# Job Compass

A local job discovery and tracking backend for job search.
Scrapes LinkedIn and Indeed. Stores everything in a local SQLite database.

---

## Setup

### 1. Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Run the server

```bash
cd backend
python main.py
```

Server runs at: **http://localhost:9500**
API docs at: **http://localhost:9500/docs**

---

## API Endpoints

### Scraping
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/scrape` | Trigger a job search |

**Example scrape request body:**
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
| GET | `/jobs/{id}` | Get single job with full JD |
| PATCH | `/jobs/{id}` | Update status, notes, priority |
| DELETE | `/jobs/{id}` | Delete a job |

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
  "fit_score": 85,
  "applied_date": "2026-05-20T00:00:00"
}
```

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
- Resume fit scoring against each JD
- Cover letter generation
- Auto-apply to Easy Apply jobs
- Email/Slack notifications for new matches
- Duplicate detection improvements
- Salary trend charts