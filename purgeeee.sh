#!/usr/bin/env bash
# Run this from the project root (the folder with package.json / backend/) before
# pushing to a public GitHub repo. It deletes your personal data, strips
# identifying info baked into the code, resets local runtime config back to
# defaults, and removes the Lovable.dev scaffolding metadata.
#
# This is DESTRUCTIVE and irreversible for anything not already backed up
# elsewhere (your resume, your scraped jobs database, your job search history).
# Back up backend/jobtracker.db and backend/resume.txt first if you want to
# keep a private copy.

set -euo pipefail

if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
  echo "Run this from the project root (where package.json and backend/ live)." >&2
  exit 1
fi

echo "== Removing personal data files =="
rm -f  backend/jobtracker.db
rm -f  backend/resume.txt
rm -f  backend/resume_embedding.json
rm -f  backend/scheduler_config.json   # regenerated with defaults on next run
rm -f  backend/blacklist.json          # regenerated with defaults on next run
rm -rf backend/__pycache__
echo "  done"

echo "== Removing Lovable.dev project metadata =="
rm -rf .lovable
echo "  done"

echo "== Stripping personal identifiers from source =="

# main.py: FastAPI description mentions the owner's name
if grep -q "Riky's job search" backend/main.py 2>/dev/null; then
  sed -i.bak 's/Job discovery and tracking API for Riky'"'"'s job search/Job discovery and tracking API/' backend/main.py
  rm -f backend/main.py.bak
  echo "  cleaned backend/main.py"
fi

# ollama_client.py: hardcoded default is a personal Tailscale IP
if grep -q "100.81.99.54" backend/ollama_client.py 2>/dev/null; then
  sed -i.bak 's#http://100\.81\.99\.54:11434#http://localhost:11434#' backend/ollama_client.py
  rm -f backend/ollama_client.py.bak
  echo "  cleaned backend/ollama_client.py (defaults to localhost:11434 — set OLLAMA_URL to override)"
fi

echo "== Removing the Lovable.dev section from README.md =="
if [ -f "README.md" ]; then
  python3 - <<'PY'
import re
path = "README.md"
text = open(path, encoding="utf-8").read()
pattern = re.compile(
    r"\n## Lovable\.dev Integration\n.*?(?=\n## Database\n)",
    re.DOTALL,
)
new_text, count = pattern.subn("", text)
if count:
    open(path, "w", encoding="utf-8").write(new_text)
    print("  removed Lovable.dev Integration section")
else:
    print("  no Lovable.dev section found (already clean or README changed shape — check manually)")
PY
fi

echo "== Updating .gitignore =="
touch .gitignore
# Make sure the file ends with a newline before appending, or the first
# appended line would get glued onto the end of the last existing line.
if [ -s .gitignore ] && [ "$(tail -c1 .gitignore)" != "" ]; then
  echo >> .gitignore
fi
GITIGNORE_ADDITIONS=(
  "backend/jobtracker.db"
  "backend/resume.txt"
  "backend/resume_embedding.json"
  "backend/scheduler_config.json"
  "backend/blacklist.json"
  "backend/__pycache__/"
  "*.pyc"
  ".lovable/"
)
for line in "${GITIGNORE_ADDITIONS[@]}"; do
  grep -qxF "$line" .gitignore 2>/dev/null || echo "$line" >> .gitignore
done
echo "  done"

echo
echo "== Done. Before pushing publicly, also check by hand: =="
echo "  - git log / git history: if any of the removed files were EVER committed"
echo "    before, deleting them now doesn't remove them from git history. You'd"
echo "    need 'git filter-repo' (or a fresh repo with no history) to fully purge them."
echo "  - backend/scheduler_config.json and backend/blacklist.json will be"
echo "    recreated with generic defaults the next time the backend starts."
echo "  - The frontend build still depends on the '@lovable.dev/vite-tanstack-config'"
echo "    npm package (see vite.config.ts / package.json) — that's build tooling,"
echo "    not personal data, so this script leaves it in place. Removing it would"
echo "    mean rewriting vite.config.ts's plugin setup by hand; let me know if you"
echo "    want that done separately."