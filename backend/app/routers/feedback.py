from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.services.database import get_db
from app.services.token_store import get_user_id_from_token
from app.services.google_auth import GoogleAuthService

router = APIRouter()
auth_service = GoogleAuthService()

ADMIN_EMAIL = "smith@plaminkova.cz"


class FeedbackRequest(BaseModel):
    message: str


def _get_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    raise HTTPException(401, "Missing authorization")


@router.post("/submit")
async def submit_feedback(body: FeedbackRequest, request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth.split(" ")[1] if auth.startswith("Bearer ") else ""
    user_id = get_user_id_from_token(token) if token else "anonymous"
    if not body.message.strip():
        raise HTTPException(400, "Message cannot be empty")
    db = get_db()
    try:
        db.execute(
            "INSERT INTO feedback (user_id, message) VALUES (?, ?)",
            (user_id, body.message.strip()),
        )
        db.commit()
    finally:
        db.close()
    return {"submitted": True}


@router.get("/all")
async def get_all_feedback(request: Request):
    token = _get_token(request)
    try:
        user_info = auth_service.get_user_info(token)
        email = user_info.get("email", "")
    except Exception:
        raise HTTPException(401, "Could not verify identity")
    if email != ADMIN_EMAIL:
        raise HTTPException(403, "Admin only")
    db = get_db()
    try:
        rows = db.execute(
            "SELECT id, user_id, message, created_at FROM feedback ORDER BY created_at DESC"
        ).fetchall()
        return {"feedback": [dict(r) for r in rows]}
    finally:
        db.close()
