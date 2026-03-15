from fastapi import APIRouter, Request, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.services.token_store import get_user_id_from_token
from app.services import grader_service
from app.services.database import get_db

router = APIRouter()


class GradeRequest(BaseModel):
    course_id: str
    assignment_id: str
    rubric: str
    max_points: int = 100


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


@router.post("/grade")
async def grade_assignment(body: GradeRequest, request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth.split(" ")[1] if auth.startswith("Bearer ") else ""
    user_id = get_user_id_from_token(token)
    return StreamingResponse(
        grader_service.grade_assignment_stream(
            token, user_id, body.course_id, body.assignment_id, body.rubric, body.max_points
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
