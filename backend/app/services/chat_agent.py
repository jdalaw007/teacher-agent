import json
import sys
from openai import OpenAI
from app.config import get_settings
from app.services import memory
from app.services.prompts import CHAT_SYSTEM_PROMPT, CONVERSATION_SUMMARY_PROMPT
from app.services.student import StudentService
from app.services.classroom import ClassroomService
from app.services.linked_classes import LinkedClassService
from app.services.pseudonymize import safe_student_for_llm, anonymize_text
from app.services.database import get_db
from app.services import audit

settings = get_settings()

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "list_corpus_documents",
            "description": "List all documents uploaded to the teacher's corpus for a class.",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_id": {"type": "string", "description": "Class ID to list documents for (optional, lists all if omitted)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_corpus_document",
            "description": "Read the full content of a specific document from the corpus by its doc_id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "doc_id": {"type": "string", "description": "The document ID from list_corpus_documents"},
                    "class_id": {"type": "string", "description": "The class ID the document belongs to"},
                },
                "required": ["doc_id", "class_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_corpus",
            "description": "Search the teacher's uploaded documents and materials for relevant content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "class_id": {"type": "string", "description": "Class ID to search in (optional, searches all if omitted)"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_student_data",
            "description": "Get student profiles, grades, and submission history for specific students or all students in a class.",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_id": {"type": "string", "description": "Class ID"},
                    "student_ids": {"type": "array", "items": {"type": "integer"}, "description": "Specific student IDs (optional, gets all if omitted)"},
                },
                "required": ["class_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_class_assignments",
            "description": "List assignments for a class with submission statistics.",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_id": {"type": "string", "description": "Class/course ID"},
                },
                "required": ["class_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_assignment_detail",
            "description": "Get the full details of a specific assignment including its description, instructions, and any attached files (rubrics, worksheets, etc.). Use this when the teacher asks about the content of a specific assignment or its attachments.",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_id": {"type": "string", "description": "The class/course ID"},
                    "assignment_title": {"type": "string", "description": "The title or partial title of the assignment to look up"},
                },
                "required": ["class_id", "assignment_title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_class_roster",
            "description": "Get the full student roster for a class.",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_id": {"type": "string", "description": "Class/course ID"},
                },
                "required": ["class_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "post_assignment",
            "description": "Create and post an assignment to Google Classroom.",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_id": {"type": "string", "description": "Class/course ID"},
                    "title": {"type": "string", "description": "Assignment title"},
                    "description": {"type": "string", "description": "Assignment description/instructions"},
                    "max_points": {"type": "integer", "description": "Maximum points (optional)"},
                },
                "required": ["class_id", "title", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "post_announcement",
            "description": "Post an announcement to a Google Classroom stream.",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_id": {"type": "string", "description": "Class/course ID"},
                    "text": {"type": "string", "description": "Announcement text"},
                },
                "required": ["class_id", "text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_memories",
            "description": "Search past conversation memories and learned insights about the teacher's preferences and students.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "What to search for in memories"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "log_strategy",
            "description": "Record a teaching strategy suggestion for future follow-up and evaluation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "strategy_description": {"type": "string", "description": "Description of the strategy"},
                    "context": {"type": "string", "description": "Context for why this strategy was suggested"},
                    "class_id": {"type": "string", "description": "Related class ID (optional)"},
                },
                "required": ["strategy_description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_emails",
            "description": "Read recent emails from the teacher's Gmail inbox.",
            "parameters": {
                "type": "object",
                "properties": {
                    "max_results": {"type": "integer", "description": "Number of emails to fetch (default 10)"},
                    "query": {"type": "string", "description": "Gmail search query to filter emails (e.g. 'from:parent is:unread')"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_email_detail",
            "description": "Get the full body and attachment list for a specific email by message ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message_id": {"type": "string", "description": "The Gmail message ID"},
                },
                "required": ["message_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_email_attachment",
            "description": "Read the text content of an email attachment (supports PDF, Word, and plain text files).",
            "parameters": {
                "type": "object",
                "properties": {
                    "message_id": {"type": "string", "description": "The Gmail message ID"},
                    "attachment_id": {"type": "string", "description": "The attachment ID from get_email_detail"},
                    "mime_type": {"type": "string", "description": "The MIME type of the attachment"},
                    "filename": {"type": "string", "description": "The filename of the attachment"},
                },
                "required": ["message_id", "attachment_id", "mime_type", "filename"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "trash_email",
            "description": "Move an email to the trash (recoverable). Use this when the teacher asks to delete an email.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message_id": {"type": "string", "description": "The Gmail message ID to trash"},
                },
                "required": ["message_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "archive_email",
            "description": "Archive an email (removes it from inbox but keeps it). Use when the teacher wants to file/clear an email without deleting it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message_id": {"type": "string", "description": "The Gmail message ID to archive"},
                },
                "required": ["message_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "file_email",
            "description": "Apply a Gmail label to an email to file it into a folder. Use list_gmail_labels first to find the right label ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message_id": {"type": "string", "description": "The Gmail message ID"},
                    "label_id": {"type": "string", "description": "The Gmail label ID to apply"},
                },
                "required": ["message_id", "label_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_gmail_labels",
            "description": "List all available Gmail labels/folders. Use before file_email to find the correct label ID.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_drive",
            "description": "Search the teacher's Google Drive for files and folders by name or keyword. Returns file names, types, and links.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search term — file name, keyword, or Drive query (e.g. 'unit 5 test', 'scheme of work')",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results to return (default 10)",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "print_document",
            "description": (
                "Search Google Drive for a document and print it on the local printer. "
                "Use when the teacher asks to print something. "
                "The backend must be running on the same Windows machine as the printer. "
                "If printing for a whole class, use the student count as copies."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query to find the file in Drive (e.g. 'unit 5 test 5th grade')",
                    },
                    "copies": {
                        "type": "integer",
                        "description": "Number of copies to print.",
                    },
                    "printer_name": {
                        "type": "string",
                        "description": "Optional: exact printer name. Omit to use the system default printer.",
                    },
                },
                "required": ["query", "copies"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_calendar_events",
            "description": "Get upcoming events from the teacher's Google Calendar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "max_results": {"type": "integer", "description": "Maximum number of events to return (default 10)"},
                    "days_ahead": {"type": "integer", "description": "How many days ahead to look (default 14)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "navigate",
            "description": "Navigate the teacher to a different page in the app. Use when the teacher asks to go somewhere, open a page, or switch to a section.",
            "parameters": {
                "type": "object",
                "properties": {
                    "page": {
                        "type": "string",
                        "description": "Page to navigate to",
                        "enum": ["dashboard", "classes", "files", "inbox", "calendar", "settings", "admin"],
                    },
                },
                "required": ["page"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_language",
            "description": "Change the teacher's preferred language for the agent's responses. Use this when the teacher asks to switch languages.",
            "parameters": {
                "type": "object",
                "properties": {
                    "language": {"type": "string", "description": "Language name, e.g. English, Czech, Russian, Spanish, French"},
                },
                "required": ["language"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_documentation",
            "description": "Look up how-to information about the app's features. Use when the teacher asks how something works, where to find a feature, or what the app can do.",
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "The topic to look up",
                        "enum": [
                            "getting_started", "ai_chat_agent", "assignment_generator",
                            "document_library", "student_profiles", "scheduled_posts",
                            "content_checker", "settings", "gdpr_privacy", "known_limitations",
                        ],
                    },
                },
                "required": ["topic"],
            },
        },
    },
]


# Tools that are always available regardless of skills settings
_CORE_TOOLS = {
    "list_corpus_documents", "read_corpus_document", "search_corpus",
    "get_student_data", "get_class_assignments", "get_assignment_detail",
    "get_class_roster", "search_memories", "log_strategy", "navigate",
    "set_language", "get_documentation",
}

# Maps skill key → set of tool names it unlocks
_SKILL_TOOL_MAP = {
    "classroom_post": {"post_assignment", "post_announcement"},
    "gmail": {
        "get_emails", "get_email_detail", "read_email_attachment",
        "trash_email", "archive_email", "file_email", "list_gmail_labels",
    },
    "calendar": {"get_calendar_events"},
    "drive_print": {"search_drive", "print_document"},
}


class ChatAgentService:
    def __init__(self, teacher_user_id: str, access_token: str):
        self.teacher_user_id = teacher_user_id
        self.access_token = access_token
        self.client = None
        self.model = "gpt-4o"
        self.embedding_model = "text-embedding-3-small"

        from app.services.profile import ProfileService
        ps = ProfileService(teacher_user_id)
        provider = ps.get_ai_provider()

        if provider == "gemini":
            gemini_key = ps.get_gemini_api_key() or settings.gemini_api_key
            if gemini_key:
                self.client = OpenAI(
                    api_key=gemini_key,
                    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                )
                self.model = "models/gemini-2.5-flash"
                self.embedding_model = "models/text-embedding-004"
        else:
            user_key = ps.get_api_key()
            api_key = user_key or settings.openai_api_key
            if api_key and api_key != "your-api-key-here":
                self.client = OpenAI(api_key=api_key)

        # Build allowed tool set from core + enabled skills
        skills = ps.get_skills()
        allowed = set(_CORE_TOOLS)
        for skill, enabled in skills.items():
            if enabled and skill in _SKILL_TOOL_MAP:
                allowed.update(_SKILL_TOOL_MAP[skill])
        self.tools = [t for t in TOOL_DEFINITIONS if t["function"]["name"] in allowed]

    def _assemble_context(self, conversation_id: str, user_message: str) -> str:
        """Auto-gather context for the conversation."""
        parts = []

        # 0. Teacher profile + language
        try:
            from app.services.profile import ProfileService
            ps = ProfileService(self.teacher_user_id)
            profile_block = ps.get_context_block()
            if profile_block:
                parts.append(profile_block)
            lang = ps.get_language()
            if lang and lang != "English":
                parts.append(f"## Language\nAlways respond in {lang}. Do not switch to English unless explicitly asked.")
        except Exception as e:
            print(f"[ChatAgent] Failed to load profile: {e}", file=sys.stderr)

        # 1. Teacher's classes
        try:
            classroom = ClassroomService(self.access_token)
            courses = classroom.list_courses()
            if courses:
                class_list = "\n".join(
                    f"- {c.get('name', 'Unknown')} (ID: {c.get('id', '')})"
                    for c in courses[:20]
                )
                parts.append(f"## Teacher's Classes\n{class_list}")
        except Exception as e:
            print(f"[ChatAgent] Failed to load classes: {e}", file=sys.stderr)

        # 2. Relevant memories
        try:
            memories = memory.get_relevant_memories(self.teacher_user_id, user_message, limit=3,
                                                    embedding_client=self.client, embedding_model=self.embedding_model)
            memory_texts = []
            for ep in memories.get("episodic", []):
                memory_texts.append(f"- [Past conversation] {ep['content'][:200]}")
            for sem in memories.get("semantic", []):
                memory_texts.append(f"- [Learned insight] {sem['content'][:200]}")
            if memory_texts:
                parts.append(f"## Relevant Memories\n" + "\n".join(memory_texts))
        except Exception as e:
            print(f"[ChatAgent] Failed to load memories: {e}", file=sys.stderr)

        # 3. Recent conversation context
        try:
            messages = memory.get_conversation_messages(conversation_id)
            if len(messages) > 1:
                parts.append(f"## Conversation History\nThis conversation has {len(messages)} previous messages.")
        except Exception:
            pass

        if parts:
            return "## Current Context\n\n" + "\n\n".join(parts)
        return ""

    def _execute_tool(self, tool_name: str, arguments: dict) -> str:
        """Execute a tool call and return the result as a string."""
        try:
            if tool_name == "list_corpus_documents":
                from pathlib import Path
                import json as _json
                corpus_dir = Path(__file__).parent.parent.parent / "data" / "corpus" / self.teacher_user_id
                class_id = arguments.get("class_id", "")
                docs = []
                if class_id:
                    dirs = [corpus_dir / class_id]
                else:
                    dirs = list(corpus_dir.iterdir()) if corpus_dir.exists() else []
                for cdir in dirs:
                    if not cdir.is_dir():
                        continue
                    index_file = cdir / "index.json"
                    if index_file.exists():
                        index = _json.loads(index_file.read_text())
                        for doc_id, info in index.get("documents", {}).items():
                            docs.append({
                                "doc_id": doc_id,
                                "title": info.get("title", doc_id),
                                "class_id": cdir.name,
                                "filename": info.get("filename", ""),
                            })
                if docs:
                    return json.dumps(docs)
                return json.dumps({"message": "No documents found in corpus."})

            elif tool_name == "read_corpus_document":
                from pathlib import Path
                doc_id = arguments["doc_id"]
                class_id = arguments["class_id"]
                corpus_dir = Path(__file__).parent.parent.parent / "data" / "corpus" / self.teacher_user_id
                doc_file = corpus_dir / class_id / f"{doc_id}.txt"
                if doc_file.exists():
                    content = doc_file.read_text(encoding="utf-8")
                    return json.dumps({"doc_id": doc_id, "content": content[:12000]})
                return json.dumps({"error": f"Document {doc_id} not found"})

            elif tool_name == "search_corpus":
                class_id = arguments.get("class_id", "")
                query = arguments["query"]
                from pathlib import Path
                corpus_dir = Path(__file__).parent.parent.parent / "data" / "corpus" / self.teacher_user_id
                results = []

                if class_id:
                    # Search specific class (and linked classes)
                    linked = LinkedClassService(self.teacher_user_id)
                    class_ids = linked.get_linked_class_ids(class_id)
                    for cid in class_ids:
                        cdir = corpus_dir / cid
                        if cdir.exists():
                            index_file = cdir / "index.json"
                            if index_file.exists():
                                index = json.loads(index_file.read_text())
                                for doc_id, info in index.get("documents", {}).items():
                                    doc_file = cdir / f"{doc_id}.txt"
                                    if doc_file.exists():
                                        text = doc_file.read_text(encoding='utf-8')
                                        if query.lower() in text.lower():
                                            idx = text.lower().find(query.lower())
                                            snippet = text[max(0, idx-200):idx+500]
                                            results.append({"content": snippet, "metadata": info.get("metadata", {})})
                else:
                    # Search all classes
                    if corpus_dir.exists():
                        for cdir in corpus_dir.iterdir():
                            if cdir.is_dir():
                                index_file = cdir / "index.json"
                                if index_file.exists():
                                    index = json.loads(index_file.read_text())
                                    for doc_id, info in index.get("documents", {}).items():
                                        doc_file = cdir / f"{doc_id}.txt"
                                        if doc_file.exists():
                                            text = doc_file.read_text(encoding='utf-8')
                                            if query.lower() in text.lower():
                                                idx = text.lower().find(query.lower())
                                                snippet = text[max(0, idx-200):idx+500]
                                                results.append({"content": snippet, "metadata": info.get("metadata", {})})

                if results:
                    return json.dumps([{"content": r["content"][:500], "metadata": r.get("metadata", {})} for r in results[:5]])
                return json.dumps({"message": "No matching documents found."})

            elif tool_name == "get_student_data":
                class_id = arguments["class_id"]
                student_ids = arguments.get("student_ids")
                student_service = StudentService(self.teacher_user_id)

                if student_ids:
                    students = []
                    for sid in student_ids:
                        s = student_service.get_student(sid)
                        if s:
                            s["summary"] = student_service.get_student_summary(sid)
                            s["history"] = student_service.get_student_history(sid)[:5]
                            students.append(s)
                else:
                    students = student_service.list_students(class_id)
                    for s in students:
                        s["summary"] = student_service.get_student_summary(s["id"])

                # GDPR: strip name, email, notes before sending to OpenAI
                safe = [safe_student_for_llm(s) for s in students]
                ids = [s["id"] for s in students]
                audit.log(self.teacher_user_id, audit.READ, "student",
                          detail=f"tool=get_student_data class_id={class_id} ids={ids}")
                return json.dumps(safe, default=str)

            elif tool_name == "get_class_assignments":
                class_id = arguments["class_id"]
                classroom = ClassroomService(self.access_token)
                assignments = classroom.list_assignments(class_id)
                simplified = []
                for a in assignments[:20]:
                    simplified.append({
                        "id": a.get("id"),
                        "title": a.get("title"),
                        "state": a.get("state"),
                        "maxPoints": a.get("maxPoints"),
                        "dueDate": a.get("dueDate"),
                        "creationTime": a.get("creationTime"),
                    })
                return json.dumps(simplified, default=str)

            elif tool_name == "get_assignment_detail":
                class_id = arguments["class_id"]
                title_query = arguments["assignment_title"].lower()
                classroom = ClassroomService(self.access_token)
                assignments = classroom.list_assignments(class_id)

                # Find best title match
                match = None
                for a in assignments:
                    if title_query in a.get("title", "").lower():
                        match = a
                        break

                if not match:
                    return json.dumps({"error": f"No assignment found matching '{arguments['assignment_title']}'"})

                # Fetch full detail (includes materials)
                full = classroom.get_assignment(class_id, match["id"])
                result = {
                    "id": full.get("id"),
                    "title": full.get("title"),
                    "description": full.get("description", ""),
                    "state": full.get("state"),
                    "maxPoints": full.get("maxPoints"),
                    "dueDate": full.get("dueDate"),
                    "materials": [],
                }

                # Process attached materials
                from app.services.drive import DriveService
                drive = DriveService(self.access_token)
                for mat in full.get("materials", []):
                    if "driveFile" in mat:
                        df = mat["driveFile"]["driveFile"]
                        file_id = df.get("id")
                        entry = {
                            "title": df.get("title"),
                            "link": df.get("alternateLink"),
                        }
                        # Classroom API doesn't return mimeType — fetch it from Drive
                        try:
                            file_meta = drive.get_file(file_id)
                            mime = file_meta.get("mimeType", "")
                            entry["type"] = mime
                        except Exception:
                            mime = ""
                            entry["type"] = "unknown"

                        # Read content based on actual mimeType
                        try:
                            if mime in (
                                "application/vnd.google-apps.document",
                                "application/vnd.google-apps.spreadsheet",
                            ):
                                entry["content"] = drive.export_as_text(file_id, mime)[:4000]
                            elif mime == "text/plain":
                                raw = drive.download_file(file_id)
                                entry["content"] = raw.decode("utf-8", errors="replace")[:4000]
                            elif mime == "application/pdf":
                                import io
                                from pypdf import PdfReader
                                raw = drive.download_file(file_id)
                                reader = PdfReader(io.BytesIO(raw))
                                text = "\n".join(p.extract_text() or "" for p in reader.pages)
                                entry["content"] = text[:4000]
                        except Exception as e:
                            entry["content"] = f"(could not read content: {e})"
                        result["materials"].append(entry)
                    elif "link" in mat:
                        result["materials"].append({"title": mat["link"].get("title"), "url": mat["link"].get("url"), "type": "link"})
                    elif "form" in mat:
                        result["materials"].append({"title": mat["form"].get("title"), "type": "form"})

                return json.dumps(result, default=str)

            elif tool_name == "get_class_roster":
                class_id = arguments["class_id"]
                student_service = StudentService(self.teacher_user_id)
                students = student_service.list_students(class_id)
                if not students:
                    # Try importing from Classroom first
                    student_service.import_roster(self.access_token, class_id)
                    students = student_service.list_students(class_id)
                # GDPR: include name for LLM name-resolution but strip email
                audit.log(self.teacher_user_id, audit.LIST, "roster",
                          detail=f"tool=get_class_roster class_id={class_id}")
                return json.dumps([safe_student_for_llm(s, include_name=True) for s in students], default=str)

            elif tool_name == "post_assignment":
                class_id = arguments["class_id"]
                title = arguments["title"]
                description = arguments["description"]
                max_points = arguments.get("max_points")
                classroom = ClassroomService(self.access_token)
                result = classroom.create_assignment(
                    course_id=class_id,
                    title=title,
                    description=f"[AI Generated]\n\n{description}",
                    max_points=max_points,
                )
                return json.dumps({
                    "success": True,
                    "assignment_id": result.get("id"),
                    "title": result.get("title"),
                    "link": result.get("alternateLink"),
                })

            elif tool_name == "post_announcement":
                class_id = arguments["class_id"]
                text = arguments["text"]
                classroom = ClassroomService(self.access_token)
                result = classroom.create_announcement(class_id, f"[AI Generated]\n\n{text}")
                return json.dumps({
                    "success": True,
                    "announcement_id": result.get("id"),
                    "link": result.get("alternateLink"),
                })

            elif tool_name == "search_memories":
                query = arguments["query"]
                results = memory.get_relevant_memories(self.teacher_user_id, query, limit=5,
                                                       embedding_client=self.client, embedding_model=self.embedding_model)
                formatted = []
                for ep in results.get("episodic", []):
                    formatted.append({"type": "episodic", "content": ep["content"], "created_at": ep.get("created_at")})
                for sem in results.get("semantic", []):
                    formatted.append({"type": "semantic", "content": sem["content"], "confidence": sem.get("confidence")})
                return json.dumps(formatted, default=str)

            elif tool_name == "log_strategy":
                result = memory.log_strategy(
                    teacher_user_id=self.teacher_user_id,
                    strategy_description=arguments["strategy_description"],
                    context=arguments.get("context"),
                    class_id=arguments.get("class_id"),
                )
                return json.dumps({"success": True, "strategy_id": result.get("id")})

            elif tool_name == "get_emails":
                from app.services.gmail_service import GmailService
                max_results = arguments.get("max_results", 10)
                query = arguments.get("query", "")
                gmail = GmailService(self.access_token)
                messages = gmail.list_messages(max_results=max_results, query=query)
                return json.dumps(messages, default=str)

            elif tool_name == "get_email_detail":
                from app.services.gmail_service import GmailService
                gmail = GmailService(self.access_token)
                message = gmail.get_message(arguments["message_id"])
                return json.dumps(message, default=str)

            elif tool_name == "read_email_attachment":
                from app.services.gmail_service import GmailService
                gmail = GmailService(self.access_token)
                content = gmail.get_attachment_content(
                    message_id=arguments["message_id"],
                    attachment_id=arguments["attachment_id"],
                    mime_type=arguments["mime_type"],
                    filename=arguments["filename"],
                )
                return json.dumps({"filename": arguments["filename"], "content": content[:8000]}, default=str)

            elif tool_name == "trash_email":
                from app.services.gmail_service import GmailService
                gmail = GmailService(self.access_token)
                return json.dumps(gmail.trash_message(arguments["message_id"]))

            elif tool_name == "archive_email":
                from app.services.gmail_service import GmailService
                gmail = GmailService(self.access_token)
                return json.dumps(gmail.archive_message(arguments["message_id"]))

            elif tool_name == "file_email":
                from app.services.gmail_service import GmailService
                gmail = GmailService(self.access_token)
                return json.dumps(gmail.apply_label(arguments["message_id"], arguments["label_id"]))

            elif tool_name == "list_gmail_labels":
                from app.services.gmail_service import GmailService
                gmail = GmailService(self.access_token)
                return json.dumps(gmail.list_labels())

            elif tool_name == "search_drive":
                query = arguments.get("query", "")
                max_results = int(arguments.get("max_results", 10))
                from app.services.drive import DriveService
                files = DriveService(self.access_token).search_files(
                    f"name contains '{query}'", page_size=max_results
                )
                if not files:
                    return json.dumps({"results": [], "message": f"No files found matching: {query}"})
                results = [
                    {
                        "name": f.get("name"),
                        "type": f.get("mimeType", "").split(".")[-1],
                        "modified": f.get("modifiedTime", "")[:10],
                        "link": f.get("webViewLink", ""),
                        "id": f.get("id"),
                    }
                    for f in files
                ]
                return json.dumps({"results": results, "count": len(results)})

            elif tool_name == "print_document":
                query = arguments.get("query", "")
                copies = int(arguments.get("copies", 1))
                printer_name = arguments.get("printer_name")
                from app.services.drive import DriveService
                from app.services import print_service

                files = DriveService(self.access_token).search_files(query, page_size=5)
                if not files:
                    return json.dumps({"error": f"No files found in Drive matching: {query}"})

                file = files[0]
                result = print_service.download_and_print(
                    access_token=self.access_token,
                    file_id=file["id"],
                    mime_type=file["mimeType"],
                    filename=file["name"],
                    printer_name=printer_name,
                    copies=copies,
                )
                if result.get("success"):
                    return json.dumps({
                        "printed": True,
                        "filename": file["name"],
                        "copies": copies,
                        "printer": result.get("printer", "default"),
                    })
                return json.dumps(result)

            elif tool_name == "get_calendar_events":
                from app.services.calendar_service import CalendarService
                max_results = arguments.get("max_results", 10)
                days_ahead = arguments.get("days_ahead", 14)
                cal = CalendarService(self.access_token)
                events = cal.list_upcoming_events(max_results=max_results, days_ahead=days_ahead)
                return json.dumps(events, default=str)

            elif tool_name == "navigate":
                page = arguments.get("page", "dashboard")
                paths = {
                    "dashboard": "/dashboard", "classes": "/classes", "files": "/files",
                    "inbox": "/inbox", "calendar": "/calendar", "settings": "/settings", "admin": "/admin",
                }
                return json.dumps({"__navigate__": paths.get(page, "/dashboard"), "page": page})

            elif tool_name == "set_language":
                lang = arguments.get("language", "English")
                from app.services.profile import ProfileService
                ProfileService(self.teacher_user_id).save_profile({"language": lang})
                return json.dumps({"success": True, "language": lang})

            elif tool_name == "get_documentation":
                topic = arguments.get("topic", "getting_started")
                WIKI_BASE = "https://github.com/jdalaw007/teacher-agent/wiki"
                DOCS = {
                    "getting_started": {
                        "url": f"{WIKI_BASE}/Getting-Started",
                        "summary": (
                            "Log in with Google, then complete the 3-step onboarding: "
                            "(1) About You — name, school, role; "
                            "(2) Your Work — subjects and grade levels; "
                            "(3) API Key — paste your OpenAI or Gemini key. "
                            "After onboarding you land on the Dashboard: AI chat on the left, "
                            "recent submissions on the right."
                        ),
                    },
                    "ai_chat_agent": {
                        "url": f"{WIKI_BASE}/AI-Chat-Agent",
                        "summary": (
                            "The Chat page is a full AI conversation interface. The agent has tools: "
                            "search_corpus, get_student_data, get_class_assignments, get_class_roster, "
                            "post_assignment, post_announcement, search_memories, log_strategy. "
                            "Just ask naturally — the agent picks the right tool. "
                            "Conversations are summarised into episodic and semantic memory when ended. "
                            "Voice input works in Chrome and Edge."
                        ),
                    },
                    "assignment_generator": {
                        "url": f"{WIKI_BASE}/Assignment-Generator",
                        "summary": (
                            "Go to Agent, select a class and optionally a student or group, enter a topic, "
                            "grade level, and type, then click Generate. The AI uses your corpus documents "
                            "as source material. After generating you can Improve the draft or run Check Content "
                            "before posting to Google Classroom."
                        ),
                    },
                    "document_library": {
                        "url": f"{WIKI_BASE}/Document-Library",
                        "summary": (
                            "The corpus (Agent > Corpus tab) is your document library. Upload PDF, DOCX, or "
                            "plain text files, import from Google Drive, paste text directly, or import from a URL. "
                            "Documents are organised per class. Link classes together so the same documents "
                            "are searchable across multiple classes without re-uploading."
                        ),
                    },
                    "student_profiles": {
                        "url": f"{WIKI_BASE}/Student-Profiles-and-Groups",
                        "summary": (
                            "Student rosters sync automatically from Google Classroom. You can add private notes "
                            "per student, track submission history, and create custom groups. Student names and "
                            "emails are pseudonymised before being sent to the AI. "
                            "Ask the agent about groups or individual students naturally in chat."
                        ),
                    },
                    "scheduled_posts": {
                        "url": f"{WIKI_BASE}/Scheduled-Posts",
                        "summary": (
                            "From a class detail page, click Schedule Post. Choose assignment or announcement, "
                            "set the content, frequency (weekly/biweekly/monthly), day, and time. "
                            "Posts are sent automatically and repeat on the chosen schedule. "
                            "You can enable, disable, edit, or delete scheduled posts from the same page."
                        ),
                    },
                    "content_checker": {
                        "url": f"{WIKI_BASE}/Content-Checker",
                        "summary": (
                            "After generating an assignment, click Check Content to run a second AI review. "
                            "It checks for age-inappropriate content, factual errors, bias, and unclear instructions. "
                            "The output is advisory — you decide whether to post. Rate limit: 20 checks per minute."
                        ),
                    },
                    "settings": {
                        "url": f"{WIKI_BASE}/Settings-and-Configuration",
                        "summary": (
                            "Settings lets you update your profile, switch AI provider (OpenAI GPT-4o or Gemini 2.0 Flash), "
                            "test your API key, change the interface language (English, Czech, Russian, Spanish, French), "
                            "download your data export, and switch Google account. "
                            "Full documentation is linked at the bottom of the Settings page."
                        ),
                    },
                    "gdpr_privacy": {
                        "url": f"{WIKI_BASE}/GDPR-and-Data-Privacy",
                        "summary": (
                            "The app complies with EU GDPR and Czech Act 110/2019. Key protections: "
                            "student names/emails are pseudonymised before reaching the AI; "
                            "nightly retention enforcement deletes expired records automatically; "
                            "right to erasure via Settings (delete student or full account); "
                            "data export available (Art. 20); full audit log kept. "
                            "Age of consent in CZ is 15 — parental consent required for under-15s. "
                            "A DPIA + FRIA is required before school deployment."
                        ),
                    },
                    "known_limitations": {
                        "url": f"{WIKI_BASE}/Known-Limitations",
                        "summary": (
                            "Key limitations: (1) Switching AI providers (OpenAI <-> Gemini) breaks memory search "
                            "because the two providers use incompatible embedding models — pick one and stick with it. "
                            "(2) Voice input only works in Chrome and Edge. "
                            "(3) Gmail and Calendar integrations are not yet available. "
                            "(4) SQLite storage is suitable for single-teacher use, not school-wide concurrency."
                        ),
                    },
                }
                doc = DOCS.get(topic, DOCS["getting_started"])
                return json.dumps({"topic": topic, "summary": doc["summary"], "wiki_url": doc["url"]})

            else:
                return json.dumps({"error": f"Unknown tool: {tool_name}"})

        except Exception as e:
            print(f"[ChatAgent] Tool error ({tool_name}): {e}", file=sys.stderr)
            return json.dumps({"error": str(e)})

    async def stream_response(self, conversation_id: str, user_message: str, page_context: str = ""):
        """Async generator that yields SSE chunks."""
        if not self.client:
            yield f"data: {json.dumps({'type': 'error', 'content': 'OpenAI API key not configured.'})}\n\n"
            return

        # 1. Save user message
        memory.add_message(conversation_id, "user", user_message)

        # 2. Assemble context
        context = self._assemble_context(conversation_id, user_message)

        # 3. Build messages
        history = memory.get_conversation_messages(conversation_id)
        messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]

        if context:
            messages.append({"role": "system", "content": context})

        if page_context:
            messages.append({"role": "system", "content": f"The teacher is currently viewing: {page_context}"})

        # Add conversation history (skip system messages, limit to last 20)
        for msg in history[-20:]:
            role = msg["role"]
            if role == "system":
                continue

            if msg.get("tool_call_id"):
                # Tool result message
                messages.append({
                    "role": "tool",
                    "tool_call_id": msg["tool_call_id"],
                    "content": msg.get("content") or "",
                })
            elif msg.get("tool_calls"):
                # Assistant message with tool calls
                try:
                    tc = json.loads(msg["tool_calls"])
                except (json.JSONDecodeError, TypeError):
                    tc = None
                entry = {"role": "assistant", "content": msg.get("content") or None}
                if tc:
                    entry["tool_calls"] = tc
                messages.append(entry)
            else:
                # Regular user or assistant message
                messages.append({
                    "role": role,
                    "content": msg.get("content") or "",
                })

        # 4. Call OpenAI with streaming and tools - loop for tool calls
        max_tool_rounds = 5
        for round_num in range(max_tool_rounds):
            try:
                stream = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    tools=self.tools,
                    stream=True,
                    max_tokens=4000,
                )
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
                return

            full_content = ""
            tool_calls_accumulator = {}  # index -> {id, name, arguments}
            finish_reason = None

            for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                finish_reason = chunk.choices[0].finish_reason if chunk.choices else None

                if delta is None:
                    continue

                # Content chunks
                if delta.content:
                    full_content += delta.content
                    yield f"data: {json.dumps({'type': 'content', 'content': delta.content})}\n\n"

                # Tool call chunks
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_accumulator:
                            tool_calls_accumulator[idx] = {
                                "id": tc.id or "",
                                "name": "",
                                "arguments": "",
                            }
                        if tc.id:
                            tool_calls_accumulator[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tool_calls_accumulator[idx]["name"] = tc.function.name
                            if tc.function.arguments:
                                tool_calls_accumulator[idx]["arguments"] += tc.function.arguments

            # If we got content, save the assistant message
            if full_content:
                memory.add_message(conversation_id, "assistant", full_content)

            # If tool calls were made, execute them
            if tool_calls_accumulator:
                # Save assistant message with tool calls
                tool_calls_list = []
                for idx in sorted(tool_calls_accumulator.keys()):
                    tc = tool_calls_accumulator[idx]
                    tool_calls_list.append({
                        "id": tc["id"],
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": tc["arguments"],
                        },
                    })

                if not full_content:
                    # Save tool-call-only assistant message
                    memory.add_message(conversation_id, "assistant", None, tool_calls=tool_calls_list)

                # Add assistant message with tool calls to messages for next round
                assistant_msg = {"role": "assistant", "content": full_content or None, "tool_calls": tool_calls_list}
                messages.append(assistant_msg)

                # Execute each tool call
                for tc_data in tool_calls_list:
                    tool_name = tc_data["function"]["name"]
                    try:
                        args = json.loads(tc_data["function"]["arguments"])
                    except json.JSONDecodeError:
                        args = {}

                    yield f"data: {json.dumps({'type': 'tool_call', 'name': tool_name, 'arguments': args})}\n\n"

                    # Execute the tool
                    result = self._execute_tool(tool_name, args)

                    yield f"data: {json.dumps({'type': 'tool_result', 'name': tool_name, 'result': result[:500]})}\n\n"

                    # Emit navigate event if tool returned a navigation instruction
                    try:
                        result_data = json.loads(result)
                        if "__navigate__" in result_data:
                            yield f"data: {json.dumps({'type': 'navigate', 'path': result_data['__navigate__']})}\n\n"
                    except Exception:
                        pass

                    # Save tool result message
                    memory.add_message(conversation_id, "tool", result, tool_call_id=tc_data["id"])

                    # Add to messages for next round
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc_data["id"],
                        "content": result,
                    })

                # Continue loop to get the model's response after tool calls
                continue
            else:
                # No tool calls, we're done
                break

        # Parse actions from response
        if full_content:
            import re
            actions = re.findall(r'\[ACTION:([^\]]+)\]', full_content)
            if actions:
                yield f"data: {json.dumps({'type': 'actions', 'actions': actions})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    async def summarize_conversation(self, conversation_id: str) -> dict:
        """Summarize a conversation and save as episodic memory."""
        if not self.client:
            return {"error": "OpenAI API key not configured"}

        messages = memory.get_conversation_messages(conversation_id)
        if not messages:
            return {"error": "No messages in conversation"}

        # Build conversation text
        conv_text = "\n".join(
            f"{m['role'].upper()}: {m.get('content', '[tool call]')}"
            for m in messages if m["role"] in ("user", "assistant")
        )

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": CONVERSATION_SUMMARY_PROMPT},
                    {"role": "user", "content": conv_text[:10000]},
                ],
                max_tokens=1000,
                response_format={"type": "json_object"},
            )

            result_text = response.choices[0].message.content
            result = json.loads(result_text)

            summary = result.get("summary", "")
            tags = result.get("tags", [])
            title = result.get("title", "")

            # GDPR: anonymize student names in summary before storing/embedding
            db = get_db()
            try:
                all_students = [
                    dict(r) for r in db.execute(
                        "SELECT id, name FROM students WHERE teacher_user_id = ?",
                        (self.teacher_user_id,),
                    ).fetchall()
                ]
            finally:
                db.close()
            anon_summary = anonymize_text(summary, all_students)

            # End the conversation with summary and updated title
            memory.end_conversation(conversation_id, summary=anon_summary, tags=tags, title=title or None)

            # Save anonymized summary as episodic memory
            memory.save_episodic_memory(
                self.teacher_user_id,
                content=anon_summary,
                conversation_id=conversation_id,
                tags=tags,
                memory_type="conversation_summary",
                embedding_client=self.client,
                embedding_model=self.embedding_model,
            )

            # Save any strategies mentioned
            for strategy in result.get("strategies", []):
                memory.log_strategy(
                    self.teacher_user_id,
                    strategy_description=strategy,
                    conversation_id=conversation_id,
                )

            # Save preferences as episodic memories
            for pref in result.get("preferences", []):
                memory.save_episodic_memory(
                    self.teacher_user_id,
                    content=pref,
                    conversation_id=conversation_id,
                    tags=["preference"],
                    memory_type="teacher_preference",
                    embedding_client=self.client,
                    embedding_model=self.embedding_model,
                )

            return {"summary": summary, "tags": tags}

        except Exception as e:
            print(f"[ChatAgent] Summarization error: {e}", file=sys.stderr)
            # Still end the conversation even if summarization fails
            memory.end_conversation(conversation_id)
            return {"error": str(e)}
