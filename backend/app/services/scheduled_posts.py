import datetime
import calendar
from app.services.database import get_db
from app.services.classroom import ClassroomService
from app.services.google_auth import GoogleAuthService


class ScheduledPostService:
    def __init__(self, teacher_user_id: str):
        self.teacher_user_id = teacher_user_id

    def create(self, class_id: str, post_type: str, title: str, content: str,
               frequency: str, day_of_week: int = None, week_of_month: int = None,
               time_of_day: str = "08:00", max_points: int = None) -> dict:
        """Create a scheduled recurring post."""
        next_post = self._calculate_next_post(frequency, day_of_week, week_of_month, time_of_day)

        db = get_db()
        try:
            cursor = db.execute(
                """INSERT INTO scheduled_posts
                   (teacher_user_id, class_id, post_type, title, content,
                    frequency, day_of_week, week_of_month, time_of_day,
                    max_points, next_post_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (self.teacher_user_id, class_id, post_type, title, content,
                 frequency, day_of_week, week_of_month, time_of_day,
                 max_points, next_post.isoformat()),
            )
            db.commit()
            row = db.execute("SELECT * FROM scheduled_posts WHERE id = ?", (cursor.lastrowid,)).fetchone()
            return dict(row)
        finally:
            db.close()

    def list_posts(self, class_id: str = None) -> list:
        """List scheduled posts, optionally filtered by class."""
        db = get_db()
        try:
            if class_id:
                rows = db.execute(
                    "SELECT * FROM scheduled_posts WHERE teacher_user_id = ? AND class_id = ? ORDER BY next_post_at",
                    (self.teacher_user_id, class_id),
                ).fetchall()
            else:
                rows = db.execute(
                    "SELECT * FROM scheduled_posts WHERE teacher_user_id = ? ORDER BY next_post_at",
                    (self.teacher_user_id,),
                ).fetchall()
            return [dict(r) for r in rows]
        finally:
            db.close()

    def get_post(self, post_id: int) -> dict | None:
        db = get_db()
        try:
            row = db.execute(
                "SELECT * FROM scheduled_posts WHERE id = ? AND teacher_user_id = ?",
                (post_id, self.teacher_user_id),
            ).fetchone()
            return dict(row) if row else None
        finally:
            db.close()

    def update(self, post_id: int, **kwargs) -> dict | None:
        """Update a scheduled post. Recalculates next_post_at if schedule changes."""
        db = get_db()
        try:
            existing = db.execute(
                "SELECT * FROM scheduled_posts WHERE id = ? AND teacher_user_id = ?",
                (post_id, self.teacher_user_id),
            ).fetchone()
            if not existing:
                return None

            fields = []
            values = []
            allowed = ["title", "content", "post_type", "frequency", "day_of_week",
                        "week_of_month", "time_of_day", "max_points", "active"]
            for key in allowed:
                if key in kwargs and kwargs[key] is not None:
                    fields.append(f"{key} = ?")
                    values.append(kwargs[key])

            # Recalculate next_post_at if schedule changed
            schedule_keys = {"frequency", "day_of_week", "week_of_month", "time_of_day"}
            if schedule_keys & set(kwargs.keys()):
                existing_dict = dict(existing)
                freq = kwargs.get("frequency", existing_dict["frequency"])
                dow = kwargs.get("day_of_week", existing_dict["day_of_week"])
                wom = kwargs.get("week_of_month", existing_dict["week_of_month"])
                tod = kwargs.get("time_of_day", existing_dict["time_of_day"])
                next_post = self._calculate_next_post(freq, dow, wom, tod)
                fields.append("next_post_at = ?")
                values.append(next_post.isoformat())

            if not fields:
                return dict(existing)

            values.extend([post_id, self.teacher_user_id])
            db.execute(
                f"UPDATE scheduled_posts SET {', '.join(fields)} WHERE id = ? AND teacher_user_id = ?",
                values,
            )
            db.commit()
            row = db.execute("SELECT * FROM scheduled_posts WHERE id = ?", (post_id,)).fetchone()
            return dict(row) if row else None
        finally:
            db.close()

    def delete(self, post_id: int) -> bool:
        db = get_db()
        try:
            cursor = db.execute(
                "DELETE FROM scheduled_posts WHERE id = ? AND teacher_user_id = ?",
                (post_id, self.teacher_user_id),
            )
            db.commit()
            return cursor.rowcount > 0
        finally:
            db.close()

    def toggle_active(self, post_id: int) -> dict | None:
        """Toggle a scheduled post's active state."""
        db = get_db()
        try:
            row = db.execute(
                "SELECT * FROM scheduled_posts WHERE id = ? AND teacher_user_id = ?",
                (post_id, self.teacher_user_id),
            ).fetchone()
            if not row:
                return None
            new_active = 0 if row["active"] else 1
            db.execute("UPDATE scheduled_posts SET active = ? WHERE id = ?", (new_active, post_id))
            db.commit()
            row = db.execute("SELECT * FROM scheduled_posts WHERE id = ?", (post_id,)).fetchone()
            return dict(row)
        finally:
            db.close()

    @staticmethod
    def get_due_posts() -> list:
        """Return all active posts whose next_post_at is in the past. (No user filter — for scheduler.)"""
        db = get_db()
        try:
            now = datetime.datetime.utcnow().isoformat()
            rows = db.execute(
                "SELECT * FROM scheduled_posts WHERE active = 1 AND next_post_at <= ?",
                (now,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            db.close()

    @staticmethod
    def execute_post(post: dict) -> dict:
        """Execute a single scheduled post using the teacher's refresh token.
        Returns a result dict with success/error info."""
        db = get_db()
        try:
            # Get refresh token for this teacher
            token_row = db.execute(
                "SELECT refresh_token FROM teacher_tokens WHERE user_id = ?",
                (post["teacher_user_id"],),
            ).fetchone()

            if not token_row:
                ScheduledPostService._advance_next_post(db, post)
                return {"success": False, "error": "No refresh token stored — teacher must log in again"}

            # Refresh the access token
            auth_service = GoogleAuthService()
            try:
                access_token = auth_service.refresh_access_token(token_row["refresh_token"])
            except Exception as e:
                ScheduledPostService._advance_next_post(db, post)
                return {"success": False, "error": f"Token refresh failed: {e}"}

            # Post to Classroom
            classroom = ClassroomService(access_token)
            try:
                if post["post_type"] == "announcement":
                    result = classroom.create_announcement(post["class_id"], post["content"])
                else:
                    result = classroom.create_assignment(
                        course_id=post["class_id"],
                        title=post["title"],
                        description=post["content"],
                        max_points=post.get("max_points"),
                    )
            except Exception as e:
                ScheduledPostService._advance_next_post(db, post)
                return {"success": False, "error": f"Classroom API error: {e}"}

            # Update last_posted_at and calculate next_post_at
            now = datetime.datetime.utcnow()
            next_post = ScheduledPostService._calculate_next_post(
                post["frequency"], post["day_of_week"],
                post["week_of_month"], post["time_of_day"],
                after=now,
            )
            db.execute(
                "UPDATE scheduled_posts SET last_posted_at = ?, next_post_at = ? WHERE id = ?",
                (now.isoformat(), next_post.isoformat(), post["id"]),
            )
            db.commit()

            return {"success": True, "classroom_result": result}
        finally:
            db.close()

    @staticmethod
    def _advance_next_post(db, post: dict) -> None:
        """Advance next_post_at to the next scheduled occurrence so a failed post
        doesn't get retried on every restart."""
        now = datetime.datetime.utcnow()
        next_post = ScheduledPostService._calculate_next_post(
            post["frequency"], post["day_of_week"],
            post["week_of_month"], post["time_of_day"],
            after=now,
        )
        db.execute(
            "UPDATE scheduled_posts SET next_post_at = ? WHERE id = ?",
            (next_post.isoformat(), post["id"]),
        )
        db.commit()

    @staticmethod
    def _calculate_next_post(frequency: str, day_of_week: int = None,
                              week_of_month: int = None, time_of_day: str = "08:00",
                              after: datetime.datetime = None) -> datetime.datetime:
        """Calculate the next occurrence for a scheduled post."""
        now = after or datetime.datetime.utcnow()

        # Parse time
        parts = time_of_day.split(":")
        hour = int(parts[0]) if len(parts) > 0 else 8
        minute = int(parts[1]) if len(parts) > 1 else 0

        if frequency == "weekly":
            if day_of_week is None:
                day_of_week = now.weekday()
            days_ahead = day_of_week - now.weekday()
            if days_ahead < 0:
                days_ahead += 7
            target = now + datetime.timedelta(days=days_ahead)
            target = target.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if target <= now:
                target += datetime.timedelta(weeks=1)
            return target

        elif frequency == "biweekly":
            if day_of_week is None:
                day_of_week = now.weekday()
            days_ahead = day_of_week - now.weekday()
            if days_ahead < 0:
                days_ahead += 7
            target = now + datetime.timedelta(days=days_ahead)
            target = target.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if target <= now:
                target += datetime.timedelta(weeks=1)
            # Ensure it's on an even-week boundary (every 2 weeks)
            week_num = target.isocalendar()[1]
            if week_num % 2 != 0:
                target += datetime.timedelta(weeks=1)
            return target

        elif frequency == "monthly":
            if week_of_month is not None and day_of_week is not None:
                # Nth weekday of the month (e.g., 1st Monday)
                for month_offset in range(0, 4):
                    year = now.year
                    month = now.month + month_offset
                    while month > 12:
                        month -= 12
                        year += 1
                    target_day = _nth_weekday(year, month, day_of_week, week_of_month)
                    if target_day:
                        target = datetime.datetime(year, month, target_day, hour, minute)
                        if target > now:
                            return target
            # Fallback: same day number next month
            target_month = now.month + 1
            target_year = now.year
            if target_month > 12:
                target_month -= 12
                target_year += 1
            day = min(now.day, calendar.monthrange(target_year, target_month)[1])
            return datetime.datetime(target_year, target_month, day, hour, minute)

        # Default fallback — 1 week
        return now + datetime.timedelta(weeks=1)


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> int | None:
    """Find the day-of-month for the Nth occurrence of a weekday.
    weekday: 0=Monday..6=Sunday. n: 1-based (1st, 2nd, 3rd, 4th)."""
    cal = calendar.monthcalendar(year, month)
    count = 0
    for week in cal:
        if week[weekday] != 0:
            count += 1
            if count == n:
                return week[weekday]
    return None
