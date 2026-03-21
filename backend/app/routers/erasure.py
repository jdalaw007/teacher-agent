from fastapi import APIRouter, HTTPException, Request
from app.services.token_store import get_user_id_from_token
from app.services import erasure as erasure_service

router = APIRouter()


def _get_user_id(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    return get_user_id_from_token(auth.split(" ")[1])


@router.delete("/students/{student_id}")
async def erase_student(student_id: int, request: Request):
    """
    GDPR Art. 17 — erase all personal data for a single student.
    Returns an erasure receipt.
    """
    teacher_user_id = _get_user_id(request)
    result = erasure_service.erase_student(teacher_user_id, student_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.delete("/account")
async def erase_account(request: Request):
    """
    GDPR Art. 17 — erase all personal data for the authenticated teacher.
    Deletes the account, all student data, conversations, memories, and corpus files.
    This is irreversible.
    """
    teacher_user_id = _get_user_id(request)
    result = erasure_service.erase_account(teacher_user_id)
    return result
