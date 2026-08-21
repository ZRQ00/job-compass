"""
Shared helpers for talking to your Ollama instance.
embeddings.py and reasoning.py both build on this — one URL, one connection
check, one place to fix bugs instead of two.
"""
import os
import json
import socket
import urllib.request
import urllib.error

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://100.81.99.54:11434")


def post(path: str, payload: dict, timeout: int = 60) -> dict:
    """POST to an Ollama endpoint, e.g. post('/api/chat', {...})."""
    url = f"{OLLAMA_URL}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except socket.timeout:
        raise TimeoutError(
            f"Ollama at {OLLAMA_URL} didn't respond within {timeout}s. "
            "If the model hasn't been used in a while, it may still be loading into memory — try again shortly."
        )
    except urllib.error.URLError as e:
        raise ConnectionError(f"Ollama not reachable at {OLLAMA_URL}: {e}")


def is_ollama_running() -> bool:
    try:
        req = urllib.request.Request(f"{OLLAMA_URL}/api/tags")
        with urllib.request.urlopen(req, timeout=5):
            return True
    except Exception:
        return False


def is_model_available(model: str) -> bool:
    """Check a specific model tag is actually pulled, not just that Ollama is up."""
    try:
        req = urllib.request.Request(f"{OLLAMA_URL}/api/tags")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        names = [m.get("model") or m.get("name", "") for m in data.get("models", [])]
        return any(model == n or n.startswith(model + ":") for n in names)
    except Exception:
        return False