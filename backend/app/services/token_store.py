import hashlib
import sys
from app.services.database import get_db


def get_user_id_from_token(token: str) -> str:
    """Return the stable user_id for the given access token.

    Fast path: look up cached token in teacher_tokens.
    Slow path: call Google userinfo API to get email, compute stable user_id,
               then cache it so future requests are fast.
    Fallback: md5(token) for any edge cases.
    """
    # Fast path — already cached
    db = get_db()
    try:
        row = db.execute(
            "SELECT user_id FROM teacher_tokens WHERE access_token = ?",
            (token,)
        ).fetchone()
        if row:
            return row["user_id"]
    finally:
        db.close()

    # Slow path — resolve via Google userinfo and cache
    try:
        from app.services.google_auth import GoogleAuthService
        auth_service = GoogleAuthService()
        user_info = auth_service.get_user_info(token)
        email = user_info.get("email", "")
        if email:
            user_id = hashlib.md5(email.lower().encode()).hexdigest()[:16]
            # Cache the token → user_id mapping for this session
            db = get_db()
            try:
                db.execute(
                    """INSERT INTO teacher_tokens (user_id, refresh_token, access_token, updated_at)
                       VALUES (?, '', ?, datetime('now'))
                       ON CONFLICT(user_id) DO UPDATE SET
                       access_token=excluded.access_token,
                       updated_at=datetime('now')""",
                    (user_id, token),
                )
                # Also ensure user_profiles row exists so onboarding check works
                db.execute(
                    """INSERT INTO user_profiles (user_id, last_login_at)
                       VALUES (?, datetime('now'))
                       ON CONFLICT(user_id) DO UPDATE SET last_login_at = datetime('now')""",
                    (user_id,),
                )
                db.commit()
                print(f"[TokenStore] Resolved {email} -> user_id={user_id}", file=sys.stderr)
            finally:
                db.close()
            return user_id
    except Exception as e:
        print(f"[TokenStore] Google userinfo lookup failed: {e}", file=sys.stderr)

    # Final fallback — unstable but prevents a 500
    return hashlib.md5(token.encode()).hexdigest()[:16]
