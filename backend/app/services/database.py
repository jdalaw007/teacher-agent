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
            recorded_at TEXT DEFAULT (datetime('now')),
            UNIQUE(student_id, assignment_id)
        );

        CREATE TABLE IF NOT EXISTS student_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            class_id TEXT NOT NULL,
            teacher_user_id TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS student_group_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            UNIQUE(group_id, student_id)
        );

        CREATE TABLE IF NOT EXISTS linked_classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_user_id TEXT NOT NULL,
            link_name TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS linked_class_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link_id INTEGER NOT NULL REFERENCES linked_classes(id) ON DELETE CASCADE,
            class_id TEXT NOT NULL,
            UNIQUE(link_id, class_id)
        );

        CREATE TABLE IF NOT EXISTS teacher_tokens (
            user_id TEXT PRIMARY KEY,
            refresh_token TEXT,
            access_token TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS scheduled_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_user_id TEXT NOT NULL,
            class_id TEXT NOT NULL,
            post_type TEXT NOT NULL DEFAULT 'assignment',
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            frequency TEXT NOT NULL,
            day_of_week INTEGER,
            week_of_month INTEGER,
            time_of_day TEXT DEFAULT '08:00',
            max_points INTEGER,
            active INTEGER DEFAULT 1,
            last_posted_at TEXT,
            next_post_at TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chat_conversations (
            id TEXT PRIMARY KEY,
            teacher_user_id TEXT NOT NULL,
            title TEXT DEFAULT '',
            started_at TEXT DEFAULT (datetime('now')),
            ended_at TEXT,
            summary TEXT,
            tags TEXT DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            content TEXT,
            tool_calls TEXT,
            tool_call_id TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS episodic_memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_user_id TEXT NOT NULL,
            conversation_id TEXT REFERENCES chat_conversations(id) ON DELETE SET NULL,
            content TEXT NOT NULL,
            embedding TEXT,
            tags TEXT DEFAULT '[]',
            memory_type TEXT DEFAULT 'general',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS semantic_memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            embedding TEXT,
            category TEXT DEFAULT 'general',
            confidence REAL DEFAULT 0.5,
            source_episodic_ids TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS strategy_evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_user_id TEXT NOT NULL,
            strategy_description TEXT NOT NULL,
            context TEXT,
            class_id TEXT,
            student_ids TEXT DEFAULT '[]',
            suggested_at TEXT DEFAULT (datetime('now')),
            outcome TEXT,
            outcome_rating INTEGER,
            evaluated_at TEXT,
            conversation_id TEXT REFERENCES chat_conversations(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            message TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS grader_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_user_id TEXT NOT NULL,
            course_id TEXT NOT NULL,
            assignment_id TEXT NOT NULL,
            assignment_title TEXT,
            student_name TEXT NOT NULL,
            ai_score INTEGER,
            ai_reasoning TEXT,
            grade INTEGER,
            max_points INTEGER,
            feedback TEXT,
            plagiarism_flagged INTEGER DEFAULT 0,
            graded_at TEXT DEFAULT (datetime('now')),
            UNIQUE(teacher_user_id, course_id, assignment_id, student_name)
        );

        CREATE TABLE IF NOT EXISTS class_preferences (
            user_id TEXT NOT NULL,
            class_id TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            PRIMARY KEY (user_id, class_id)
        );

        CREATE TABLE IF NOT EXISTS file_folders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            class_id TEXT NOT NULL DEFAULT 'general',
            name TEXT NOT NULL,
            parent_id TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            display_name TEXT DEFAULT '',
            school_org TEXT DEFAULT '',
            role TEXT DEFAULT 'teacher',
            subjects TEXT DEFAULT '[]',
            grade_levels TEXT DEFAULT '[]',
            teaching_style TEXT DEFAULT '',
            about TEXT DEFAULT '',
            openai_api_key TEXT DEFAULT '',
            onboarding_complete INTEGER DEFAULT 0,
            last_login_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
    """)
    # Safe migrations for existing databases
    for migration in [
        "ALTER TABLE user_profiles ADD COLUMN last_login_at TEXT",
        "ALTER TABLE teacher_tokens ADD COLUMN access_token TEXT",
        "ALTER TABLE user_profiles ADD COLUMN language TEXT DEFAULT 'English'",
        """CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT DEFAULT (datetime('now')),
            teacher_user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            resource_id TEXT,
            detail TEXT
        )""",
        "ALTER TABLE user_profiles ADD COLUMN gemini_api_key TEXT DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN claude_api_key TEXT DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN ai_provider TEXT DEFAULT 'openai'",
        "ALTER TABLE user_profiles ADD COLUMN extraction_notes TEXT DEFAULT ''",
        "ALTER TABLE tests ADD COLUMN original_markdown TEXT DEFAULT ''",
        "ALTER TABLE user_profiles ADD COLUMN skills_enabled TEXT DEFAULT '{}'",
        "ALTER TABLE grader_results ADD COLUMN student_user_id TEXT",
        "ALTER TABLE grader_results ADD COLUMN submission_id TEXT",
        "ALTER TABLE students ADD COLUMN codename TEXT DEFAULT ''",
        """CREATE TABLE IF NOT EXISTS test_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_id TEXT NOT NULL,
            student_name TEXT NOT NULL,
            answers TEXT NOT NULL,
            submitted_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS tests (
            id TEXT PRIMARY KEY,
            teacher_user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            test_data TEXT NOT NULL,
            answer_key TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        )""",
        "ALTER TABLE tests ADD COLUMN rubric TEXT DEFAULT ''",
        "ALTER TABLE test_submissions ADD COLUMN ai_grades TEXT DEFAULT '{}'",
        "ALTER TABLE test_submissions ADD COLUMN score_overrides TEXT DEFAULT '{}'",
    ]:
        try:
            conn.execute(migration)
            conn.commit()
        except Exception:
            pass  # column already exists

    # Ensure submission_history has UNIQUE(student_id, assignment_id) constraint
    try:
        has_unique = conn.execute(
            """SELECT COUNT(*) FROM sqlite_master
               WHERE type='index' AND tbl_name='submission_history'
               AND (name LIKE '%student_id%' OR sql LIKE '%student_id%assignment_id%')"""
        ).fetchone()[0]
        if not has_unique:
            conn.executescript("""
                CREATE TABLE submission_history_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id INTEGER NOT NULL,
                    assignment_id TEXT NOT NULL,
                    assignment_title TEXT,
                    state TEXT,
                    grade REAL,
                    late INTEGER DEFAULT 0,
                    submitted_at TEXT,
                    recorded_at TEXT DEFAULT (datetime('now')),
                    UNIQUE(student_id, assignment_id)
                );
                INSERT OR IGNORE INTO submission_history_new
                    SELECT id, student_id, assignment_id, assignment_title,
                           state, grade, late, submitted_at, recorded_at
                    FROM submission_history;
                DROP TABLE submission_history;
                ALTER TABLE submission_history_new RENAME TO submission_history;
            """)
            conn.commit()
    except Exception:
        pass

    conn.close()
