from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.services.classroom import ClassroomService

router = APIRouter()


class CreateAssignmentRequest(BaseModel):
    title: str
    description: str
    max_points: Optional[int] = None
    due_year: Optional[int] = None
    due_month: Optional[int] = None
    due_day: Optional[int] = None
    due_hour: Optional[int] = 23
    due_minute: Optional[int] = 59
    publish: bool = True  # True = publish now, False = save as draft


def get_token_from_request(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    return auth_header.split(" ")[1]


@router.get("/courses")
async def list_courses(request: Request):
    """List all courses for the authenticated teacher."""
    token = get_token_from_request(request)
    service = ClassroomService(token)
    try:
        courses = service.list_courses()
        return {"courses": courses}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/courses/{course_id}")
async def get_course(course_id: str, request: Request):
    """Get details of a specific course."""
    token = get_token_from_request(request)
    service = ClassroomService(token)
    try:
        course = service.get_course(course_id)
        return course
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/courses/{course_id}/assignments")
async def list_assignments(course_id: str, request: Request):
    """List all assignments for a course."""
    token = get_token_from_request(request)
    service = ClassroomService(token)
    try:
        assignments = service.list_assignments(course_id)
        return {"assignments": assignments}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/courses/{course_id}/assignments/{assignment_id}")
async def get_assignment(course_id: str, assignment_id: str, request: Request):
    """Get details of a specific assignment."""
    token = get_token_from_request(request)
    service = ClassroomService(token)
    try:
        assignment = service.get_assignment(course_id, assignment_id)
        return assignment
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/courses/{course_id}/assignments/{assignment_id}/submissions")
async def list_submissions(course_id: str, assignment_id: str, request: Request):
    """List all student submissions for an assignment."""
    token = get_token_from_request(request)
    service = ClassroomService(token)
    try:
        submissions = service.list_submissions(course_id, assignment_id)
        return {"submissions": submissions}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/courses/{course_id}/assignments")
async def create_assignment(course_id: str, request: Request, body: CreateAssignmentRequest):
    """Create a new assignment in Google Classroom."""
    token = get_token_from_request(request)
    service = ClassroomService(token)

    try:
        # Build due date if provided
        due_date = None
        due_time = None
        if body.due_year and body.due_month and body.due_day:
            due_date = {
                "year": body.due_year,
                "month": body.due_month,
                "day": body.due_day
            }
            due_time = {
                "hours": body.due_hour or 23,
                "minutes": body.due_minute or 59
            }

        if body.publish:
            result = service.create_assignment(
                course_id=course_id,
                title=body.title,
                description=body.description,
                max_points=body.max_points,
                due_date=due_date,
                due_time=due_time
            )
        else:
            result = service.create_draft_assignment(
                course_id=course_id,
                title=body.title,
                description=body.description,
                max_points=body.max_points
            )

        return {
            "message": "Assignment created",
            "assignment_id": result.get("id"),
            "title": result.get("title"),
            "state": result.get("state"),
            "alternateLink": result.get("alternateLink")
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
