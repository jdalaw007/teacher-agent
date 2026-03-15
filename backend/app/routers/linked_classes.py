from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.services.linked_classes import LinkedClassService
from app.services.token_store import get_user_id_from_token

router = APIRouter()


def get_user_id_from_request(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = auth_header.split(" ")[1]
    return get_user_id_from_token(token)


class CreateLinkRequest(BaseModel):
    link_name: str
    class_ids: list[str]


class UpdateLinkRequest(BaseModel):
    link_name: Optional[str] = None
    class_ids: Optional[list[str]] = None


@router.get("/list")
async def list_links(request: Request):
    """List all link groups for the teacher."""
    user_id = get_user_id_from_request(request)
    service = LinkedClassService(user_id)
    links = service.list_links()
    return {"links": links}


@router.post("/create")
async def create_link(body: CreateLinkRequest, request: Request):
    """Create a linked classes group."""
    user_id = get_user_id_from_request(request)
    service = LinkedClassService(user_id)
    link = service.create_link(body.link_name, body.class_ids)
    return link


@router.put("/{link_id}")
async def update_link(link_id: int, body: UpdateLinkRequest, request: Request):
    """Update a linked classes group."""
    user_id = get_user_id_from_request(request)
    service = LinkedClassService(user_id)
    link = service.update_link(link_id, link_name=body.link_name, class_ids=body.class_ids)
    if not link:
        raise HTTPException(status_code=404, detail="Link group not found")
    return link


@router.delete("/{link_id}")
async def delete_link(link_id: int, request: Request):
    """Delete a linked classes group."""
    user_id = get_user_id_from_request(request)
    service = LinkedClassService(user_id)
    success = service.delete_link(link_id)
    if not success:
        raise HTTPException(status_code=404, detail="Link group not found")
    return {"deleted": True}
