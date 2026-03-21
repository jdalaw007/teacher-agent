import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from app.services.token_store import get_user_id_from_token
from app.services.export import export_teacher_data
from app.services import audit

router = APIRouter()


def _get_user_id(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    return get_user_id_from_token(auth.split(" ")[1])


@router.get("/my-data")
async def export_my_data(request: Request):
    """
    GDPR Art. 20 — export all personal data for the authenticated teacher.
    Returns a JSON file download.
    """
    teacher_user_id = _get_user_id(request)
    data = export_teacher_data(teacher_user_id)

    audit.log(teacher_user_id, audit.EXPORT, "account", detail="gdpr_art20_export")

    filename = f"teacher-agent-export-{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
    content = json.dumps(data, indent=2, default=str).encode("utf-8")

    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
