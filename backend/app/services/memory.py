import json
import math
import uuid
from datetime import datetime
from openai import OpenAI
from app.config import get_settings
from app.services.database import get_db

settings = get_settings()


def _get_openai_client():
    if not settings.openai_api_key or settings.openai_api_key == "your-api-key-here":
        return None
    return OpenAI(api_key=settings.openai_api_key)


def _get_embedding(text: str) -> list[float] | None:
    """Get embedding vector from OpenAI text-embedding-3-small."""
    client = _get_openai_client()
    if not client:
        return None
    try:
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text[:8000],  # truncate to stay within limits
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"[Memory] Embedding error: {e}")
        return None


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Pure Python cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# --- Conversation CRUD ---

def create_conversation(teacher_user_id: str, title: str = "") -> dict:
    """Create a new chat conversation."""
    conv_id = str(uuid.uuid4())
    db = get_db()
    try:
        db.execute(
            "INSERT INTO chat_conversations (id, teacher_user_id, title) VALUES (?, ?, ?)",
            (conv_id, teacher_user_id, title),
        )
        db.commit()
        row = db.execute("SELECT * FROM chat_conversations WHERE id = ?", (conv_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


def add_message(conversation_id: str, role: str, content: str = None,
                tool_calls: list = None, tool_call_id: str = None) -> dict:
    """Add a message to a conversation."""
    db = get_db()
    try:
        db.execute(
            """INSERT INTO chat_messages (conversation_id, role, content, tool_calls, tool_call_id)
               VALUES (?, ?, ?, ?, ?)""",
            (conversation_id, role, content,
             json.dumps(tool_calls) if tool_calls else None,
             tool_call_id),
        )
        db.commit()
        row = db.execute(
            "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1",
            (conversation_id,),
        ).fetchone()
        return dict(row)
    finally:
        db.close()


def get_conversation_messages(conversation_id: str) -> list[dict]:
    """Get all messages in a conversation."""
    db = get_db()
    try:
        rows = db.execute(
            "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id",
            (conversation_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


def get_conversation(conversation_id: str) -> dict | None:
    """Get a conversation by ID."""
    db = get_db()
    try:
        row = db.execute("SELECT * FROM chat_conversations WHERE id = ?", (conversation_id,)).fetchone()
        return dict(row) if row else None
    finally:
        db.close()


def list_conversations(teacher_user_id: str, limit: int = 50) -> list[dict]:
    """List conversations for a teacher, most recent first."""
    db = get_db()
    try:
        rows = db.execute(
            """SELECT * FROM chat_conversations
               WHERE teacher_user_id = ?
               ORDER BY started_at DESC LIMIT ?""",
            (teacher_user_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


def delete_conversation(conversation_id: str, teacher_user_id: str) -> bool:
    """Delete a conversation and its messages."""
    db = get_db()
    try:
        cursor = db.execute(
            "DELETE FROM chat_conversations WHERE id = ? AND teacher_user_id = ?",
            (conversation_id, teacher_user_id),
        )
        db.commit()
        return cursor.rowcount > 0
    finally:
        db.close()


def end_conversation(conversation_id: str, summary: str = None, tags: list[str] = None, title: str = None) -> dict | None:
    """Mark a conversation as ended."""
    db = get_db()
    try:
        if title:
            db.execute(
                """UPDATE chat_conversations
                   SET ended_at = datetime('now'), summary = ?, tags = ?, title = ?
                   WHERE id = ?""",
                (summary, json.dumps(tags or []), title, conversation_id),
            )
        else:
            db.execute(
                """UPDATE chat_conversations
                   SET ended_at = datetime('now'), summary = ?, tags = ?
                   WHERE id = ?""",
                (summary, json.dumps(tags or []), conversation_id),
            )
        db.commit()
        row = db.execute("SELECT * FROM chat_conversations WHERE id = ?", (conversation_id,)).fetchone()
        return dict(row) if row else None
    finally:
        db.close()


def reopen_conversation(conversation_id: str) -> dict | None:
    """Clear ended_at so a conversation can be continued."""
    db = get_db()
    try:
        db.execute(
            "UPDATE chat_conversations SET ended_at = NULL WHERE id = ?",
            (conversation_id,),
        )
        db.commit()
        row = db.execute("SELECT * FROM chat_conversations WHERE id = ?", (conversation_id,)).fetchone()
        return dict(row) if row else None
    finally:
        db.close()


# --- Episodic Memory ---

def save_episodic_memory(teacher_user_id: str, content: str,
                         conversation_id: str = None, tags: list[str] = None,
                         memory_type: str = "general") -> dict:
    """Save an episodic memory with embedding."""
    embedding = _get_embedding(content)
    db = get_db()
    try:
        db.execute(
            """INSERT INTO episodic_memories
               (teacher_user_id, conversation_id, content, embedding, tags, memory_type)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (teacher_user_id, conversation_id, content,
             json.dumps(embedding) if embedding else None,
             json.dumps(tags or []), memory_type),
        )
        db.commit()
        row = db.execute(
            "SELECT * FROM episodic_memories WHERE teacher_user_id = ? ORDER BY id DESC LIMIT 1",
            (teacher_user_id,),
        ).fetchone()
        return dict(row)
    finally:
        db.close()


def search_episodic_memories(teacher_user_id: str, query: str,
                             limit: int = 5, tag_filter: str = None) -> list[dict]:
    """Search episodic memories using semantic similarity."""
    query_embedding = _get_embedding(query)
    db = get_db()
    try:
        if tag_filter:
            rows = db.execute(
                """SELECT * FROM episodic_memories
                   WHERE teacher_user_id = ? AND tags LIKE ?
                   ORDER BY created_at DESC LIMIT 100""",
                (teacher_user_id, f'%"{tag_filter}"%'),
            ).fetchall()
        else:
            rows = db.execute(
                """SELECT * FROM episodic_memories
                   WHERE teacher_user_id = ?
                   ORDER BY created_at DESC LIMIT 100""",
                (teacher_user_id,),
            ).fetchall()

        memories = [dict(r) for r in rows]

        if query_embedding:
            # Rank by cosine similarity
            scored = []
            for mem in memories:
                if mem["embedding"]:
                    mem_embedding = json.loads(mem["embedding"])
                    score = _cosine_similarity(query_embedding, mem_embedding)
                    scored.append((score, mem))
            scored.sort(key=lambda x: x[0], reverse=True)
            return [m for _, m in scored[:limit]]
        else:
            # Fallback: keyword search
            query_lower = query.lower()
            return [m for m in memories if query_lower in m["content"].lower()][:limit]
    finally:
        db.close()


# --- Semantic Memory ---

def save_semantic_memory(teacher_user_id: str, content: str,
                         category: str = "general", confidence: float = 0.5,
                         source_episodic_ids: list[int] = None) -> dict:
    """Save a semantic (distilled) memory."""
    embedding = _get_embedding(content)
    db = get_db()
    try:
        db.execute(
            """INSERT INTO semantic_memories
               (teacher_user_id, content, embedding, category, confidence, source_episodic_ids)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (teacher_user_id, content,
             json.dumps(embedding) if embedding else None,
             category, confidence,
             json.dumps(source_episodic_ids or [])),
        )
        db.commit()
        row = db.execute(
            "SELECT * FROM semantic_memories WHERE teacher_user_id = ? ORDER BY id DESC LIMIT 1",
            (teacher_user_id,),
        ).fetchone()
        return dict(row)
    finally:
        db.close()


def search_semantic_memories(teacher_user_id: str, query: str,
                             limit: int = 5) -> list[dict]:
    """Search semantic memories using semantic similarity."""
    query_embedding = _get_embedding(query)
    db = get_db()
    try:
        rows = db.execute(
            """SELECT * FROM semantic_memories
               WHERE teacher_user_id = ?
               ORDER BY confidence DESC LIMIT 100""",
            (teacher_user_id,),
        ).fetchall()

        memories = [dict(r) for r in rows]

        if query_embedding:
            scored = []
            for mem in memories:
                if mem["embedding"]:
                    mem_embedding = json.loads(mem["embedding"])
                    score = _cosine_similarity(query_embedding, mem_embedding)
                    scored.append((score, mem))
            scored.sort(key=lambda x: x[0], reverse=True)
            return [m for _, m in scored[:limit]]
        else:
            query_lower = query.lower()
            return [m for m in memories if query_lower in m["content"].lower()][:limit]
    finally:
        db.close()


def update_semantic_confidence(memory_id: int, confidence: float) -> bool:
    """Update confidence score for a semantic memory."""
    db = get_db()
    try:
        db.execute(
            "UPDATE semantic_memories SET confidence = ?, updated_at = datetime('now') WHERE id = ?",
            (confidence, memory_id),
        )
        db.commit()
        return True
    finally:
        db.close()


# --- Strategy Tracking ---

def log_strategy(teacher_user_id: str, strategy_description: str,
                 context: str = None, class_id: str = None,
                 student_ids: list[int] = None,
                 conversation_id: str = None) -> dict:
    """Log a teaching strategy for tracking."""
    db = get_db()
    try:
        db.execute(
            """INSERT INTO strategy_evaluations
               (teacher_user_id, strategy_description, context, class_id, student_ids, conversation_id)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (teacher_user_id, strategy_description, context, class_id,
             json.dumps(student_ids or []), conversation_id),
        )
        db.commit()
        row = db.execute(
            "SELECT * FROM strategy_evaluations WHERE teacher_user_id = ? ORDER BY id DESC LIMIT 1",
            (teacher_user_id,),
        ).fetchone()
        return dict(row)
    finally:
        db.close()


def evaluate_strategy(strategy_id: int, outcome: str, outcome_rating: int) -> dict | None:
    """Record the outcome of a strategy."""
    db = get_db()
    try:
        db.execute(
            """UPDATE strategy_evaluations
               SET outcome = ?, outcome_rating = ?, evaluated_at = datetime('now')
               WHERE id = ?""",
            (outcome, outcome_rating, strategy_id),
        )
        db.commit()
        row = db.execute("SELECT * FROM strategy_evaluations WHERE id = ?", (strategy_id,)).fetchone()
        return dict(row) if row else None
    finally:
        db.close()


# --- Composite ---

def get_relevant_memories(teacher_user_id: str, query: str,
                          limit: int = 5) -> dict:
    """Get mixed episodic + semantic memories relevant to a query."""
    episodic = search_episodic_memories(teacher_user_id, query, limit=limit)
    semantic = search_semantic_memories(teacher_user_id, query, limit=limit)
    return {
        "episodic": episodic,
        "semantic": semantic,
    }
