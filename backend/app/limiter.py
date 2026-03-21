"""Shared rate limiter instance for the Teacher Agent API.

Key function uses the Authorization Bearer token (per authenticated user).
Falls back to client IP for unauthenticated requests.
"""
from slowapi import Limiter
from fastapi import Request


def _get_key(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        # Use first 64 chars of token as a stable per-user key
        return auth[7:71]
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_get_key)
