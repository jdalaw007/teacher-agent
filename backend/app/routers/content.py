from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from app.services.token_store import get_user_id_from_token
from app.services.content_checker import ContentCheckerService
from app.limiter import limiter

router = APIRouter()


def _get_user_id(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = auth_header.split(" ")[1]
    return get_user_id_from_token(token)


class CheckRequest(BaseModel):
    content: str
    content_type: str = "assignment"
    grade_level: Optional[str] = None
    subject: Optional[str] = None


@router.post("/check")
@limiter.limit("20/minute")
async def check_content(request: Request, body: CheckRequest):
    """Stream a content review as SSE."""
    user_id = _get_user_id(request)
    checker = ContentCheckerService(user_id)
    return StreamingResponse(
        checker.check_content(body.content, body.content_type, body.grade_level, body.subject),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
