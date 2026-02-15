import json
from pathlib import Path
from typing import List, Dict, Any

# Store data in project directory
DATA_DIR = Path(__file__).parent.parent.parent / "data" / "corpus"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class CorpusService:
    """Simple file-based corpus storage."""

    def __init__(self, user_id: str):
        self.user_id = user_id
        self.user_dir = DATA_DIR / user_id
        self.user_dir.mkdir(parents=True, exist_ok=True)
        self.index_file = self.user_dir / "index.json"
        self._load_index()

    def _load_index(self):
        if self.index_file.exists():
            self.index = json.loads(self.index_file.read_text())
        else:
            self.index = {"documents": {}}

    def _save_index(self):
        self.index_file.write_text(json.dumps(self.index, indent=2))

    def add_document(self, doc_id: str, content: str, metadata: dict = None) -> dict:
        """Add a document to the corpus."""
        # Save document content
        doc_file = self.user_dir / f"{doc_id}.txt"
        doc_file.write_text(content, encoding='utf-8')

        # Update index
        self.index["documents"][doc_id] = {
            "metadata": metadata or {},
            "length": len(content)
        }
        self._save_index()

        return {
            "doc_id": doc_id,
            "chunks": 1,
            "status": "added"
        }

    def search(self, query: str, n_results: int = 5) -> List[Dict[str, Any]]:
        """Simple keyword search in documents."""
        results = []
        query_lower = query.lower()

        for doc_id, doc_info in self.index["documents"].items():
            doc_file = self.user_dir / f"{doc_id}.txt"
            if doc_file.exists():
                content = doc_file.read_text(encoding='utf-8')
                if query_lower in content.lower():
                    # Find relevant snippet
                    idx = content.lower().find(query_lower)
                    start = max(0, idx - 200)
                    end = min(len(content), idx + 500)
                    snippet = content[start:end]

                    results.append({
                        "content": snippet,
                        "metadata": doc_info.get("metadata", {}),
                        "distance": 0
                    })

        return results[:n_results]

    def list_documents(self) -> List[str]:
        """List all document IDs."""
        return list(self.index["documents"].keys())

    def delete_document(self, doc_id: str) -> dict:
        """Delete a document."""
        doc_file = self.user_dir / f"{doc_id}.txt"
        if doc_file.exists():
            doc_file.unlink()

        if doc_id in self.index["documents"]:
            del self.index["documents"][doc_id]
            self._save_index()

        return {"doc_id": doc_id, "deleted": True}

    def get_document(self, doc_id: str) -> str:
        """Get document content."""
        doc_file = self.user_dir / f"{doc_id}.txt"
        if doc_file.exists():
            return doc_file.read_text(encoding='utf-8')
        return ""

    def get_all_content(self) -> str:
        """Get all documents concatenated."""
        content = []
        for doc_id in self.index["documents"]:
            doc_file = self.user_dir / f"{doc_id}.txt"
            if doc_file.exists():
                content.append(doc_file.read_text(encoding='utf-8'))
        return "\n\n---\n\n".join(content)
