# Job Compass

A self-hosted job discovery and tracking app. Scrapes LinkedIn, Indeed, Glassdoor, and ZipRecruiter, stores everything in a local SQLite database, and can optionally score how well each listing matches your resume using a local Ollama model — no data leaves your machine unless you want it to.

The frontend is a TanStack Start (React) app; the backend is FastAPI with a SQLite database.

---

## Setup

### Option A — Docker (recommended)

```bash
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:9500 (docs at `/docs`)

Both containers bind-mount the project folder, so code changes hot-reload without a rebuild. See [DOCKER.md](./DOCKER.md) for details, including how to point the backend at an Ollama instance on your network.

### Option B — Run it manually

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python main.py
```
Server runs at **http://localhost:9500** (docs at `/docs`).

**Frontend:**
```bash
bun install   # or npm install
bun run dev   # or npm run dev
```

### Optional: AI-powered matching

Fit scoring and "AI reasoning" explanations use a local [Ollama](https://ollama.com) instance — nothing is sent to a third-party API. To enable it:

```bash
ollama serve
ollama pull nomic-embed-text   # embedding model, used for fit_score
ollama pull <your-reasoning-model>  # used for the explainable "Get AI reasoning" feature
```

Configure via environment variables (all optional, sensible defaults apply):

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Where your Ollama instance is reachable |
| `EMBED_MODEL` | `nomic-embed-text` | Embedding model for automatic fit scoring |
| `REASONING_MODEL` | `gemma4:26b` | Model used for the explainable AI reasoning feature |

Without Ollama running, the app still works fully for scraping and tracking — fit scoring and AI reasoning are just skipped.

---

## API Endpoints

### Scraping
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/scrape` | Trigger a job search, blocks until done |
| GET | `/scrape/stream` | Same, but streams live progress via SSE (used by the Discover page) |

**Scrape parameters** (body for `/scrape`, query params for `/scrape/stream`):
```json
{
  "search_term": "AI Engineer",
  "location": "United States",
  "results_wanted": 50,
  "hours_old": 168,
  "remote_only": true,
  "salary_min": 150000,
  "sites": ["linkedin", "indeed", "glassdoor", "zip_recruiter"]
}
```

### Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jobs` | Get all jobs (with filters) |
| POST | `/jobs` | Manually add a job (not scraped) |
| GET | `/jobs/{id}` | Get a single job with full JD |
| PATCH | `/jobs/{id}` | Update status, notes, priority, fit score |
| DELETE | `/jobs/{id}` | Delete a job |
| DELETE | `/jobs` | Delete all jobs, or all jobs with a given `status` |
| POST | `/jobs/cleanup` | Remove stale `found` jobs older than N days (default 90) |
| POST | `/jobs/cleanup/blacklisted` | Remove any existing jobs from blacklisted companies |
| POST | `/dedup` | Remove duplicate jobs (by URL, or by company+title) |

**GET /jobs query params:**
- `status` — found, applied, interview, offer, rejected, skipped
- `source` — linkedin, indeed, glassdoor, zip_recruiter
- `remote_only` — true/false
- `salary_min` — integer
- `search` — searches title, company, description
- `limit` — max results (default 100)
- `offset` — pagination offset

**PATCH /jobs/{id} body:**
```json
{
  "status": "applied",
  "priority": "1 - Apply Now",
  "notes": "Applied via LinkedIn Easy Apply",
  "fit_score": 85
}
```

### Resume & AI Scoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/resume` | Upload your resume (PDF or plain text) — extracts text and computes its embedding |
| GET | `/resume` | Check whether a resume/embedding is currently stored |
| POST | `/rescore` | Recompute `fit_score` (embedding-based) for every job against the current resume |
| POST | `/jobs/{id}/reason` | Run the reasoning model once on a job, blocks until done |
| GET | `/jobs/{id}/reason/stream` | Same, but streams the model's thinking + final answer live via SSE |
| POST | `/jobs/{id}/reason/cancel` | Cancel an in-flight reasoning call for a job |

There are two independent scores: `fit_score` is computed automatically for every job at scrape time via embedding similarity. `reasoning_score` / `fit_reasoning` are only computed when you explicitly trigger "Get AI reasoning" on a job — they're not run automatically during scraping or the scheduler.

### Blacklist
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/blacklist` | List blacklisted companies (never added when scraping) |
| POST | `/blacklist?company=...` | Add a company to the blacklist |
| DELETE | `/blacklist?company=...` | Remove a company from the blacklist |

### Scheduler
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/scheduler` | Get scheduler status, next run time, last run results |
| POST | `/scheduler/run` | Trigger all configured searches now, in the background |
| GET | `/scheduler/run/stream` | Same, but streams live progress via SSE (used by the "Run now" button) |
| PATCH | `/scheduler?enabled=...&interval_hours=...` | Enable/disable the scheduler or change its interval |
| PUT | `/scheduler/searches` | Replace the full list of scheduled search configs |

The scheduler also runs a daily cleanup of stale `found` jobs — configurable in `backend/scheduler_config.json` (auto-created with sensible defaults on first run).

### Stats
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats` | Application funnel counts |

### Export
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/export/csv` | Download CSV |
| GET | `/export/xlsx` | Download Excel spreadsheet |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Check server is running |

---

## Status Values
- `found` — scraped, not yet reviewed
- `applied` — application submitted
- `interview` — in interview process
- `offer` — received offer
- `rejected` — rejected or ghosted
- `skipped` — decided not to apply

---

## Database

SQLite file stored at `backend/jobtracker.db`. No setup required — created automatically on first run.

To reset: delete `jobtracker.db` and restart the server.

---

## Future Features (V2)
- Cover letter generation
- Auto-apply to Easy Apply jobs
- Email/Slack notifications for new matches
- Salary trend charts
