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
                    """INSERT INTO students
                       (classroom_user_id, name, email, class_id, teacher_user_id)
                       VALUES (?, ?, ?, ?, ?)
                       ON CONFLICT(classroom_user_id, class_id, teacher_user_id) DO UPDATE SET
                       name = excluded.name,
                       email = excluded.email,
                       updated_at = datetime('now')""",
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

    def get_students_for_prompt(self, class_id: str, student_ids: list[int], group_id: int = None) -> str:
        """Format student profiles as text for AI prompt injection.
        If group_id is provided, includes group context."""
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

            # Add group context if provided
            if group_id:
                group = db.execute(
                    "SELECT * FROM student_groups WHERE id = ? AND teacher_user_id = ?",
                    (group_id, self.teacher_user_id),
                ).fetchone()
                if group:
                    group_dict = dict(group)
                    parts.append(f"Differentiation Group: {group_dict['name']}")
                    if group_dict.get("description"):
                        parts.append(f"Group Description: {group_dict['description']}")
                    parts.append("")

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

    # --- Group CRUD ---

    def create_group(self, class_id: str, name: str, description: str = "") -> dict:
        """Create a differentiation group."""
        db = get_db()
        try:
            cursor = db.execute(
                """INSERT INTO student_groups (name, description, class_id, teacher_user_id)
                   VALUES (?, ?, ?, ?)""",
                (name, description, class_id, self.teacher_user_id),
            )
            db.commit()
            row = db.execute("SELECT * FROM student_groups WHERE id = ?", (cursor.lastrowid,)).fetchone()
            return dict(row)
        finally:
            db.close()

    def list_groups(self, class_id: str) -> list:
        """Return all groups for a class."""
        db = get_db()
        try:
            rows = db.execute(
                """SELECT sg.*, COUNT(sgm.id) as member_count
                   FROM student_groups sg
                   LEFT JOIN student_group_members sgm ON sg.id = sgm.group_id
                   WHERE sg.class_id = ? AND sg.teacher_user_id = ?
                   GROUP BY sg.id
                   ORDER BY sg.name""",
                (class_id, self.teacher_user_id),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            db.close()

    def update_group(self, group_id: int, name: str = None, description: str = None) -> dict | None:
        """Update group info."""
        db = get_db()
        try:
            fields = []
            values = []
            if name is not None:
                fields.append("name = ?")
                values.append(name)
            if description is not None:
                fields.append("description = ?")
                values.append(description)
            if not fields:
                row = db.execute("SELECT * FROM student_groups WHERE id = ? AND teacher_user_id = ?",
                                 (group_id, self.teacher_user_id)).fetchone()
                return dict(row) if row else None

            values.extend([group_id, self.teacher_user_id])
            db.execute(
                f"UPDATE student_groups SET {', '.join(fields)} WHERE id = ? AND teacher_user_id = ?",
                values,
            )
            db.commit()
            row = db.execute("SELECT * FROM student_groups WHERE id = ?", (group_id,)).fetchone()
            return dict(row) if row else None
        finally:
            db.close()

    def delete_group(self, group_id: int) -> bool:
        """Delete a group and its memberships."""
        db = get_db()
        try:
            cursor = db.execute(
                "DELETE FROM student_groups WHERE id = ? AND teacher_user_id = ?",
                (group_id, self.teacher_user_id),
            )
            db.commit()
            return cursor.rowcount > 0
        finally:
            db.close()

    def add_to_group(self, group_id: int, student_id: int) -> bool:
        """Add a student to a group."""
        db = get_db()
        try:
            db.execute(
                "INSERT OR IGNORE INTO student_group_members (group_id, student_id) VALUES (?, ?)",
                (group_id, student_id),
            )
            db.commit()
            return True
        finally:
            db.close()

    def remove_from_group(self, group_id: int, student_id: int) -> bool:
        """Remove a student from a group."""
        db = get_db()
        try:
            cursor = db.execute(
                "DELETE FROM student_group_members WHERE group_id = ? AND student_id = ?",
                (group_id, student_id),
            )
            db.commit()
            return cursor.rowcount > 0
        finally:
            db.close()

    def get_group_members(self, group_id: int) -> list:
        """Return all students in a group."""
        db = get_db()
        try:
            rows = db.execute(
                """SELECT s.* FROM students s
                   JOIN student_group_members sgm ON s.id = sgm.student_id
                   WHERE sgm.group_id = ? AND s.teacher_user_id = ?
                   ORDER BY s.name""",
                (group_id, self.teacher_user_id),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            db.close()

    def get_student_groups(self, student_id: int) -> list:
        """Return groups a student belongs to."""
        db = get_db()
        try:
            rows = db.execute(
                """SELECT sg.* FROM student_groups sg
                   JOIN student_group_members sgm ON sg.id = sgm.group_id
                   WHERE sgm.student_id = ? AND sg.teacher_user_id = ?
                   ORDER BY sg.name""",
                (student_id, self.teacher_user_id),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            db.close()

    # --- Submission Sync ---

    def sync_submissions(self, access_token: str, class_id: str) -> dict:
        """Pull grades and submission states from Google Classroom."""
        classroom = ClassroomService(access_token)
        assignments = classroom.list_assignments(class_id)

        db = get_db()
        synced = 0
        try:
            # Get local students keyed by classroom_user_id
            students_rows = db.execute(
                "SELECT id, classroom_user_id FROM students WHERE class_id = ? AND teacher_user_id = ?",
                (class_id, self.teacher_user_id),
            ).fetchall()
            student_map = {r["classroom_user_id"]: r["id"] for r in students_rows if r["classroom_user_id"]}

            for assignment in assignments:
                assignment_id = assignment.get("id", "")
                assignment_title = assignment.get("title", "")

                submissions = classroom.list_submissions(class_id, assignment_id)
                for sub in submissions:
                    user_id = sub.get("userId", "")
                    if user_id not in student_map:
                        continue

                    local_student_id = student_map[user_id]
                    state = sub.get("state", "")
                    grade = sub.get("assignedGrade") or sub.get("draftGrade")
                    late = 1 if sub.get("late", False) else 0
                    submitted_at = sub.get("updateTime", "")

                    db.execute(
                        """INSERT INTO submission_history
                           (student_id, assignment_id, assignment_title, state, grade, late, submitted_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?)
                           ON CONFLICT(student_id, assignment_id) DO UPDATE SET
                           assignment_title=excluded.assignment_title,
                           state=excluded.state,
                           grade=excluded.grade,
                           late=excluded.late,
                           submitted_at=excluded.submitted_at,
                           recorded_at=datetime('now')""",
                        (local_student_id, assignment_id, assignment_title, state, grade, late, submitted_at),
                    )
                    synced += 1

            db.commit()
        finally:
            db.close()

        return {"synced": synced, "assignments_checked": len(assignments)}

    def get_student_summary(self, student_id: int) -> dict:
        """Return summary stats for a student's submissions."""
        db = get_db()
        try:
            row = db.execute(
                """SELECT
                    COUNT(*) as total_assignments,
                    SUM(CASE WHEN state = 'TURNED_IN' OR state = 'RETURNED' THEN 1 ELSE 0 END) as turned_in,
                    AVG(CASE WHEN grade IS NOT NULL THEN grade END) as avg_grade,
                    SUM(late) as late_count
                   FROM submission_history
                   WHERE student_id = ?""",
                (student_id,),
            ).fetchone()
            if row:
                d = dict(row)
                return {
                    "total_assignments": d["total_assignments"] or 0,
                    "turned_in": d["turned_in"] or 0,
                    "avg_grade": round(d["avg_grade"], 1) if d["avg_grade"] is not None else None,
                    "late_count": d["late_count"] or 0,
                }
            return {"total_assignments": 0, "turned_in": 0, "avg_grade": None, "late_count": 0}
        finally:
            db.close()
