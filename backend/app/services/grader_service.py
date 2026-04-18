import json
import re
import difflib
from app.services.classroom import ClassroomService
from app.services.pseudonymize import scrub_submission_text
from app.services.drive import DriveService
from app.services.profile import ProfileService, get_ai_client
from app.services.database import get_db


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


def _extract_text_from_submission(submission: dict, token: str) -> str:
    """Extract text from a student submission."""
    # Short answer question
    short_answer = submission.get("shortAnswerSubmission", {})
    if short_answer.get("answer"):
        return short_answer["answer"]

    # Drive attachments
    attachments = submission.get("assignmentSubmission", {}).get("attachments", [])
    if not attachments:
        return ""

    drive = DriveService(token)
    texts = []
    for attachment in attachments:
        drive_file = attachment.get("driveFile", {})
        file_id = drive_file.get("id")
        if not file_id:
            continue
        try:
            file_meta = drive.get_file(file_id)
            mime = file_meta.get("mimeType", "")
            if mime in ("application/vnd.google-apps.document", "application/vnd.google-apps.spreadsheet"):
                text = drive.export_as_text(file_id, mime)
                texts.append(text)
            elif mime.startswith("text/"):
                raw = drive.download_file(file_id)
                texts.append(raw.decode("utf-8", errors="replace"))
            elif mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                from docx import Document
                from io import BytesIO
                raw = drive.download_file(file_id)
                doc = Document(BytesIO(raw))
                texts.append("\n".join(p.text for p in doc.paragraphs if p.text.strip()))
            elif mime == "application/pdf":
                from pypdf import PdfReader
                from io import BytesIO
                raw = drive.download_file(file_id)
                reader = PdfReader(BytesIO(raw))
                pdf_text = "\n".join(page.extract_text() or "" for page in reader.pages)
                if pdf_text.strip():
                    texts.append(pdf_text)
        except Exception:
            pass

    return "\n\n".join(texts)


def _check_plagiarism(texts_by_student: dict) -> list:
    """Pairwise similarity check. Returns flags for ratio > 0.6."""
    flags = []
    names = list(texts_by_student.keys())
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a = texts_by_student[names[i]][:3000]
            b = texts_by_student[names[j]][:3000]
            if not a or not b:
                continue
            ratio = difflib.SequenceMatcher(None, a, b).ratio()
            if ratio > 0.6:
                flags.append({
                    "student_a": names[i],
                    "student_b": names[j],
                    "similarity": round(ratio, 2),
                })
    return flags


def _save_result(teacher_user_id: str, course_id: str, assignment_id: str, assignment_title: str,
                 student_name: str, ai_score: int, ai_reasoning: str, grade: int, max_points: int,
                 feedback: str, plagiarism_flagged: bool,
                 student_user_id: str = "", submission_id: str = "") -> None:
    try:
        db = get_db()
        db.execute(
            """INSERT INTO grader_results
               (teacher_user_id, course_id, assignment_id, assignment_title, student_name,
                ai_score, ai_reasoning, grade, max_points, feedback, plagiarism_flagged, graded_at,
                student_user_id, submission_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
               ON CONFLICT(teacher_user_id, course_id, assignment_id, student_name)
               DO UPDATE SET ai_score=excluded.ai_score, ai_reasoning=excluded.ai_reasoning,
                   grade=excluded.grade, max_points=excluded.max_points, feedback=excluded.feedback,
                   plagiarism_flagged=excluded.plagiarism_flagged, graded_at=excluded.graded_at,
                   student_user_id=excluded.student_user_id, submission_id=excluded.submission_id""",
            (teacher_user_id, course_id, assignment_id, assignment_title, student_name,
             ai_score, ai_reasoning, grade, max_points, feedback, int(plagiarism_flagged),
             student_user_id, submission_id)
        )
        db.commit()
        db.close()
    except Exception:
        pass  # Don't let DB errors break the stream


RUBRIC_GEN_PROMPT = """You are a teacher's assistant. Generate a concise grading rubric for this assignment:
Title: {title}
Description: {description}
Max points: {max_points}

Return a short rubric (3-5 criteria with point values that add up to {max_points}). Plain text, no JSON."""


GRADE_PROMPT = """You are grading a student assignment. Do the following:
1. GRADING: Grade against this rubric and assign a score out of {max_points}:
{rubric}

2. ORIGINALITY: Rate 1-10 how original and personal this writing feels (10=very original, 1=very generic/formulaic). One sentence only.

Keep your feedback concise: 3-5 sentences maximum. Do not use headers or bullet points.

Student submission:
{text}

{tone_section}{language_instruction}Respond with JSON only, using exactly these keys:
- "grade": your score out of {max_points} (integer)
- "ai_score": your originality rating 1-10 (integer, NOT the grade)
- "ai_reasoning": one sentence explaining the originality rating
- "feedback": your written feedback for the student

Example format: {{"grade": 75, "ai_score": 7, "ai_reasoning": "Shows personal voice.", "feedback": "Good work on..."}}"""


async def grade_assignment_stream(token: str, user_id: str, course_id: str, assignment_id: str, rubric: str, max_points: int, student_user_id: str | None = None, tone_instructions: str | None = None):
    """Async generator yielding SSE events for the grading pipeline."""

    def sse(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    try:
        client, ai_model = get_ai_client(user_id)

        from app.services.profile import ProfileService
        language = ProfileService(user_id).get_language()
        language_instruction = f"Write the feedback in {language}. " if language and language != "English" else ""

        yield sse({"type": "status", "message": "Fetching submissions..."})

        classroom = ClassroomService(token)

        # Get assignment title and description for record-keeping + rubric gen
        assignment_title = assignment_id
        assignment_description = ""
        try:
            assignment_data = classroom.get_assignment(course_id, assignment_id)
            assignment_title = assignment_data.get("title", assignment_id)
            assignment_description = assignment_data.get("description", "")
        except Exception:
            pass

        # Auto-generate rubric if not provided
        if not rubric.strip():
            yield sse({"type": "status", "message": "Generating rubric with AI..."})
            try:
                rubric_prompt = RUBRIC_GEN_PROMPT.format(
                    title=assignment_title,
                    description=assignment_description or "No description provided.",
                    max_points=max_points,
                )
                rubric_response = client.chat.completions.create(
                    model=ai_model,
                    messages=[{"role": "user", "content": rubric_prompt}],
                    max_tokens=300,
                )
                rubric = rubric_response.choices[0].message.content.strip()
                yield sse({"type": "rubric_generated", "rubric": rubric})
            except Exception as e:
                rubric = f"Content accuracy and completeness ({max_points} pts)"

        submissions = classroom.list_submissions(course_id, assignment_id)
        if student_user_id:
            submissions = [s for s in submissions if s.get("userId") == student_user_id]

        yield sse({"type": "status", "message": f"Found {len(submissions)} submission(s). Fetching roster..."})

        # Build user_id -> name lookup
        try:
            classroom_students = classroom.list_students(course_id)
            student_names = {
                s["userId"]: s.get("profile", {}).get("name", {}).get("fullName", s["userId"])
                for s in classroom_students
            }
        except Exception:
            student_names = {}

        yield sse({"type": "status", "message": "Extracting submission text..."})

        # Extract text per student
        texts_by_student: dict[str, str] = {}
        sub_map: dict[str, str | None] = {}  # name -> text or None (no submission)
        sub_ids: dict[str, tuple[str, str]] = {}  # name -> (student_user_id, submission_id)

        for sub in submissions:
            uid = sub.get("userId", "")
            sub_id = sub.get("id", "")
            name = student_names.get(uid, f"Student ({uid[-6:]})")
            state = sub.get("state", "")
            sub_ids[name] = (uid, sub_id)

            if state not in ("TURNED_IN", "RETURNED"):
                sub_map[name] = None
                continue

            try:
                text = _extract_text_from_submission(sub, token)
                texts_by_student[name] = text
                sub_map[name] = text
            except Exception:
                sub_map[name] = ""

        if not sub_map:
            yield sse({"type": "error", "message": f"No student submissions found for this assignment (found {len(submissions)} submission record(s) but none could be mapped to students). Check that the class roster is imported and students are enrolled."})
            yield sse({"type": "done"})
            return

        # Plagiarism check
        yield sse({"type": "status", "message": "Checking for plagiarism..."})
        has_text = {k: v for k, v in texts_by_student.items() if v}
        flags = _check_plagiarism(has_text)
        plagiarism_students: set[str] = set()
        for f in flags:
            plagiarism_students.add(f["student_a"])
            plagiarism_students.add(f["student_b"])

        if flags:
            yield sse({"type": "plagiarism", "flags": flags})

        # Grade each student
        total = len(sub_map)
        for idx, (name, text) in enumerate(sub_map.items(), 1):
            yield sse({"type": "status", "message": f"Grading {name} ({idx}/{total})..."})

            if text is None:
                yield sse({"type": "student_result", "student_name": name, "no_submission": True})
                continue

            if not text:
                yield sse({"type": "student_result", "student_name": name, "no_text": True,
                           "note": "Submission found but no readable text extracted"})
                continue

            try:
                tone_section = f"Tone and style instructions: {tone_instructions}\n\n" if tone_instructions and tone_instructions.strip() else ""
                clean_text = scrub_submission_text(text, known_names=list(student_names.values()))[:4000]
                if not clean_text.strip():
                    yield sse({"type": "student_result", "student_name": name, "no_text": True,
                               "note": f"Text was extracted ({len(text)} chars) but scrubbed to empty"})
                    continue
                yield sse({"type": "status", "message": f"Grading {name} — {len(clean_text)} chars extracted..."})
                prompt = GRADE_PROMPT.format(
                    max_points=max_points,
                    rubric=rubric,
                    text=clean_text,
                    tone_section=tone_section,
                    language_instruction=language_instruction,
                )
                response = client.chat.completions.create(
                    model=ai_model,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=8000,
                )
                if not response.choices:
                    raise ValueError("AI returned no choices in response")
                choice = response.choices[0]
                raw = (choice.message.content or "").strip()
                finish = getattr(choice, "finish_reason", "unknown")

                # If empty, retry with a simpler prompt (avoids Gemini safety triggers)
                if not raw:
                    simple_prompt = (
                        f"Please grade this student assignment out of {max_points} points.\n\n"
                        f"Rubric: {rubric}\n\n"
                        f"Assignment text:\n{clean_text[:2000]}\n\n"
                        f"{language_instruction}"
                        f"Return JSON only: {{\"ai_score\": 5, \"ai_reasoning\": \"n/a\", "
                        f"\"grade\": <int>, \"feedback\": \"<string>\"}}"
                    )
                    retry = client.chat.completions.create(
                        model=ai_model,
                        messages=[{"role": "user", "content": simple_prompt}],
                        max_tokens=400,
                    )
                    raw = (retry.choices[0].message.content or "").strip()
                    finish2 = getattr(retry.choices[0], "finish_reason", "unknown")
                    if not raw:
                        raise ValueError(f"AI returned empty response (finish_reason={finish}/{finish2})")

                # Strip markdown code fences (Gemini wraps JSON in ```json ... ```)
                raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
                raw = re.sub(r'\s*```\s*$', '', raw, flags=re.MULTILINE)
                raw = raw.strip()
                # Extract first balanced {...} block — handles } inside string values
                raw = _extract_first_json_object(raw) or raw
                try:
                    result = json.loads(raw)
                except (json.JSONDecodeError, ValueError):
                    from json_repair import repair_json
                    repaired = repair_json(raw)
                    if not repaired or repaired in ('""', "null", "{}"):
                        raise ValueError(f"AI returned unparseable response: {raw[:200]!r}")
                    result = json.loads(repaired)

                # Retry if no feedback (or grade=0) — AI truncated or mis-parsed
                if not (result.get("feedback") or "").strip():
                    orig_ai_score = result.get("ai_score")
                    orig_ai_reasoning = result.get("ai_reasoning", "")
                    retry2_prompt = (
                        f"You are a teacher grading a student essay. The essay is below.\n\n"
                        f"Rubric:\n{rubric}\n\n"
                        f"Essay:\n{clean_text[:3000]}\n\n"
                        f"Instructions: Assign a grade between 1 and {max_points}. "
                        f"Do not return 0 unless the essay is completely blank. "
                        f"Write 2-3 sentences of constructive feedback. "
                        f"{language_instruction}"
                        f"Reply with JSON only, exactly this format:\n"
                        f"{{\"grade\": 75, \"feedback\": \"example feedback here\"}}\n"
                        f"Replace 75 with your actual grade and fill in real feedback."
                    )
                    retry2 = client.chat.completions.create(
                        model=ai_model,
                        messages=[{"role": "user", "content": retry2_prompt}],
                        max_tokens=600,
                    )
                    raw2 = (retry2.choices[0].message.content or "").strip()
                    if raw2 and "{" in raw2 and "}" in raw2:
                        raw2 = raw2[raw2.find("{"):raw2.rfind("}") + 1]
                        try:
                            retry_result = json.loads(raw2)
                            # Merge: keep original ai_score/reasoning, take new grade/feedback
                            result["grade"] = retry_result.get("grade", result.get("grade", 0))
                            result["feedback"] = retry_result.get("feedback", result.get("feedback", ""))
                            if orig_ai_score is not None:
                                result["ai_score"] = orig_ai_score
                                result["ai_reasoning"] = orig_ai_reasoning
                        except Exception:
                            pass  # keep original result if retry also fails

                # Coerce nulls — Gemini sometimes returns null for numeric fields
                ai_score_val = int(result.get("ai_score") or 0)
                grade_val = int(result.get("grade") or 0)

                flagged = name in plagiarism_students
                uid_sid = sub_ids.get(name, ("", ""))
                _save_result(
                    teacher_user_id=user_id,
                    course_id=course_id,
                    assignment_id=assignment_id,
                    assignment_title=assignment_title,
                    student_name=name,
                    ai_score=ai_score_val,
                    ai_reasoning=result.get("ai_reasoning") or "",
                    grade=grade_val,
                    max_points=max_points,
                    feedback=result.get("feedback") or "",
                    plagiarism_flagged=flagged,
                    student_user_id=uid_sid[0],
                    submission_id=uid_sid[1],
                )
                yield sse({
                    "type": "student_result",
                    "student_name": name,
                    "ai_score": ai_score_val,
                    "ai_reasoning": result.get("ai_reasoning") or "",
                    "grade": grade_val,
                    "max_points": max_points,
                    "feedback": result.get("feedback") or "",
                    "plagiarism_flagged": flagged,
                })
            except Exception as e:
                yield sse({"type": "student_result", "student_name": name, "no_text": True,
                           "note": f"Grading error: {str(e)[:200]}"})

        yield sse({"type": "done"})

    except Exception as e:
        yield sse({"type": "error", "message": str(e)})
        yield sse({"type": "done"})
