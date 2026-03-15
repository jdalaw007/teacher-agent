from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.services.scheduled_posts import ScheduledPostService
from app.services.token_store import get_user_id_from_token

router = APIRouter()


def get_user_id_from_request(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = auth_header.split(" ")[1]
    return get_user_id_from_token(token)


class CreateScheduledPostRequest(BaseModel):
    class_id: str
    post_type: str = "assignment"  # 'assignment' or 'announcement'
    title: str
    content: str
    frequency: str  # 'weekly', 'biweekly', 'monthly'
    day_of_week: Optional[int] = None  # 0=Monday..6=Sunday
    week_of_month: Optional[int] = None  # 1-4 (1st, 2nd, 3rd, 4th occurrence)
    time_of_day: Optional[str] = "08:00"
    max_points: Optional[int] = None


class UpdateScheduledPostRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    post_type: Optional[str] = None
    frequency: Optional[str] = None
    day_of_week: Optional[int] = None
    week_of_month: Optional[int] = None
    time_of_day: Optional[str] = None
    max_points: Optional[int] = None
    active: Optional[int] = None


@router.get("/list")
async def list_scheduled_posts(request: Request, class_id: Optional[str] = None):
    """List all scheduled posts for this teacher, optionally filtered by class."""
    user_id = get_user_id_from_request(request)
    service = ScheduledPostService(user_id)
    posts = service.list_posts(class_id)
    return {"scheduled_posts": posts}


@router.post("/create")
async def create_scheduled_post(body: CreateScheduledPostRequest, request: Request):
    """Create a new scheduled recurring post."""
    user_id = get_user_id_from_request(request)
    service = ScheduledPostService(user_id)
    post = service.create(
        class_id=body.class_id,
        post_type=body.post_type,
        title=body.title,
        content=body.content,
        frequency=body.frequency,
        day_of_week=body.day_of_week,
        week_of_month=body.week_of_month,
        time_of_day=body.time_of_day,
        max_points=body.max_points,
    )
    return post


@router.put("/{post_id}")
async def update_scheduled_post(post_id: int, body: UpdateScheduledPostRequest, request: Request):
    """Update a scheduled post."""
    user_id = get_user_id_from_request(request)
    service = ScheduledPostService(user_id)
    post = service.update(post_id, **body.model_dump(exclude_none=True))
    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")
    return post


@router.delete("/{post_id}")
async def delete_scheduled_post(post_id: int, request: Request):
    """Delete a scheduled post."""
    user_id = get_user_id_from_request(request)
    service = ScheduledPostService(user_id)
    success = service.delete(post_id)
    if not success:
        raise HTTPException(status_code=404, detail="Scheduled post not found")
    return {"deleted": True}


@router.post("/{post_id}/toggle")
async def toggle_scheduled_post(post_id: int, request: Request):
    """Toggle a scheduled post active/inactive."""
    user_id = get_user_id_from_request(request)
    service = ScheduledPostService(user_id)
    post = service.toggle_active(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")
    return post


@router.post("/{post_id}/post-now")
async def post_now(post_id: int, request: Request):
    """Manually trigger a scheduled post right now."""
    user_id = get_user_id_from_request(request)
    service = ScheduledPostService(user_id)
    post = service.get_post(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")

    result = ScheduledPostService.execute_post(post)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"message": "Posted successfully", "result": result}


@router.post("/check-due")
async def check_and_post_due(request: Request):
    """Check for due scheduled posts and execute them. Called by frontend on load or by scheduler."""
    user_id = get_user_id_from_request(request)
    # Only execute posts belonging to this teacher
    service = ScheduledPostService(user_id)
    all_posts = service.list_posts()

    import datetime
    now = datetime.datetime.utcnow().isoformat()

    results = []
    for post in all_posts:
        if post["active"] and post["next_post_at"] <= now:
            result = ScheduledPostService.execute_post(post)
            results.append({"post_id": post["id"], "title": post["title"], **result})

    return {"executed": len(results), "results": results}
