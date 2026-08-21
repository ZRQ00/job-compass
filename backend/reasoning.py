"""
Reasoning-based job fit scoring via a local Ollama model.
Runs after the embedding pass — only on jobs worth a closer look.
"""
import os
import json
import re
import socket
import urllib.request
import urllib.error
from ollama_client import post, is_ollama_running, is_model_available, OLLAMA_URL  # noqa: F401
import threading

_active_cancels: dict[int, threading.Event] = {}
REASONING_MODEL = os.getenv("REASONING_MODEL", "gemma4:26b")

def start_cancel_token(job_id: int) -> threading.Event:
    event = threading.Event()
    _active_cancels[job_id] = event
    return event


def cancel_job_reasoning(job_id: int) -> bool:
    event = _active_cancels.get(job_id)
    if event:
        event.set()
        return True
    return False


def clear_cancel_token(job_id: int):
    _active_cancels.pop(job_id, None)
    
def _build_prompt(job_title: str, company: str, description: str, resume_text: str) -> str:
    return f"""You are evaluating how well a candidate's resume matches a job listing.

RESUME:
{resume_text[:6000]}

JOB: {job_title} at {company}
DESCRIPTION:
{description[:6000]}

Assess the fit honestly and critically — don't inflate the score. Weigh required skills, seniority match, and any clear gaps.

Keep your reasoning brief and decisive — a quick mental check of the biggest 2-3 factors is enough. You do not need to enumerate every skill category or write a structured report.
"""


SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer", "minimum": 0, "maximum": 100},
        "reasoning": {"type": "string"},
    },
    "required": ["score", "reasoning"],
}


def reason_job_fit(resume_text: str, job_title: str, company: str, description: str) -> dict:
    """Blocking version — used by the batch pipeline."""
    resp = post(
        "/api/chat",
        {
            "model": REASONING_MODEL,
            "messages": [{"role": "user", "content": _build_prompt(job_title, company, description, resume_text)}],
            "stream": False,
            "format": SCHEMA,
            "options": {"temperature": 0.2, "num_ctx": 8192, "num_predict": 1500},
            "keep_alive": "30m",
        },
        timeout=600,
    )
    text = resp["message"]["content"].strip()
    try:
        data = json.loads(text)
        return {"score": int(data["score"]), "reasoning": str(data["reasoning"])}
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
        raise ValueError(f"Model returned unexpected output: {text[:300]!r}") from e


def stream_job_reasoning(resume_text: str, job_title: str, company: str, description: str, cancel_event: threading.Event | None = None):
    """
    Stream the model's thinking trace and final answer as they're generated.
    Yields dicts: {"type": "thinking"|"content", "text": str} while running,
    then {"type": "done", "score": int, "reasoning": str} or {"type": "error", "text": str}.
    """
    payload = {
        "model": REASONING_MODEL,
        "messages": [{"role": "user", "content": _build_prompt(job_title, company, description, resume_text)}],
        "stream": True,
        "think": True,
        "format": SCHEMA,
        "options": {"temperature": 0.2, "num_ctx": 8192, "num_predict": 1500},
        "keep_alive": "30m",
    }
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    full_content = ""
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            for raw_line in resp:
                if cancel_event is not None and cancel_event.is_set():
                    yield {"type": "cancelled"}
                    return
                line = raw_line.decode("utf-8").strip()
                if not line:
                    continue
                chunk = json.loads(line)
                msg = chunk.get("message", {})
                thinking = msg.get("thinking")
                content = msg.get("content")
                if thinking:
                    yield {"type": "thinking", "text": thinking}
                if content:
                    full_content += content
                    yield {"type": "content", "text": content}
                if chunk.get("done"):
                    break
    except socket.timeout:
        yield {"type": "error", "text": f"Ollama at {OLLAMA_URL} timed out"}
        return
    except urllib.error.URLError as e:
        yield {"type": "error", "text": f"Ollama not reachable at {OLLAMA_URL}: {e}"}
        return

    try:
        parsed = json.loads(full_content.strip())
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", full_content, re.DOTALL)
        if not match:
            yield {"type": "error", "text": f"Model returned unexpected output: {full_content[:300]!r}"}
            return
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            yield {"type": "error", "text": f"Model returned unexpected output: {full_content[:300]!r}"}
            return

    try:
        score = int(parsed["score"])
        reasoning = str(parsed["reasoning"])
    except (KeyError, TypeError, ValueError):
        yield {"type": "error", "text": f"Model returned unexpected output: {full_content[:300]!r}"}
        return

    yield {"type": "done", "score": score, "reasoning": reasoning}