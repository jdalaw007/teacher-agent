import base64
import io
from email.mime.text import MIMEText
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


class GmailService:
    def __init__(self, access_token: str):
        credentials = Credentials(token=access_token)
        self.service = build("gmail", "v1", credentials=credentials)

    def _build_raw(self, to: list, subject: str, body: str) -> dict:
        msg = MIMEText(body)
        msg["to"] = ", ".join(to)
        msg["subject"] = subject
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        return {"raw": raw}

    def send_message(self, to: list, subject: str, body: str) -> dict:
        return self.service.users().messages().send(
            userId="me", body=self._build_raw(to, subject, body)
        ).execute()

    def create_draft(self, to: list, subject: str, body: str) -> dict:
        return self.service.users().drafts().create(
            userId="me", body={"message": self._build_raw(to, subject, body)}
        ).execute()

    def list_messages(self, max_results: int = 10, query: str = "") -> list:
        """Return recent messages with headers and snippet."""
        params = {"userId": "me", "maxResults": max_results}
        if query:
            params["q"] = query

        result = self.service.users().messages().list(**params).execute()
        message_refs = result.get("messages", [])

        messages = []
        for ref in message_refs:
            try:
                msg = self.service.users().messages().get(
                    userId="me", id=ref["id"], format="metadata",
                    metadataHeaders=["From", "Subject", "Date"]
                ).execute()

                headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
                messages.append({
                    "id": msg["id"],
                    "thread_id": msg.get("threadId"),
                    "snippet": msg.get("snippet", ""),
                    "from": headers.get("From", ""),
                    "subject": headers.get("Subject", "(No subject)"),
                    "date": headers.get("Date", ""),
                    "unread": "UNREAD" in msg.get("labelIds", []),
                })
            except Exception:
                continue

        return messages

    def get_message(self, message_id: str) -> dict:
        """Return full message content with body and attachment list."""
        msg = self.service.users().messages().get(
            userId="me", id=message_id, format="full"
        ).execute()

        headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        body = self._extract_body(msg.get("payload", {}))
        attachments = self._list_attachments(msg.get("payload", {}))

        return {
            "id": msg["id"],
            "from": headers.get("From", ""),
            "subject": headers.get("Subject", "(No subject)"),
            "date": headers.get("Date", ""),
            "body": body,
            "snippet": msg.get("snippet", ""),
            "unread": "UNREAD" in msg.get("labelIds", []),
            "attachments": attachments,
        }

    def trash_message(self, message_id: str) -> dict:
        """Move a message to the trash (recoverable)."""
        result = self.service.users().messages().trash(userId="me", id=message_id).execute()
        return {"success": True, "id": result.get("id"), "action": "trashed"}

    def delete_message(self, message_id: str) -> dict:
        """Permanently delete a message (not recoverable)."""
        self.service.users().messages().delete(userId="me", id=message_id).execute()
        return {"success": True, "id": message_id, "action": "permanently deleted"}

    def list_labels(self) -> list:
        """Return all available Gmail labels."""
        result = self.service.users().labels().list(userId="me").execute()
        return [
            {"id": l["id"], "name": l["name"], "type": l.get("type", "")}
            for l in result.get("labels", [])
        ]

    def apply_label(self, message_id: str, label_id: str) -> dict:
        """Add a label to a message (file it)."""
        self.service.users().messages().modify(
            userId="me", id=message_id,
            body={"addLabelIds": [label_id]}
        ).execute()
        return {"success": True, "id": message_id, "action": f"label {label_id} applied"}

    def archive_message(self, message_id: str) -> dict:
        """Archive a message (remove from inbox)."""
        self.service.users().messages().modify(
            userId="me", id=message_id,
            body={"removeLabelIds": ["INBOX"]}
        ).execute()
        return {"success": True, "id": message_id, "action": "archived"}

    def mark_read(self, message_id: str) -> dict:
        """Mark a message as read."""
        self.service.users().messages().modify(
            userId="me", id=message_id,
            body={"removeLabelIds": ["UNREAD"]}
        ).execute()
        return {"success": True, "id": message_id, "action": "marked read"}

    def get_attachment_content(self, message_id: str, attachment_id: str, mime_type: str, filename: str) -> str:
        """Download an attachment and return its text content."""
        result = self.service.users().messages().attachments().get(
            userId="me", messageId=message_id, id=attachment_id
        ).execute()

        data = result.get("data", "")
        raw_bytes = base64.urlsafe_b64decode(data + "==")

        # Plain text / HTML / CSV
        if mime_type.startswith("text/"):
            return raw_bytes.decode("utf-8", errors="replace")

        # PDF
        if mime_type == "application/pdf":
            return self._extract_pdf_text(raw_bytes, filename)

        # Word document
        if mime_type in (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
        ):
            return self._extract_docx_text(raw_bytes, filename)

        return f"[Attachment '{filename}' is a {mime_type} file — content type not supported for reading]"

    # ── Private helpers ────────────────────────────────────────────────────────

    def _extract_body(self, payload: dict) -> str:
        """Recursively extract plain text body from payload."""
        mime_type = payload.get("mimeType", "")

        if mime_type == "text/plain":
            data = payload.get("body", {}).get("data", "")
            if data:
                return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")

        for part in payload.get("parts", []):
            text = self._extract_body(part)
            if text:
                return text

        return ""

    def _list_attachments(self, payload: dict) -> list:
        """Collect attachment metadata from message parts."""
        attachments = []
        for part in payload.get("parts", []):
            filename = part.get("filename", "")
            body = part.get("body", {})
            att_id = body.get("attachmentId")
            if filename and att_id:
                attachments.append({
                    "attachment_id": att_id,
                    "filename": filename,
                    "mime_type": part.get("mimeType", "application/octet-stream"),
                    "size": body.get("size", 0),
                })
            # Recurse into nested parts
            attachments.extend(self._list_attachments(part))
        return attachments

    def _extract_pdf_text(self, raw_bytes: bytes, filename: str) -> str:
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(raw_bytes))
            pages = [page.extract_text() or "" for page in reader.pages]
            text = "\n".join(pages).strip()
            return text if text else f"[PDF '{filename}' appears to contain no extractable text]"
        except Exception as e:
            return f"[Could not read PDF '{filename}': {e}]"

    def _extract_docx_text(self, raw_bytes: bytes, filename: str) -> str:
        try:
            import docx
            doc = docx.Document(io.BytesIO(raw_bytes))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            return text if text else f"[Word doc '{filename}' appears to be empty]"
        except Exception as e:
            return f"[Could not read Word doc '{filename}': {e}]"
