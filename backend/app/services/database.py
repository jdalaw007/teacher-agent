import sqlite3
from pathlib import Path

DB_DIR = Path(__file__).parent.parent.parent / "data"
DB_PATH = DB_DIR / "students.db"

_initialized = False


def get_db() -> sqlite3.Connection:
    """Return a connection with Row factory. Calls init_db() on first use."""
    global _initialized
    if not _initialized:
        init_db()
        _initialized = True

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Create tables if they don't exist."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            classroom_user_id TEXT,
            name TEXT NOT NULL,
            email TEXT,
            class_id TEXT NOT NULL,
            teacher_user_id TEXT NOT NULL,
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(classroom_user_id, class_id, teacher_user_id)
        );

        CREATE TABLE IF NOT EXISTS submission_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            assignment_id TEXT NOT NULL,
            assignment_title TEXT,
            state TEXT,
            grade REAL,
            late INTEGER DEFAULT 0,
            submitted_at TEXT,
            recorded_at TEXT DEFAULT (datetime('now'))
        );
    """)
    conn.close()
