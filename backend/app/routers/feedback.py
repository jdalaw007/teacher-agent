from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.services.database import get_db
from app.services.token_store import get_user_id_from_token

router = APIRouter()


class FeedbackRequest(BaseModel):
    message: str


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
