"""
Pseudonymization utilities for GDPR compliance.

Before sending student data to any external AI processor (OpenAI), use these
functions to strip or mask personal identifiers. Real names and emails must
never appear in tool results sent to the LLM — the teacher's own typed messages
may contain names, but system-injected data must not.
"""

# Fields that must never be sent to an external AI processor
_STRIP_FIELDS = ("email", "notes", "classroom_user_id", "updated_at", "created_at")


def safe_student_for_llm(student: dict, include_name: bool = False) -> dict:
    """
    Return a copy of a student record safe to include in an LLM prompt.

    By default strips: email, notes, classroom_user_id, timestamps.
    Set include_name=True only for roster lookups where the LLM needs
    name→ID resolution and the teacher has already typed the name.
    """
    safe = {k: v for k, v in student.items() if k not in _STRIP_FIELDS}
    if not include_name:
        safe.pop("name", None)
    # Add stable opaque reference token
    safe["ref"] = f"st_{student['id']}"
    return safe


def anonymize_text(text: str, students: list[dict]) -> str:
    """
    Replace student names with opaque tokens in text before storing in memory
    or sending to an embedding model.

    Only replaces names longer than 3 characters to avoid false positives on
    common short words.
    """
    if not text or not students:
        return text
    for student in students:
        name = (student.get("name") or "").strip()
        if len(name) > 3:
            text = text.replace(name, f"[st_{student['id']}]")
    return text
