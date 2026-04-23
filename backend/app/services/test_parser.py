"""
Parse a test document (txt or docx) into structured JSON using AI.
Also parses an optional answer key file.
"""
import json
import re
from pathlib import Path


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract plain text from txt or docx bytes."""
    fname = filename.lower()
    if fname.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="replace")
    if fname.endswith(".docx") or fname.endswith(".doc"):
        import io
        from docx import Document
        try:
            doc = Document(io.BytesIO(file_bytes))
            return "\n".join(p.text or "" for p in doc.paragraphs)
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
- multiple_choice: a numbered gap in a dialogue/paragraph, followed by "a X  b Y  c Z" options. Set text to empty string, put options as [["a","X"],["b","Y"],["c","Z"]].
- short_answer: reading comprehension question that asks "What/When/Where/Who/Why" and requires a full sentence answer.
- essay: ONLY for genuinely free writing tasks where the student writes a full paragraph (60+ words). Clues: "Write X–Y words", "Write a review/email/paragraph/essay". Do NOT use essay for grammar exercises or sentence transformation tasks.
- show_work: math or problem-solving questions where the student must show their working/solution steps. Use for equations, calculations, proofs, or any question that says "solve", "calculate", "show your work". The text field contains the full problem.

IMPORTANT: Grammar exercises that say "Write questions/sentences with be going to" or similar are fill_in_blank — each numbered item gets its own question with type fill_in_blank.

For fill_in_blank_hint: clean the text so it shows the sentence without the hint letter (the hint_letter field carries it separately).

For the writing section, include Paragraph guidance in writing_guide field.
For reading sections, include the full passage text in passage field.
For communication sections with dialogues, include the full dialogue in dialogue field.
For word boxes (list of words to choose from), put them in word_box as an array.

TEST TEXT:
"""

ANSWER_KEY_PROMPT = """Parse this answer key and return ONLY valid JSON mapping question IDs to correct answers.

Question IDs follow the pattern s{block_num}_q{question_num}.
Example: section 1 question 1 = "s1_q1", section 8 question 3 = "s8_q3".

For multiple choice, use the letter ("a", "b", or "c").
For other questions, use an array of acceptable answers (lowercase, include variants).
For essay/writing sections, skip them entirely.

Return format: {"s1_q1": ["bass"], "s1_q2": ["sister"], "s8_q1": ["b"], ...}

ANSWER KEY TEXT:
"""


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


def parse_test(file_bytes: bytes, filename: str, ai_client, model: str) -> dict:
    """Parse test file into structured JSON using AI."""
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
    return result


def parse_answer_key(file_bytes: bytes, filename: str, ai_client, model: str) -> dict:
    """Parse answer key file into {question_id: [answers]} mapping."""
    text = extract_text(file_bytes, filename)
    prompt = ANSWER_KEY_PROMPT + text

    response = ai_client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
    )
    raw = (response.choices[0].message.content or "").strip()
    if not raw:
        return {}
    return _clean_and_parse(raw)
