import httpx
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from app.config import get_settings

settings = get_settings()

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    # Classroom
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.students",  # Create/edit assignments
    "https://www.googleapis.com/auth/classroom.announcements",  # Create/read announcements
    "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
    "https://www.googleapis.com/auth/classroom.student-submissions.students.readonly",
    "https://www.googleapis.com/auth/classroom.rosters.readonly",
    "https://www.googleapis.com/auth/classroom.profile.emails",  # Student email addresses
    # Drive
    "https://www.googleapis.com/auth/drive.readonly",
    # Docs
    "https://www.googleapis.com/auth/documents.readonly",
    # Gmail (modify includes read + trash + label)
    "https://www.googleapis.com/auth/gmail.modify",
    # Calendar
    "https://www.googleapis.com/auth/calendar.readonly",
]


class GoogleAuthService:
    def __init__(self):
        self.client_id = settings.google_client_id
        self.client_secret = settings.google_client_secret
        self.redirect_uri = settings.google_redirect_uri

    def get_authorization_url(self) -> str:
        from urllib.parse import urlencode
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": " ".join(SCOPES),
            "access_type": "offline",
            "prompt": "consent",
        }
        return f"https://accounts.google.com/o/oauth2/auth?{urlencode(params)}"

    def exchange_code_for_tokens(self, code: str) -> dict:
        """Exchange authorization code for tokens using direct HTTP request."""
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": self.redirect_uri,
        }

        response = httpx.post(token_url, data=data)
        response.raise_for_status()
        tokens = response.json()

        return {
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token"),
            "token_uri": token_url,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scopes": tokens.get("scope", "").split(),
        }

    def get_user_info(self, access_token: str) -> dict:
        credentials = Credentials(token=access_token)
        service = build("oauth2", "v2", credentials=credentials)
        user_info = service.userinfo().get().execute()
        return user_info

    def refresh_access_token(self, refresh_token: str) -> str:
        """Use a refresh token to get a new access token."""
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        response = httpx.post(token_url, data=data)
        response.raise_for_status()
        return response.json()["access_token"]
