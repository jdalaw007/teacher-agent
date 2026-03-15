from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from app.services.google_auth import GoogleAuthService
from app.services.database import get_db
from app.config import get_settings
import hashlib

router = APIRouter()
settings = get_settings()
auth_service = GoogleAuthService()


@router.get("/login")
async def login():
    """Redirect to Google OAuth consent screen."""
    auth_url = auth_service.get_authorization_url()
    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def callback(code: str = None, error: str = None):
    """Handle Google OAuth callback."""
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")

    if not code:
        raise HTTPException(status_code=400, detail="No authorization code received")

    try:
        tokens = auth_service.exchange_code_for_tokens(code)

        access_token = tokens["access_token"]
        refresh_token = tokens.get("refresh_token")

        # Stable user_id derived from Google email — survives token rotation
        user_info = auth_service.get_user_info(access_token)
        email = user_info.get("email", "")
        user_id = hashlib.md5(email.lower().encode()).hexdigest()[:16]
        print(f"[Auth] Login: {email} -> user_id={user_id}, refresh_token present: {refresh_token is not None}")

        db = get_db()
        try:
            db.execute(
                """INSERT INTO teacher_tokens (user_id, refresh_token, access_token, updated_at)
                   VALUES (?, COALESCE(?, ''), ?, datetime('now'))
                   ON CONFLICT(user_id) DO UPDATE SET
                   refresh_token=COALESCE(excluded.refresh_token, teacher_tokens.refresh_token),
                   access_token=excluded.access_token,
                   updated_at=datetime('now')""",
                (user_id, refresh_token, access_token),
            )
            db.execute(
                """INSERT INTO user_profiles (user_id, last_login_at)
                   VALUES (?, datetime('now'))
                   ON CONFLICT(user_id) DO UPDATE SET last_login_at = datetime('now')""",
                (user_id,),
            )
            db.commit()
        finally:
            db.close()

        # Redirect to frontend with token
        redirect_url = f"{settings.frontend_url}/dashboard?token={access_token}"
        return RedirectResponse(url=redirect_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/user")
async def get_current_user(request: Request):
    """Get current user info from token."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = auth_header.split(" ")[1]
    try:
        user_info = auth_service.get_user_info(token)
        return user_info
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))
