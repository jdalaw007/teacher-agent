"""
AI test validator — a second AI reads and answers the test, then compares to the answer key.
Flags questions where the test content appears malformed or the answer key mismatches.
"""
import json


VALIDATOR_PROMPT = """You are a student taking an English language test. Answer every question based ONLY on the test content provided. Do not use outside knowledge for fill-in-blank or multiple-choice questions — only use the words/options visible in the question.

Return ONLY valid JSON: a flat object mapping question IDs to your answers.
- For fill_in_blank / fill_in_blank_hint: give the word or phrase that fills the blank (string)
- For multiple_choice: give the letter "a", "b", or "c"
- For binary_choice: give one of the two options exactly as shown
- For short_answer: give a short answer sentence
- Skip essay and show_work questions entirely

Example: {"s1_q1": "b", "s1_q2": "discovered", "s2_q1": "railway", "s3_q1": "looks"}

TEST:
"""


def _build_test_text(test_data: dict) -> str:
    """Convert test JSON into plain text a student AI can read and answer."""
    lines = []
    title = test_data.get("title", "Test")
    lines.append(f"TEST: {title}\n")

    for sec in test_data.get("sections", []):
        bn = sec.get("block_num", 0)
        lines.append(f"\nSECTION {bn}: {sec.get('section_title', '')} — {sec.get('instruction', '')}")

        if sec.get("passage"):
            lines.append(f"[Reading passage: {sec['passage'][:600]}...]")
        if sec.get("dialogue"):
            lines.append(f"[Dialogue: {sec['dialogue'][:400]}...]")
        if sec.get("word_box"):
            lines.append(f"[Word box: {', '.join(sec['word_box'])}]")
        if sec.get("example"):
            lines.append(f"Example: {sec['example']}")

        for q in sec.get("questions", []):
            qtype = q.get("type", "")
            qid = f"s{bn}_q{q['num']}"
            text = q.get("text", "")

            if qtype in ("essay", "show_work"):
                continue

            if qtype == "multiple_choice":
                opts = q.get("options") or []
                opt_str = "  ".join(f"{o[0]}) {o[1]}" for o in opts if len(o) >= 2)
                lines.append(f"  Q{q['num']} [{qid}] {text}  OPTIONS: {opt_str}")

            elif qtype == "binary_choice":
                choices = q.get("choice_values") or []
                lines.append(f"  Q{q['num']} [{qid}] {text}  CHOOSE: {' / '.join(choices)}")

            elif qtype == "fill_in_blank_hint":
                hint = q.get("hint_letter", "")
                lines.append(f"  Q{q['num']} [{qid}] {text}  (starts with: {hint})")

            else:
                lines.append(f"  Q{q['num']} [{qid}] {text}")

    return "\n".join(lines)


def _compare(ai_answer: str, correct_values: list[str]) -> bool:
    """Check if AI answer matches any correct value (case-insensitive, partial ok for long answers)."""
    ai_norm = ai_answer.lower().strip().rstrip(".")
    for val in correct_values:
        v = val.lower().strip().rstrip(".")
        if ai_norm == v:
            return True
        # Accept if one contains the other (handles "goes to work" vs "go back to work")
        if len(v) > 4 and (v in ai_norm or ai_norm in v):
            return True
    return False


def validate_test(test_data: dict, answer_key: dict, ai_client, model: str) -> dict:
    """
    Have AI #2 take the test and compare to the answer key.
    Returns {
      "passed": int,
      "failed": int,
      "skipped": int,
      "issues": [{"q_id": "s1_q5", "problem": "AI answered X, key says Y"}]
    }
    """
    test_text = _build_test_text(test_data)
    prompt = VALIDATOR_PROMPT + test_text

    try:
        response = ai_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4000,
        )
        raw = (response.choices[0].message.content or "").strip()
        # Strip markdown fences
        import re
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```\s*$", "", raw, flags=re.MULTILINE)
        ai_answers = json.loads(raw)
    except Exception as e:
        return {"passed": 0, "failed": 0, "skipped": 0, "issues": [],
                "error": f"Validator AI failed: {e}"}

    passed = failed = skipped = 0
    issues = []

    # Build set of gradeable question IDs (skip essay/show_work)
    gradeable = set()
    for sec in test_data.get("sections", []):
        bn = sec.get("block_num", 0)
        for q in sec.get("questions", []):
            if q.get("type") not in ("essay", "show_work"):
                gradeable.add(f"s{bn}_q{q['num']}")

    for qid in gradeable:
        correct_raw = answer_key.get(qid)
        if correct_raw is None:
            skipped += 1
            continue

        correct = [correct_raw] if isinstance(correct_raw, str) else list(correct_raw)
        correct_norm = [str(c).lower().strip() for c in correct]

        ai_ans = ai_answers.get(qid)
        if ai_ans is None:
            issues.append({"q_id": qid, "problem": f"AI gave no answer — question text may be missing or unreadable"})
            failed += 1
            continue

        if _compare(str(ai_ans), correct_norm):
            passed += 1
        else:
            issues.append({
                "q_id": qid,
                "problem": f'AI answered "{ai_ans}" but key says "{" / ".join(correct_norm[:3])}" — check question text or answer key'
            })
            failed += 1

    return {"passed": passed, "failed": failed, "skipped": skipped, "issues": issues}
