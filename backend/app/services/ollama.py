"""
Thin client for a local Ollama server. Standard library only, so there's
nothing extra to install.
"""
import json
import socket
import urllib.error
import urllib.request
from typing import Iterator

from app.config import OLLAMA_URL


class OllamaError(RuntimeError):
    pass


def _request(path: str, payload: dict | None = None) -> urllib.request.Request:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    return urllib.request.Request(
        f"{OLLAMA_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST" if payload is not None else "GET",
    )


def list_models() -> list[str]:
    try:
        with urllib.request.urlopen(_request("/api/tags"), timeout=5) as resp:
            data = json.loads(resp.read())
    except Exception as e:  # noqa: BLE001
        raise OllamaError(f"Ollama not reachable at {OLLAMA_URL}: {e}") from e
    return [m.get("model") or m.get("name", "") for m in data.get("models", [])]


def status(model: str) -> dict:
    """{"reachable": bool, "model": str, "model_available": bool}"""
    try:
        names = list_models()
    except OllamaError:
        return {"reachable": False, "model": model, "model_available": False}
    available = any(model == n or n.startswith(model + ":") for n in names)
    return {"reachable": True, "model": model, "model_available": available}


def ensure_ready(model: str) -> None:
    s = status(model)
    if not s["reachable"]:
        raise OllamaError(f"Ollama isn't reachable at {OLLAMA_URL}. Start it with `ollama serve`.")
    if not s["model_available"]:
        raise OllamaError(f"Model '{model}' isn't pulled. Run `ollama pull {model}`.")


def chat(payload: dict, timeout: int = 300) -> str:
    """Blocking chat call. Returns the final message content."""
    try:
        with urllib.request.urlopen(_request("/api/chat", {"think": False, **payload, "stream": False}), timeout=timeout) as resp:
            data = json.loads(resp.read())
    except socket.timeout as e:
        raise OllamaError(f"Ollama timed out after {timeout}s (the model may still be loading).") from e
    except urllib.error.URLError as e:
        raise OllamaError(f"Ollama not reachable at {OLLAMA_URL}: {e}") from e
    return data.get("message", {}).get("content", "")


def chat_stream(payload: dict, timeout: int = 600) -> Iterator[dict]:
    """Streaming chat call. Yields raw Ollama chunks."""
    try:
        with urllib.request.urlopen(_request("/api/chat", {**payload, "stream": True}), timeout=timeout) as resp:
            for raw in resp:
                line = raw.decode("utf-8").strip()
                if line:
                    yield json.loads(line)
    except socket.timeout as e:
        raise OllamaError(f"Ollama timed out after {timeout}s.") from e
    except urllib.error.URLError as e:
        raise OllamaError(f"Ollama not reachable at {OLLAMA_URL}: {e}") from e
