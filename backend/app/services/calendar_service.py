from datetime import datetime, timezone
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


class CalendarService:
    def __init__(self, access_token: str):
        credentials = Credentials(token=access_token)
        self.service = build("calendar", "v3", credentials=credentials)

    def list_upcoming_events(self, max_results: int = 10, days_ahead: int = 14) -> list:
        """Return upcoming events from the primary calendar."""
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        time_max = now + timedelta(days=days_ahead)

        result = self.service.events().list(
            calendarId="primary",
            timeMin=now.isoformat(),
            timeMax=time_max.isoformat(),
            maxResults=max_results,
            singleEvents=True,
            orderBy="startTime",
        ).execute()

        events = []
        for item in result.get("items", []):
            start = item.get("start", {})
            end = item.get("end", {})
            events.append({
                "id": item.get("id"),
                "title": item.get("summary", "(No title)"),
                "description": item.get("description", ""),
                "start": start.get("dateTime") or start.get("date"),
                "end": end.get("dateTime") or end.get("date"),
                "all_day": "date" in start,
                "location": item.get("location", ""),
                "html_link": item.get("htmlLink", ""),
            })
        return events
