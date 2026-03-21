from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from app.services.chat_agent import ChatAgentService
from app.services import memory
from app.services.token_store import get_user_id_from_token
from app.limiter import limiter

router = APIRouter()


def _get_user_id(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = auth_header.split(" ")[1]
    return get_user_id_from_token(token)


def _get_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    return auth_header.split(" ")[1]


class CreateConversationRequest(BaseModel):
    title: Optional[str] = ""


class SendMessageRequest(BaseModel):
    message: str
    page_context: str = ""


class FeedbackRequest(BaseModel):
    message_id: int
    correction: str


# --- Conversation endpoints ---

@router.post("/conversations")
async def create_conversation(request: Request, body: CreateConversationRequest):
    """Create a new chat conversation."""
    user_id = _get_user_id(request)
    conv = memory.create_conversation(user_id, body.title)
    return conv


@router.get("/conversations")
async def list_conversations(request: Request):
    """List all conversations for the current teacher."""
    user_id = _get_user_id(request)
    conversations = memory.list_conversations(user_id)
    return {"conversations": conversations}


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, request: Request):
    """Get a conversation with its messages."""
    user_id = _get_user_id(request)
    conv = memory.get_conversation(conversation_id)
    if not conv or conv["teacher_user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = memory.get_conversation_messages(conversation_id)
    return {**conv, "messages": messages}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, request: Request):
    """Delete a conversation."""
    user_id = _get_user_id(request)
    deleted = memory.delete_conversation(conversation_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"deleted": True}


@router.post("/conversations/{conversation_id}/messages")
@limiter.limit("30/minute")
async def send_message(conversation_id: str, request: Request, body: SendMessageRequest):
    """Send a message and get a streaming SSE response."""
    user_id = _get_user_id(request)
    token = _get_token(request)

    conv = memory.get_conversation(conversation_id)
    if not conv or conv["teacher_user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.get("ended_at"):
        raise HTTPException(status_code=400, detail="Conversation has ended")

    agent = ChatAgentService(user_id, token)

    return StreamingResponse(
        agent.stream_response(conversation_id, body.message, body.page_context),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/conversations/{conversation_id}/end")
async def end_conversation(conversation_id: str, request: Request):
    """End a conversation, triggering summarization."""
    user_id = _get_user_id(request)
    token = _get_token(request)

    conv = memory.get_conversation(conversation_id)
    if not conv or conv["teacher_user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    agent = ChatAgentService(user_id, token)
    result = await agent.summarize_conversation(conversation_id)

    # Trigger learning if enough unprocessed memories
    try:
        from app.services.learning import LearningService
        learning = LearningService(user_id)
        learning.maybe_distill_insights()
    except Exception:
        pass

    return result


@router.post("/conversations/{conversation_id}/reopen")
async def reopen_conversation(conversation_id: str, request: Request):
    """Reopen an ended conversation so it can be continued."""
    user_id = _get_user_id(request)
    conv = memory.get_conversation(conversation_id)
    if not conv or conv["teacher_user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    result = memory.reopen_conversation(conversation_id)
    return result


@router.post("/conversations/{conversation_id}/feedback")
async def submit_feedback(conversation_id: str, request: Request, body: FeedbackRequest):
    """Submit a teacher correction on a message."""
    user_id = _get_user_id(request)

    conv = memory.get_conversation(conversation_id)
    if not conv or conv["teacher_user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Save correction as episodic memory
    memory.save_episodic_memory(
        teacher_user_id=user_id,
        content=f"Teacher correction: {body.correction}",
        conversation_id=conversation_id,
        tags=["correction"],
        memory_type="teacher_correction",
    )

    # Try to update conflicting semantic memories
    try:
        from app.services.learning import LearningService
        learning = LearningService(user_id)
        learning.apply_correction(body.correction)
    except Exception:
        pass

    return {"saved": True}


@router.get("/context/{class_id}")
async def get_class_context(class_id: str, request: Request):
    """Get the agent's current awareness for a class (for sidebar display)."""
    user_id = _get_user_id(request)
    token = _get_token(request)

    result = {"class_id": class_id}

    # Student count
    try:
        from app.services.student import StudentService
        student_service = StudentService(user_id)
        students = student_service.list_students(class_id)
        result["student_count"] = len(students)
    except Exception:
        result["student_count"] = 0

    # Recent memories
    try:
        memories = memory.search_semantic_memories(user_id, class_id, limit=3)
        result["recent_insights"] = [m["content"][:100] for m in memories]
    except Exception:
        result["recent_insights"] = []

    return result
