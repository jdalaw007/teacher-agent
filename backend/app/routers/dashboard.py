import json
import re
import sys
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from openai import OpenAI
from app.services.database import get_db
from app.services.google_auth import GoogleAuthService
from app.services.token_store import get_user_id_from_token
from app.config import get_settings
from app.limiter import limiter

router = APIRouter()
settings = get_settings()
auth_service = GoogleAuthService()


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


def _get_openai_client(user_id: str):
    from app.services.profile import ProfileService
    user_key = ProfileService(user_id).get_api_key()
    api_key = user_key or settings.openai_api_key
    if not api_key or api_key == "your-api-key-here":
        return None
    return OpenAI(api_key=api_key)


def _get_summary(user_id: str) -> dict:
    db = get_db()
    try:
        profile = db.execute(
            "SELECT last_login_at FROM user_profiles WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        last_login_at = profile["last_login_at"] if profile else None

        submissions = []
        if last_login_at:
            rows = db.execute(
                """SELECT s.name AS student_name, sh.assignment_title, sh.state, sh.submitted_at,
                          s.class_id
                   FROM submission_history sh
                   JOIN students s ON s.id = sh.student_id
                   WHERE s.teacher_user_id = ?
                     AND sh.recorded_at > ?
                   ORDER BY sh.recorded_at DESC""",
                (user_id, last_login_at)
            ).fetchall()
            submissions = [dict(r) for r in rows]
        else:
            rows = db.execute(
                """SELECT s.name AS student_name, sh.assignment_title, sh.state, sh.submitted_at,
                          s.class_id
                   FROM submission_history sh
                   JOIN students s ON s.id = sh.student_id
                   WHERE s.teacher_user_id = ?
                   ORDER BY sh.recorded_at DESC
                   LIMIT 20""",
                (user_id,)
            ).fetchall()
            submissions = [dict(r) for r in rows]

        return {
            "last_login_at": last_login_at,
            "submission_count": len(submissions),
            "submissions": submissions,
        }
    finally:
        db.close()


@router.get("/summary")
async def get_summary(request: Request):
    """Return new submissions since last login and last_login_at timestamp."""
    user_id = _get_user_id(request)
    return _get_summary(user_id)


_FALLBACK_PROMPTS = [
    "How are my students doing on recent assignments?",
    "Draft a lesson plan for this week",
    "Create a formative assessment quiz",
    "What differentiation strategies should I try?",
]


@router.get("/suggested-prompts")
async def get_suggested_prompts(request: Request):
    """Return 4 context-aware suggested prompts based on recent classroom activity."""
    user_id = _get_user_id(request)
    client = _get_openai_client(user_id)
    if not client:
        return {"prompts": _FALLBACK_PROMPTS}

    summary = _get_summary(user_id)
    if summary["submissions"]:
        lines = [
            f"- {s['student_name']} submitted '{s['assignment_title']}' ({s['state']})"
            for s in summary["submissions"][:8]
        ]
        context = "Recent submissions:\n" + "\n".join(lines)
    else:
        context = "No recent submissions."

    prompt = (
        f"You are a teaching assistant. Based on this classroom context:\n\n{context}\n\n"
        "Generate exactly 4 short, specific, actionable prompts a teacher might ask their AI assistant. "
        "Each prompt must be 1 sentence under 12 words. "
        "Return ONLY a JSON array of 4 strings, nothing else."
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.7,
        )
        text = response.choices[0].message.content.strip()
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if match:
            prompts = json.loads(match.group())
            if isinstance(prompts, list) and len(prompts) >= 4:
                return {"prompts": [str(p) for p in prompts[:4]]}
    except Exception as e:
        print(f"[Dashboard] suggested-prompts error: {e}", file=sys.stderr)

    return {"prompts": _FALLBACK_PROMPTS}


@router.get("/greeting")
@limiter.limit("10/minute")
async def get_greeting(request: Request):
    """Stream a personalized greeting as SSE."""
    user_id = _get_user_id(request)
    token = _get_token(request)

    # Get teacher name
    teacher_name = "there"
    try:
        user_info = auth_service.get_user_info(token)
        given_name = user_info.get("given_name") or user_info.get("name", "").split()[0]
        if given_name:
            teacher_name = given_name
    except Exception as e:
        print(f"[Dashboard] Could not fetch user info: {e}", file=sys.stderr)

    summary = _get_summary(user_id)
    sub_count = summary["submission_count"]
    last_login = summary["last_login_at"]

    if last_login:
        # Format date nicely
        login_str = last_login.replace("T", " ").split(".")[0]
        sub_part = (
            f"{sub_count} new submission{'s' if sub_count != 1 else ''} since your last login ({login_str})"
            if sub_count > 0
            else f"no new submissions since your last login ({login_str})"
        )
    else:
        sub_part = f"{sub_count} submission{'s' if sub_count != 1 else ''} in the system" if sub_count > 0 else "no submissions yet"

    hour = datetime.now().hour
    if hour < 12:
        time_of_day = "morning"
    elif hour < 17:
        time_of_day = "afternoon"
    else:
        time_of_day = "evening"

    prompt = (
        f"You are a concise teaching assistant. Greet {teacher_name} (it is {time_of_day}) "
        f"and briefly mention: {sub_part}. "
        f"2-3 sentences max. No bullet points. Do not add any closing remarks or sign-offs."
    )

    client = _get_openai_client(user_id)

    async def event_stream():
        if not client:
            yield f"data: {json.dumps({'type': 'content', 'content': f'Good {time_of_day}, {teacher_name}! OpenAI API key not configured — add yours in Settings.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        try:
            stream = client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=150,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield f"data: {json.dumps({'type': 'content', 'content': delta.content})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            print(f"[Dashboard] Greeting stream error: {e}", file=sys.stderr)
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
