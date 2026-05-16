"""Distill the teacher's edits into reusable extraction rules.

When a teacher creates a test from markdown, the editor sends both the AI's
original draft (`original_markdown`) and the teacher's edited final version.
This service compares the two, asks the AI to extract any persistent rule
behind the changes, and appends/refines the teacher's `extraction_notes`
so the next test upload extracts closer to their preference.
"""
from typing import Optional
from app.services.profile import ProfileService, get_ai_client


LEARN_PROMPT = """\
You are improving a style guide used to extract structured test markdown
from teacher-uploaded documents. A teacher just took your AI-generated draft
and edited it before saving. Your job: figure out what PERSISTENT rule the
teacher implied with their edits, so next time you produce output closer to
what they want without them having to fix it again.

CURRENT STYLE GUIDE (may be empty):
---
{notes}
---

YOUR ORIGINAL DRAFT:
---
{original}
---

TEACHER'S EDITED VERSION (what they actually kept):
---
{final}
---

Rules:
- Only add a rule if the edit reveals a GENERALIZABLE preference, not a
  one-off content fix (e.g. fixing a transcription typo is NOT a rule;
  always italicizing the correct option in multiple-choice IS a rule).
- Keep the style guide concise. Prefer refining an existing bullet over
  adding a new one. Drop bullets that are now wrong.
- Total length must stay under 1500 characters.
- Output format: return ONLY the full updated style guide as plain text
  bullets (one rule per line, starting with "- "). No preamble, no
  explanation, no markdown code fences.
- If the edit reveals nothing generalizable, output the single token:
  NO_CHANGE
"""


def _trivial_diff(original: str, final: str) -> bool:
    """Return True if the difference is only whitespace — not worth learning from."""
    norm = lambda s: " ".join(s.split())
    return norm(original) == norm(final)


def learn_from_edit(user_id: str, original_md: str, final_md: str) -> Optional[str]:
    """Update the teacher's extraction_notes based on their edits.

    Returns the newly-saved style guide text if it changed (so the UI can show
    the teacher what was learned), or None if nothing changed / learning skipped.
    Never raises — failures are swallowed so test creation never breaks.
    """
    try:
        original = (original_md or "").strip()
        final = (final_md or "").strip()
        if not original or not final or _trivial_diff(original, final):
            return None

        client, model = get_ai_client(user_id)
        if client is None:
            return None

        ps = ProfileService(user_id)
        current_notes = ps.get_extraction_notes()

        prompt = LEARN_PROMPT.format(
            notes=current_notes or "(empty — no rules yet)",
            original=original[:8000],
            final=final[:8000],
        )

        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800,
        )
        new_notes = (response.choices[0].message.content or "").strip()
        if not new_notes or new_notes == "NO_CHANGE":
            return None

        # Hard cap to keep prompt budget in check
        if len(new_notes) > 1500:
            new_notes = new_notes[:1500].rsplit("\n", 1)[0]

        if new_notes == current_notes.strip():
            return None

        ps.set_extraction_notes(new_notes)
        return new_notes
    except Exception:
        return None
