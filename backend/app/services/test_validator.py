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


FIX_PROMPT = """You are fixing errors in a parsed English language test. The test was parsed from a document into JSON, but a second AI that tried to take the test found the following problems:

PROBLEMS:
{problems}

ORIGINAL TEST TEXT (source of truth):
{original_text}

CURRENT BROKEN QUESTION JSON (just the affected questions):
{broken_json}

ANSWER KEY for these questions:
{answer_key_subset}

Fix ONLY the broken questions. Return ONLY valid JSON — an object with the same structure as the broken questions, corrected. Each fixed question must have all original fields (num, text, type, hint_letter, options, choice_values).

Common fixes:
- If question text is missing or truncated, restore it from the original test text
- If type is wrong (e.g. essay instead of fill_in_blank), correct it
- If options are missing for multiple_choice, restore them from the original text
- If hint_letter is missing for fill_in_blank_hint, extract it from the original text
- For multiple_choice: the text field MUST contain ________ where the options go — NEVER include the actual option words in the text field
- For fill_in_blank/fill_in_blank_hint: use exactly ________ (8 underscores) as the placeholder

Return format: {"s1_q3": {<fixed question object>}, "s2_q1": {<fixed question object>}, ...}
"""


def fix_and_revalidate(test_data: dict, answer_key: dict, original_text: str,
                       ai_client, model: str, max_rounds: int = 3) -> tuple[dict, dict]:
    """
    Run validate → fix → re-validate loop up to max_rounds times.
    Returns (final_test_data, final_validation_result).
    """
    for round_num in range(max_rounds):
        result = validate_test(test_data, answer_key, ai_client, model)
        result["round"] = round_num + 1

        if not result.get("issues") or result.get("error"):
            return test_data, result

        # Build subset of broken questions — only fix STRUCTURAL problems, not content mismatches
        broken_q_ids = {issue["q_id"] for issue in result["issues"]
                        if "no answer" in issue["problem"].lower()
                        or "missing" in issue["problem"].lower()
                        or "unreadable" in issue["problem"].lower()}
        broken_questions = {}
        q_map = {}
        for sec in test_data.get("sections", []):
            bn = sec.get("block_num", 0)
            for q in sec.get("questions", []):
                qid = f"s{bn}_q{q['num']}"
                q_map[qid] = (sec, q)
                # Also flag structurally defective questions regardless of validator result
                qtype = q.get("type", "")
                text = (q.get("text") or "").strip()
                if qtype == "multiple_choice" and not q.get("options"):
                    broken_q_ids.add(qid)
                elif qtype in ("fill_in_blank", "fill_in_blank_hint", "short_answer") and len(text) < 8:
                    broken_q_ids.add(qid)
                if qid in broken_q_ids:
                    broken_questions[qid] = q

        if not broken_questions:
            return test_data, result

        problems_text = "\n".join(
            f"- {i['q_id']}: {i['problem']}" for i in result["issues"]
        )
        answer_key_subset = {k: answer_key[k] for k in broken_q_ids if k in answer_key}

        prompt = FIX_PROMPT.format(
            problems=problems_text,
            original_text=original_text[:6000],
            broken_json=json.dumps(broken_questions, indent=2),
            answer_key_subset=json.dumps(answer_key_subset, indent=2),
        )

        try:
            response = ai_client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4000,
            )
            raw = (response.choices[0].message.content or "").strip()
            import re
            raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
            raw = re.sub(r"\s*```\s*$", "", raw, flags=re.MULTILINE)
            fixes = json.loads(raw)
        except Exception as e:
            result["fix_error"] = f"Fix AI failed on round {round_num + 1}: {e}"
            return test_data, result

        # Apply fixes back into test_data
        for qid, fixed_q in fixes.items():
            if qid in q_map:
                sec, old_q = q_map[qid]
                idx = sec["questions"].index(old_q)
                fixed_q["num"] = old_q["num"]  # preserve question number
                sec["questions"][idx] = fixed_q

        result["fixes_applied"] = list(fixes.keys())

    # Final validation after last round
    final_result = validate_test(test_data, answer_key, ai_client, model)
    final_result["round"] = max_rounds
    return test_data, final_result
