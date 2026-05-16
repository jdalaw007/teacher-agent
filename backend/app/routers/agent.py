from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
from app.services.agent import AgentService
from app.services.student import StudentService
from app.services.token_store import get_user_id_from_token
from app.limiter import limiter
from datetime import date
import hashlib
import json
import re
from pathlib import Path


def _extract_file_text(file_bytes: bytes, filename: str) -> str:
    """Extract plain text from a PDF/docx/txt for use as AI context."""
    fname = (filename or "").lower()
    if fname.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="replace")
    if fname.endswith((".doc", ".docx")):
        from app.services.test_parser import extract_text
        return extract_text(file_bytes, filename)
    if fname.endswith(".pdf"):
        try:
            import fitz  # pymupdf
        except ImportError as e:
            raise ValueError(f"PDF support unavailable: {e}")
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        try:
            return "\n\n".join(page.get_text() for page in doc)
        finally:
            doc.close()
    raise ValueError(f"Unsupported file type: {filename}. Use .pdf, .docx, or .txt")

DATA_DIR = Path(__file__).parent.parent.parent / "data" / "corpus"


def _slugify(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')[:40]


def _get_or_create_generated_folder(user_id: str, class_id: str) -> str:
    """Return the 'Generated Assignments' folder id for this class, creating it if needed."""
    from app.services.database import get_db
    import uuid as _uuid
    db = get_db()
    try:
        row = db.execute(
            "SELECT id FROM file_folders WHERE user_id=? AND class_id=? AND name=?",
            (user_id, class_id, "Generated Assignments")
        ).fetchone()
        if row:
            return row["id"]
        folder_id = str(_uuid.uuid4())[:12]
        db.execute(
            "INSERT INTO file_folders (id, user_id, class_id, name) VALUES (?, ?, ?, ?)",
            (folder_id, user_id, class_id, "Generated Assignments")
        )
        db.commit()
        return folder_id
    finally:
        db.close()


def _auto_save_assignment(user_id: str, class_id: str, class_name: str, topic: str, content: str) -> str:
    """Save generated assignment to the files corpus. Returns the display title."""
    today = date.today().isoformat()
    class_label = class_name or class_id
    slug = f"{_slugify(topic)}_{_slugify(class_label)}_{today}"
    title = f"{topic} — {class_label} — {today}"

    folder_id = _get_or_create_generated_folder(user_id, class_id)

    class_dir = DATA_DIR / user_id / class_id
    class_dir.mkdir(parents=True, exist_ok=True)

    doc_id = hashlib.md5(slug.encode()).hexdigest()[:12]
    (class_dir / f"{doc_id}.txt").write_text(content, encoding='utf-8')

    idx_file = class_dir / "index.json"
    index = json.loads(idx_file.read_text()) if idx_file.exists() else {"documents": {}}
    index["documents"][doc_id] = {
        "title": title,
        "filename": f"{slug}.txt",
        "folder_id": folder_id,
        "source": "generated",
    }
    idx_file.write_text(json.dumps(index, indent=2))
    return title

router = APIRouter()


def get_user_id_from_request(request: Request) -> str:
    """Extract user ID from token."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = auth_header.split(" ")[1]
    return get_user_id_from_token(token)


class GenerateAssignmentRequest(BaseModel):
    topic: str
    class_id: str
    class_name: Optional[str] = None
    grade_level: Optional[str] = None
    assignment_type: str = "worksheet"
    additional_instructions: Optional[str] = None
    selected_doc_ids: Optional[list[str]] = None
    student_ids: Optional[list[int]] = None
    group_id: Optional[int] = None


class AskQuestionRequest(BaseModel):
    question: str


class ImproveAssignmentRequest(BaseModel):
    assignment_text: str


@router.post("/generate")
@limiter.limit("20/minute")
async def generate_assignment(request: Request, body: GenerateAssignmentRequest):
    """Generate an assignment using AI and corpus materials."""
    user_id = get_user_id_from_request(request)
    agent = AgentService(user_id, body.class_id)

    # Build student context if student_ids or group_id provided
    student_context = None
    student_service = StudentService(user_id)
    if body.group_id:
        members = student_service.get_group_members(body.group_id)
        if members:
            member_ids = [m["id"] for m in members]
            student_context = student_service.get_students_for_prompt(body.class_id, member_ids, group_id=body.group_id)
    elif body.student_ids:
        student_context = student_service.get_students_for_prompt(body.class_id, body.student_ids)

    result = agent.generate_assignment(
        topic=body.topic,
        grade_level=body.grade_level,
        assignment_type=body.assignment_type,
        additional_instructions=body.additional_instructions,
        selected_doc_ids=body.selected_doc_ids,
        student_context=student_context
    )

    if result.get("error"):
        raise HTTPException(status_code=503, detail=result["error"])

    if result.get("assignment"):
        saved_title = _auto_save_assignment(
            user_id=user_id,
            class_id=body.class_id,
            class_name=body.class_name or body.class_id,
            topic=body.topic,
            content=result["assignment"],
        )
        result["saved_filename"] = saved_title

    return result


@router.post("/generate-with-file")
@limiter.limit("20/minute")
async def generate_assignment_with_file(
    request: Request,
    file: UploadFile = File(...),
    body: str = Form(...),
):
    """Generate an assignment using an uploaded reference file as primary source.
    `body` is a JSON-encoded GenerateAssignmentRequest (same shape as /generate).
    The file is extracted to plain text and prepended to the AI prompt as the
    primary reference; corpus docs / search results still apply as secondary
    context.
    """
    try:
        body_data = json.loads(body)
        parsed = GenerateAssignmentRequest(**body_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid body JSON: {e}")

    file_bytes = await file.read()
    try:
        reference_content = _extract_file_text(file_bytes, file.filename or "")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not read file: {e}")

    if not reference_content.strip():
        raise HTTPException(status_code=422, detail="Uploaded file has no extractable text")

    # If no topic was provided, use the filename as a fallback so the assignment has a label
    if not parsed.topic.strip():
        parsed.topic = (file.filename or "Uploaded assignment").rsplit(".", 1)[0].replace("_", " ")

    user_id = get_user_id_from_request(request)
    agent = AgentService(user_id, parsed.class_id)

    student_context = None
    student_service = StudentService(user_id)
    if parsed.group_id:
        members = student_service.get_group_members(parsed.group_id)
        if members:
            member_ids = [m["id"] for m in members]
            student_context = student_service.get_students_for_prompt(parsed.class_id, member_ids, group_id=parsed.group_id)
    elif parsed.student_ids:
        student_context = student_service.get_students_for_prompt(parsed.class_id, parsed.student_ids)

    result = agent.generate_assignment(
        topic=parsed.topic,
        grade_level=parsed.grade_level,
        assignment_type=parsed.assignment_type,
        additional_instructions=parsed.additional_instructions,
        selected_doc_ids=parsed.selected_doc_ids,
        student_context=student_context,
        reference_content=reference_content,
        reference_filename=file.filename,
    )

    if result.get("error"):
        raise HTTPException(status_code=503, detail=result["error"])

    if result.get("assignment"):
        saved_title = _auto_save_assignment(
            user_id=user_id,
            class_id=parsed.class_id,
            class_name=parsed.class_name or parsed.class_id,
            topic=parsed.topic,
            content=result["assignment"],
        )
        result["saved_filename"] = saved_title
        result["used_file"] = file.filename

    return result


@router.post("/ask")
@limiter.limit("20/minute")
async def ask_question(request: Request, body: AskQuestionRequest):
    """Ask the AI a question using corpus materials."""
    user_id = get_user_id_from_request(request)
    agent = AgentService(user_id)

    result = agent.answer_question(body.question)

    if result.get("error"):
        raise HTTPException(status_code=503, detail=result["error"])

    return result


@router.post("/improve")
@limiter.limit("20/minute")
async def improve_assignment(request: Request, body: ImproveAssignmentRequest):
    """Get AI suggestions to improve an assignment."""
    user_id = get_user_id_from_request(request)
    agent = AgentService(user_id)

    result = agent.suggest_improvements(body.assignment_text)

    if result.get("error"):
        raise HTTPException(status_code=503, detail=result["error"])

    return result
