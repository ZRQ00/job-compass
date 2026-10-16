"""
Everything that asks the reasoning model a question:

  * match_stream()  : score your resume against one job, streaming the model's
                      thinking so the UI can show progress.
  * extract_fields(): read a pasted job description and pull out company,
                      role, location and salary so you don't have to type them.
"""
import json
import re
import threading
from typing import Iterator
from datetime import date

from app.config import REASONING_MODEL
from app.services import ollama

# ── cancellation ──────────────────────────────────────────────────────────────

_cancels: dict[int, threading.Event] = {}


def start_cancel_token(job_id: int) -> threading.Event:
    ev = threading.Event()
    _cancels[job_id] = ev
    return ev


def cancel(job_id: int) -> bool:
    ev = _cancels.get(job_id)
    if ev:
        ev.set()
        return True
    return False


def clear_cancel_token(job_id: int) -> None:
    _cancels.pop(job_id, None)


# ── resume match ──────────────────────────────────────────────────────────────

MATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer", "minimum": 0, "maximum": 100},
        "summary": {"type": "string"},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "gaps": {"type": "array", "items": {"type": "string"}},
        "suggestions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["score", "summary", "strengths", "gaps", "suggestions"],
}


def build_match_prompt(resume: str, role: str, company: str, location: str | None, description: str) -> str:
    today = date.today()
    return f"""You are an experienced, fair technical recruiter. Evaluate how well this candidate's resume fits the job.

TODAY'S DATE: {today:%B %d, %Y}. Judge every date in the resume and posting relative to this date, not your training data.

How to read the resume:
- "Present" means the role is current as of today. Compute durations from today's date.
- An expected graduation date is when the degree finishes. If it is within about 12 months of today, the candidate is graduating soon, which is normal for entry-level and new-grad roles. Do not treat it as a gap.
- Holding jobs while studying (research, teaching, campus IT, technical lead or developer roles at a university, internships, part-time work) is real professional experience. Count it at face value. It is not a red flag, and doing it alongside a degree is a positive signal.
- Judge only fit for this job. Do not speculate about the candidate's salary expectations, motives, or whether they will stay.

RESUME:
{resume[:7000]}

JOB: {role} at {company}{f" ({location})" if location else ""}
DESCRIPTION:
{description[:7000]}

Scoring rubric (0-100, do not inflate):
- 90-100: meets all must-haves and most nice-to-haves, with clear evidence
- 75-89: meets all must-haves; a few nice-to-haves missing
- 60-74: meets most must-haves; one notable gap that could be learned quickly
- 40-59: missing several must-haves or the wrong level for the role
- 0-39: different field or far below requirements
Weigh must-have skills, level, and domain most heavily. For entry-level roles, projects and part-time technical work count toward experience.

Return:
- summary: 2-3 sentences, the overall verdict.
- strengths: up to 4 specific matches between the resume and the job.
- gaps: up to 4 specific requirements the resume does not show.
- suggestions: up to 3 concrete edits to the resume (wording, bullets to surface) that would make it a better fit for THIS job. Only suggest things supported by the resume; never invent experience.

Reasoning: do not restate the resume or the job. Identify the must-haves, check each against the resume, pick a rubric band, then answer."""


def _parse_json(text: str) -> dict:
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            raise ValueError(f"Model returned unexpected output: {text[:300]!r}")
        return json.loads(m.group(0))


def normalize_match(data: dict) -> dict:
    def _list(key):
        v = data.get(key) or []
        return [str(x).strip() for x in v if str(x).strip()][:5] if isinstance(v, list) else []

    score = max(0, min(100, int(data["score"])))
    return {
        "score": score,
        "summary": str(data.get("summary", "")).strip(),
        "strengths": _list("strengths"),
        "gaps": _list("gaps"),
        "suggestions": _list("suggestions"),
    }


def match_stream(
    resume: str,
    role: str,
    company: str,
    location: str | None,
    description: str,
    cancel_event: threading.Event | None = None,
) -> Iterator[dict]:
    """
    Yields {"type": "thinking"|"content", "text"} while running, then exactly one of
    {"type": "done", "result": {...}}, {"type": "error", "text"}, {"type": "cancelled"}.
    """
    payload = {
        "model": REASONING_MODEL,
        "messages": [{"role": "user", "content": build_match_prompt(resume, role, company, location, description)}],
        "think": True,
        "format": MATCH_SCHEMA,
        "options": {"temperature": 0.2, "num_ctx": 16384, "num_predict": 8192},
        "keep_alive": "30m",
    }
    content = ""
    try:
        for chunk in ollama.chat_stream(payload):
            if cancel_event is not None and cancel_event.is_set():
                yield {"type": "cancelled"}
                return
            msg = chunk.get("message", {})
            if msg.get("thinking"):
                yield {"type": "thinking", "text": msg["thinking"]}
            if msg.get("content"):
                content += msg["content"]
                yield {"type": "content", "text": msg["content"]}
            if chunk.get("done"):
                break
    except ollama.OllamaError as e:
        yield {"type": "error", "text": str(e)}
        return

    try:
        yield {"type": "done", "result": normalize_match(_parse_json(content))}
    except (ValueError, KeyError, TypeError) as e:
        yield {"type": "error", "text": str(e)}


# ── autofill from a pasted job description ────────────────────────────────────

EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "company": {"type": ["string", "null"]},
        "role": {"type": ["string", "null"]},
        "location": {"type": ["string", "null"]},
        "salary_min": {"type": ["integer", "null"]},
        "salary_max": {"type": ["integer", "null"]},
    },
    "required": ["company", "role", "location", "salary_min", "salary_max"],
}


def extract_fields(text: str) -> dict:
    prompt = f"""Extract these fields from the job posting below. Use null for anything not stated; never guess.
- company: hiring company name
- role: job title
- location: city/state or "Remote" / "Hybrid - City"
- salary_min / salary_max: annual base salary in whole dollars (convert "150k" to 150000; if hourly, multiply by 2080). If only one number, set both to it.

JOB POSTING:
{text[:8000]}"""
    raw = ollama.chat(
        {
            "model": REASONING_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "format": EXTRACT_SCHEMA,
            "think": False,
            "options": {"temperature": 0, "num_ctx": 8192, "num_predict": 300},
            "keep_alive": "30m",
        },
        timeout=180,
    )
    data = _parse_json(raw)
    out = {}
    for k in ("company", "role", "location"):
        v = data.get(k)
        out[k] = str(v).strip() if v else None
    for k in ("salary_min", "salary_max"):
        try:
            out[k] = int(data.get(k)) if data.get(k) is not None else None
        except (TypeError, ValueError):
            out[k] = None
    return out
