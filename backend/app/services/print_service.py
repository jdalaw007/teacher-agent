import os
import sys
import tempfile
import subprocess


def list_printers() -> list:
    if sys.platform != "win32":
        return []
    result = subprocess.run(
        ['powershell', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'],
        capture_output=True, text=True, timeout=10
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def get_default_printer() -> str:
    if sys.platform != "win32":
        return ""
    result = subprocess.run(
        ['powershell', '-Command',
         '(Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default=True").Name'],
        capture_output=True, text=True, timeout=10
    )
    return result.stdout.strip()


def print_file(file_path: str, printer_name: str = None, copies: int = 1) -> dict:
    if sys.platform != "win32":
        return {"error": "Printing only works when the backend runs on a Windows machine."}

    printer = printer_name or get_default_printer()
    ps_lines = []
    for _ in range(copies):
        if printer:
            ps_lines.append(
                f'Start-Process -FilePath "{file_path}" -Verb PrintTo -ArgumentList "{printer}" -Wait'
            )
        else:
            ps_lines.append(f'Start-Process -FilePath "{file_path}" -Verb Print -Wait')

    result = subprocess.run(
        ['powershell', '-NonInteractive', '-Command', "; ".join(ps_lines)],
        capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0 and result.stderr.strip():
        return {"error": result.stderr.strip()}
    return {"success": True, "printer": printer, "copies": copies}


def download_and_print(access_token: str, file_id: str, mime_type: str,
                       filename: str, printer_name: str = None, copies: int = 1) -> dict:
    from app.services.drive import DriveService
    drive = DriveService(access_token)

    google_native = {
        "application/vnd.google-apps.document",
        "application/vnd.google-apps.spreadsheet",
        "application/vnd.google-apps.presentation",
    }
    try:
        if mime_type in google_native:
            content = drive.service.files().export(
                fileId=file_id, mimeType="application/pdf"
            ).execute()
            ext = ".pdf"
        else:
            content = drive.download_file(file_id)
            _, ext = os.path.splitext(filename)
            ext = ext or ".pdf"

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(content if isinstance(content, bytes) else content.encode())
            tmp_path = tmp.name

        result = print_file(tmp_path, printer_name=printer_name, copies=copies)

        try:
            os.unlink(tmp_path)
        except Exception:
            pass

        result["filename"] = filename
        return result
    except Exception as e:
        return {"error": str(e)}
