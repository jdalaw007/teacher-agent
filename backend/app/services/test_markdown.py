"""
Deterministic markdown -> test_data parser. No AI involved.

Spec (one place to look up syntax):

    # Test title

    ## 1. Section name (10 marks)
    > Block instruction (one line, can repeat)
    [audio 1.02]                 # optional
    [wordbox] word1, word2, ...  # optional
    [example] text               # optional

    [passage] ... [/passage]     # multi-line reading passage
    [dialogue] ... [/dialogue]
    [guide] ... [/guide]
    [match] ... [/match]         # match exercise; see below

    1. Question text with ________ blank.
       - a) option 1
       - *b) option 2 (correct, prefixed with *)
       - c) option 3

    2. Inline binary choice (*opt1 / opt2) like this.

    3. Tick the items that apply.
       [ ] item one *
       [ ] item two
       [ ] item three *

    4. Joe's a big f________ of heavy metal.   = fan
    5. old - o___r   = older

    6. Write a review of a music video. 60-80 words. [essay]

Match block:

    [match]
    - We play basketball there. = sports centre
    - It goes over the river.   = bridge
    [/match]

Type detection:
- has bullet options below             -> multiple_choice
- has [ ] checkboxes below              -> tick
- has (x / y) at end                    -> binary_choice
- has [essay] marker                    -> essay
- has letter-then-underscores like f___ -> fill_in_blank_hint
- has ________ in text                  -> fill_in_blank
- otherwise                             -> short_answer (treated as fill_in_blank)
"""
import re
from typing import Optional, Tuple


# ── Line patterns ─────────────────────────────────────────────────────────
TITLE_RE = re.compile(r"^#\s+(.+?)\s*$")
BLOCK_HEADER_RE = re.compile(r"^##\s*(\d+)\.\s+(.+?)\s*\((\d+)\s*marks?\)\s*$")
INSTRUCTION_RE = re.compile(r"^>\s*(.*)$")

# Single-line markers: [audio X], [wordbox] words, [example] text
AUDIO_RE = re.compile(r"^\[audio\s+([^\]]+)\]\s*$")
WORDBOX_RE = re.compile(r"^\[wordbox\]\s*(.+?)\s*$")
EXAMPLE_RE = re.compile(r"^\[example\]\s*(.+?)\s*$")

# Fenced multi-line markers
FENCE_OPEN_RE = re.compile(r"^\[(passage|dialogue|guide|match)\]\s*$")
FENCE_CLOSE_RE = re.compile(r"^\[/(passage|dialogue|guide|match)\]\s*$")

# Question-level markers
ESSAY_MARKER_RE = re.compile(r"\[essay\]\s*$")

# Question line: "1. text..." — captures number and rest
QUESTION_RE = re.compile(r"^(\d+)\.\s*(.*)$")

# Option line: "- a) text" or "- *a) text" (optional indent)
OPTION_RE = re.compile(r"^\s*-\s*(\*\s*)?([a-z])\)\s*(.+?)\s*$", re.IGNORECASE)

# Tick item: "[ ] text" or "[ ] text *"
TICK_RE = re.compile(r"^\s*\[\s*\]\s*(.+?)(\s+\*)?\s*$")

# Standalone answer line: "= word, word"
ANSWER_LINE_RE = re.compile(r"^\s*=\s*(.+?)\s*$")

# Match pair line (inside [match] block): "- left text = right text"
MATCH_PAIR_RE = re.compile(r"^\s*-\s*(.+?)\s*=\s*(.+?)\s*$")

# Inline binary choice at end of line: "(opt1 / *opt2)" or "(*opt1 / opt2)"
BINARY_CHOICE_RE = re.compile(r"\(\s*(\*?\s*[^()/\n]+?)\s*/\s*(\*?\s*[^()/\n]+?)\s*\)")

# Trailing answer on a question/text line: " = answer"
INLINE_ANSWER_RE = re.compile(r"\s+=\s+(.+?)\s*$")

# Underscore patterns
HINT_LETTER_RE = re.compile(r"\b([a-zA-Z])(_{3,})")  # like f________ or o___
PLAIN_BLANK_RE = re.compile(r"_{3,}")


def _split_alternatives(s: str) -> list[str]:
    """Split an answer string into alternatives. Accepts both ',' and ' / ' as
    separators (AI naturally writes 'hasn't seen / hasn't visited'). Slashes WITHOUT
    surrounding spaces are preserved (so 'and/or', '1/2' stay as one answer)."""
    parts = re.split(r',|\s+/\s+', s)
    return [p.strip() for p in parts if p.strip()]


def _strip_inline_answer(text: str) -> Tuple[str, Optional[list[str]]]:
    """If text ends with ' = answer1, answer2', strip and return parts."""
    m = INLINE_ANSWER_RE.search(text)
    if not m:
        return text, None
    answers = _split_alternatives(m.group(1))
    return text[:m.start()].rstrip(), answers


def _detect_binary_choice(text: str) -> Tuple[str, Optional[list[str]], Optional[str]]:
    """Find (x / y) or (*x / y) inline in text. Returns:
        (text_with_blank, [opt1, opt2], correct_value or None)
    or unchanged text and None if no binary choice found."""
    m = BINARY_CHOICE_RE.search(text)
    if not m:
        return text, None, None
    raw_a, raw_b = m.group(1).strip(), m.group(2).strip()

    correct = None
    if raw_a.startswith("*"):
        a = raw_a[1:].strip()
        correct = a
    else:
        a = raw_a
    if raw_b.startswith("*"):
        b = raw_b[1:].strip()
        correct = b
    else:
        b = raw_b

    new_text = text[:m.start()] + "________" + text[m.end():]
    return new_text, [a, b], correct


def _detect_question_type(q_text: str) -> Tuple[str, Optional[str]]:
    """Inspect question text to decide simple types (no options/options analysis here).
    Returns (type, hint_letter_or_None)."""
    if ESSAY_MARKER_RE.search(q_text):
        return "essay", None
    # fill_in_blank_hint: a single letter immediately followed by 3+ underscores
    hint_m = HINT_LETTER_RE.search(q_text)
    if hint_m:
        return "fill_in_blank_hint", hint_m.group(1)
    # plain underscores
    if PLAIN_BLANK_RE.search(q_text):
        return "fill_in_blank", None
    return "short_answer", None


def _normalize_blanks(text: str) -> str:
    """Normalise blanks for consistent rendering:
       - Collapse adjacent blanks (`________ ________`) into a single one. This
         catches the AI mistake of splitting a multi-word answer like "have seen"
         into two separate input fields.
       - Then replace any remaining run of 3+ underscores with exactly 8.
    """
    text = re.sub(r'_{3,}(\s+_{3,})+', '________', text)
    return PLAIN_BLANK_RE.sub("________", text)


def _strip_hint_letter(text: str) -> str:
    """For fill_in_blank_hint, the hint letter is rendered as a styled badge by the
    HTML layer, so strip it from the text to avoid duplication. 'f________' -> '________'.
    """
    return re.sub(r'\b([a-zA-Z])(_{3,})', r'\2', text)


def _strip_essay_marker(text: str) -> str:
    return ESSAY_MARKER_RE.sub("", text).rstrip()


# ── Main parser ─────────────────────────────────────────────────────────


def markdown_to_test_data(markdown: str) -> dict:
    """Parse markdown spec into {test_data, answer_key}."""
    lines = markdown.split("\n")

    title = ""
    sections: list[dict] = []
    answer_key: dict = {}

    cur_sec: Optional[dict] = None
    cur_q: Optional[dict] = None
    cur_q_correct: Optional[set[str]] = None  # for MC: collect letters marked *
    cur_q_tick_correct: Optional[list[str]] = None  # for tick: collect items marked *
    cur_q_explicit_answer: Optional[list[str]] = None  # from "= answer" line

    fence_buf: list[str] = []
    fence_kind: Optional[str] = None  # passage | dialogue | guide | match

    def flush_question():
        """Finalize the current question into the section, and write to answer_key."""
        nonlocal cur_q, cur_q_correct, cur_q_tick_correct, cur_q_explicit_answer
        if cur_q is None or cur_sec is None:
            return
        qid = f"s{cur_sec['block_num']}_q{cur_q['num']}"
        qtype = cur_q.get("type", "")

        # Reconcile type based on what we collected
        if cur_q.get("options"):
            cur_q["type"] = "multiple_choice"
            qtype = "multiple_choice"
        elif cur_q.get("tick_items"):
            cur_q["type"] = "tick"
            qtype = "tick"

        # Answer key resolution
        if qtype == "multiple_choice" and cur_q_correct:
            answer_key[qid] = sorted(cur_q_correct)
        elif qtype == "tick" and cur_q_tick_correct is not None:
            answer_key[qid] = list(cur_q_tick_correct)
        elif qtype == "binary_choice" and cur_q.get("_correct"):
            answer_key[qid] = [cur_q.pop("_correct")]
        elif cur_q_explicit_answer is not None:
            answer_key[qid] = cur_q_explicit_answer

        # Clean question text: normalize blanks, strip essay marker, strip hint letter
        if cur_q.get("text"):
            cur_q["text"] = _strip_essay_marker(cur_q["text"])
            cur_q["text"] = _normalize_blanks(cur_q["text"])
            if qtype == "fill_in_blank_hint":
                cur_q["text"] = _strip_hint_letter(cur_q["text"])

        cur_sec["questions"].append(cur_q)
        cur_q = None
        cur_q_correct = None
        cur_q_tick_correct = None
        cur_q_explicit_answer = None

    def flush_section():
        nonlocal cur_sec
        flush_question()
        if cur_sec is not None:
            sections.append(cur_sec)
            cur_sec = None

    def start_question(num: int, text: str):
        """Begin building a new question; auto-detects type from text."""
        nonlocal cur_q, cur_q_correct, cur_q_tick_correct, cur_q_explicit_answer
        flush_question()

        # Strip inline answer "= ..."
        text, inline_answers = _strip_inline_answer(text)
        # Detect inline binary choice "( x / y )"
        text, choices, correct_value = _detect_binary_choice(text)

        # Detect type
        if choices is not None:
            qtype = "binary_choice"
            hint = None
        else:
            qtype, hint = _detect_question_type(text)

        cur_q = {
            "num": num,
            "type": qtype,
            "text": text.strip(),
        }
        if hint:
            cur_q["hint_letter"] = hint
        if choices is not None:
            cur_q["choice_values"] = choices
            if correct_value:
                cur_q["_correct"] = correct_value

        cur_q_correct = set()
        cur_q_tick_correct = None  # only created if we see [ ] checkbox lines
        cur_q_explicit_answer = inline_answers

    # ── Line-by-line walk ──────────────────────────────────────────────
    for raw_line in lines:
        line = raw_line.rstrip("\n").rstrip("\r")
        stripped = line.strip()

        # Inside a fenced region — collect lines until [/kind]
        if fence_kind is not None:
            close = FENCE_CLOSE_RE.match(stripped)
            if close and close.group(1) == fence_kind:
                # Finalize the fenced block
                content = "\n".join(fence_buf).strip("\n")
                if cur_sec is not None:
                    if fence_kind == "passage":
                        cur_sec["passage"] = content
                    elif fence_kind == "dialogue":
                        cur_sec["dialogue"] = content
                    elif fence_kind == "guide":
                        cur_sec["writing_guide"] = content
                    elif fence_kind == "match":
                        # Parse match pairs into questions
                        cur_sec["section_type"] = "match"
                        match_options = []  # collected right-side answers as labeled options
                        for buf_line in fence_buf:
                            m = MATCH_PAIR_RE.match(buf_line)
                            if not m:
                                continue
                            left, right = m.group(1).strip(), m.group(2).strip()
                            qnum = len(cur_sec["questions"]) + 1
                            qid = f"s{cur_sec['block_num']}_q{qnum}"
                            cur_sec["questions"].append({
                                "num": qnum,
                                "type": "match",
                                "text": left,
                            })
                            answer_key[qid] = [right]
                            if right not in [o[1] for o in match_options]:
                                letter = chr(ord("a") + len(match_options))
                                match_options.append([letter, right])
                        cur_sec["match_options"] = match_options
                fence_buf = []
                fence_kind = None
                continue
            else:
                fence_buf.append(line)
                continue

        # Blank line: nothing closes; just continue
        if not stripped:
            continue

        # Title
        m = TITLE_RE.match(stripped)
        if m and not stripped.startswith("##"):
            title = m.group(1)
            continue

        # Block header
        m = BLOCK_HEADER_RE.match(stripped)
        if m:
            flush_section()
            cur_sec = {
                "block_num": int(m.group(1)),
                "section_title": m.group(2).strip(),
                "instruction": "",
                "marks": int(m.group(3)),
                "questions": [],
            }
            continue

        # Outside any section, ignore stray content
        if cur_sec is None:
            continue

        # Fence open
        m = FENCE_OPEN_RE.match(stripped)
        if m:
            flush_question()
            fence_kind = m.group(1)
            fence_buf = []
            continue

        # Single-line markers
        m = AUDIO_RE.match(stripped)
        if m:
            cur_sec["audio_ref"] = m.group(1).strip()
            continue
        m = WORDBOX_RE.match(stripped)
        if m:
            cur_sec["word_box"] = [w.strip() for w in m.group(1).split(",") if w.strip()]
            continue
        m = EXAMPLE_RE.match(stripped)
        if m:
            cur_sec["example"] = m.group(1).strip()
            continue

        # Instruction line
        m = INSTRUCTION_RE.match(stripped)
        if m:
            instr = m.group(1).strip()
            if cur_sec.get("instruction"):
                cur_sec["instruction"] = cur_sec["instruction"] + " " + instr
            else:
                cur_sec["instruction"] = instr
            continue

        # Standalone answer line ("= answer")
        m = ANSWER_LINE_RE.match(stripped)
        if m and cur_q is not None:
            cur_q_explicit_answer = _split_alternatives(m.group(1))
            continue

        # Option line ("- *a) text")
        m = OPTION_RE.match(line)
        if m and cur_q is not None:
            star, letter, opt_text = m.group(1), m.group(2).lower(), m.group(3).strip()
            if "options" not in cur_q:
                cur_q["options"] = []
            cur_q["options"].append([letter, opt_text])
            if star:
                cur_q_correct.add(letter)
            # Remove fill-in-blank-hint detection if MC
            cur_q.pop("hint_letter", None)
            continue

        # Tick item line
        m = TICK_RE.match(line)
        if m and cur_q is not None:
            item_text = m.group(1).strip()
            is_correct = bool(m.group(2))
            if "tick_items" not in cur_q:
                cur_q["tick_items"] = []
                cur_q_tick_correct = []
            cur_q["tick_items"].append(item_text)
            if is_correct:
                cur_q_tick_correct.append(item_text)
            continue

        # Question line ("1. text")
        m = QUESTION_RE.match(stripped)
        if m:
            num = int(m.group(1))
            qtext = m.group(2)
            start_question(num, qtext)
            continue

        # Otherwise, treat as continuation of question text
        if cur_q is not None:
            cur_q["text"] = (cur_q["text"] + " " + stripped).strip()
            # Re-detect type if we just added meaningful content
            qtype, hint = _detect_question_type(cur_q["text"])
            if cur_q.get("type") in ("short_answer",) and qtype != "short_answer":
                cur_q["type"] = qtype
                if hint:
                    cur_q["hint_letter"] = hint

    # End of input — flush remaining state
    flush_section()

    return {
        "test_data": {"title": title, "sections": sections},
        "answer_key": answer_key,
    }
