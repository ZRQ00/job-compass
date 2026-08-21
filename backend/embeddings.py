"""
Resume matching via Ollama embeddings.
Uses nomic-embed-text to embed resume and job descriptions,
then scores each job by cosine similarity.
"""
import json
import os
import numpy as np
from pathlib import Path
from ollama_client import post, is_ollama_running  # noqa: F401 (re-exported for existing callers)

EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")
RESUME_PATH = Path(__file__).parent / "resume.txt"
RESUME_EMBEDDING_PATH = Path(__file__).parent / "resume_embedding.json"


def get_embedding(text: str) -> list[float]:
    """Get embedding vector for a text string."""
    resp = post("/api/embeddings", {"model": EMBED_MODEL, "prompt": text[:8000]}, timeout=30)
    return resp["embedding"]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    norm_a = np.linalg.norm(va)
    norm_b = np.linalg.norm(vb)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b)) * 100


def load_resume() -> str:
    if not RESUME_PATH.exists():
        raise FileNotFoundError(
            f"Resume not found at {RESUME_PATH}. "
            "Create a file called resume.txt in the backend/ directory."
        )
    return RESUME_PATH.read_text(encoding="utf-8").strip()


def get_resume_embedding() -> list[float]:
    if RESUME_EMBEDDING_PATH.exists():
        return json.loads(RESUME_EMBEDDING_PATH.read_text())
    print("Computing resume embedding (one-time setup)...")
    resume_text = load_resume()
    embedding = get_embedding(resume_text)
    RESUME_EMBEDDING_PATH.write_text(json.dumps(embedding))
    print("Resume embedding cached.")
    return embedding


def score_job(job_text: str, resume_embedding: list[float]) -> int:
    job_embedding = get_embedding(job_text)
    score = cosine_similarity(resume_embedding, job_embedding)
    return round(score)


def build_job_text(title: str, company: str, description: str, tech_stack: str = "") -> str:
    parts = []
    if title:
        parts.append(f"Job Title: {title}")
    if company:
        parts.append(f"Company: {company}")
    if tech_stack:
        parts.append(f"Tech Stack: {tech_stack}")
    if description:
        parts.append(f"Description: {description[:4000]}")
    return "\n\n".join(parts)


def recompute_resume_embedding() -> list[float]:
    if RESUME_EMBEDDING_PATH.exists():
        RESUME_EMBEDDING_PATH.unlink()
    return get_resume_embedding()