from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


class DriveService:
    def __init__(self, access_token: str):
        credentials = Credentials(token=access_token)
        self.service = build("drive", "v3", credentials=credentials)

    def list_files(self, folder_id: str = None, page_size: int = 20) -> list:
        query = None
        if folder_id:
            query = f"'{folder_id}' in parents"

        results = (
            self.service.files()
            .list(
                q=query,
                pageSize=page_size,
                fields="files(id, name, mimeType, modifiedTime, webViewLink)",
            )
            .execute()
        )
        return results.get("files", [])

    def get_file(self, file_id: str) -> dict:
        return (
            self.service.files()
            .get(
                fileId=file_id,
                fields="id, name, mimeType, modifiedTime, webViewLink, parents",
            )
            .execute()
        )

    def export_as_text(self, file_id: str, mime_type: str) -> str:
        """Export a Google Doc/Sheet/Slide as plain text."""
        if mime_type == "application/vnd.google-apps.document":
            # Google Doc - export as plain text
            content = self.service.files().export(
                fileId=file_id,
                mimeType="text/plain"
            ).execute()
            return content.decode('utf-8')
        elif mime_type == "application/vnd.google-apps.spreadsheet":
            # Google Sheet - export as CSV
            content = self.service.files().export(
                fileId=file_id,
                mimeType="text/csv"
            ).execute()
            return content.decode('utf-8')
        else:
            raise ValueError(f"Cannot export {mime_type} as text")

    def download_file(self, file_id: str) -> bytes:
        """Download a regular file's content."""
        return self.service.files().get_media(fileId=file_id).execute()

    def search_files(self, query: str, page_size: int = 10) -> list:
        result = self.service.files().list(
            q=query,
            pageSize=page_size,
            fields="files(id, name, mimeType, modifiedTime, webViewLink)",
        ).execute()
        return result.get("files", [])

    def list_docs_and_text_files(self, page_size: int = 50) -> list:
        """List only Google Docs and text-based files."""
        query = (
            "mimeType='application/vnd.google-apps.document' or "
            "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or "
            "mimeType='text/plain' or "
            "mimeType='application/pdf'"
        )
        results = (
            self.service.files()
            .list(
                q=query,
                pageSize=page_size,
                fields="files(id, name, mimeType, modifiedTime)",
                orderBy="modifiedTime desc"
            )
            .execute()
        )
        return results.get("files", [])
