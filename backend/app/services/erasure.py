"""
GDPR Art. 17 — Right to Erasure

Two operations:
  erase_student()  — removes all personal data for one student
  erase_account()  — removes all data for a teacher (account deletion)

Both return a receipt dict that should be logged / returned to the caller
as proof of erasure. The receipt records what was deleted but NOT the
personal data that was erased.
"""

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from app.services.database import get_db
from app.services import audit

CORPUS_ROOT = Path(__file__).parent.parent.parent / "data" / "corpus"


def erase_student(teacher_user_id: str, student_id: int) -> dict:
    """
    Erase all personal data for a single student.

    Covers:
      - students row (cascades: submission_history, student_group_members)
      - grader_results rows matched by student name (no FK exists — noted as tech debt)
      - strategy_evaluations: remove student_id from student_ids JSON arrays
      - episodic/semantic memories: already anonymized going forward; old records
        that may contain the name are left in place — they hold no FK and
        anonymize_text already replaced names with tokens for new records.
        If full scrubbing of old memories is required, run a one-off migration.

    Returns a receipt dict.
    """
    db = get_db()
    receipt = {
        "erased_at": datetime.now(timezone.utc).isoformat(),
        "student_id": student_id,
        "teacher_user_id": teacher_user_id,
        "tables_affected": {},
    }
    try:
        # Fetch student before deletion so we have the name for grader_results
        row = db.execute(
            "SELECT name FROM students WHERE id = ? AND teacher_user_id = ?",
            (student_id, teacher_user_id),
        ).fetchone()
        if not row:
            return {"error": "Student not found", "student_id": student_id}

        student_name = row["name"]

        # 1. Delete student (cascades submission_history + student_group_members)
        cur = db.execute(
            "DELETE FROM students WHERE id = ? AND teacher_user_id = ?",
            (student_id, teacher_user_id),
        )
        receipt["tables_affected"]["students"] = cur.rowcount

        # 2. grader_results — matched by name (tech debt: no FK; migrate to student_id)
        cur = db.execute(
            "DELETE FROM grader_results WHERE teacher_user_id = ? AND student_name = ?",
            (teacher_user_id, student_name),
        )
        receipt["tables_affected"]["grader_results"] = cur.rowcount

        # 3. strategy_evaluations — remove this student_id from JSON arrays
        rows = db.execute(
            "SELECT id, student_ids FROM strategy_evaluations WHERE teacher_user_id = ?",
            (teacher_user_id,),
        ).fetchall()
        updated = 0
        for r in rows:
            try:
                ids = json.loads(r["student_ids"] or "[]")
                if student_id in ids:
                    ids.remove(student_id)
                    db.execute(
                        "UPDATE strategy_evaluations SET student_ids = ? WHERE id = ?",
                        (json.dumps(ids), r["id"]),
                    )
                    updated += 1
            except (json.JSONDecodeError, ValueError):
                pass
        receipt["tables_affected"]["strategy_evaluations_updated"] = updated

        db.commit()
        receipt["success"] = True
        audit.log(teacher_user_id, audit.ERASE, "student", resource_id=student_id,
                  detail=f"gdpr_erasure tables={list(receipt['tables_affected'].keys())}")
        return receipt

    finally:
        db.close()


def erase_account(teacher_user_id: str) -> dict:
    """
    Erase all personal data for a teacher (full account deletion).

    Covers all DB tables scoped to teacher_user_id, plus corpus files on disk.
    Returns a receipt dict.
    """
    db = get_db()
    receipt = {
        "erased_at": datetime.now(timezone.utc).isoformat(),
        "teacher_user_id": teacher_user_id,
        "tables_affected": {},
    }
    try:
        def delete(table: str, column: str = "teacher_user_id") -> int:
            cur = db.execute(f"DELETE FROM {table} WHERE {column} = ?", (teacher_user_id,))
            return cur.rowcount

        # Students (cascades submission_history + student_group_members)
        receipt["tables_affected"]["students"] = delete("students")

        # Student groups (members already gone via cascade above on delete)
        receipt["tables_affected"]["student_groups"] = delete("student_groups")

        # Linked classes — need to remove members then the link rows
        link_ids = [
            r["id"] for r in db.execute(
                "SELECT id FROM linked_classes WHERE teacher_user_id = ?",
                (teacher_user_id,),
            ).fetchall()
        ]
        if link_ids:
            placeholders = ",".join("?" * len(link_ids))
            db.execute(f"DELETE FROM linked_class_members WHERE link_id IN ({placeholders})", link_ids)
        receipt["tables_affected"]["linked_classes"] = delete("linked_classes")

        # Chat conversations (cascades chat_messages)
        receipt["tables_affected"]["chat_conversations"] = delete("chat_conversations")

        # Episodic + semantic memories
        receipt["tables_affected"]["episodic_memories"] = delete("episodic_memories")
        receipt["tables_affected"]["semantic_memories"] = delete("semantic_memories")

        # Strategy evaluations
        receipt["tables_affected"]["strategy_evaluations"] = delete("strategy_evaluations")

        # Grader results
        receipt["tables_affected"]["grader_results"] = delete("grader_results")

        # Scheduled posts
        receipt["tables_affected"]["scheduled_posts"] = delete("scheduled_posts")

        # Class preferences
        receipt["tables_affected"]["class_preferences"] = delete("class_preferences", column="user_id")

        # File folders
        receipt["tables_affected"]["file_folders"] = delete("file_folders", column="user_id")

        # Auth tokens
        receipt["tables_affected"]["teacher_tokens"] = delete("teacher_tokens", column="user_id")

        # User profile
        receipt["tables_affected"]["user_profiles"] = delete("user_profiles", column="user_id")

        db.commit()

        # Corpus files on disk
        corpus_dir = CORPUS_ROOT / teacher_user_id
        if corpus_dir.exists():
            shutil.rmtree(corpus_dir)
            receipt["corpus_files_deleted"] = True
        else:
            receipt["corpus_files_deleted"] = False

        receipt["success"] = True
        # Log before profile row is gone — teacher_user_id is still valid as an identifier
        audit.log(teacher_user_id, audit.ERASE, "account",
                  detail="gdpr_full_account_erasure")
        return receipt

    finally:
        db.close()
