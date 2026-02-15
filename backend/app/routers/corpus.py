from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
import json
import hashlib
from pathlib import Path

router = APIRouter()

# Simple file storage
DATA_DIR = Path(__file__).parent.parent.parent / "data" / "corpus"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_user_id(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        return hashlib.md5(token.encode()).hexdigest()[:16]
    return "anonymous"


def get_class_dir(user_id: str, class_id: str) -> Path:
    class_dir = DATA_DIR / user_id / class_id
    class_dir.mkdir(parents=True, exist_ok=True)
    return class_dir


def get_index(user_id: str, class_id: str) -> dict:
    class_dir = get_class_dir(user_id, class_id)
    index_file = class_dir / "index.json"
    if index_file.exists():
        return json.loads(index_file.read_text())
    return {"documents": {}}


def save_index(user_id: str, class_id: str, index: dict):
    class_dir = get_class_dir(user_id, class_id)
    index_file = class_dir / "index.json"
    index_file.write_text(json.dumps(index, indent=2))


@router.get("/documents")
async def list_documents(request: Request, class_id: str):
    user_id = get_user_id(request)
    index = get_index(user_id, class_id)
    docs = [{"id": doc_id, **info} for doc_id, info in index["documents"].items()]
    return {"documents": docs, "class_id": class_id}


@router.post("/upload")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    class_id: str = Form(...),
    title: str = Form(None)
):
    user_id = get_user_id(request)
    class_dir = get_class_dir(user_id, class_id)

    content = await file.read()
    filename = file.filename or "untitled"
    doc_title = title or filename

    # Handle different file types
    if filename.lower().endswith('.pdf'):
        try:
            from pypdf import PdfReader
            import io
            pdf = PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        except Exception as e:
            raise HTTPException(400, f"Failed to parse PDF: {e}")
    elif filename.lower().endswith('.docx'):
        try:
            from docx import Document
            import io
            doc = Document(io.BytesIO(content))
            text = "\n".join(para.text for para in doc.paragraphs)
        except Exception as e:
            raise HTTPException(400, f"Failed to parse Word document: {e}")
    else:
        try:
            text = content.decode('utf-8')
        except:
            text = content.decode('latin-1')

    if not text.strip():
        raise HTTPException(400, "No text content found in PDF - the PDF may be image-based")

    doc_id = hashlib.md5(filename.encode()).hexdigest()[:12]

    # Save document
    (class_dir / f"{doc_id}.txt").write_text(text, encoding='utf-8')

    # Update index
    index = get_index(user_id, class_id)
    index["documents"][doc_id] = {"title": doc_title, "filename": filename}
    save_index(user_id, class_id, index)

    return {"message": "Uploaded", "doc_id": doc_id, "title": doc_title, "class_id": class_id}


@router.post("/upload-text")
async def upload_text(
    request: Request,
    class_id: str = Form(...),
    title: str = Form(...),
    content: str = Form(...)
):
    user_id = get_user_id(request)
    class_dir = get_class_dir(user_id, class_id)

    if not content.strip():
        raise HTTPException(400, "Content cannot be empty")

    doc_id = hashlib.md5(title.encode()).hexdigest()[:12]

    # Save document
    (class_dir / f"{doc_id}.txt").write_text(content, encoding='utf-8')

    # Update index
    index = get_index(user_id, class_id)
    index["documents"][doc_id] = {"title": title, "type": "text"}
    save_index(user_id, class_id, index)

    return {"message": "Added", "doc_id": doc_id, "title": title, "class_id": class_id}


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, request: Request, class_id: str):
    user_id = get_user_id(request)
    class_dir = get_class_dir(user_id, class_id)

    doc_file = class_dir / f"{doc_id}.txt"
    if doc_file.exists():
        doc_file.unlink()

    index = get_index(user_id, class_id)
    if doc_id in index["documents"]:
        del index["documents"][doc_id]
        save_index(user_id, class_id, index)

    return {"deleted": True, "doc_id": doc_id, "class_id": class_id}


@router.get("/documents/{doc_id}/content")
async def get_document_content(doc_id: str, request: Request, class_id: str):
    user_id = get_user_id(request)
    class_dir = get_class_dir(user_id, class_id)
    index = get_index(user_id, class_id)

    if doc_id not in index["documents"]:
        raise HTTPException(404, "Document not found")

    doc_file = class_dir / f"{doc_id}.txt"
    if not doc_file.exists():
        raise HTTPException(404, "Document file not found")

    content = doc_file.read_text(encoding='utf-8')
    return {
        "doc_id": doc_id,
        "content": content,
        "metadata": index["documents"][doc_id]
    }


@router.get("/search")
async def search_corpus(request: Request, class_id: str, query: str, limit: int = 5):
    user_id = get_user_id(request)
    class_dir = get_class_dir(user_id, class_id)
    index = get_index(user_id, class_id)

    results = []
    query_lower = query.lower()

    for doc_id in index["documents"]:
        doc_file = class_dir / f"{doc_id}.txt"
        if doc_file.exists():
            text = doc_file.read_text(encoding='utf-8')
            if query_lower in text.lower():
                idx = text.lower().find(query_lower)
                snippet = text[max(0, idx-100):idx+300]
                results.append({"content": snippet, "metadata": index["documents"][doc_id]})

    return {"results": results[:limit], "class_id": class_id}


def get_token_from_request(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    return auth_header.split(" ")[1]


@router.get("/drive-files")
async def list_drive_files(request: Request):
    """List Google Docs and text files from Drive that can be imported."""
    from app.services.drive import DriveService
    token = get_token_from_request(request)
    service = DriveService(token)
    try:
        files = service.list_docs_and_text_files()
        return {"files": files}
    except Exception as e:
        raise HTTPException(400, f"Failed to list Drive files: {e}")


@router.post("/import-from-drive")
async def import_from_drive(
    request: Request,
    file_id: str = Form(...),
    class_id: str = Form(...),
    title: str = Form(None)
):
    """Import a Google Doc or file from Drive into the corpus."""
    from app.services.drive import DriveService

    user_id = get_user_id(request)
    token = get_token_from_request(request)
    class_dir = get_class_dir(user_id, class_id)

    service = DriveService(token)

    try:
        # Get file info
        file_info = service.get_file(file_id)
        mime_type = file_info.get("mimeType", "")
        file_name = file_info.get("name", "untitled")
        doc_title = title or file_name

        # Extract text based on file type
        if mime_type == "application/vnd.google-apps.document":
            text = service.export_as_text(file_id, mime_type)
        elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            # Word doc - download and parse
            content = service.download_file(file_id)
            from docx import Document
            import io
            doc = Document(io.BytesIO(content))
            text = "\n".join(para.text for para in doc.paragraphs)
        elif mime_type == "application/pdf":
            content = service.download_file(file_id)
            from pypdf import PdfReader
            import io
            pdf = PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        elif mime_type == "text/plain":
            content = service.download_file(file_id)
            text = content.decode('utf-8')
        else:
            raise HTTPException(400, f"Unsupported file type: {mime_type}")

        if not text.strip():
            raise HTTPException(400, "No text content found in file")

        doc_id = hashlib.md5(file_id.encode()).hexdigest()[:12]

        # Save document
        (class_dir / f"{doc_id}.txt").write_text(text, encoding='utf-8')

        # Update index
        index = get_index(user_id, class_id)
        index["documents"][doc_id] = {
            "title": doc_title,
            "source": "google_drive",
            "drive_file_id": file_id
        }
        save_index(user_id, class_id, index)

        return {
            "message": "Imported from Drive",
            "doc_id": doc_id,
            "title": doc_title,
            "class_id": class_id
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Failed to import: {e}")
