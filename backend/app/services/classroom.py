from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


class ClassroomService:
    def __init__(self, access_token: str):
        credentials = Credentials(token=access_token)
        self.service = build("classroom", "v1", credentials=credentials)

    def list_courses(self) -> list:
        results = self.service.courses().list(teacherId="me", pageSize=50).execute()
        return results.get("courses", [])

    def get_course(self, course_id: str) -> dict:
        return self.service.courses().get(id=course_id).execute()

    def list_assignments(self, course_id: str) -> list:
        results = (
            self.service.courses()
            .courseWork()
            .list(courseId=course_id, pageSize=50)
            .execute()
        )
        return results.get("courseWork", [])

    def get_assignment(self, course_id: str, assignment_id: str) -> dict:
        return (
            self.service.courses()
            .courseWork()
            .get(courseId=course_id, id=assignment_id)
            .execute()
        )

    def list_submissions(self, course_id: str, coursework_id: str) -> list:
        results = (
            self.service.courses()
            .courseWork()
            .studentSubmissions()
            .list(courseId=course_id, courseWorkId=coursework_id, pageSize=50)
            .execute()
        )
        return results.get("studentSubmissions", [])

    def create_assignment(
        self,
        course_id: str,
        title: str,
        description: str,
        max_points: int = None,
        due_date: dict = None,
        due_time: dict = None,
        work_type: str = "ASSIGNMENT"
    ) -> dict:
        """
        Create a new assignment in Google Classroom.

        work_type can be: ASSIGNMENT, SHORT_ANSWER_QUESTION, MULTIPLE_CHOICE_QUESTION
        due_date format: {"year": 2024, "month": 12, "day": 15}
        due_time format: {"hours": 23, "minutes": 59}
        """
        coursework = {
            "title": title,
            "description": description,
            "workType": work_type,
            "state": "PUBLISHED"
        }

        if max_points is not None:
            coursework["maxPoints"] = max_points

        if due_date:
            coursework["dueDate"] = due_date
            if due_time:
                coursework["dueTime"] = due_time

        return (
            self.service.courses()
            .courseWork()
            .create(courseId=course_id, body=coursework)
            .execute()
        )

    def create_announcement(self, course_id: str, text: str) -> dict:
        """Create an announcement on the Classroom stream."""
        body = {
            "text": text,
            "state": "PUBLISHED",
        }
        return (
            self.service.courses()
            .announcements()
            .create(courseId=course_id, body=body)
            .execute()
        )

    def list_students(self, course_id: str) -> list:
        """List all students enrolled in a course."""
        results = (
            self.service.courses()
            .students()
            .list(courseId=course_id, pageSize=100)
            .execute()
        )
        return results.get("students", [])

    def patch_submission_grade(self, course_id: str, coursework_id: str, submission_id: str, draft_grade: float) -> dict:
        """Set the draft grade on a student submission."""
        return (
            self.service.courses()
            .courseWork()
            .studentSubmissions()
            .patch(
                courseId=course_id,
                courseWorkId=coursework_id,
                id=submission_id,
                updateMask="draftGrade",
                body={"draftGrade": draft_grade},
            )
            .execute()
        )

    def create_draft_assignment(
        self,
        course_id: str,
        title: str,
        description: str,
        max_points: int = None
    ) -> dict:
        """Create a draft assignment (not published to students yet)."""
        coursework = {
            "title": title,
            "description": description,
            "workType": "ASSIGNMENT",
            "state": "DRAFT"
        }

        if max_points is not None:
            coursework["maxPoints"] = max_points

        return (
            self.service.courses()
            .courseWork()
            .create(courseId=course_id, body=coursework)
            .execute()
        )
