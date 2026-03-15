# Teacher Agent — Claude Code Context

AI-powered teaching assistant integrating Google Workspace with an AI chat agent.

---

## CRITICAL: Starting the Servers

**Always use the startup script — never start servers manually:**
```bash
cd /c/Users/jdlaw/teacher-agent
./start.sh
```

This script automatically finds a free backend port (8005+), updates `frontend/.env.local`, and starts both servers. **Never use `--reload` with uvicorn** — it creates unkillable zombie processes on Windows that permanently occupy ports.

If you must start manually:
```bash
# 1. Find a free port first
cd backend && venv/Scripts/python.exe -c "
import socket, sys
for p in range(8005, 8100):
    try:
        s = socket.socket(); s.bind(('127.0.0.1', p)); s.close(); print(p); break
    except: pass
"
# 2. Start backend (no --reload)
PYTHONDONTWRITEBYTECODE=1 PYTHONUTF8=1 venv/Scripts/python.exe -m uvicorn app.main:app --port <PORT>

# 3. Update frontend/.env.local NEXT_PUBLIC_API_URL=http://localhost:<PORT>
# 4. Start frontend
cd frontend && npm run dev
```

**Known zombie ports (never use):** 8001, 8002, 8003, 8004
**OAuth callback stays on 8003** — Google redirects there, zombie processes handle it fine.

---

## Project Structure

```
teacher-agent/
├── start.sh                    # Always use this to start servers
├── CLAUDE.md                   # This file
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app, registers all routers
│   │   ├── config.py           # Pydantic settings (reads .env)
│   │   ├── routers/            # One file per feature area
│   │   │   ├── auth.py         # Google OAuth login/callback
│   │   │   ├── agent.py        # Assignment generation endpoints
│   │   │   ├── chat.py         # Conversation endpoints (SSE streaming)
│   │   │   ├── classroom.py    # Google Classroom API
│   │   │   ├── content.py      # Content checker (SSE streaming)
│   │   │   ├── corpus.py       # Document upload/search
│   │   │   ├── dashboard.py    # Dashboard summary + greeting SSE
│   │   │   ├── drive.py        # Google Drive API
│   │   │   ├── linked_classes.py
│   │   │   ├── onboarding.py   # Profile CRUD
│   │   │   ├── scheduled_posts.py
│   │   │   └── students.py
│   │   └── services/           # Business logic
│   │       ├── agent.py        # AgentService — assignment generation
│   │       ├── chat_agent.py   # ChatAgentService — main AI with tools
│   │       ├── content_checker.py  # ContentCheckerService
│   │       ├── corpus.py       # CorpusService — doc storage/search
│   │       ├── database.py     # SQLite connection + init_db()
│   │       ├── google_auth.py  # GoogleAuthService — OAuth flow
│   │       ├── linked_classes.py
│   │       ├── memory.py       # Conversation memory
│   │       ├── profile.py      # ProfileService — user profiles
│   │       ├── prompts.py      # System prompts for AI
│   │       ├── scheduled_posts.py
│   │       ├── students.py
│   │       └── token_store.py  # Token → user_id resolution (CRITICAL)
│   ├── data/
│   │   ├── corpus/             # Uploaded documents: data/corpus/{user_id}/{class_id}/
│   │   └── teacher_agent.db    # SQLite database
│   ├── .env                    # Google OAuth creds, OpenAI key, ports
│   └── venv/                   # Python virtualenv (Windows: venv/Scripts/python.exe)
└── frontend/
    ├── src/app/                # Next.js App Router pages
    │   ├── page.tsx            # Login page
    │   ├── dashboard/          # Dashboard (AI chat panel + submissions)
    │   ├── classes/            # Class list + linked classes management
    │   ├── classes/[id]/       # Individual class detail
    │   ├── chat/               # Full AI chat interface
    │   ├── agent/              # Assignment generator + corpus upload
    │   ├── onboarding/         # 3-step setup wizard
    │   └── settings/           # Profile + API key settings
    ├── src/components/
    │   └── Navbar.tsx          # Top nav: Dashboard, Classes, Chat, Agent, Settings
    └── .env.local              # NEXT_PUBLIC_API_URL=http://localhost:<PORT>
```

---

## Tech Stack

- **Backend**: Python 3.11, FastAPI, SQLite (via sqlite3), OpenAI SDK
- **Frontend**: Next.js 16, React 18, TypeScript (no component libraries — inline styles only)
- **AI**: OpenAI GPT-4o for all AI features
- **Auth**: Google OAuth 2.0 (access token stored in browser localStorage)
- **Storage**: SQLite for all structured data, flat files for corpus documents

---

## Authentication & User Identity (CRITICAL)

Every request carries `Authorization: Bearer <google_access_token>`.

**Stable user_id**: `md5(email.lower())[:16]` — never use `md5(token)` as tokens rotate.

**token_store.py** resolves token → user_id:
1. Fast path: look up `access_token` in `teacher_tokens` table
2. Slow path: call Google userinfo API, compute email-based user_id, cache it
3. Last resort fallback: `md5(token)` (unstable — only if Google API fails)

All routers use the same pattern:
```python
from app.services.token_store import get_user_id_from_token

def _get_user_id(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = auth_header.split(" ")[1]
    return get_user_id_from_token(token)
```

---

## Database Schema (SQLite — `data/teacher_agent.db`)

```sql
teacher_tokens (user_id TEXT PRIMARY KEY, refresh_token TEXT, access_token TEXT, updated_at TEXT)
user_profiles  (id, user_id TEXT UNIQUE, display_name, school_org, role, subjects JSON,
                grade_levels JSON, teaching_style, about, openai_api_key, onboarding_complete,
                created_at, updated_at, last_login_at)
conversations  (id, user_id, class_id, title, created_at, updated_at, ended_at)
messages       (id, conversation_id, role, content, tool_calls JSON, created_at)
episodic_memory(id, user_id, conversation_id, summary, created_at)
semantic_memory(id, user_id, key, value, updated_at)
students       (id, teacher_user_id, class_id, name, email, classroom_user_id, notes, created_at)
student_groups (id, teacher_user_id, class_id, name, description, created_at)
student_group_members (group_id, student_id)
submission_history (id, student_id, assignment_title, state, submitted_at, recorded_at)
scheduled_posts(id, user_id, class_id, post_type, title, content, frequency, day_of_week,
                week_of_month, time_of_day, max_points, active, last_posted_at, next_post_at, created_at)
linked_class_groups (id, owner_user_id, name, created_at)
linked_class_members (group_id, class_id)
assignments    (id, user_id, class_id, name, topic, assignment_type, content, created_at, updated_at)
```

Migrations run at startup in `database.py:init_db()` via safe `ALTER TABLE ... ADD COLUMN` try/except blocks.

---

## Code Patterns & Conventions

**No component libraries** — all styling is inline React `CSSProperties` objects at the bottom of each file.

**SSE streaming** (used for AI responses, dashboard greeting, content checker):
```python
# Backend: return StreamingResponse with generator
async def event_stream():
    for chunk in openai_stream:
        yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"
    yield f"data: {json.dumps({'type': 'done'})}\n\n"
return StreamingResponse(event_stream(), media_type="text/event-stream", headers={...})
```
```typescript
// Frontend: use fetch (NOT EventSource — EventSource doesn't support Authorization header)
const response = await fetch(`${API_URL}/endpoint`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: ... })
const reader = response.body!.getReader()
// read chunks, split on \n, parse data: {...} lines
```

**OpenAI client init** (always prefer user's own API key):
```python
from app.services.profile import ProfileService
user_key = ProfileService(user_id).get_api_key()
api_key = user_key or settings.openai_api_key
self.client = OpenAI(api_key=api_key) if api_key and api_key != "your-api-key-here" else None
```

**Windows encoding** — always use `PYTHONUTF8=1` env var when starting server. Never use non-ASCII chars in `print()` statements (use `->` not `→`).

---

## Features Built

1. Google OAuth 2.0 login with stable email-based user_id
2. Google Classroom: courses, assignments, submissions, announcements, roster
3. Google Drive file listing
4. AI Chat Agent with tool-calling (search_corpus, get_student_data, get_class_assignments, get_class_roster, post_assignment, post_announcement, search_memories, log_strategy)
5. Conversation memory (episodic + semantic, auto-summarized when conversation ends)
6. Document corpus (upload PDF/text, search, import from Drive)
7. Student profiles, submission sync, notes, groups
8. Assignment local storage (save/list/rename/delete)
9. Scheduled recurring posts (weekly/biweekly/monthly)
10. Linked classes (corpus searches span multiple linked classes)
11. Learning analytics (insight distillation from conversation history)
12. Onboarding wizard (3-step: about you, your work, API key)
13. Settings page (edit profile, API key with "Key on file" indicator, switch Google account)
14. Dashboard (AI greeting SSE + submissions since last login + placeholder cards)
15. Classes page (moved from dashboard: course grid + linked class management)
16. Content checker (POST /content/check — GPT-4o reviews assignment for safety/accuracy/bias)
17. Multi-user support (each Google account gets isolated data via email-based user_id)
18. Google account display + "Switch account" on login page, onboarding, and settings

---

## Planned / Next Features

- **Skills toggle system** — enable/disable capabilities (Classroom, Drive, Gmail, Calendar) via Settings, with incremental OAuth per skill. Design notes in `memory/skills-architecture.md`
- **Gmail skill** — read inbox, send emails from agent (scopes removed pending build)
- **Google Calendar skill** — view/create events from agent
- **Content checker enhancements** — auto-run before posting, not just on demand
- **Student-facing avatar** — separate agent with student permissions
- **Free/OSS AI model option** — Ollama or similar as alternative to OpenAI

---

## Environment Variables

**`backend/.env`**:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8003/auth/callback  # stays 8003 (zombie handles OAuth)
SECRET_KEY=...
FRONTEND_URL=http://localhost:3000
OPENAI_API_KEY=...  # fallback key; users can set their own in Settings
```

**`frontend/.env.local`**:
```
NEXT_PUBLIC_API_URL=http://localhost:<current_backend_port>  # updated by start.sh
```

---

## Testing

No automated test suite yet. Manual testing flow:
1. `./start.sh` — both servers up
2. Open http://localhost:3000 — login with Google
3. Complete onboarding → check Settings shows "Key on file"
4. Dashboard → AI greeting streams in
5. Chat → ask a question, verify response
6. Agent page → generate assignment → click "Check Content"

TypeScript check: `cd frontend && npx tsc --noEmit`

---

## Common Gotchas

- **Multiple zombie processes on same port** — check with `netstat -ano | grep ":800" | grep LISTENING`, use `start.sh` to avoid
- **Stale bytecache** — always use `PYTHONDONTWRITEBYTECODE=1`
- **Windows encoding errors** — always use `PYTHONUTF8=1`, never non-ASCII in print()
- **lru_cache on get_settings()** — settings cached for process lifetime; restart server after `.env` changes
- **Google access tokens expire ~1 hour** — token_store.py handles re-resolution via Google API
- **`has_api_key` in profile** — computed in `onboarding.py` router via `service.get_api_key()`, not returned raw
