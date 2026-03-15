from fastapi import APIRouter, Request, HTTPException
from app.services.token_store import get_user_id_from_token
from app.services.database import get_db

router = APIRouter()


def _get_user_id(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = auth_header.split(" ")[1]
    return get_user_id_from_token(token)


@router.get("/")
async def get_preferences(request: Request):
    """Return active state for all classes. Classes not in the table default to active."""
    user_id = _get_user_id(request)
    db = get_db()
    try:
        rows = db.execute(
            "SELECT class_id, is_active FROM class_preferences WHERE user_id = ?",
            (user_id,)
        ).fetchall()
        return {"preferences": {row["class_id"]: bool(row["is_active"]) for row in rows}}
    finally:
        db.close()


@router.post("/{class_id}/toggle")
async def toggle_preference(class_id: str, request: Request):
    """Toggle the active/inactive state for a class."""
    user_id = _get_user_id(request)
    db = get_db()
    try:
        existing = db.execute(
            "SELECT is_active FROM class_preferences WHERE user_id = ? AND class_id = ?",
            (user_id, class_id)
        ).fetchone()

        if existing is None:
            # Not in table means it was active by default — set to inactive
            db.execute(
                "INSERT INTO class_preferences (user_id, class_id, is_active) VALUES (?, ?, 0)",
                (user_id, class_id)
            )
            new_state = False
        else:
            new_state = not bool(existing["is_active"])
            db.execute(
                "UPDATE class_preferences SET is_active = ? WHERE user_id = ? AND class_id = ?",
                (1 if new_state else 0, user_id, class_id)
            )

        db.commit()
        return {"class_id": class_id, "is_active": new_state}
    finally:
        db.close()
