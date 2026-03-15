from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.services.student import StudentService
from app.services.token_store import get_user_id_from_token

router = APIRouter()


def get_user_id_from_request(request: Request) -> str:
    """Extract user ID from token."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = auth_header.split(" ")[1]
    return get_user_id_from_token(token)


def get_token_from_request(request: Request) -> str:
    """Extract raw access token."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    return auth_header.split(" ")[1]


class AddStudentRequest(BaseModel):
    class_id: str
    name: str
    email: Optional[str] = ""


class ImportRosterRequest(BaseModel):
    class_id: str


class UpdateStudentRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


class UpdateNotesRequest(BaseModel):
    notes: str


class CreateGroupRequest(BaseModel):
    class_id: str
    name: str
    description: Optional[str] = ""


class UpdateGroupRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class AddGroupMemberRequest(BaseModel):
    student_id: int


class SyncSubmissionsRequest(BaseModel):
    class_id: str


@router.get("/list")
async def list_students(class_id: str, request: Request):
    """List all students for a class, enriched with summary stats and group info."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    students = service.list_students(class_id)
    # Enrich each student with summary stats and groups
    for student in students:
        student["summary"] = service.get_student_summary(student["id"])
        student["groups"] = service.get_student_groups(student["id"])
    return {"students": students}


@router.post("/import-roster")
async def import_roster(body: ImportRosterRequest, request: Request):
    """Import students from Google Classroom roster."""
    user_id = get_user_id_from_request(request)
    access_token = get_token_from_request(request)
    service = StudentService(user_id)

    try:
        result = service.import_roster(access_token, body.class_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-submissions")
async def sync_submissions(body: SyncSubmissionsRequest, request: Request):
    """Sync submission data from Google Classroom."""
    user_id = get_user_id_from_request(request)
    access_token = get_token_from_request(request)
    service = StudentService(user_id)
    try:
        result = service.sync_submissions(access_token, body.class_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Group endpoints ---

@router.get("/groups")
async def list_groups(class_id: str, request: Request):
    """List all groups for a class."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    groups = service.list_groups(class_id)
    return {"groups": groups}


@router.post("/groups")
async def create_group(body: CreateGroupRequest, request: Request):
    """Create a differentiation group."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    group = service.create_group(body.class_id, body.name, body.description)
    return group


@router.put("/groups/{group_id}")
async def update_group(group_id: int, body: UpdateGroupRequest, request: Request):
    """Update a group."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    group = service.update_group(group_id, name=body.name, description=body.description)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.delete("/groups/{group_id}")
async def delete_group(group_id: int, request: Request):
    """Delete a group."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    success = service.delete_group(group_id)
    if not success:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"deleted": True}


@router.get("/groups/{group_id}/members")
async def get_group_members(group_id: int, request: Request):
    """Get members of a group."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    members = service.get_group_members(group_id)
    return {"members": members}


@router.post("/groups/{group_id}/members")
async def add_group_member(group_id: int, body: AddGroupMemberRequest, request: Request):
    """Add a student to a group."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    service.add_to_group(group_id, body.student_id)
    return {"added": True}


@router.delete("/groups/{group_id}/members/{student_id}")
async def remove_group_member(group_id: int, student_id: int, request: Request):
    """Remove a student from a group."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    success = service.remove_from_group(group_id, student_id)
    if not success:
        raise HTTPException(status_code=404, detail="Membership not found")
    return {"removed": True}


@router.post("/add")
async def add_student(body: AddStudentRequest, request: Request):
    """Manually add a student."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    student = service.add_student(body.class_id, body.name, body.email)
    return student


@router.get("/{student_id}")
async def get_student(student_id: int, request: Request):
    """Get a student profile."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    student = service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.put("/{student_id}")
async def update_student(student_id: int, body: UpdateStudentRequest, request: Request):
    """Update student name/email/notes."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    student = service.update_student(student_id, name=body.name, email=body.email, notes=body.notes)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.put("/{student_id}/notes")
async def update_notes(student_id: int, body: UpdateNotesRequest, request: Request):
    """Quick notes update."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    student = service.update_notes(student_id, body.notes)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.delete("/{student_id}")
async def delete_student(student_id: int, request: Request):
    """Delete a student."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    success = service.delete_student(student_id)
    if not success:
        raise HTTPException(status_code=404, detail="Student not found")
    return {"deleted": True}


@router.get("/{student_id}/history")
async def get_student_history(student_id: int, request: Request):
    """Get submission history for a student."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    history = service.get_student_history(student_id)
    return {"history": history}
