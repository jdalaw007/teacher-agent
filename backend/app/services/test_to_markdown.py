"""
AI-powered conversion of a test document (PDF/docx/txt) into our deterministic
markdown format. Two-pass strategy:

  Pass 1 — Outline: AI sees the whole document and returns just the high-level
           block structure (titles, marks, expected question count and type).
           This is a small, focused task. Errors are easy to spot.

  Pass 2 — Per block: For each block in the outline, AI sees the document AGAIN
           plus the outline and the target block_num. It returns markdown for
           ONLY that block. Each call is independent — an error in block 3 does
           not affect block 4.

Final output: concatenated markdown ready for our markdown_to_test_data parser.
"""
import json
import re
from typing import Optional

from app.services.test_parser import _pdf_to_b64_images, extract_text, _clean_and_parse


# ── Outline pass prompt ────────────────────────────────────────────────────

OUTLINE_PROMPT = """You are reading an English language test. Return ONLY a high-level outline of its blocks (sections / numbered exercises) — do NOT include question content yet.

Return ONLY valid JSON:
{
  "title": "string",
  "blocks": [
    {
      "block_num": 1,
      "section_title": "Listening",
      "instruction": "Listen to the conversation. Choose the correct words.",
      "marks": 10,
      "expected_count": 10,
      "expected_type": "multiple_choice"
    },
    ...
  ]
}

Rules:
- block_num is the exercise number as it appears in the document. If the document numbers exercises 1, 2, 3 ... use those numbers.
- expected_type is your best guess from these options:
    multiple_choice    (a/b/c options)
    binary_choice      (two slash-separated options)
    fill_in_blank      (gap to complete with one word)
    fill_in_blank_hint (gap with a starting letter shown)
    short_answer       (write a single word/phrase from a passage)
    essay              (write a paragraph)
    tick               (multi-select checkboxes)
    match              ("Match 1-5 with a-e" exercises)
- expected_count is your best guess at how many numbered questions the block has.
- DO NOT skip blocks. If the document has 8 numbered exercises, return 8 blocks.
- DO NOT split a single exercise into two blocks.
- If a section has a Speaking part that is teacher-graded (in person), include it but mark expected_type as "essay" (we treat it as ungraded text).
- Skip any "Total marks" footer.

TEST DOCUMENT:
"""


# ── Per-block markdown prompt ──────────────────────────────────────────────

MARKDOWN_SPEC = """OUR MARKDOWN SPEC (return ONLY this format, nothing else):

## N. Section title (M marks)
> Block instruction (one line)
[audio 1.02]                        # optional, only if document references audio
[wordbox] word1, word2, word3       # optional, only if there's a word box
[example] An example sentence.      # optional, only if document has an example

[passage] ... [/passage]            # multi-line reading passage (only if section has one)
[dialogue] ... [/dialogue]          # multi-line dialogue (only if section has one)
[guide] ... [/guide]                # writing-guide bullet points (only for writing tasks)
[match] ... [/match]                # see below

QUESTION TYPES:

  Fill-in-blank with hint letter (e.g. "f________ of metal", answer "fan"):
      1. Joe is a big f________ of metal.   = fan
      Use 8 underscores for the gap. Put the letter immediately before them.

  Fill-in-blank (plain gap):
      1. She lives in ________.   = manchester

  Letter pattern (e.g. "old - o___r" with answer "older"):
      1. old - o___r   = older
      Preserve the publisher's pattern in question text. The answer (after =) is the full word.

  Multiple choice (a/b/c):
      1. He has ________ some treasure.
         - a) hidden
         - *b) discovered          ← * marks the correct answer
         - c) stolen

  Binary choice (two-way slash choice — write inline as parens):
      1. There (*there's / are) two theatres.
      Always use parentheses around the two options. * before the correct one.

  Short answer (full sentence answer to a reading question):
      1. When did Zara start piano?   = at age five, when she was five
      Comma-separated alternatives are all accepted.

  Tick (multi-select):
      1. Tick the adjectives you hear.
         [ ] small *
         [ ] friendly *
         [ ] dirty
      * marks items that should be ticked.

  Match (matching 1-5 with a-e):
      [match]
      - We play basketball there.   = sports centre
      - Trains go from there.       = train station
      [/match]
      The text after = is the right-hand option that matches the left-hand item.

  Essay / writing task:
      1. [essay]
      Use this for any task where the student writes a paragraph or full text.

CRITICAL RULES:
- Output ONLY markdown. No explanations, no code fences, no commentary.
- The first non-empty line MUST be `## N. Title (M marks)`.
- Use the exact section_title, marks, and instruction provided to you.
- Mark every objective answer with * (multiple choice / binary choice / tick) or = answer (fill-in / short answer).
- For speaking-style or open-ended writing where there's no fixed answer, use [essay].
"""


BLOCK_PROMPT = """You are converting ONE section of an English test to our markdown spec. Output ONLY the markdown for this single block.

TARGET BLOCK:
- block_num: {block_num}
- section_title: {section_title}
- marks: {marks}
- instruction: {instruction}
- expected question count: {expected_count}
- expected question type: {expected_type}

{spec}

The full test document is provided so you can find this block. Locate exercise number {block_num} ("{section_title}") in the document and convert ONLY that block to markdown. Do NOT include other blocks.

Use the EXACT block_num, section_title, and marks given above in the `## N. Title (M marks)` header.

If the block's questions cannot all be expressed in our spec (e.g. they require open-ended sentence writing that has no fixed answer), use [essay] for those questions.

TEST DOCUMENT:
"""


# ── Helpers ────────────────────────────────────────────────────────────────


def _strip_md_fences(text: str) -> str:
    """Remove ```markdown ... ``` or ``` ... ``` wrappers if present."""
    text = text.strip()
    text = re.sub(r"^```(?:markdown|md)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


def _build_content_for_pdf(file_bytes: bytes, prompt: str, max_pages: int = 12) -> list:
    """Build OpenAI-style multimodal content array for a PDF input."""
    images = _pdf_to_b64_images(file_bytes, max_pages=max_pages)
    if not images:
        raise ValueError("Could not extract pages from PDF.")
    content = [{"type": "text", "text": prompt}]
    for b64 in images:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"}
        })
    return content


# ── Pass 1: extract outline ────────────────────────────────────────────────


def extract_outline(file_bytes: bytes, filename: str, ai_client, model: str) -> dict:
    """Run the AI outline pass. Returns {"title": str, "blocks": [...]}"""
    fname = filename.lower()
    if fname.endswith(".pdf"):
        content = _build_content_for_pdf(file_bytes, OUTLINE_PROMPT)
        messages = [{"role": "user", "content": content}]
    else:
        text = extract_text(file_bytes, filename)
        messages = [{"role": "user", "content": OUTLINE_PROMPT + text}]

    response = ai_client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=2000,
    )
    raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise ValueError("AI returned an empty outline.")
    parsed = _clean_and_parse(raw)
    if not parsed.get("blocks"):
        raise ValueError("AI returned an outline with no blocks.")
    return parsed


# ── Pass 2: per-block markdown ─────────────────────────────────────────────


def block_to_markdown(file_bytes: bytes, filename: str, outline_block: dict,
                     ai_client, model: str) -> str:
    """Generate markdown for a single block, using the rest of the document as context."""
    prompt = BLOCK_PROMPT.format(
        block_num=outline_block.get("block_num"),
        section_title=outline_block.get("section_title", ""),
        marks=outline_block.get("marks", 0),
        instruction=outline_block.get("instruction", ""),
        expected_count=outline_block.get("expected_count", "?"),
        expected_type=outline_block.get("expected_type", "?"),
        spec=MARKDOWN_SPEC,
    )

    fname = filename.lower()
    if fname.endswith(".pdf"):
        content = _build_content_for_pdf(file_bytes, prompt)
        messages = [{"role": "user", "content": content}]
    else:
        text = extract_text(file_bytes, filename)
        messages = [{"role": "user", "content": prompt + text}]

    response = ai_client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=4000,
    )
    raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise ValueError(f"AI returned empty markdown for block {outline_block.get('block_num')}.")
    return _strip_md_fences(raw)


# ── Orchestrator ───────────────────────────────────────────────────────────


def extract_to_markdown(file_bytes: bytes, filename: str, ai_client, model: str,
                       progress_cb: Optional[callable] = None) -> dict:
    """
    Convert a test document end-to-end into our markdown format.
    Returns {"markdown": str, "outline": dict, "errors": [str]}.

    progress_cb (optional): called as progress_cb(stage, current, total) so the
    caller can stream UI updates.
    """
    errors: list[str] = []

    # Pass 1
    if progress_cb:
        progress_cb("outline", 0, 1)
    outline = extract_outline(file_bytes, filename, ai_client, model)
    if progress_cb:
        progress_cb("outline", 1, 1)

    blocks = outline.get("blocks", [])
    title = outline.get("title", "")

    # Pass 2: each block independently
    block_markdowns: list[str] = []
    for i, block in enumerate(blocks):
        if progress_cb:
            progress_cb("block", i, len(blocks))
        try:
            md = block_to_markdown(file_bytes, filename, block, ai_client, model)
            block_markdowns.append(md)
        except Exception as e:
            errors.append(f"Block {block.get('block_num')}: {e}")
            # Insert a stub so the teacher sees the gap and can fill it
            block_markdowns.append(
                f"## {block.get('block_num')}. {block.get('section_title', 'Untitled')} ({block.get('marks', 0)} marks)\n"
                f"> {block.get('instruction', '')}\n\n"
                f"<!-- AI failed to convert this block: {e}. Please add questions manually. -->\n"
            )
    if progress_cb:
        progress_cb("block", len(blocks), len(blocks))

    # Stitch together
    parts: list[str] = []
    if title:
        parts.append(f"# {title}")
    parts.extend(block_markdowns)
    full_markdown = "\n\n".join(parts).strip() + "\n"

    return {
        "markdown": full_markdown,
        "outline": outline,
        "errors": errors,
    }
