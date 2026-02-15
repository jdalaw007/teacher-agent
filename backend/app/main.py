from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import get_settings
from app.routers import auth, classroom, drive, corpus, agent, assignments, students
import traceback
import sys

settings = get_settings()

app = FastAPI(
    title="Teacher Agent API",
    description="API for Teacher Assistant Agent - Google Classroom integration",
    version="0.1.0"
)

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
