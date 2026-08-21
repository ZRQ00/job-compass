from jobspy import scrape_jobs
from sqlalchemy.orm import Session
from database import Job
from schemas import ScrapeRequest
import pandas as pd
import re
from datetime import datetime
from embeddings import (
    is_ollama_running,
    get_resume_embedding,
    score_job,
    build_job_text,
)
from blacklist import is_blacklisted

# Cache resume embedding for the lifetime of the process
_resume_embedding = None


def get_cached_resume_embedding():
    global _resume_embedding
    if _resume_embedding is None:
        _resume_embedding = get_resume_embedding()
    return _resume_embedding


def extract_tech_stack(description: str) -> str:
    """Extract common tech keywords from description."""
    if not description:
        return ""
    keywords = [
        "Python", "JavaScript", "TypeScript", "React", "Node.js", "FastAPI",
        "Django", "Flask", "Go", "Rust", "Java", "C++", "Ruby", "Rails",
        "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite",
        "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform",
        "LangChain", "LangGraph", "LlamaIndex", "OpenAI", "Anthropic",
        "RAG", "LLM", "PyTorch", "TensorFlow", "scikit-learn",
        "GraphQL", "REST", "gRPC", "Kafka", "Spark",
        "Next.js", "Vue", "Angular", "Tailwind",
    ]
    found = [kw for kw in keywords if re.search(rf'\b{re.escape(kw)}\b', description, re.IGNORECASE)]
    return ", ".join(found)


def _process_row(row, request: ScrapeRequest, db: Session, use_embeddings: bool, resume_embedding):
    job_url = str(row.get("job_url", "")) if pd.notna(row.get("job_url")) else None
    title = str(row.get("title", "")) if pd.notna(row.get("title")) else ""
    company = str(row.get("company", "")) if pd.notna(row.get("company")) else ""

    if is_blacklisted(company):
        return "blacklisted"

    existing = None
    if job_url:
        existing = db.query(Job).filter(Job.job_url == job_url).first()
    if not existing:
        existing = db.query(Job).filter(Job.title == title, Job.company == company).first()
    if existing:
        return "duplicate"

    salary_min, salary_max = None, None
    if pd.notna(row.get("min_amount")):
        salary_min = int(row.get("min_amount", 0))
    if pd.notna(row.get("max_amount")):
        salary_max = int(row.get("max_amount", 0))

    if request.salary_min and salary_min and salary_max:
        if salary_max < request.salary_min:
            return "skipped"

    description = str(row.get("description", "")) if pd.notna(row.get("description")) else ""
    location = str(row.get("location", "")) if pd.notna(row.get("location")) else ""
    tech_stack = extract_tech_stack(description)

    is_remote = (
        request.remote_only or
        "remote" in location.lower() or
        "remote" in description.lower()[:500]
    )

    date_posted_raw = row.get("date_posted")
    date_posted = None
    if pd.notna(date_posted_raw):
        parsed = pd.to_datetime(date_posted_raw, errors="coerce")
        if pd.notna(parsed):
            date_posted = parsed.to_pydatetime()

    fit_score = None
    if use_embeddings and resume_embedding and (description or title):
        try:
            job_text = build_job_text(title, company, description, tech_stack)
            fit_score = score_job(job_text, resume_embedding)
        except Exception as e:
            print(f"Warning: Could not score job '{title}': {e}")

    job = Job(
        title=title,
        company=company,
        location=location,
        job_type=str(row.get("job_type", "")) if pd.notna(row.get("job_type")) else None,
        salary_min=salary_min,
        salary_max=salary_max,
        salary_currency=str(row.get("currency", "USD")) if pd.notna(row.get("currency")) else "USD",
        description=description,
        tech_stack=tech_stack,
        job_url=job_url,
        source=str(row.get("site", "")) if pd.notna(row.get("site")) else "",
        status="found",
        is_remote=is_remote,
        date_posted=date_posted,
        fit_score=fit_score,
    )
    db.add(job)
    return "added"


def stream_scrape_and_store(request: ScrapeRequest, db: Session):
    """
    Generator version of the scrape — yields progress events as it works through
    each site and each listing, instead of going silent until everything's done.
    Yields dicts shaped like:
      {"type": "status", "text": str}
      {"type": "progress", "site": str, "current": int, "total": int}
      {"type": "done", "jobs_found": int, "jobs_added": int, "jobs_duplicate": int}
    """
    use_embeddings = is_ollama_running()
    resume_embedding = None
    if use_embeddings:
        try:
            resume_embedding = get_cached_resume_embedding()
            yield {"type": "status", "text": "Ollama running — fit scoring enabled"}
        except FileNotFoundError:
            yield {"type": "status", "text": "No resume found — skipping fit scoring"}
            use_embeddings = False
        except Exception as e:
            yield {"type": "status", "text": f"Couldn't load resume embedding ({e}) — skipping fit scoring"}
            use_embeddings = False
    else:
        yield {"type": "status", "text": "Ollama not running — fit scoring disabled"}

    jobs_found_total = 0
    jobs_added_total = 0
    jobs_duplicate_total = 0

    for site in request.sites:
        yield {"type": "status", "text": f'Searching {site} for "{request.search_term}"...'}

        try:
            params = dict(
                site_name=[site],
                search_term=request.search_term,
                location=request.location,
                results_wanted=request.results_wanted,
                country_indeed="USA",
                linkedin_fetch_description=True,
                description_format="markdown",
                verbose=0,
            )
            if site.lower() == "indeed":
                params["is_remote"] = request.remote_only
            else:
                params["hours_old"] = request.hours_old
                params["is_remote"] = request.remote_only

            jobs_df = scrape_jobs(**params)
        except Exception as e:
            yield {"type": "status", "text": f"{site} failed: {e}"}
            continue

        if jobs_df is None or jobs_df.empty:
            yield {"type": "status", "text": f"No results from {site}"}
            continue

        site_total = len(jobs_df)
        jobs_found_total += site_total
        yield {"type": "status", "text": f"Found {site_total} listings on {site} — processing..."}

        site_added = 0
        site_duplicate = 0
        site_blacklisted = 0

        for idx, (_, row) in enumerate(jobs_df.iterrows()):
            outcome = _process_row(row, request, db, use_embeddings, resume_embedding)
            if outcome == "added":
                site_added += 1
            elif outcome == "duplicate":
                site_duplicate += 1
            elif outcome == "blacklisted":
                site_blacklisted += 1
            yield {"type": "progress", "site": site, "current": idx + 1, "total": site_total}

        db.commit()
        jobs_added_total += site_added
        jobs_duplicate_total += site_duplicate + site_blacklisted
        yield {"type": "status", "text": f"{site}: added {site_added}, {site_duplicate} duplicates, {site_blacklisted} blacklisted"}

    yield {
        "type": "done",
        "jobs_found": jobs_found_total,
        "jobs_added": jobs_added_total,
        "jobs_duplicate": jobs_duplicate_total,
    }


def scrape_and_store(request: ScrapeRequest, db: Session) -> dict:
    """Blocking wrapper for existing callers (scheduler, pipeline, POST /scrape) that just want the final summary."""
    result = {"jobs_found": 0, "jobs_added": 0, "jobs_duplicate": 0}
    for event in stream_scrape_and_store(request, db):
        if event["type"] == "done":
            result = {k: event[k] for k in ("jobs_found", "jobs_added", "jobs_duplicate")}
    return result