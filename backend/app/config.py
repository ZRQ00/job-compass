"""
All runtime settings in one place. Everything can be overridden with
environment variables (or a .env file next to docker-compose.yml).
"""
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Where your personal data lives: the SQLite database and your resume text.
DATA_DIR = Path(os.getenv("DATA_DIR", BACKEND_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'jobcompass.db'}")
RESUME_PATH = DATA_DIR / "resume.txt"

# Local Ollama instance used for resume matching and JD autofill.
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")
REASONING_MODEL = os.getenv("REASONING_MODEL", "gemma4:26b")

# Defaults for settings you can change on the dashboard. Once you change them
# in the app, the saved value wins over these.

# Applications sitting in "applied" this many days without movement show up
# in the dashboard's follow-up queue.
FOLLOW_UP_AFTER_DAYS = int(os.getenv("FOLLOW_UP_AFTER_DAYS", "7"))

# Weekly application goal shown on the dashboard.
WEEKLY_GOAL = int(os.getenv("WEEKLY_GOAL", "10"))

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
