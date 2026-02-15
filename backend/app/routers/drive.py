from fastapi import APIRouter, HTTPException, Request
from app.services.drive import DriveService

router = APIRouter()


def get_token_from_request(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    return auth_header.split(" ")[1]


@router.get("/files")
async def list_files(request: Request, folder_id: str = None, page_size: int = 20):
    """List files in Drive, optionally filtered by folder."""
    token = get_token_from_request(request)
    service = DriveService(token)
    try:
        files = service.list_files(folder_id=folder_id, page_size=page_size)
        return {"files": files}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/files/{file_id}")
async def get_file(file_id: str, request: Request):
    """Get metadata for a specific file."""
    token = get_token_from_request(request)
    service = DriveService(token)
    try:
        file_info = service.get_file(file_id)
        return file_info
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
