from fastapi import APIRouter, HTTPException, Request
from app.services.token_store import get_user_id_from_token
from app.services import audit as audit_service

router = APIRouter()


def _get_user_id(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    return get_user_id_from_token(auth.split(" ")[1])


@router.get("/log")
async def get_audit_log(request: Request, limit: int = 200, offset: int = 0):
    """
    Return audit log entries for the authenticated teacher.
    For DPO review and subject access requests.
    """
    user_id = _get_user_id(request)
    entries = audit_service.get_log(user_id, limit=limit, offset=offset)
    return {"entries": entries, "count": len(entries)}


@router.get("/log/student/{student_id}")
async def get_student_audit_log(student_id: int, request: Request):
    """
    Return all audit entries for a specific student.
    Use when responding to a subject access request (Art. 15 GDPR).
    """
    user_id = _get_user_id(request)
    entries = audit_service.get_log_for_student(user_id, student_id)
    return {"student_id": student_id, "entries": entries, "count": len(entries)}
