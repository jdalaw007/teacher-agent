"""
GDPR Art. 20 — Right to Data Portability

Assembles all personal data held for a teacher into a single JSON structure
suitable for download. Includes students, submissions, conversations,
memories, strategies, grader results, scheduled posts, and the audit log.

Corpus document files are not included (binary/PDF) but their metadata is.
"""

from datetime import datetime, timezone
import json
from app.services.database import get_db
from pathlib import Path

CORPUS_ROOT = Path(__file__).parent.parent.parent / "data" / "corpus"


def export_teacher_data(teacher_user_id: str) -> dict:
    db = get_db()
    try:
        def rows(sql, params=()):
            return [dict(r) for r in db.execute(sql, params).fetchall()]

        # Profile
        profile = rows(
            "SELECT * FROM user_profiles WHERE user_id = ?", (teacher_user_id,)
        )

        # Students + their submission history
        students = rows(
            "SELECT * FROM students WHERE teacher_user_id = ?", (teacher_user_id,)
        )
        student_ids = [s["id"] for s in students]
        submissions = []
        if student_ids:
            placeholders = ",".join("?" * len(student_ids))
            submissions = rows(
                f"SELECT * FROM submission_history WHERE student_id IN ({placeholders})",
                student_ids,
            )

        # Student groups + memberships
        groups = rows(
            "SELECT * FROM student_groups WHERE teacher_user_id = ?", (teacher_user_id,)
        )
        group_ids = [g["id"] for g in groups]
        memberships = []
        if group_ids:
            placeholders = ",".join("?" * len(group_ids))
            memberships = rows(
                f"SELECT * FROM student_group_members WHERE group_id IN ({placeholders})",
                group_ids,
            )

        # Conversations + messages
        conversations = rows(
            "SELECT * FROM chat_conversations WHERE teacher_user_id = ?", (teacher_user_id,)
        )
        conv_ids = [c["id"] for c in conversations]
        messages = []
        if conv_ids:
            placeholders = ",".join("?" * len(conv_ids))
            messages = rows(
                f"SELECT * FROM chat_messages WHERE conversation_id IN ({placeholders})",
                conv_ids,
            )

        # Memories
        episodic = rows(
            "SELECT id, conversation_id, content, tags, memory_type, created_at "
            "FROM episodic_memories WHERE teacher_user_id = ?",
            (teacher_user_id,),
        )
        semantic = rows(
            "SELECT id, content, category, confidence, created_at, updated_at "
            "FROM semantic_memories WHERE teacher_user_id = ?",
            (teacher_user_id,),
        )

        # Strategy evaluations
        strategies = rows(
            "SELECT * FROM strategy_evaluations WHERE teacher_user_id = ?", (teacher_user_id,)
        )

        # Grader results
        grader = rows(
            "SELECT * FROM grader_results WHERE teacher_user_id = ?", (teacher_user_id,)
        )

        # Scheduled posts
        scheduled = rows(
            "SELECT * FROM scheduled_posts WHERE teacher_user_id = ?", (teacher_user_id,)
        )

        # Audit log
        audit = rows(
            "SELECT id, timestamp, action, resource_type, resource_id, detail "
            "FROM audit_log WHERE teacher_user_id = ?",
            (teacher_user_id,),
        )

        # Corpus document metadata (not the files themselves)
        corpus_meta = []
        corpus_dir = CORPUS_ROOT / teacher_user_id
        if corpus_dir.exists():
            for class_dir in corpus_dir.iterdir():
                if not class_dir.is_dir():
                    continue
                index_file = class_dir / "index.json"
                if index_file.exists():
                    try:
                        index = json.loads(index_file.read_text())
                        for doc_id, info in index.get("documents", {}).items():
                            corpus_meta.append({
                                "class_id": class_dir.name,
                                "doc_id": doc_id,
                                **{k: v for k, v in info.items() if k != "embedding"},
                            })
                    except Exception:
                        pass

        return {
            "export_info": {
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "teacher_user_id": teacher_user_id,
                "gdpr_basis": "Art. 20 GDPR — Right to Data Portability",
            },
            "profile": profile[0] if profile else {},
            "students": students,
            "submission_history": submissions,
            "student_groups": groups,
            "student_group_memberships": memberships,
            "conversations": conversations,
            "messages": messages,
            "episodic_memories": episodic,
            "semantic_memories": semantic,
            "strategy_evaluations": strategies,
            "grader_results": grader,
            "scheduled_posts": scheduled,
            "corpus_documents": corpus_meta,
            "audit_log": audit,
        }

    finally:
        db.close()
