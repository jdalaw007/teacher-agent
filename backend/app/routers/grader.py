import csv
import io
from fastapi import APIRouter, Request, Query
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from app.services.token_store import get_user_id_from_token
from app.services import grader_service
from app.services.database import get_db

router = APIRouter()


class GradeRequest(BaseModel):
    course_id: str
    assignment_id: str
    rubric: str = ""
    max_points: int = 100
    student_user_id: str = ""


@router.get("/history")
async def get_grader_history(request: Request, course_id: str = Query(None), assignment_id: str = Query(None), student_name: str = Query(None)):
    """Return stored grading results for a teacher, optionally filtered."""
    auth = request.headers.get("Authorization", "")
    token = auth.split(" ")[1] if auth.startswith("Bearer ") else ""
    user_id = get_user_id_from_token(token)
    db = get_db()
    try:
        conditions = ["teacher_user_id = ?"]
        params: list = [user_id]
        if course_id:
            conditions.append("course_id = ?")
            params.append(course_id)
        if assignment_id:
            conditions.append("assignment_id = ?")
            params.append(assignment_id)
        if student_name:
            conditions.append("student_name LIKE ?")
            params.append(f"%{student_name}%")
        rows = db.execute(
            f"SELECT * FROM grader_results WHERE {' AND '.join(conditions)} ORDER BY graded_at DESC",
            params,
        ).fetchall()
        return {"results": [dict(r) for r in rows]}
    finally:
        db.close()


@router.get("/submission-preview")
async def get_submission_preview(request: Request, course_id: str, assignment_id: str, student_user_id: str):
    """Fetch and return the text content of a single student's submission."""
    auth = request.headers.get("Authorization", "")
    token = auth.split(" ")[1] if auth.startswith("Bearer ") else ""
    try:
        from app.services.classroom import ClassroomService
        classroom = ClassroomService(token)
        submissions = classroom.list_submissions(course_id, assignment_id)
        sub = next((s for s in submissions if s.get("userId") == student_user_id), None)
        if not sub:
            return {"text": None, "state": "NOT_FOUND"}
        text = grader_service._extract_text_from_submission(sub, token)
        return {"text": text or None, "state": sub.get("state", "")}
    except Exception as e:
        return {"text": None, "error": str(e)}


@router.get("/export-csv")
async def export_grader_csv(request: Request, course_id: str, assignment_id: str):
    """Download grader results as a CSV file."""
    auth = request.headers.get("Authorization", "")
    token = auth.split(" ")[1] if auth.startswith("Bearer ") else ""
    user_id = get_user_id_from_token(token)
    db = get_db()
    try:
        rows = db.execute(
            "SELECT student_name, grade, max_points, ai_score, feedback, plagiarism_flagged FROM grader_results "
            "WHERE teacher_user_id = ? AND course_id = ? AND assignment_id = ? ORDER BY student_name",
            (user_id, course_id, assignment_id),
        ).fetchall()
    finally:
        db.close()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Student", "Grade", "Max Points", "AI Score", "Feedback", "Plagiarism Flag"])
    for r in rows:
        writer.writerow([
            r["student_name"],
            r["grade"] if r["grade"] is not None else "",
            r["max_points"] if r["max_points"] is not None else "",
            r["ai_score"] if r["ai_score"] is not None else "",
            r["feedback"] or "",
            "Yes" if r["plagiarism_flagged"] else "No",
        ])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=grades_{assignment_id}.csv"},
    )


class PushGradesRequest(BaseModel):
    course_id: str
    assignment_id: str


@router.post("/push-grades")
async def push_draft_grades(body: PushGradesRequest, request: Request):
    """Push AI-assigned draft grades back to Google Classroom."""
    auth = request.headers.get("Authorization", "")
    token = auth.split(" ")[1] if auth.startswith("Bearer ") else ""
    user_id = get_user_id_from_token(token)
    db = get_db()
    try:
        rows = db.execute(
            "SELECT student_name, grade, submission_id FROM grader_results "
            "WHERE teacher_user_id = ? AND course_id = ? AND assignment_id = ? AND grade IS NOT NULL",
            (user_id, body.course_id, body.assignment_id),
        ).fetchall()
    finally:
        db.close()

    if not rows:
        return {"pushed": 0, "skipped": 0, "errors": []}

    from app.services.classroom import ClassroomService
    classroom = ClassroomService(token)

    # For rows without a stored submission_id, fall back to name-matching from Classroom
    name_to_sub_id: dict[str, str] = {}
    needs_lookup = [r for r in rows if not r["submission_id"]]
    if needs_lookup:
        try:
            submissions = classroom.list_submissions(body.course_id, body.assignment_id)
            students = classroom.list_students(body.course_id)
            uid_to_name = {
                s["userId"]: s.get("profile", {}).get("name", {}).get("fullName", "")
                for s in students
            }
            for sub in submissions:
                uid = sub.get("userId", "")
                name = uid_to_name.get(uid, "")
                if name:
                    name_to_sub_id[name] = sub["id"]
        except Exception:
            pass

    pushed, skipped, errors = 0, 0, []
    for r in rows:
        sub_id = r["submission_id"] or name_to_sub_id.get(r["student_name"], "")
        if not sub_id:
            skipped += 1
            continue
        try:
            classroom.patch_submission_grade(body.course_id, body.assignment_id, sub_id, float(r["grade"]))
            pushed += 1
        except Exception as e:
            errors.append({"student": r["student_name"], "error": str(e)})

    return {"pushed": pushed, "skipped": skipped, "errors": errors}


@router.post("/grade")
async def grade_assignment(body: GradeRequest, request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth.split(" ")[1] if auth.startswith("Bearer ") else ""
    user_id = get_user_id_from_token(token)
    return StreamingResponse(
        grader_service.grade_assignment_stream(
            token, user_id, body.course_id, body.assignment_id, body.rubric, body.max_points,
            body.student_user_id or None
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
