from app.services.database import get_db
from app.services.classroom import ClassroomService


class StudentService:
    def __init__(self, teacher_user_id: str):
        self.teacher_user_id = teacher_user_id

    def import_roster(self, access_token: str, class_id: str) -> dict:
        """Import students from Google Classroom roster."""
        classroom = ClassroomService(access_token)
        roster = classroom.list_students(class_id)

        db = get_db()
        imported = 0
        skipped = 0
        try:
            for student in roster:
                profile = student.get("profile", {})
                name = profile.get("name", {})
                full_name = name.get("fullName", "Unknown")
                email = profile.get("emailAddress", "")
                user_id = student.get("userId", "")

                cursor = db.execute(
                    """INSERT OR IGNORE INTO students
                       (classroom_user_id, name, email, class_id, teacher_user_id)
                       VALUES (?, ?, ?, ?, ?)""",
                    (user_id, full_name, email, class_id, self.teacher_user_id),
                )
                if cursor.rowcount > 0:
                    imported += 1
                else:
                    skipped += 1
            db.commit()
        finally:
            db.close()

        return {"imported": imported, "skipped": skipped, "total_in_roster": len(roster)}

    def list_students(self, class_id: str) -> list:
        """Return all students for a class belonging to this teacher."""
        db = get_db()
        try:
            rows = db.execute(
                """SELECT * FROM students
                   WHERE class_id = ? AND teacher_user_id = ?
                   ORDER BY name""",
                (class_id, self.teacher_user_id),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            db.close()

    def add_student(self, class_id: str, name: str, email: str = "") -> dict:
        """Manually add a student."""
        db = get_db()
        try:
            cursor = db.execute(
                """INSERT INTO students (name, email, class_id, teacher_user_id)
                   VALUES (?, ?, ?, ?)""",
                (name, email, class_id, self.teacher_user_id),
            )
            db.commit()
            student_id = cursor.lastrowid
            row = db.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
            return dict(row)
        finally:
            db.close()

    def get_student(self, student_id: int) -> dict | None:
        """Get a single student by ID."""
        db = get_db()
        try:
            row = db.execute(
                "SELECT * FROM students WHERE id = ? AND teacher_user_id = ?",
                (student_id, self.teacher_user_id),
            ).fetchone()
            return dict(row) if row else None
        finally:
            db.close()

    def update_student(self, student_id: int, name: str = None, email: str = None, notes: str = None) -> dict | None:
        """Update student fields."""
        db = get_db()
        try:
            fields = []
            values = []
            if name is not None:
                fields.append("name = ?")
                values.append(name)
            if email is not None:
                fields.append("email = ?")
                values.append(email)
            if notes is not None:
                fields.append("notes = ?")
                values.append(notes)
            if not fields:
                return self.get_student(student_id)

            fields.append("updated_at = datetime('now')")
            values.extend([student_id, self.teacher_user_id])

            db.execute(
                f"UPDATE students SET {', '.join(fields)} WHERE id = ? AND teacher_user_id = ?",
                values,
            )
            db.commit()
            row = db.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
            return dict(row) if row else None
        finally:
            db.close()

    def update_notes(self, student_id: int, notes: str) -> dict | None:
        """Quick notes update."""
        return self.update_student(student_id, notes=notes)

    def delete_student(self, student_id: int) -> bool:
        """Delete a student."""
        db = get_db()
        try:
            cursor = db.execute(
                "DELETE FROM students WHERE id = ? AND teacher_user_id = ?",
                (student_id, self.teacher_user_id),
            )
            db.commit()
            return cursor.rowcount > 0
        finally:
            db.close()

    def get_students_for_prompt(self, class_id: str, student_ids: list[int]) -> str:
        """Format student profiles as text for AI prompt injection."""
        db = get_db()
        try:
            placeholders = ",".join("?" for _ in student_ids)
            rows = db.execute(
                f"""SELECT * FROM students
                    WHERE id IN ({placeholders})
                    AND class_id = ? AND teacher_user_id = ?""",
                [*student_ids, class_id, self.teacher_user_id],
            ).fetchall()

            if not rows:
                return ""

            parts = []
            for row in rows:
                student = dict(row)
                section = f"Student Profile:\nName: {student['name']}"
                if student.get("email"):
                    section += f"\nEmail: {student['email']}"
                if student.get("notes"):
                    section += f"\nTeacher Notes: {student['notes']}"
                parts.append(section)

            result = "\n\n".join(parts)
            result += "\n\nPlease adapt the content, difficulty, and approach based on the student information above."
            return result
        finally:
            db.close()

    def get_student_history(self, student_id: int) -> list:
        """Return submission history for a student."""
        db = get_db()
        try:
            rows = db.execute(
                """SELECT sh.* FROM submission_history sh
                   JOIN students s ON sh.student_id = s.id
                   WHERE sh.student_id = ? AND s.teacher_user_id = ?
                   ORDER BY sh.recorded_at DESC""",
                (student_id, self.teacher_user_id),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            db.close()
