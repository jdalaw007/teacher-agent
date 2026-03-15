from openai import OpenAI
from app.config import get_settings
from pathlib import Path
import json

settings = get_settings()

# Match the corpus.py data directory
DATA_DIR = Path(__file__).parent.parent.parent / "data" / "corpus"


class AgentService:
    def __init__(self, user_id: str, class_id: str = ""):
        self.user_id = user_id
        self.class_id = class_id
        self.class_dir = DATA_DIR / user_id / class_id if class_id else None

        # Prefer user's own API key; fall back to env key
        from app.services.profile import ProfileService
        user_key = ProfileService(user_id).get_api_key()
        api_key = user_key or settings.openai_api_key
        if api_key and api_key != "your-api-key-here":
            self.client = OpenAI(api_key=api_key)
        else:
            self.client = None

        # Resolve linked class directories
        from app.services.linked_classes import LinkedClassService
        linked_service = LinkedClassService(user_id)
        self._linked_class_ids = linked_service.get_linked_class_ids(class_id)

    def _get_all_class_dirs(self) -> list[Path]:
        """Return directories for all linked classes."""
        return [DATA_DIR / self.user_id / cid for cid in self._linked_class_ids]

    def search_corpus(self, query: str, limit: int = 5) -> list:
        """Search the corpus for relevant documents across linked classes."""
        results = []
        query_lower = query.lower()

        for class_dir in self._get_all_class_dirs():
            index_file = class_dir / "index.json"
            if not index_file.exists():
                continue

            index = json.loads(index_file.read_text())

            for doc_id, info in index.get("documents", {}).items():
                doc_file = class_dir / f"{doc_id}.txt"
                if doc_file.exists():
                    text = doc_file.read_text(encoding='utf-8')
                    if query_lower in text.lower():
                        idx = text.lower().find(query_lower)
                        snippet = text[max(0, idx-200):idx+500]
                        results.append({
                            "content": snippet,
                            "metadata": info
                        })

        return results[:limit]

    def get_documents_by_ids(self, doc_ids: list[str]) -> list:
        """Get full document content by IDs across linked classes."""
        results = []

        for class_dir in self._get_all_class_dirs():
            index_file = class_dir / "index.json"
            if not index_file.exists():
                continue

            index = json.loads(index_file.read_text())

            for doc_id in doc_ids:
                if doc_id in index.get("documents", {}):
                    doc_file = class_dir / f"{doc_id}.txt"
                    if doc_file.exists():
                        text = doc_file.read_text(encoding='utf-8')
                        results.append({
                            "content": text,
                            "metadata": index["documents"][doc_id]
                        })

        return results

    def generate_assignment(
        self,
        topic: str,
        grade_level: str = None,
        assignment_type: str = "worksheet",
        additional_instructions: str = None,
        selected_doc_ids: list[str] = None,
        student_context: str = None
    ) -> dict:
        """Generate an assignment based on corpus materials."""

        if not self.client:
            return {
                "error": "OpenAI API key not configured. Add your key to .env file.",
                "assignment": None
            }

        # Get documents - either selected ones or search
        if selected_doc_ids:
            relevant_docs = self.get_documents_by_ids(selected_doc_ids)
        else:
            relevant_docs = self.search_corpus(topic, limit=5)

        # Build context from relevant documents
        context = ""
        if relevant_docs:
            context = "Here are relevant materials from the teacher's corpus:\n\n"
            for i, doc in enumerate(relevant_docs, 1):
                context += f"--- Document {i} ---\n{doc['content']}\n\n"

        # Build student context block
        student_block = ""
        if student_context:
            student_block = f"\n{student_context}\n"

        # Build the prompt
        prompt = f"""You are an experienced teacher's assistant helping create educational materials.

{context}
{student_block}
Create a {assignment_type} about: {topic}
{f"Grade level: {grade_level}" if grade_level else ""}
{f"Additional instructions: {additional_instructions}" if additional_instructions else ""}

Please create a well-structured assignment that:
1. Has clear instructions for students
2. Includes appropriate questions or tasks
3. Is grade-appropriate
4. References the provided materials where relevant

Format the assignment in a clear, ready-to-use format."""

        # Call OpenAI API
        response = self.client.chat.completions.create(
            model="gpt-4o",
            max_tokens=2000,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        return {
            "assignment": response.choices[0].message.content,
            "topic": topic,
            "type": assignment_type,
            "sources_used": len(relevant_docs)
        }

    def answer_question(self, question: str) -> dict:
        """Answer a question using corpus materials."""

        if not self.client:
            return {
                "error": "OpenAI API key not configured. Add your key to .env file.",
                "answer": None
            }

        # Search corpus for relevant content
        relevant_docs = self.search_corpus(question, limit=5)

        # Build context
        context = ""
        if relevant_docs:
            context = "Here are relevant materials:\n\n"
            for i, doc in enumerate(relevant_docs, 1):
                context += f"--- Source {i} ---\n{doc['content']}\n\n"

        prompt = f"""You are a helpful teaching assistant with access to the teacher's materials.

{context}

Question: {question}

Please provide a helpful answer based on the available materials. If the materials don't contain relevant information, say so and provide general guidance."""

        response = self.client.chat.completions.create(
            model="gpt-4o",
            max_tokens=1500,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        return {
            "answer": response.choices[0].message.content,
            "sources_used": len(relevant_docs)
        }

    def suggest_improvements(self, assignment_text: str) -> dict:
        """Suggest improvements to an existing assignment."""

        if not self.client:
            return {
                "error": "OpenAI API key not configured. Add your key to .env file.",
                "suggestions": None
            }

        prompt = f"""You are an experienced educator reviewing an assignment.

Assignment to review:
{assignment_text}

Please provide:
1. Overall assessment of the assignment
2. Specific suggestions for improvement
3. Any potential issues or areas of confusion for students
4. Ideas for differentiation (easier/harder versions)"""

        response = self.client.chat.completions.create(
            model="gpt-4o",
            max_tokens=1500,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        return {
            "suggestions": response.choices[0].message.content
        }
