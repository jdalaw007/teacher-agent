"""
GDPR Art. 5(1)(e) — Storage Limitation

Retention periods (configurable here — adjust per school contract if needed):
  STUDENT_DAYS          730  days  (~2 years; covers "end of academic year + 1 year"
                                    conservatively for any school-year boundary)
  CONVERSATION_DAYS      90  days  after a conversation is ended
  CONVERSATION_OPEN_DAYS 180 days  for conversations never formally ended (idle cutoff)
  MEMORY_DAYS           730  days  episodic + semantic memories
  STRATEGY_DAYS         730  days  strategy evaluations
  GRADER_DAYS           730  days  AI grader results

"Last active" for a student is the later of:
  - the student row's updated_at
  - the most recent submission recorded_at for that student
This avoids purging students who are still being synced even if their
profile hasn't changed.
"""

import sys
from app.services.database import get_db

STUDENT_DAYS = 730
CONVERSATION_DAYS = 90
CONVERSATION_OPEN_DAYS = 180
MEMORY_DAYS = 730
STRATEGY_DAYS = 730
GRADER_DAYS = 730


def run_retention() -> dict:
    """
    Delete records that have exceeded their retention period.
    Returns a summary of what was purged.
    """
    report = {}
    db = get_db()
    try:
        # 1. Ended conversations older than CONVERSATION_DAYS
        cur = db.execute(
            """DELETE FROM chat_conversations
               WHERE ended_at IS NOT NULL
               AND ended_at < datetime('now', ? || ' days')""",
            (f"-{CONVERSATION_DAYS}",),
        )
        report["conversations_ended_purged"] = cur.rowcount

        # 2. Never-ended conversations with no activity for CONVERSATION_OPEN_DAYS
        #    (end them first so messages cascade-delete with the conversation)
        db.execute(
            """UPDATE chat_conversations
               SET ended_at = datetime('now'), summary = 'Auto-closed by retention policy.'
               WHERE ended_at IS NULL
               AND (
                   SELECT MAX(m.created_at) FROM chat_messages m
                   WHERE m.conversation_id = chat_conversations.id
               ) < datetime('now', ? || ' days')""",
            (f"-{CONVERSATION_OPEN_DAYS}",),
        )
        cur = db.execute(
            """DELETE FROM chat_conversations
               WHERE ended_at < datetime('now', ? || ' days')""",
            (f"-{CONVERSATION_DAYS}",),
        )
        report["conversations_open_purged"] = cur.rowcount

        # 3. Episodic memories
        cur = db.execute(
            "DELETE FROM episodic_memories WHERE created_at < datetime('now', ? || ' days')",
            (f"-{MEMORY_DAYS}",),
        )
        report["episodic_memories_purged"] = cur.rowcount

        # 4. Semantic memories
        cur = db.execute(
            "DELETE FROM semantic_memories WHERE created_at < datetime('now', ? || ' days')",
            (f"-{MEMORY_DAYS}",),
        )
        report["semantic_memories_purged"] = cur.rowcount

        # 5. Strategy evaluations
        cur = db.execute(
            "DELETE FROM strategy_evaluations WHERE suggested_at < datetime('now', ? || ' days')",
            (f"-{STRATEGY_DAYS}",),
        )
        report["strategy_evaluations_purged"] = cur.rowcount

        # 6. Grader results
        cur = db.execute(
            "DELETE FROM grader_results WHERE graded_at < datetime('now', ? || ' days')",
            (f"-{GRADER_DAYS}",),
        )
        report["grader_results_purged"] = cur.rowcount

        # 7. Students whose last activity exceeds STUDENT_DAYS.
        #    Last activity = later of updated_at and most recent submission recorded_at.
        cur = db.execute(
            f"""DELETE FROM students
               WHERE id IN (
                   SELECT s.id FROM students s
                   LEFT JOIN (
                       SELECT student_id, MAX(recorded_at) AS last_submission
                       FROM submission_history
                       GROUP BY student_id
                   ) sh ON sh.student_id = s.id
                   WHERE MAX(
                       COALESCE(s.updated_at, s.created_at),
                       COALESCE(sh.last_submission, '1970-01-01')
                   ) < datetime('now', '-{STUDENT_DAYS} days')
               )""",
        )
        report["students_purged"] = cur.rowcount

        db.commit()
        report["success"] = True
        return report

    except Exception as e:
        print(f"[Retention] Error during retention run: {e}", file=sys.stderr)
        report["success"] = False
        report["error"] = str(e)
        return report
    finally:
        db.close()
