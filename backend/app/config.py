from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str = "http://localhost:8000/auth/callback"
    secret_key: str
    frontend_url: str = "http://localhost:3000"
    openai_api_key: str = "your-api-key-here"
    gemini_api_key: str = ""

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
