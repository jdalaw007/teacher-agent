"""
Translate GitHub wiki pages to Czech using OpenAI.
Saves CS-{filename}.md versions and pushes to the wiki repo.
"""
import os
import subprocess
from pathlib import Path
from openai import OpenAI

WIKI_DIR = Path("C:/Users/jdlaw/AppData/Local/Temp/teacher-agent-wiki")
API_KEY = os.environ.get("OPENAI_API_KEY", "")
WIKI_BASE = "https://github.com/jdalaw007/teacher-agent/wiki"

# Maps English page names to Czech for cross-links
EN_TO_CS_PAGE = {
    "Getting-Started": "CS-Getting-Started",
    "AI-Chat-Agent": "CS-AI-Chat-Agent",
    "Assignment-Generator": "CS-Assignment-Generator",
    "Document-Library": "CS-Document-Library",
    "Student-Profiles-and-Groups": "CS-Student-Profiles-and-Groups",
    "Scheduled-Posts": "CS-Scheduled-Posts",
    "Content-Checker": "CS-Content-Checker",
    "Settings-and-Configuration": "CS-Settings-and-Configuration",
    "GDPR-and-Data-Privacy": "CS-GDPR-and-Data-Privacy",
    "Known-Limitations": "CS-Known-Limitations",
}

PAGES = [
    "Home",
    "Getting-Started",
    "AI-Chat-Agent",
    "Assignment-Generator",
    "Document-Library",
    "Student-Profiles-and-Groups",
    "Scheduled-Posts",
    "Content-Checker",
    "Settings-and-Configuration",
    "GDPR-and-Data-Privacy",
    "Known-Limitations",
]

SYSTEM_PROMPT = """You are a professional translator specialising in Czech educational and technical documentation.
Translate the following GitHub wiki page from English to Czech.

Rules:
- Translate all prose, headings, and table content to Czech
- Keep all Markdown formatting exactly as-is (##, **, *, |, -, etc.)
- Keep all code blocks, file names, URLs, and technical terms (API, OAuth, SQLite, PDF, JSON, etc.) in English
- Keep GitHub wiki page links in the format [Czech link text](Page-Name) — translate the link text but keep the page name in English
- Do not add explanatory notes or translator comments
- Output only the translated Markdown, nothing else
"""

def translate(client: OpenAI, text: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=0.2,
    )
    return response.choices[0].message.content.strip()

def lang_banner(en_page: str, cs_page: str) -> str:
    return (
        f"> **Jazyk / Language:** [English]({WIKI_BASE}/{en_page}) | **Cestina**\n\n"
    )

def add_en_banner(content: str, en_page: str, cs_page: str) -> str:
    banner = f"> **Language:** **English** | [Cestina]({WIKI_BASE}/{cs_page})\n\n"
    return banner + content

def main():
    client = OpenAI(api_key=API_KEY)

    translated = {}

    for page in PAGES:
        src = WIKI_DIR / f"{page}.md"
        if not src.exists():
            print(f"  SKIP {page}.md (not found)")
            continue

        print(f"Translating {page}...", end=" ", flush=True)
        content = src.read_text(encoding="utf-8")
        cs_content = translate(client, content)
        cs_page_name = f"CS-{page}" if page != "Home" else "CS-Home"
        banner = lang_banner(page, cs_page_name)
        cs_content = banner + cs_content
        translated[page] = (cs_page_name, cs_content)
        print("done")

    # Write Czech files
    for page, (cs_page_name, cs_content) in translated.items():
        out = WIKI_DIR / f"{cs_page_name}.md"
        out.write_text(cs_content, encoding="utf-8")
        print(f"  Written: {cs_page_name}.md")

    # Add English language banner to existing English pages
    for page, (cs_page_name, _) in translated.items():
        src = WIKI_DIR / f"{page}.md"
        content = src.read_text(encoding="utf-8")
        # Only add if banner not already present
        if "**Language:**" not in content:
            updated = add_en_banner(content, page, cs_page_name)
            src.write_text(updated, encoding="utf-8")
            print(f"  Updated English banner: {page}.md")

    # Git commit and push
    print("\nPushing to wiki...")
    subprocess.run(["git", "-C", str(WIKI_DIR), "config", "user.email", "smith.dlawrence@gmail.com"], check=True)
    subprocess.run(["git", "-C", str(WIKI_DIR), "config", "user.name", "David"], check=True)
    subprocess.run(["git", "-C", str(WIKI_DIR), "add", "."], check=True)
    subprocess.run(["git", "-C", str(WIKI_DIR), "commit", "-m", "Add Czech translations of all wiki pages"], check=True)
    subprocess.run(["git", "-C", str(WIKI_DIR), "push", "origin", "master"], check=True)
    print("Done! Czech wiki pages are live.")

if __name__ == "__main__":
    main()
