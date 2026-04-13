from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.services.gmail_service import GmailService


class SendEmailRequest(BaseModel):
    to: list[str]
    subject: str
    body: str


class AiComposeRequest(BaseModel):
    student_names: list[str]
    class_name: str
    prompt: str

router = APIRouter()


def _get_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    return auth_header.split(" ")[1]


@router.get("/messages")
async def list_messages(request: Request, max_results: int = 10, query: str = ""):
    token = _get_token(request)
    try:
        return {"messages": GmailService(token).list_messages(max_results=max_results, query=query)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/messages/{message_id}")
async def get_message(message_id: str, request: Request):
    token = _get_token(request)
    try:
        return GmailService(token).get_message(message_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/labels")
async def list_labels(request: Request):
    token = _get_token(request)
    try:
        return {"labels": GmailService(token).list_labels()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/messages/{message_id}/trash")
async def trash_message(message_id: str, request: Request):
    token = _get_token(request)
    try:
        return GmailService(token).trash_message(message_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/messages/{message_id}/archive")
async def archive_message(message_id: str, request: Request):
    token = _get_token(request)
    try:
        return GmailService(token).archive_message(message_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class LabelRequest(BaseModel):
    label_id: str


@router.post("/messages/{message_id}/label")
async def apply_label(message_id: str, body: LabelRequest, request: Request):
    token = _get_token(request)
    try:
        return GmailService(token).apply_label(message_id, body.label_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/send")
async def send_email(body: SendEmailRequest, request: Request):
    token = _get_token(request)
    try:
        result = GmailService(token).send_message(body.to, body.subject, body.body)
        return {"message": "Sent", "id": result.get("id")}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/draft")
async def create_draft(body: SendEmailRequest, request: Request):
    token = _get_token(request)
    try:
        result = GmailService(token).create_draft(body.to, body.subject, body.body)
        return {"message": "Draft saved", "id": result.get("id")}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ai-compose")
async def ai_compose(body: AiComposeRequest, request: Request):
    token = _get_token(request)
    from openai import OpenAI
    from app.config import get_settings
    from app.services.token_store import get_user_id_from_token
    from app.services.profile import ProfileService

    user_id = get_user_id_from_token(token)
    from app.services.profile import get_ai_client
    client, ai_model = get_ai_client(user_id)

    names_str = ", ".join(body.student_names)
    response = client.chat.completions.create(
        model=ai_model,
        messages=[
            {"role": "system", "content": "You draft clear, professional emails for teachers."},
            {"role": "user", "content": (
                f"Draft an email from a teacher to: {names_str}.\n"
                f"Class: {body.class_name}\n"
                f"The teacher wants to: {body.prompt}\n\n"
                "Reply in this exact format:\n"
                "SUBJECT: <subject line>\n"
                "BODY:\n<email body>"
            )},
        ],
        max_tokens=600,
    )
    text = response.choices[0].message.content.strip()

    subject, email_body = "Message from your teacher", text
    if "SUBJECT:" in text and "BODY:" in text:
        parts = text.split("BODY:", 1)
        subject = parts[0].replace("SUBJECT:", "").strip()
        email_body = parts[1].strip()

    return {"subject": subject, "body": email_body}
