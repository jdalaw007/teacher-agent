from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from app.services.google_auth import GoogleAuthService
from app.config import get_settings

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
        # Redirect to frontend with token
        redirect_url = f"{settings.frontend_url}/dashboard?token={tokens['access_token']}"
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
