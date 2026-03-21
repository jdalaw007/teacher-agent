from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.config import get_settings
from app.limiter import limiter
from app.routers import auth, classroom, drive, corpus, agent, assignments, students, linked_classes, scheduled_posts, chat, onboarding, dashboard, content, calendar, gmail, feedback, grader, class_preferences, files, erasure, audit, export
import traceback
import sys

settings = get_settings()


async def scheduled_post_checker():
    """Background task that checks for due scheduled posts every 15 minutes."""
    from app.services.scheduled_posts import ScheduledPostService
    while True:
        try:
            due_posts = ScheduledPostService.get_due_posts()
            for post in due_posts:
                try:
                    result = ScheduledPostService.execute_post(post)
                    if result["success"]:
                        print(f"[Scheduler] Posted: {post['title']} (id={post['id']})")
                    else:
                        print(f"[Scheduler] Failed: {post['title']} — {result['error']}", file=sys.stderr)
                except Exception as e:
                    print(f"[Scheduler] Error executing post {post['id']}: {e}", file=sys.stderr)
        except Exception as e:
            print(f"[Scheduler] Check failed: {e}", file=sys.stderr)
        await asyncio.sleep(900)  # 15 minutes


async def retention_enforcer():
    """Background task that purges records past their GDPR retention period. Runs nightly."""
    from app.services.retention import run_retention
    await asyncio.sleep(3600)  # Wait 1 hour after startup before first run
    while True:
        try:
            report = run_retention()
            purged = {k: v for k, v in report.items() if isinstance(v, int) and v > 0}
            if purged:
                print(f"[Retention] Purged: {purged}")
            else:
                print("[Retention] Run complete — nothing to purge")
        except Exception as e:
            print(f"[Retention] Run failed: {e}", file=sys.stderr)
        await asyncio.sleep(86400)  # Run every 24 hours


async def conversation_auto_ender():
    """Background task that auto-ends conversations idle for 30+ minutes."""
    from app.services.database import get_db
    while True:
        try:
            db = get_db()
            try:
                # Find conversations with no messages in 30+ minutes
                stale = db.execute("""
                    SELECT c.id, c.teacher_user_id FROM chat_conversations c
                    WHERE c.ended_at IS NULL
                    AND (
                        SELECT MAX(m.created_at) FROM chat_messages m
                        WHERE m.conversation_id = c.id
                    ) < datetime('now', '-30 minutes')
                """).fetchall()

                for conv in stale:
                    from app.services import memory
                    memory.end_conversation(conv["id"], summary="Auto-ended due to inactivity.")
                    print(f"[Scheduler] Auto-ended conversation {conv['id']}")
            finally:
                db.close()
        except Exception as e:
            print(f"[Scheduler] Auto-end check failed: {e}", file=sys.stderr)
        await asyncio.sleep(900)  # Check every 15 minutes


@asynccontextmanager
async def lifespan(app):
    # Start background schedulers
    task = asyncio.create_task(scheduled_post_checker())
    auto_end_task = asyncio.create_task(conversation_auto_ender())
    retention_task = asyncio.create_task(retention_enforcer())
    print("[Scheduler] Background scheduled post checker started")
    print("[Scheduler] Background conversation auto-ender started")
    print("[Retention] GDPR retention enforcer started (first run in 1 hour)")
    yield
    task.cancel()
    auto_end_task.cancel()
    retention_task.cancel()


app = FastAPI(
    title="Teacher Agent API",
    description="API for Teacher Assistant Agent - Google Classroom integration",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"ERROR: {exc}", file=sys.stderr)
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"detail": str(exc)})

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(classroom.router, prefix="/classroom", tags=["Classroom"])
app.include_router(drive.router, prefix="/drive", tags=["Drive"])
app.include_router(corpus.router, prefix="/corpus", tags=["Corpus"])
app.include_router(agent.router, prefix="/agent", tags=["Agent"])
app.include_router(assignments.router, prefix="/assignments", tags=["Assignments"])
app.include_router(students.router, prefix="/students", tags=["Students"])
app.include_router(linked_classes.router, prefix="/linked-classes", tags=["Linked Classes"])
app.include_router(scheduled_posts.router, prefix="/scheduled-posts", tags=["Scheduled Posts"])
app.include_router(chat.router, prefix="/chat", tags=["Chat"])
app.include_router(onboarding.router, prefix="/onboarding", tags=["Onboarding"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
app.include_router(content.router, prefix="/content", tags=["Content"])
app.include_router(calendar.router, prefix="/calendar", tags=["Calendar"])
app.include_router(gmail.router, prefix="/gmail", tags=["Gmail"])
app.include_router(feedback.router, prefix="/feedback", tags=["Feedback"])
app.include_router(grader.router, prefix="/grader", tags=["Grader"])
app.include_router(class_preferences.router, prefix="/class-preferences", tags=["Class Preferences"])
app.include_router(files.router, prefix="/files", tags=["Files"])
app.include_router(erasure.router, prefix="/erase", tags=["Erasure"])
app.include_router(audit.router, prefix="/audit", tags=["Audit"])
app.include_router(export.router, prefix="/export", tags=["Export"])


@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/test-corpus")
async def test_corpus():
    """Test endpoint for corpus."""
    try:
        from app.services.corpus import CorpusService
        cs = CorpusService("test_user")
        docs = cs.list_documents()
        return {"status": "ok", "documents": docs}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}
