from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.services.agent import AgentService
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


class GenerateAssignmentRequest(BaseModel):
    topic: str
    class_id: str
    grade_level: Optional[str] = None
    assignment_type: str = "worksheet"
    additional_instructions: Optional[str] = None
    selected_doc_ids: Optional[list[str]] = None
    student_ids: Optional[list[int]] = None


class AskQuestionRequest(BaseModel):
    question: str


class ImproveAssignmentRequest(BaseModel):
    assignment_text: str


@router.post("/generate")
async def generate_assignment(request: Request, body: GenerateAssignmentRequest):
    """Generate an assignment using AI and corpus materials."""
    user_id = get_user_id_from_request(request)
    agent = AgentService(user_id, body.class_id)

    # Build student context if student_ids provided
    student_context = None
    if body.student_ids:
        student_service = StudentService(user_id)
        student_context = student_service.get_students_for_prompt(body.class_id, body.student_ids)

    result = agent.generate_assignment(
        topic=body.topic,
        grade_level=body.grade_level,
        assignment_type=body.assignment_type,
        additional_instructions=body.additional_instructions,
        selected_doc_ids=body.selected_doc_ids,
        student_context=student_context
    )

    if result.get("error"):
        raise HTTPException(status_code=503, detail=result["error"])

    return result


@router.post("/ask")
async def ask_question(request: Request, body: AskQuestionRequest):
    """Ask the AI a question using corpus materials."""
    user_id = get_user_id_from_request(request)
    agent = AgentService(user_id)

    result = agent.answer_question(body.question)

    if result.get("error"):
        raise HTTPException(status_code=503, detail=result["error"])

    return result


@router.post("/improve")
async def improve_assignment(request: Request, body: ImproveAssignmentRequest):
    """Get AI suggestions to improve an assignment."""
    user_id = get_user_id_from_request(request)
    agent = AgentService(user_id)

    result = agent.suggest_improvements(body.assignment_text)

    if result.get("error"):
        raise HTTPException(status_code=503, detail=result["error"])

    return result
