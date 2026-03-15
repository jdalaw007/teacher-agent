import json
import sys
from openai import OpenAI
from app.config import get_settings

settings = get_settings()


class ContentCheckerService:
    def __init__(self, user_id: str):
        from app.services.profile import ProfileService
        user_key = ProfileService(user_id).get_api_key()
        api_key = user_key or settings.openai_api_key
        if api_key and api_key != "your-api-key-here":
            self.client = OpenAI(api_key=api_key)
        else:
            self.client = None

    def check_content(self, content: str, content_type: str, grade_level: str = None, subject: str = None):
        """Generator yielding SSE-formatted strings with the review."""
        if not self.client:
            yield f"data: {json.dumps({'type': 'error', 'content': 'OpenAI API key not configured.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        context_lines = []
        if grade_level:
            context_lines.append(f"Grade level: {grade_level}")
        if subject:
            context_lines.append(f"Subject/topic: {subject}")
        context = "\n".join(context_lines) if context_lines else "Grade level not specified."

        prompt = f"""You are an experienced educational content reviewer. Review the following {content_type} for classroom use.

{context}

Content to review:
---
{content}
---

Provide a concise structured review:

1. Start with a single line: VERDICT: PASS, NEEDS REVIEW, or CONCERN
   - PASS = ready to use as-is
   - NEEDS REVIEW = minor issues worth addressing
   - CONCERN = significant issues that should be fixed before use

2. Age-appropriateness: Is the content, language, and complexity right for the stated grade?

3. Accuracy: Any factual errors or misleading statements?

4. Clarity: Will students understand the instructions and tasks?

5. Bias check: Any unintended cultural, gender, racial, or socioeconomic bias?

6. If NEEDS REVIEW or CONCERN: list specific issues as bullets and brief suggestions.

Be concise and direct. If content is good, say so briefly. Do not pad the response."""

        try:
            stream = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=600,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield f"data: {json.dumps({'type': 'content', 'content': delta.content})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            safe_err = str(e).encode('ascii', 'replace').decode('ascii')
            print(f"[ContentChecker] Error: {safe_err}", file=sys.stderr)
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
