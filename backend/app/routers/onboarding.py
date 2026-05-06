from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.services.profile import ProfileService
from app.services.token_store import get_user_id_from_token

router = APIRouter()


def _get_user_id(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = auth_header.split(" ")[1]
    return get_user_id_from_token(token)


class SaveProfileRequest(BaseModel):
    display_name: Optional[str] = ""
    school_org: Optional[str] = ""
    role: Optional[str] = "teacher"
    subjects: Optional[list[str]] = []
    grade_levels: Optional[list[str]] = []
    teaching_style: Optional[str] = ""
    about: Optional[str] = ""
    openai_api_key: Optional[str] = ""
    gemini_api_key: Optional[str] = ""
    claude_api_key: Optional[str] = ""
    ai_provider: Optional[str] = ""
    extraction_notes: Optional[str] = None  # None = don't change, "" = clear it
    language: Optional[str] = ""
    skills_enabled: Optional[dict] = None


class TestKeyRequest(BaseModel):
    openai_api_key: str


class TestGeminiKeyRequest(BaseModel):
    gemini_api_key: str


class TestClaudeKeyRequest(BaseModel):
    claude_api_key: str


@router.get("/profile")
async def get_profile(request: Request):
    """Get the current user's profile."""
    user_id = _get_user_id(request)
    service = ProfileService(user_id)
    profile = service.get_profile()
    if not profile:
        return {"exists": False, "onboarding_complete": False}
    # profile already contains has_api_key, has_gemini_key (raw keys stripped by get_profile)
    return {"exists": True, **profile}


@router.post("/profile")
async def save_profile(request: Request, body: SaveProfileRequest):
    """Save/update the user's profile."""
    user_id = _get_user_id(request)
    service = ProfileService(user_id)
    profile = service.save_profile(body.model_dump())
    return {"saved": True, **(profile or {})}


@router.post("/test-key")
async def test_api_key(body: TestKeyRequest):
    """Test that an OpenAI API key is valid by making a minimal API call."""
    key = body.openai_api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="No key provided")
    try:
        from openai import OpenAI, AuthenticationError, PermissionDeniedError
        client = OpenAI(api_key=key)
        client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
        )
        return {"valid": True}
    except Exception as e:
        err = str(e)
        if "Incorrect API key" in err or "invalid_api_key" in err or "401" in err:
            return {"valid": False, "error": "Invalid API key"}
        if "quota" in err.lower() or "429" in err:
            return {"valid": True, "warning": "Key valid but quota may be exceeded"}
        return {"valid": False, "error": err[:200]}


@router.post("/test-gemini-key")
async def test_gemini_key(body: TestGeminiKeyRequest):
    """Test that a Gemini API key is valid via the OpenAI-compatible endpoint."""
    key = body.gemini_api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="No key provided")
    try:
        from openai import OpenAI
        client = OpenAI(
            api_key=key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )
        client.chat.completions.create(
            model="models/gemini-2.5-flash",
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
        )
        return {"valid": True}
    except Exception as e:
        err = str(e)
        if "401" in err or "API_KEY_INVALID" in err or "invalid" in err.lower():
            return {"valid": False, "error": "Invalid API key"}
        if "quota" in err.lower() or "429" in err:
            return {"valid": True, "warning": "Key valid but quota may be exceeded"}
        return {"valid": False, "error": err[:200]}


@router.post("/test-claude-key")
async def test_claude_key(body: TestClaudeKeyRequest):
    """Test that a Claude (Anthropic) API key is valid via the OpenAI-compatible endpoint."""
    key = body.claude_api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="No key provided")
    try:
        from openai import OpenAI
        client = OpenAI(
            api_key=key,
            base_url="https://api.anthropic.com/v1/",
            default_headers={"anthropic-version": "2023-06-01"},
        )
        client.chat.completions.create(
            model="claude-opus-4-7",
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
        )
        return {"valid": True}
    except Exception as e:
        err = str(e)
        if "401" in err or "invalid_api_key" in err or "authentication" in err.lower():
            return {"valid": False, "error": "Invalid API key"}
        if "quota" in err.lower() or "429" in err:
            return {"valid": True, "warning": "Key valid but quota may be exceeded"}
        return {"valid": False, "error": err[:200]}
