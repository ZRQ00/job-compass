#!/usr/bin/env python3
"""Run from the repo root. Puts the old FastAPI backend behind the "legacy" profile and removes the
frontend's depends_on, so `docker compose up` no longer restarts the old backend."""
import re
p = "docker-compose.yml"
s = open(p).read()
if 'profiles: ["legacy"]' in s:
    raise SystemExit("already patched")
s, n1 = re.subn(r'(\n    container_name: jobcompass-backend[^\n]*)', r'\1\n    profiles: ["legacy"]', s, count=1)
s, n2 = re.subn(r'\n    depends_on:\n      - backend\n', '\n', s, count=1)
if n1 != 1 or n2 != 1:
    raise SystemExit(f"unexpected compose layout (profiles={n1}, depends_on={n2}); edit by hand")
open(p, "w").write(s)
print("patched docker-compose.yml")
