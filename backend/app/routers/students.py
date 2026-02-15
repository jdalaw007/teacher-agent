from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.services.student import StudentService
import hashlib

router = APIRouter()


def get_user_id_from_request(request: Request) -> str:
    """Extract user ID from token."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = auth_header.split(" ")[1]
    return hashlib.md5(token.encode()).hexdigest()[:16]


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


@router.get("/list")
async def list_students(class_id: str, request: Request):
    """List all students for a class."""
    user_id = get_user_id_from_request(request)
    service = StudentService(user_id)
    students = service.list_students(class_id)
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
