from fastapi import APIRouter, HTTPException, Request
from app.services.calendar_service import CalendarService

router = APIRouter()


def _get_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    return auth_header.split(" ")[1]


@router.get("/events")
async def list_events(request: Request, max_results: int = 10, days_ahead: int = 14):
    """List upcoming calendar events from the teacher's primary Google Calendar."""
    token = _get_token(request)
    try:
        service = CalendarService(token)
        events = service.list_upcoming_events(max_results=max_results, days_ahead=days_ahead)
        return {"events": events}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
