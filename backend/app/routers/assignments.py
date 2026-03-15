from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
import json
from pathlib import Path
from datetime import datetime
from app.services.token_store import get_user_id_from_token

router = APIRouter()

# Storage directory
DATA_DIR = Path(__file__).parent.parent.parent / "data" / "assignments"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_user_id(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        return get_user_id_from_token(token)
    return "anonymous"


def get_class_dir(user_id: str, class_id: str) -> Path:
    class_dir = DATA_DIR / user_id / class_id
    class_dir.mkdir(parents=True, exist_ok=True)
    return class_dir


def get_assignments_index(user_id: str, class_id: str) -> dict:
    class_dir = get_class_dir(user_id, class_id)
    index_file = class_dir / "index.json"
    if index_file.exists():
        return json.loads(index_file.read_text())
    return {"assignments": {}}


def save_assignments_index(user_id: str, class_id: str, index: dict):
    class_dir = get_class_dir(user_id, class_id)
    index_file = class_dir / "index.json"
    index_file.write_text(json.dumps(index, indent=2))


class SaveAssignmentRequest(BaseModel):
    class_id: str
    name: str
    topic: str
    assignment_type: str
    content: str


class RenameAssignmentRequest(BaseModel):
    name: str


@router.get("/list")
async def list_assignments(request: Request, class_id: str):
    """List all saved assignments for a class."""
    user_id = get_user_id(request)
    index = get_assignments_index(user_id, class_id)

    assignments = []
    for assign_id, info in index.get("assignments", {}).items():
        assignments.append({
            "id": assign_id,
            **info
        })

    # Sort by created date, newest first
    assignments.sort(key=lambda x: x.get("created", ""), reverse=True)

    return {"assignments": assignments, "class_id": class_id}


@router.post("/save")
async def save_assignment(request: Request, body: SaveAssignmentRequest):
    """Save a generated assignment."""
    user_id = get_user_id(request)
    class_dir = get_class_dir(user_id, body.class_id)

    # Generate ID from name and timestamp
    assign_id = hashlib.md5(f"{body.name}{datetime.now().isoformat()}".encode()).hexdigest()[:12]

    # Save content
    (class_dir / f"{assign_id}.txt").write_text(body.content, encoding='utf-8')

    # Update index
    index = get_assignments_index(user_id, body.class_id)
    index["assignments"][assign_id] = {
        "name": body.name,
        "topic": body.topic,
        "type": body.assignment_type,
        "created": datetime.now().isoformat()
    }
    save_assignments_index(user_id, body.class_id, index)

    return {
        "message": "Assignment saved",
        "id": assign_id,
        "name": body.name
    }


@router.get("/{assign_id}")
async def get_assignment(assign_id: str, request: Request, class_id: str):
    """Get a saved assignment's content."""
    user_id = get_user_id(request)
    class_dir = get_class_dir(user_id, class_id)
    index = get_assignments_index(user_id, class_id)

    if assign_id not in index.get("assignments", {}):
        raise HTTPException(404, "Assignment not found")

    content_file = class_dir / f"{assign_id}.txt"
    if not content_file.exists():
        raise HTTPException(404, "Assignment content not found")

    content = content_file.read_text(encoding='utf-8')

    return {
        "id": assign_id,
        "content": content,
        **index["assignments"][assign_id]
    }


@router.put("/{assign_id}/rename")
async def rename_assignment(assign_id: str, request: Request, class_id: str, body: RenameAssignmentRequest):
    """Rename a saved assignment."""
    user_id = get_user_id(request)
    index = get_assignments_index(user_id, class_id)

    if assign_id not in index.get("assignments", {}):
        raise HTTPException(404, "Assignment not found")

    index["assignments"][assign_id]["name"] = body.name
    save_assignments_index(user_id, class_id, index)

    return {"message": "Renamed", "id": assign_id, "name": body.name}


@router.delete("/{assign_id}")
async def delete_assignment(assign_id: str, request: Request, class_id: str):
    """Delete a saved assignment."""
    user_id = get_user_id(request)
    class_dir = get_class_dir(user_id, class_id)
    index = get_assignments_index(user_id, class_id)

    # Delete file
    content_file = class_dir / f"{assign_id}.txt"
    if content_file.exists():
        content_file.unlink()

    # Update index
    if assign_id in index.get("assignments", {}):
        del index["assignments"][assign_id]
        save_assignments_index(user_id, class_id, index)

    return {"deleted": True, "id": assign_id}
