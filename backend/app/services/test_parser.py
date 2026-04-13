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
    if fname.endswith(".docx"):
        import io
        from docx import Document
        doc = Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs)
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
          "type": "fill_in_blank | fill_in_blank_hint | binary_choice | multiple_choice | short_answer | essay",
          "hint_letter": "f" or null,
          "options": [["a", "have"], ["b", "want"], ["c", "like"]] or null,
          "choice_values": ["prediction", "plan"] or null
        }
      ]
    }
  ]
}

Question type rules:
- fill_in_blank: text has ________ with no leading hint letter. Use for most gaps.
- fill_in_blank_hint: text has a letter immediately before ________ (like "f________"). Extract hint_letter.
- binary_choice: question ends with two options separated by " / " (like "prediction / plan"). Remove the options from text, put them in choice_values.
- multiple_choice: a numbered gap in a dialogue/paragraph, followed by "a X  b Y  c Z" options. Set text to empty string, put options as [["a","X"],["b","Y"],["c","Z"]].
- short_answer: reading comprehension question requiring a complete sentence answer.
- essay: free writing task (says "Write X-Y words" or "Write a...").

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


def parse_test(file_bytes: bytes, filename: str, ai_client, model: str) -> dict:
    """Parse test file into structured JSON using AI."""
    text = extract_text(file_bytes, filename)
    prompt = TEST_PARSE_PROMPT + text

    response = ai_client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=4000,
    )
    raw = response.choices[0].message.content.strip()
    # Strip markdown code fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


def parse_answer_key(file_bytes: bytes, filename: str, ai_client, model: str) -> dict:
    """Parse answer key file into {question_id: [answers]} mapping."""
    text = extract_text(file_bytes, filename)
    prompt = ANSWER_KEY_PROMPT + text

    response = ai_client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
    )
    raw = response.choices[0].message.content.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)
