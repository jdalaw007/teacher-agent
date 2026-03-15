import json
import sys
from openai import OpenAI
from app.config import get_settings
from app.services import memory
from app.services.prompts import INSIGHT_DISTILLATION_PROMPT
from app.services.database import get_db

settings = get_settings()


class LearningService:
    def __init__(self, teacher_user_id: str):
        self.teacher_user_id = teacher_user_id
        self.client = None
        if settings.openai_api_key and settings.openai_api_key != "your-api-key-here":
            self.client = OpenAI(api_key=settings.openai_api_key)

    def maybe_distill_insights(self):
        """Distill insights if there are 5+ unprocessed episodic memories."""
        db = get_db()
        try:
            # Count episodic memories not yet referenced by any semantic memory
            rows = db.execute(
                """SELECT * FROM episodic_memories
                   WHERE teacher_user_id = ?
                   AND memory_type IN ('conversation_summary', 'teacher_preference')
                   ORDER BY created_at DESC LIMIT 20""",
                (self.teacher_user_id,),
            ).fetchall()
        finally:
            db.close()

        memories = [dict(r) for r in rows]
        if len(memories) < 5:
            return

        self._distill_insights(memories)

    def _distill_insights(self, episodic_memories: list[dict]):
        """Use GPT-4O to identify patterns across episodic memories."""
        if not self.client:
            return

        # Build memory text
        memory_text = "\n\n".join(
            f"Memory #{m['id']} [{m.get('memory_type', 'general')}] ({m.get('created_at', '')}):\n{m['content']}"
            for m in episodic_memories
        )

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": INSIGHT_DISTILLATION_PROMPT},
                    {"role": "user", "content": memory_text[:10000]},
                ],
                max_tokens=1000,
                response_format={"type": "json_object"},
            )

            result = json.loads(response.choices[0].message.content)

            for insight in result.get("insights", []):
                content = insight.get("content", "")
                category = insight.get("category", "general")
                confidence = insight.get("confidence", 0.5)
                source_ids = insight.get("supporting_memory_ids", [])

                # Check if this corroborates an existing semantic memory
                existing = memory.search_semantic_memories(self.teacher_user_id, content, limit=1)
                if existing:
                    best = existing[0]
                    # Check similarity
                    if best.get("embedding") and content:
                        embedding = memory._get_embedding(content)
                        if embedding:
                            stored_embedding = json.loads(best["embedding"])
                            sim = memory._cosine_similarity(embedding, stored_embedding)
                            if sim > 0.85:
                                # Corroborates existing - increase confidence
                                new_confidence = min(1.0, best.get("confidence", 0.5) + 0.1)
                                memory.update_semantic_confidence(best["id"], new_confidence)
                                continue

                # New insight - save as semantic memory
                memory.save_semantic_memory(
                    self.teacher_user_id,
                    content=content,
                    category=category,
                    confidence=confidence,
                    source_episodic_ids=source_ids,
                )

        except Exception as e:
            print(f"[Learning] Distillation error: {e}", file=sys.stderr)

    def apply_correction(self, correction: str):
        """When teacher corrects the agent, find and reduce confidence of contradicting beliefs."""
        if not correction:
            return

        # Search for semantic memories that might be contradicted
        related = memory.search_semantic_memories(self.teacher_user_id, correction, limit=3)

        for mem in related:
            # Reduce confidence of potentially contradicted memories
            current_confidence = mem.get("confidence", 0.5)
            if current_confidence > 0.2:
                memory.update_semantic_confidence(mem["id"], max(0.1, current_confidence - 0.2))
