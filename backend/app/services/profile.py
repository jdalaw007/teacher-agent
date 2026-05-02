import json
from app.services.database import get_db

DEFAULT_SKILLS = {
    "classroom_post": True,
    "gmail": False,
    "calendar": False,
    "drive_print": False,
}


class ProfileService:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def get_profile(self) -> dict | None:
        db = get_db()
        try:
            row = db.execute(
                "SELECT * FROM user_profiles WHERE user_id = ?", (self.user_id,)
            ).fetchone()
            if not row:
                return None
            p = dict(row)
            p["subjects"] = json.loads(p.get("subjects") or "[]")
            p["grade_levels"] = json.loads(p.get("grade_levels") or "[]")
            stored = json.loads(p.get("skills_enabled") or "{}")
            p["skills_enabled"] = {**DEFAULT_SKILLS, **stored}
            # Never return raw API keys to callers — use get_api_key() / get_gemini_api_key() / get_claude_api_key() instead
            p["has_api_key"] = bool(p.pop("openai_api_key", None))
            p["has_gemini_key"] = bool(p.pop("gemini_api_key", None))
            p["has_claude_key"] = bool(p.pop("claude_api_key", None))
            return p
        finally:
            db.close()

    def get_api_key(self) -> str:
        """Return the user's stored OpenAI API key, or empty string."""
        db = get_db()
        try:
            row = db.execute(
                "SELECT openai_api_key FROM user_profiles WHERE user_id = ?",
                (self.user_id,)
            ).fetchone()
            return (row["openai_api_key"] or "") if row else ""
        finally:
            db.close()

    def get_gemini_api_key(self) -> str:
        """Return the user's stored Gemini API key, or empty string."""
        db = get_db()
        try:
            row = db.execute(
                "SELECT gemini_api_key FROM user_profiles WHERE user_id = ?",
                (self.user_id,)
            ).fetchone()
            return (row["gemini_api_key"] or "") if row else ""
        finally:
            db.close()

    def get_claude_api_key(self) -> str:
        """Return the user's stored Claude (Anthropic) API key, or empty string."""
        db = get_db()
        try:
            row = db.execute(
                "SELECT claude_api_key FROM user_profiles WHERE user_id = ?",
                (self.user_id,)
            ).fetchone()
            return (row["claude_api_key"] or "") if row else ""
        finally:
            db.close()

    def get_ai_provider(self) -> str:
        """Return the user's preferred AI provider ('openai' or 'gemini')."""
        db = get_db()
        try:
            row = db.execute(
                "SELECT ai_provider FROM user_profiles WHERE user_id = ?",
                (self.user_id,)
            ).fetchone()
            return (row["ai_provider"] or "openai") if row else "openai"
        finally:
            db.close()

    def save_profile(self, data: dict) -> dict:
        subjects = json.dumps(data.get("subjects", []))
        grade_levels = json.dumps(data.get("grade_levels", []))
        api_key = data.get("openai_api_key", "")
        gemini_key = data.get("gemini_api_key", "")
        claude_key = data.get("claude_api_key", "")
        ai_provider = data.get("ai_provider", "")
        skills_raw = data.get("skills_enabled")
        skills_json = json.dumps(skills_raw) if isinstance(skills_raw, dict) else ""

        db = get_db()
        try:
            existing = db.execute(
                "SELECT id FROM user_profiles WHERE user_id = ?", (self.user_id,)
            ).fetchone()

            language = data.get("language", "")

            if existing:
                db.execute("""
                    UPDATE user_profiles SET
                        display_name = ?,
                        school_org = ?,
                        role = ?,
                        subjects = ?,
                        grade_levels = ?,
                        teaching_style = ?,
                        about = ?,
                        openai_api_key = CASE WHEN ? = '' THEN openai_api_key ELSE ? END,
                        gemini_api_key = CASE WHEN ? = '' THEN gemini_api_key ELSE ? END,
                        claude_api_key = CASE WHEN ? = '' THEN claude_api_key ELSE ? END,
                        ai_provider = CASE WHEN ? = '' THEN ai_provider ELSE ? END,
                        language = CASE WHEN ? = '' THEN language ELSE ? END,
                        skills_enabled = CASE WHEN ? = '' THEN skills_enabled ELSE ? END,
                        onboarding_complete = 1,
                        updated_at = datetime('now')
                    WHERE user_id = ?
                """, (
                    data.get("display_name", ""),
                    data.get("school_org", ""),
                    data.get("role", "teacher"),
                    subjects,
                    grade_levels,
                    data.get("teaching_style", ""),
                    data.get("about", ""),
                    api_key, api_key,
                    gemini_key, gemini_key,
                    claude_key, claude_key,
                    ai_provider, ai_provider,
                    language, language,
                    skills_json, skills_json,
                    self.user_id,
                ))
            else:
                db.execute("""
                    INSERT INTO user_profiles
                        (user_id, display_name, school_org, role, subjects,
                         grade_levels, teaching_style, about, openai_api_key,
                         gemini_api_key, claude_api_key, ai_provider, language, skills_enabled, onboarding_complete)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """, (
                    self.user_id,
                    data.get("display_name", ""),
                    data.get("school_org", ""),
                    data.get("role", "teacher"),
                    subjects,
                    grade_levels,
                    data.get("teaching_style", ""),
                    data.get("about", ""),
                    api_key,
                    gemini_key,
                    claude_key,
                    ai_provider or "openai",
                    language or "English",
                    skills_json or json.dumps(DEFAULT_SKILLS),
                ))
            db.commit()
        finally:
            db.close()

        return self.get_profile()

    def get_skills(self) -> dict:
        """Return the user's enabled skills, merged with defaults."""
        db = get_db()
        try:
            row = db.execute(
                "SELECT skills_enabled FROM user_profiles WHERE user_id = ?", (self.user_id,)
            ).fetchone()
            stored = json.loads((row["skills_enabled"] if row else None) or "{}")
            return {**DEFAULT_SKILLS, **stored}
        finally:
            db.close()

    def get_language(self) -> str:
        """Return the user's preferred language, default English."""
        db = get_db()
        try:
            row = db.execute(
                "SELECT language FROM user_profiles WHERE user_id = ?", (self.user_id,)
            ).fetchone()
            return (row["language"] if row and row["language"] else "English")
        finally:
            db.close()

    def is_onboarding_complete(self) -> bool:
        db = get_db()
        try:
            row = db.execute(
                "SELECT onboarding_complete FROM user_profiles WHERE user_id = ?",
                (self.user_id,)
            ).fetchone()
            return bool(row and row["onboarding_complete"])
        finally:
            db.close()

    def get_context_block(self) -> str:
        """Return a markdown block describing the teacher for injection into AI context."""
        profile = self.get_profile()
        if not profile:
            return ""
        parts = []
        name = profile.get("display_name", "")
        role = profile.get("role", "teacher")
        school = profile.get("school_org", "")
        subjects = profile.get("subjects", [])
        grades = profile.get("grade_levels", [])
        style = profile.get("teaching_style", "")
        about = profile.get("about", "")

        if name:
            parts.append(f"Name: {name}")
        if role:
            parts.append(f"Role: {role.title()}")
        if school:
            parts.append(f"School/Organization: {school}")
        if subjects:
            parts.append(f"Subjects: {', '.join(subjects)}")
        if grades:
            parts.append(f"Grade levels: {', '.join(grades)}")
        if style:
            parts.append(f"Teaching style: {style}")
        if about:
            parts.append(f"About: {about}")

        if not parts:
            return ""
        return "## About the Teacher\n" + "\n".join(parts)


def get_ai_client(user_id: str):
    """Return (OpenAI client, model_name) for the user's configured AI provider.
    Falls back to env-level keys if no per-user key is set.
    Returns (None, model_name) if no key is available.
    """
    from openai import OpenAI
    from app.config import get_settings
    settings = get_settings()
    ps = ProfileService(user_id)
    provider = ps.get_ai_provider()
    if provider == "gemini":
        gemini_key = ps.get_gemini_api_key() or settings.gemini_api_key
        if gemini_key:
            return OpenAI(
                api_key=gemini_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            ), "models/gemini-2.5-flash"
    if provider == "claude":
        claude_key = ps.get_claude_api_key()
        if claude_key:
            return OpenAI(
                api_key=claude_key,
                base_url="https://api.anthropic.com/v1/",
                default_headers={"anthropic-version": "2023-06-01"},
            ), "claude-opus-4-7"
    # Fall through to OpenAI
    user_key = ps.get_api_key()
    api_key = user_key or settings.openai_api_key
    if api_key and api_key != "your-api-key-here":
        return OpenAI(api_key=api_key), "gpt-4o"
    return None, "gpt-4o"
