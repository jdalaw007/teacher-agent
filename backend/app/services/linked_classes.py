from app.services.database import get_db


class LinkedClassService:
    def __init__(self, teacher_user_id: str):
        self.teacher_user_id = teacher_user_id

    def create_link(self, link_name: str, class_ids: list[str]) -> dict:
        """Create a link group with member classes."""
        db = get_db()
        try:
            cursor = db.execute(
                "INSERT INTO linked_classes (teacher_user_id, link_name) VALUES (?, ?)",
                (self.teacher_user_id, link_name),
            )
            link_id = cursor.lastrowid
            for class_id in class_ids:
                db.execute(
                    "INSERT OR IGNORE INTO linked_class_members (link_id, class_id) VALUES (?, ?)",
                    (link_id, class_id),
                )
            db.commit()
            return self._get_link(db, link_id)
        finally:
            db.close()

    def list_links(self) -> list:
        """Return all link groups for this teacher."""
        db = get_db()
        try:
            rows = db.execute(
                "SELECT * FROM linked_classes WHERE teacher_user_id = ? ORDER BY link_name",
                (self.teacher_user_id,),
            ).fetchall()
            result = []
            for row in rows:
                link = dict(row)
                members = db.execute(
                    "SELECT class_id FROM linked_class_members WHERE link_id = ?",
                    (link["id"],),
                ).fetchall()
                link["class_ids"] = [m["class_id"] for m in members]
                result.append(link)
            return result
        finally:
            db.close()

    def update_link(self, link_id: int, link_name: str = None, class_ids: list[str] = None) -> dict | None:
        """Update a link group name and/or members."""
        db = get_db()
        try:
            existing = db.execute(
                "SELECT * FROM linked_classes WHERE id = ? AND teacher_user_id = ?",
                (link_id, self.teacher_user_id),
            ).fetchone()
            if not existing:
                return None

            if link_name is not None:
                db.execute(
                    "UPDATE linked_classes SET link_name = ? WHERE id = ?",
                    (link_name, link_id),
                )

            if class_ids is not None:
                db.execute("DELETE FROM linked_class_members WHERE link_id = ?", (link_id,))
                for class_id in class_ids:
                    db.execute(
                        "INSERT OR IGNORE INTO linked_class_members (link_id, class_id) VALUES (?, ?)",
                        (link_id, class_id),
                    )

            db.commit()
            return self._get_link(db, link_id)
        finally:
            db.close()

    def delete_link(self, link_id: int) -> bool:
        """Delete a link group."""
        db = get_db()
        try:
            cursor = db.execute(
                "DELETE FROM linked_classes WHERE id = ? AND teacher_user_id = ?",
                (link_id, self.teacher_user_id),
            )
            db.commit()
            return cursor.rowcount > 0
        finally:
            db.close()

    def add_class_to_link(self, link_id: int, class_id: str) -> bool:
        """Add a class to a link group."""
        db = get_db()
        try:
            db.execute(
                "INSERT OR IGNORE INTO linked_class_members (link_id, class_id) VALUES (?, ?)",
                (link_id, class_id),
            )
            db.commit()
            return True
        finally:
            db.close()

    def remove_class_from_link(self, link_id: int, class_id: str) -> bool:
        """Remove a class from a link group."""
        db = get_db()
        try:
            cursor = db.execute(
                "DELETE FROM linked_class_members WHERE link_id = ? AND class_id = ?",
                (link_id, class_id),
            )
            db.commit()
            return cursor.rowcount > 0
        finally:
            db.close()

    def get_linked_class_ids(self, class_id: str) -> list[str]:
        """Return all class_ids linked to this one (including itself)."""
        db = get_db()
        try:
            # Find all link groups this class belongs to
            link_rows = db.execute(
                """SELECT lcm.link_id FROM linked_class_members lcm
                   JOIN linked_classes lc ON lcm.link_id = lc.id
                   WHERE lcm.class_id = ? AND lc.teacher_user_id = ?""",
                (class_id, self.teacher_user_id),
            ).fetchall()

            if not link_rows:
                return [class_id]

            # Get all class_ids from those link groups
            link_ids = [r["link_id"] for r in link_rows]
            placeholders = ",".join("?" for _ in link_ids)
            member_rows = db.execute(
                f"SELECT DISTINCT class_id FROM linked_class_members WHERE link_id IN ({placeholders})",
                link_ids,
            ).fetchall()

            class_ids = list({r["class_id"] for r in member_rows})
            if class_id not in class_ids:
                class_ids.append(class_id)
            return class_ids
        finally:
            db.close()

    def _get_link(self, db, link_id: int) -> dict:
        """Helper to get a link with its member class_ids."""
        row = db.execute("SELECT * FROM linked_classes WHERE id = ?", (link_id,)).fetchone()
        link = dict(row)
        members = db.execute(
            "SELECT class_id FROM linked_class_members WHERE link_id = ?",
            (link_id,),
        ).fetchall()
        link["class_ids"] = [m["class_id"] for m in members]
        return link
