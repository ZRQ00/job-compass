# Job Compass

A self-hosted tracker for the jobs you find yourself, with a local AI model that fills in job details for you and scores your resume against any posting. No scrapers, no third-party APIs: your data lives in a SQLite file and the AI runs on your own Ollama.

```
  Collect                Track                     Match
  ───────                ─────                     ─────
  Paste a JD or    ──▶   Applied → Interview  ──▶  Resume vs. JD:
  use the bookmark       → Offer                   score, strengths,
  (AI autofills)         (or Rejected/Withdrawn)   gaps, tailoring tips
```

**Frontend:** TanStack Start (React, built as a static SPA, served by nginx) · **Backend:** FastAPI + SQLite · **AI:** Ollama (optional)

---

## Features

| Page | What it does |
|---|---|
| **Dashboard** | Weekly goal progress (click the pencil to change it), response rate, pipeline bar, a *Follow up* queue (applied 7+ days ago with no movement), *Find jobs* (type a search once, open it on LinkedIn, Indeed, Glassdoor, ZipRecruiter, Dice, Built In and more), and applications per week. |
| **Tracker** | Every job in a sortable table or a drag-and-drop board. Filter by status, search, and change status inline. |
| **Add job** | Paste the job description (lists, headings and bold text are kept), hit **Autofill** to pull out company, role, location and salary, review, and save. Warns you if you're already tracking a job at that company. |
| **Job page** | Full description, pipeline stepper, auto-saving notes, status history, and **Match my resume**, which streams the model's reasoning live. |
| **Resume** | Upload a PDF, DOCX or TXT, and fix the extracted text if the PDF parse is messy. |

**Tracked fields:** company, role, location, date applied, salary range, notes, status, job description, and an optional link to the posting.

**Statuses:** `applied` → `interview` → `offer`, with `rejected` and `withdrawn` as exits. New jobs start as *applied*, dated today unless you pick another date. Every status change is logged to the job's history.

### Job description formatting
Descriptions are stored as Markdown. When you paste from a job board, the HTML on your clipboard is converted, so bullet lists, numbered lists, headings and bold text come through. Plain-text "•" bullets become real list items too. Use the **Preview** tab to check before saving, or type Markdown by hand (`- item`, `## Heading`, `**bold**`).

### Job boards
The board list lives in `src/lib/boards.ts`. Add, remove or reorder entries there; each has a home page and an optional search URL template. The job page also labels the posting link with the board it came from (LinkedIn, Indeed, Greenhouse, Lever, and so on).

### Capture bookmarklet
On the Add job page there's a **+ Job Compass** button. Drag it to your bookmarks bar. On any job board, highlight the description and click the bookmark: Job Compass opens with the link and description filled in (formatting included) and runs autofill for you. If you added the bookmark before this version, drag the button again to replace it.

---

## Setup

### 1. Ollama (optional, needed for autofill and matching)
Everything else works without it. The **AI** dot in the top bar shows whether it's reachable.

```bash
ollama pull qwen3.5:9b      # or whatever you set REASONING_MODEL to
```

If the backend runs in Docker and Ollama runs on the host (the usual setup), Ollama must listen on all interfaces, not just localhost, or the container can't reach it. With a systemd install:

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
printf '[Service]\nEnvironment="OLLAMA_HOST=0.0.0.0"\nEnvironment="OLLAMA_CONTEXT_LENGTH=16384"\n' \
  | sudo tee /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload && sudo systemctl restart ollama
ss -tlnp | grep 11434       # should show *:11434
```

> Ollama has no authentication. `0.0.0.0` exposes it to your whole network, which is usually fine at home or on a tailnet. To lock it down, firewall port 11434 to localhost and Docker's range (`172.16.0.0/12`).

**Choosing a model:** pick one that fits entirely in your GPU's VRAM. On a 12 GB card, a 7 to 9B model is fast.

### 2. Run with Docker (recommended)
```bash
cp .env.example .env
docker compose up -d --build
```

| Service | Container | Listens on |
|---|---|---|
| Frontend (nginx) | `jobcompass-frontend` | 80 |
| Backend (Uvicorn) | `jobcompass-backend` | 9500 (interactive API docs at `/docs`) |

The frontend is a production build: code changes need `docker compose up -d --build frontend`. The backend mounts `./backend` and reloads on save.

To open it directly without a reverse proxy, publish the ports in `docker-compose.yml` (`"8080:80"` for the frontend, `"9500:9500"` for the backend) and build with `VITE_API_URL=http://localhost:9500`.

### 3. Behind a reverse proxy (Caddy example)
The app is built to live under a path prefix, `/jobcompass/` by default. Both containers join an external `caddy_net` network, so Caddy reaches them by container name and no ports need publishing.

```caddy
your-host.example.ts.net {
    # API first, so it isn't swallowed by the frontend route
    handle_path /jobcompass/api/* {
        reverse_proxy jobcompass-backend:9500
    }
    handle_path /jobcompass* {
        reverse_proxy jobcompass-frontend:80
    }
}
```

`handle_path` strips the matched prefix, so `/jobcompass/api/stats` reaches the backend as `/stats`.

**Changing the prefix** means updating it in four places so they agree:
1. `base` in the `vite:` block of `vite.config.ts`
2. `basepath` where the router is created (`src/router.tsx`)
3. the `VITE_API_URL` build arg in `docker-compose.yml`
4. both `handle_path` lines in the Caddyfile

### Local development
```bash
# backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 9500

# frontend (another terminal, project root)
bun install
bun run dev          # prints the local URL
```

---

## Configuration
All optional. Set them in `.env` (Docker) or export them (local dev).

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_URL` | `http://host.docker.internal:11434` | Your Ollama server |
| `REASONING_MODEL` | `qwen3.5:9b` | Model used for matching and autofill |
| `WEEKLY_GOAL` | `10` | Starting weekly goal (editable on the dashboard) |
| `FOLLOW_UP_AFTER_DAYS` | `7` | Starting follow-up threshold (editable on the dashboard) |
| `DATA_DIR` | `backend/data` | Where the database and resume live |
| `VITE_API_URL` | `/jobcompass/api` | Where the frontend finds the API. Baked in at **build** time, so set it as a build arg and rebuild after changing it. |

### Model settings
Request options live in `backend/app/services/matcher.py`:

| Call | `think` | `num_ctx` | `num_predict` |
|---|---|---|---|
| Resume match | on (streamed to the UI) | 16384 | 8192 |
| Autofill | off | 8192 | 300 |

With thinking on, `num_predict` covers the reasoning **and** the answer. If it's too low, the model runs out mid-thought and the match fails with `Model returned unexpected output: ''`. For faster matches without live reasoning, set `think` to `False` on the match call.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `"reachable": false` in `/health` | Ollama only listening on `127.0.0.1`. See the `OLLAMA_HOST` step above. |
| `"model_available": false` | Model not pulled, or `REASONING_MODEL` (in `docker-compose.yml` **or** `.env`) names a different one. Check `ollama list`. |
| 502 from the proxy | Check `docker logs <proxy> --tail 5`. `lookup ...` means a name mismatch or the container isn't on `caddy_net`; `connection refused` means the port in the Caddyfile is wrong. |
| Proxy still uses an old Caddyfile | Single-file bind mounts go stale when editors replace the file. Recreate the proxy: `docker compose up -d --force-recreate caddy`. |
| Blank page under the prefix | `base` / `basepath` / proxy prefix don't agree. See "Changing the prefix". |
| "Welcome to nginx!" | The build didn't produce `index.html`. Run `docker compose build --no-cache frontend` and read the errors. |

---

## Coming from the old (scraper) version?
Your data is in `backend/jobtracker.db` and `backend/resume.txt`. One command brings it over:
```bash
cd backend
python -m scripts.migrate_v1            # dry run: shows what would move
python -m scripts.migrate_v1 --apply    # do it
```
It migrates jobs you added manually or acted on (applied / interview / offer / rejected / skipped) and leaves scraped `found` jobs behind. Manually added `found` jobs come over as *applied*, and `skipped` becomes *withdrawn*. Your old database isn't modified, and re-running is safe. Once you're happy, delete the old files.

---

## Project layout
```
backend/
  app/
    main.py            FastAPI app, wires up routers
    config.py          every setting, read from env
    db.py  models.py   SQLite + SQLAlchemy models (Job, JobEvent)
    schemas.py         request/response validation
    routers/           jobs · matching · resume · stats (+export, health) · settings
    services/          ollama client · matcher (match + autofill) · resume store · exporter · settings
  scripts/migrate_v1.py
  tests/test_api.py    run with: cd backend && pytest
src/
  routes/              index (dashboard) · tracker · tracker_.new · tracker_.$jobId · resume
  components/          JobForm · MatchPanel · PipelineBoard · StatusBadge · AppNav · ui/
  hooks/               useMatchStream · useJobMutations · useAutoScroll
  lib/                 api.ts (typed client) · jobs.ts (statuses, formatting) · boards.ts
Dockerfile             builds the SPA, serves it with nginx
vite.config.ts         Lovable TanStack wrapper: SPA mode, Cloudflare off, base path
```

## API
Paths are relative to the backend (`/jobcompass/api` when behind the proxy).

| Method | Endpoint | |
|---|---|---|
| GET | `/jobs?status=&q=` | List / filter / search |
| POST | `/jobs` | Add a job |
| GET · PATCH · DELETE | `/jobs/{id}` | Read (with history) / partial update / delete |
| GET | `/jobs/duplicates?company=&role=` | Jobs already tracked at a company |
| POST | `/jobs/extract` | `{text}` → company, role, location, salary (AI) |
| GET | `/jobs/{id}/match/stream` | Run the resume match; streams thinking via SSE |
| POST | `/jobs/{id}/match/cancel` | Stop a running match |
| DELETE | `/jobs/{id}/match` | Clear a saved match |
| GET · POST · PUT · DELETE | `/resume` | Read / upload file / save edited text / remove |
| GET | `/stats` | Dashboard numbers |
| GET · PATCH | `/settings` | Weekly goal and follow-up days |
| GET | `/export/xlsx` · `/export/csv` | Download everything |
| GET | `/health` | API + Ollama status |