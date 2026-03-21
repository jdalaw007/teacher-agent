"""
GDPR audit logging — records who accessed or modified student personal data and when.

Rules:
  - Log metadata only. Never log personal data values (names, grades, notes).
  - audit_log is excluded from retention enforcement — it must survive longer
    than the data it documents, including erasure events.
  - Failures are silent (fire-and-forget) so a logging error never breaks a request.
"""

import sys
from app.services.database import get_db

# Recognised action constants — use these rather than raw strings
READ   = "read"
LIST   = "list"
UPDATE = "update"
DELETE = "delete"
ERASE  = "erase"          # GDPR Art. 17 erasure
IMPORT = "import"
SYNC   = "sync"
EXPORT = "export"


def log(
    teacher_user_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    detail: str | None = None,
) -> None:
    """
    Write one audit entry. Silent on failure.

    Args:
        teacher_user_id: Who performed the action.
        action:          One of the constants above (read/list/update/delete/erase/import/sync).
        resource_type:   'student', 'roster', 'submission_history', 'account', 'grader_results'.
        resource_id:     Opaque ID (student_id, class_id). No names or emails.
        detail:          Brief non-PII context e.g. "class_id=abc123" or "tool=get_student_data".
    """
    try:
        db = get_db()
        try:
            db.execute(
                """INSERT INTO audit_log (teacher_user_id, action, resource_type, resource_id, detail)
                   VALUES (?, ?, ?, ?, ?)""",
                (teacher_user_id, action, resource_type, str(resource_id) if resource_id is not None else None, detail),
            )
            db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"[Audit] Failed to write log entry: {e}", file=sys.stderr)


def get_log(teacher_user_id: str, limit: int = 200, offset: int = 0) -> list[dict]:
    """Return audit entries for a teacher, most recent first."""
    db = get_db()
    try:
        rows = db.execute(
            """SELECT id, timestamp, action, resource_type, resource_id, detail
               FROM audit_log
               WHERE teacher_user_id = ?
               ORDER BY id DESC LIMIT ? OFFSET ?""",
            (teacher_user_id, limit, offset),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


def get_log_for_student(teacher_user_id: str, student_id: int) -> list[dict]:
    """Return all audit entries for a specific student — useful for subject access requests."""
    db = get_db()
    try:
        rows = db.execute(
            """SELECT id, timestamp, action, resource_type, resource_id, detail
               FROM audit_log
               WHERE teacher_user_id = ? AND resource_id = ?
               ORDER BY id DESC""",
            (teacher_user_id, str(student_id)),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()
