import io
from datetime import datetime, timezone

from app.config import RESUME_PATH


def extract_text(filename: str, content: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    if name.endswith(".docx"):
        from zipfile import ZipFile
        import re

        with ZipFile(io.BytesIO(content)) as z:
            xml = z.read("word/document.xml").decode("utf-8", errors="ignore")
        xml = re.sub(r"</w:p>", "\n", xml)
        return re.sub(r"<[^>]+>", "", xml).strip()
    return content.decode("utf-8", errors="ignore").strip()


def save(text: str) -> None:
    RESUME_PATH.write_text(text, encoding="utf-8")


def load() -> str | None:
    if not RESUME_PATH.exists():
        return None
    text = RESUME_PATH.read_text(encoding="utf-8").strip()
    return text or None


def info() -> dict:
    text = load()
    return {
        "exists": text is not None,
        "characters": len(text) if text else 0,
        "updated_at": datetime.fromtimestamp(RESUME_PATH.stat().st_mtime, timezone.utc).isoformat() if text else None,
        "text": text,
    }


def delete() -> None:
    RESUME_PATH.unlink(missing_ok=True)
