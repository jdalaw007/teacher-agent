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
    language: Optional[str] = ""


class TestKeyRequest(BaseModel):
    openai_api_key: str


@router.get("/profile")
async def get_profile(request: Request):
    """Get the current user's profile."""
    user_id = _get_user_id(request)
    service = ProfileService(user_id)
    profile = service.get_profile()
    if not profile:
        return {"exists": False, "onboarding_complete": False}
    has_api_key = bool(service.get_api_key())
    return {"exists": True, "has_api_key": has_api_key, **profile}


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
