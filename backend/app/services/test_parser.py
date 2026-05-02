"""
Parse a test document (txt or docx) into structured JSON using AI.
Also parses an optional answer key file.
"""
import json
import re
from pathlib import Path


def _rejoin_split_lines(text: str) -> str:
    """Join lines where a sentence is split mid-way before slash options.
    E.g. "There's \nenough / too much" → "There's enough / too much"
    """
    lines = text.split("\n")
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Join when next line is a standalone slash-options line (continuation of this sentence)
        stripped = line.rstrip()
        next_line = lines[i + 1].strip() if i + 1 < len(lines) else ""
        # A slash-options-only line: contains " / " and has no leading number/tab (not a new question)
        next_is_options = (" / " in next_line and not next_line[:2].strip().isdigit()
                           and not next_line.startswith("\t"))
        if stripped and next_is_options:
            result.append(stripped + " " + lines[i + 1].strip())
            i += 2
        else:
            result.append(line)
            i += 1
    return "\n".join(result)


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract plain text from txt or docx bytes."""
    fname = filename.lower()
    if fname.endswith(".txt"):
        return _rejoin_split_lines(file_bytes.decode("utf-8", errors="replace"))
    if fname.endswith(".docx") or fname.endswith(".doc"):
        import io
        from docx import Document
        try:
            doc = Document(io.BytesIO(file_bytes))
            parts = []
            # Regular paragraphs
            for p in doc.paragraphs:
                parts.append(p.text or "")
            # Text boxes (txbxContent elements) — often contain reading passages
            for el in doc.element.body.iter():
                if el.tag.endswith("}txbxContent"):
                    text = "".join(t.text or "" for t in el.iter() if t.tag.endswith("}t"))
                    if text.strip():
                        parts.append("\n[PASSAGE]\n" + text.strip() + "\n[/PASSAGE]")
            return _rejoin_split_lines("\n".join(parts))
        except Exception:
            raise ValueError(
                "Could not read this file. It appears to be an old .doc format. "
                "Please open it in Word and save as .docx (File > Save As), "
                "or paste the text into a .txt file and upload that instead."
            )
    raise ValueError(f"Unsupported file type: {filename}. Use .txt or .docx")


TEST_PARSE_PROMPT = """You are parsing an English language test from plain text into structured JSON.

Return ONLY valid JSON — no markdown, no explanation.

Schema:
{
  "title": "string",
  "sections": [
    {
      "section_title": "string",
      "block_num": 1,
      "instruction": "string",
      "marks": 10,
      "audio_ref": "1.08" or null,
      "word_box": ["word1", "word2"] or null,
      "example": "string" or null,
      "passage_title": "string" or null,
      "passage": "string" or null,
      "dialogue": "string" or null,
      "writing_guide": "string" or null,
      "questions": [
        {
          "num": 1,
          "text": "string",
          "type": "fill_in_blank | fill_in_blank_hint | binary_choice | multiple_choice | short_answer | essay | show_work",
          "hint_letter": "f" or null,
          "options": [["a", "have"], ["b", "want"], ["c", "like"]] or null,
          "choice_values": ["prediction", "plan"] or null
        }
      ]
    }
  ]
}

Question type rules:
- fill_in_blank: text has ________ with no leading hint letter. Use for most gaps including grammar transformation exercises (e.g. "(you / be) → ________"). Always use exactly 8 underscores (________) as the blank placeholder in the text field.
- fill_in_blank_hint: text has a letter immediately before ________ (like "f________"). Extract hint_letter.
- binary_choice: question ends with two options separated by " / " (like "prediction / plan"). Remove the options from text, put them in choice_values.
- multiple_choice: TWO sub-cases:
  (a) Inline slash options: a full sentence with 2 OR 3 choices separated by " / " embedded inside it. CRITICAL: Replace the entire slash-separated group in the text field with "________" and list EVERY option separately. Example: "He thought it was something very old / a piece of plastic / a valuable coin." → text: "He thought it was ________.", options: [["a","something very old"],["b","a piece of plastic"],["c","a valuable coin"]]. NEVER leave slashes in the text field.
  (b) Dialogue gap: a numbered gap [1] in a dialogue/paragraph, followed by "a X  b Y  c Z" options below. Set text to empty string, put options as [["a","X"],["b","Y"],["c","Z"]].
- short_answer: reading comprehension question that asks "What/When/Where/Who/Why" and requires a full sentence answer.
- essay: ONLY for genuinely free writing tasks where the student writes a full paragraph (60+ words). Clues: "Write X–Y words", "Write a review/email/paragraph/essay". Do NOT use essay for grammar exercises or sentence transformation tasks.
- show_work: math or problem-solving questions where the student must show their working/solution steps. Use for equations, calculations, proofs, or any question that says "solve", "calculate", "show your work". The text field contains the full problem.

IMPORTANT: Grammar exercises that say "Write questions/sentences with be going to" or similar are fill_in_blank — each numbered item gets its own question with type fill_in_blank.

For fill_in_blank_hint: clean the text so it shows the sentence without the hint letter (the hint_letter field carries it separately).

For the writing section, include Paragraph guidance in writing_guide field.
For reading sections, include the full passage text in passage field. Text marked with [PASSAGE]...[/PASSAGE] is a reading passage — place it in the passage field of the relevant reading section.

For communication sections where blanks are embedded inline with numbers+hint letters (e.g. "It 1l_________ like London, but I'm not 2s_________"), treat each numbered blank as a separate fill_in_blank_hint question. Extract the hint_letter (the letter after the number), and set text to the full sentence containing that blank with the hint removed from the text (e.g. "It ________ like London"). Put the full paragraph in the dialogue field for context.
For communication sections with dialogues, include the full dialogue in dialogue field.
For word boxes (list of words to choose from), put them in word_box as an array.

TEST TEXT:
"""

ANSWER_KEY_PROMPT_TEMPLATE = """You have two documents: a PARSED TEST STRUCTURE and a raw ANSWER KEY document.
Your job is to match the answers from the answer key to the correct question IDs in the test structure.

Use the question text and options in the test structure to identify which answer in the key belongs to which question — do NOT rely solely on numbering, as the key may number exercises differently.

TEST STRUCTURE:
{test_summary}

RULES:
- For multiple_choice questions: return the letter ("a", "b", or "c") that matches the correct option in the TEST STRUCTURE above.
- For fill_in_blank / passive form / grammar: return an array of acceptable answers (lowercase). Use the exact form (e.g. ["are sold"], ["was found", "been found"]).
- For short_answer (write a sentence): return the expected answer lowercase, without trailing punctuation.
- For essay/free writing: skip entirely.
- Word boxes and example answers in the key are NOT answers — ignore them.

Return ONLY valid JSON: {{"s1_q1": ["b"], "s1_q2": ["c"], "s3_q1": ["are sold"], ...}}

ANSWER KEY TEXT:
{answer_key_text}"""


def _build_test_summary(test_data: dict) -> str:
    """Build a concise text summary of test questions for use in answer key parsing."""
    lines = []
    for sec in test_data.get("sections", []):
        bn = sec.get("block_num", "?")
        instr = sec.get("instruction", "")
        lines.append(f"\nBlock {bn}: {instr}")
        for q in sec.get("questions", []):
            qtype = q.get("type", "")
            if qtype in ("essay",):
                continue
            text = q.get("text", "")
            opts = q.get("options") or []
            choices = q.get("choice_values") or []
            key = f"s{bn}_q{q['num']}"
            if opts:
                opt_str = ", ".join(f"{o[0]}) {o[1]}" for o in opts if isinstance(o, (list, tuple)) and len(o) >= 2)
                lines.append(f"  {key} [{qtype}]: {text}  OPTIONS: {opt_str}")
            elif choices:
                lines.append(f"  {key} [{qtype}]: {text}  CHOICES: {' / '.join(choices)}")
            else:
                lines.append(f"  {key} [{qtype}]: {text}")
    return "\n".join(lines)


def _extract_first_json_object(text: str) -> str:
    """Extract the first balanced {...} block, correctly handling } inside strings."""
    depth = 0
    in_string = False
    escape = False
    start = None
    for i, ch in enumerate(text):
        if escape:
            escape = False
            continue
        if ch == '\\' and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start is not None:
                return text[start:i + 1]
    return ""


def _clean_and_parse(raw: str) -> dict:
    """Strip fences, extract outermost JSON object, repair and parse."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    raw = re.sub(r"\s*```\s*$", "", raw, flags=re.MULTILINE)
    raw = raw.strip()
    extracted = _extract_first_json_object(raw)
    if extracted:
        raw = extracted
    # Try standard parse first, fall back to json_repair
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        from json_repair import repair_json
        return json.loads(repair_json(raw))


def _pdf_to_b64_images(file_bytes: bytes, max_pages: int = 12, dpi: int = 150) -> list[str]:
    """Convert PDF pages to base64-encoded PNG images using pymupdf."""
    import fitz
    import base64
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    images = []
    for i in range(min(len(doc), max_pages)):
        page = doc[i]
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
        png_bytes = pix.tobytes("png")
        images.append(base64.b64encode(png_bytes).decode("utf-8"))
    doc.close()
    return images


def _parse_test_vision(file_bytes: bytes, ai_client, model: str) -> tuple:
    """Parse a PDF test using GPT-4o vision — sees the page exactly as a human would."""
    images = _pdf_to_b64_images(file_bytes)
    if not images:
        raise ValueError("Could not extract pages from PDF.")

    content = [{"type": "text", "text": TEST_PARSE_PROMPT.replace("TEST TEXT:\n", "TEST (shown as images below):\n")}]
    for b64 in images:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"}
        })

    response = ai_client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": content}],
        max_tokens=16000,
    )
    raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise ValueError("Vision AI returned an empty response.")
    result = _clean_and_parse(raw)
    if not result.get("sections") or not any(s.get("questions") for s in result.get("sections", [])):
        raise ValueError("Vision AI returned no questions — try uploading with OpenAI selected in Settings.")
    # Use title as stand-in for original_text (vision has no extractable plain text)
    original_text = f"[PDF — {len(images)} page(s) processed via vision]"
    return result, original_text


def parse_test(file_bytes: bytes, filename: str, ai_client, model: str) -> tuple:
    """Parse test file into structured JSON using AI. Returns (test_data, original_text).
    PDFs use vision (GPT-4o image input); .txt/.docx use text extraction.
    """
    fname = filename.lower()
    if fname.endswith(".pdf"):
        return _parse_test_vision(file_bytes, ai_client, model)

    text = extract_text(file_bytes, filename)
    prompt = TEST_PARSE_PROMPT + text

    response = ai_client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=16000,
    )
    raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise ValueError("AI returned an empty response. Try again or switch to OpenAI in Settings.")
    result = _clean_and_parse(raw)
    if not result.get("sections") or not any(s.get("questions") for s in result.get("sections", [])):
        raise ValueError(
            "AI returned no questions — response may have been truncated. "
            "Try uploading with OpenAI instead, or split the test into smaller sections."
        )
    return result, text


def parse_answer_key(file_bytes: bytes, filename: str, ai_client, model: str, test_data: dict = None) -> dict:
    """Parse answer key file into {question_id: [answers]} mapping.
    Pass test_data to enable cross-referencing against test questions for accurate block assignment.
    """
    test_summary = _build_test_summary(test_data) if test_data else ""
    prompt = ANSWER_KEY_PROMPT_TEMPLATE.format(
        test_summary=test_summary or "(not provided)",
        answer_key_text="{answer_key_text}",  # placeholder replaced below
    )

    fname = filename.lower()
    if fname.endswith(".pdf"):
        images = _pdf_to_b64_images(file_bytes, max_pages=6)
        # For PDFs: put the prompt + test summary as text, then append images
        prompt_text = ANSWER_KEY_PROMPT_TEMPLATE.format(
            test_summary=test_summary or "(not provided)",
            answer_key_text="(shown in images below)",
        )
        content = [{"type": "text", "text": prompt_text}]
        for b64 in images:
            content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"}})
        response = ai_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": content}],
            max_tokens=2000,
        )
    else:
        answer_key_text = extract_text(file_bytes, filename)
        full_prompt = ANSWER_KEY_PROMPT_TEMPLATE.format(
            test_summary=test_summary or "(not provided)",
            answer_key_text=answer_key_text,
        )
        response = ai_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": full_prompt}],
            max_tokens=2000,
        )
    raw = (response.choices[0].message.content or "").strip()
    if not raw:
        return {}
    return _clean_and_parse(raw)
