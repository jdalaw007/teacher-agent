import json
from app.services.database import get_db


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
            # Never return raw API keys to callers — use get_api_key() / get_gemini_api_key() instead
            p["has_api_key"] = bool(p.pop("openai_api_key", None))
            p["has_gemini_key"] = bool(p.pop("gemini_api_key", None))
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
        ai_provider = data.get("ai_provider", "")

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
                        ai_provider = CASE WHEN ? = '' THEN ai_provider ELSE ? END,
                        language = CASE WHEN ? = '' THEN language ELSE ? END,
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
                    ai_provider, ai_provider,
                    language, language,
                    self.user_id,
                ))
            else:
                db.execute("""
                    INSERT INTO user_profiles
                        (user_id, display_name, school_org, role, subjects,
                         grade_levels, teaching_style, about, openai_api_key,
                         gemini_api_key, ai_provider, language, onboarding_complete)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
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
                    ai_provider or "openai",
                    language or "English",
                ))
            db.commit()
        finally:
            db.close()

        return self.get_profile()

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
