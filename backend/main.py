from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Query, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
from datetime import datetime
import io
import json

from database import get_db, create_tables, Job
from schemas import (
    ScrapeRequest, ScrapeResponse, JobResponse,
    JobUpdate, JobCreate, StatsResponse
)
from scraper import scrape_and_store
from exporter import export_to_csv, export_to_xlsx
from scheduler import start_scheduler, stop_scheduler, get_scheduler_status, load_config, save_config, run_scheduled_scrapes

app = FastAPI(
    title="JobTracker API",
    description="Job discovery and tracking API for Riky's job search",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    create_tables()
    start_scheduler()


@app.on_event("shutdown")
def shutdown():
    stop_scheduler()


# ─── SCRAPING ────────────────────────────────────────────────────────────────

@app.post("/scrape", response_model=ScrapeResponse, tags=["Scraping"])
def trigger_scrape(request: ScrapeRequest, db: Session = Depends(get_db)):
    """
    Trigger a job search across LinkedIn, Indeed, Glassdoor, ZipRecruiter.
    Results are stored in the local database and deduplicated automatically.
    """
    try:
        result = scrape_and_store(request, db)
        return ScrapeResponse(
            message="Scrape completed successfully",
            jobs_found=result["jobs_found"],
            jobs_added=result["jobs_added"],
            jobs_duplicate=result["jobs_duplicate"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/scrape/stream", tags=["Scraping"])
def scrape_stream(
    search_term: str = Query("AI Engineer"),
    location: str = Query("United States"),
    results_wanted: int = Query(50),
    hours_old: int = Query(168),
    remote_only: bool = Query(True),
    salary_min: int = Query(150000),
    sites: List[str] = Query(["linkedin", "indeed", "glassdoor", "zip_recruiter"]),
    db: Session = Depends(get_db),
):
    """Stream scrape progress live via SSE — site by site, job by job."""
    from scraper import stream_scrape_and_store

    request = ScrapeRequest(
        search_term=search_term,
        location=location,
        results_wanted=results_wanted,
        hours_old=hours_old,
        remote_only=remote_only,
        salary_min=salary_min,
        sites=sites,
    )

    def event_stream():
        for event in stream_scrape_and_store(request, db):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─── Blacklist ────────────────────────────────────────────────────────────────────
@app.get("/blacklist", tags=["Jobs"])
def get_blacklist():
    from blacklist import load_blacklist
    return {"companies": load_blacklist()}


@app.post("/blacklist", tags=["Jobs"])
def add_to_blacklist(company: str = Query(...)):
    from blacklist import load_blacklist, save_blacklist
    companies = load_blacklist()
    if company not in companies:
        companies.append(company)
        save_blacklist(companies)
    return {"companies": companies}


@app.delete("/blacklist", tags=["Jobs"])
def remove_from_blacklist(company: str = Query(...)):
    from blacklist import load_blacklist, save_blacklist
    companies = [c for c in load_blacklist() if c != company]
    save_blacklist(companies)
    return {"companies": companies}
# ─── JOBS ─────────────────────────────────────────────────────────────────────

@app.get("/jobs", response_model=List[JobResponse], tags=["Jobs"])
def get_jobs(
    status: Optional[str] = Query(None, description="Filter by status: found, applied, interview, offer, rejected, skipped"),
    source: Optional[str] = Query(None, description="Filter by source: linkedin, indeed, glassdoor, zip_recruiter"),
    remote_only: Optional[bool] = Query(None, description="Filter remote jobs only"),
    salary_min: Optional[int] = Query(None, description="Minimum salary filter"),
    search: Optional[str] = Query(None, description="Search in title, company, description"),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: Session = Depends(get_db)
):
    """Get all jobs with optional filters."""
    query = db.query(Job)

    if status:
        query = query.filter(Job.status == status)
    if source:
        query = query.filter(Job.source == source)
    if remote_only is not None:
        query = query.filter(Job.is_remote == remote_only)
    if salary_min:
        query = query.filter(
            or_(Job.salary_min >= salary_min, Job.salary_max >= salary_min)
        )
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Job.title.ilike(search_term),
                Job.company.ilike(search_term),
                Job.description.ilike(search_term),
                Job.tech_stack.ilike(search_term),
            )
        )

    return query.order_by(Job.created_at.desc()).offset(offset).limit(limit).all()

@app.post("/jobs", response_model=JobResponse, status_code=201, tags=["Jobs"])
def create_job(job_data: JobCreate, db: Session = Depends(get_db)):
    """Manually add a job to the tracker (e.g. something you found yourself, not scraped)."""
    valid_statuses = ["found", "applied", "interview", "offer", "rejected", "skipped"]
    status = job_data.status or "found"
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    job = Job(
        title=job_data.title,
        company=job_data.company,
        location=job_data.location,
        job_type=job_data.job_type,
        salary_min=job_data.salary_min,
        salary_max=job_data.salary_max,
        salary_currency=job_data.salary_currency,
        description=job_data.description,
        requirements=job_data.requirements,
        tech_stack=job_data.tech_stack,
        job_url=job_data.job_url,
        source=job_data.source or "manual",
        status=status,
        priority=job_data.priority,
        notes=job_data.notes,
        is_remote=job_data.is_remote,
        date_posted=job_data.date_posted,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@app.get("/jobs/{job_id}", response_model=JobResponse, tags=["Jobs"])
def get_job(job_id: int, db: Session = Depends(get_db)):
    """Get a single job by ID including full description."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.patch("/jobs/{job_id}", response_model=JobResponse, tags=["Jobs"])
def update_job(job_id: int, update: JobUpdate, db: Session = Depends(get_db)):
    """Update job status, priority, notes, fit score, or applied date."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if update.status is not None:
        valid_statuses = ["found", "applied", "interview", "offer", "rejected", "skipped"]
        if update.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        job.status = update.status

    if update.priority is not None:
        job.priority = update.priority
    if update.notes is not None:
        job.notes = update.notes
    if update.fit_score is not None:
        if not 0 <= update.fit_score <= 100:
            raise HTTPException(status_code=400, detail="Fit score must be between 0 and 100")
        job.fit_score = update.fit_score
    if update.applied_date is not None:
        job.applied_date = update.applied_date

    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job

@app.post("/jobs/{job_id}/reason", response_model=JobResponse, tags=["Resume"])
def reason_job(job_id: int, db: Session = Depends(get_db)):
    """Run the reasoning model on a single job for an explainable fit score."""
    from reasoning import reason_job_fit, is_model_available, REASONING_MODEL
    from embeddings import load_resume, is_ollama_running

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not is_ollama_running():
        raise HTTPException(status_code=503, detail="Ollama is not running. Start it with: ollama serve")
    if not is_model_available(REASONING_MODEL):
        raise HTTPException(status_code=503, detail=f"Model '{REASONING_MODEL}' not found. Run: ollama pull {REASONING_MODEL}")

    try:
        resume_text = load_resume()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No resume found. Upload one via POST /resume first.")

    try:
        result = reason_job_fit(resume_text, job.title, job.company, job.description or "")
    except (ConnectionError, TimeoutError) as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reasoning failed: {e}")

    job.reasoning_score = result["score"]
    job.fit_reasoning = result["reasoning"]
    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job

@app.get("/jobs/{job_id}/reason/stream", tags=["Resume"])
def reason_job_stream(job_id: int, db: Session = Depends(get_db)):
    """Stream the reasoning model's thinking trace and final answer live via SSE."""
    from reasoning import stream_job_reasoning, is_model_available, REASONING_MODEL, start_cancel_token, clear_cancel_token
    from embeddings import load_resume, is_ollama_running

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not is_ollama_running():
        raise HTTPException(status_code=503, detail="Ollama is not running. Start it with: ollama serve")
    if not is_model_available(REASONING_MODEL):
        raise HTTPException(status_code=503, detail=f"Model '{REASONING_MODEL}' not found. Run: ollama pull {REASONING_MODEL}")
    try:
        resume_text = load_resume()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No resume found. Upload one via POST /resume first.")

    cancel_event = start_cancel_token(job_id)

    def event_stream():
        try:
            for event in stream_job_reasoning(resume_text, job.title, job.company, job.description or "", cancel_event=cancel_event):
                if event["type"] == "done":
                    job.reasoning_score = event["score"]
                    job.fit_reasoning = event["reasoning"]
                    job.updated_at = datetime.utcnow()
                    db.commit()
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            clear_cancel_token(job_id)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/jobs/{job_id}/reason/cancel", tags=["Resume"])
def cancel_reason_job(job_id: int):
    """Stop an in-flight reasoning call for this job, if one is running."""
    from reasoning import cancel_job_reasoning
    return {"cancelled": cancel_job_reasoning(job_id)}

@app.delete("/jobs/{job_id}", tags=["Jobs"])
def delete_job(job_id: int, db: Session = Depends(get_db)):
    """Delete a job from the tracker."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
    return {"message": f"Job {job_id} deleted"}


@app.delete("/jobs", tags=["Jobs"])
def clear_jobs(status: Optional[str] = None, db: Session = Depends(get_db)):
    """Delete all jobs, or all jobs with a specific status."""
    query = db.query(Job)
    if status:
        query = query.filter(Job.status == status)
    count = query.count()
    query.delete()
    db.commit()
    return {"message": f"Deleted {count} jobs"}


# ─── STATS ────────────────────────────────────────────────────────────────────

@app.get("/stats", response_model=StatsResponse, tags=["Stats"])
def get_stats(db: Session = Depends(get_db)):
    """Get application funnel statistics."""
    total = db.query(Job).count()
    return StatsResponse(
        total=total,
        found=db.query(Job).filter(Job.status == "found").count(),
        applied=db.query(Job).filter(Job.status == "applied").count(),
        interview=db.query(Job).filter(Job.status == "interview").count(),
        offer=db.query(Job).filter(Job.status == "offer").count(),
        rejected=db.query(Job).filter(Job.status == "rejected").count(),
        skipped=db.query(Job).filter(Job.status == "skipped").count(),
    )


# ─── EXPORT ───────────────────────────────────────────────────────────────────

@app.get("/export/csv", tags=["Export"])
def export_csv(db: Session = Depends(get_db)):
    """Export all jobs as CSV."""
    csv_data = export_to_csv(db)
    return StreamingResponse(
        io.StringIO(csv_data),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=jobs_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


@app.get("/export/xlsx", tags=["Export"])
def export_xlsx(db: Session = Depends(get_db)):
    """Export all jobs as Excel spreadsheet."""
    xlsx_data = export_to_xlsx(db)
    return StreamingResponse(
        io.BytesIO(xlsx_data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=jobs_{datetime.now().strftime('%Y%m%d')}.xlsx"}
    )


# ─── RESUME & SCORING ─────────────────────────────────────────────────────────

def extract_pdf_text(content: bytes) -> str:
    import io
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)

@app.post("/resume", tags=["Resume"])
async def upload_resume(file: UploadFile = File(...)):
    """
    Upload your resume as a PDF or plain text file.
    Extracts the text, saves it, and recomputes the embedding.
    """
    from embeddings import RESUME_PATH, recompute_resume_embedding

    content = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith(".pdf"):
        text = extract_pdf_text(content)
    else:
        text = content.decode("utf-8", errors="ignore")

    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Could not extract any text from the uploaded file")

    RESUME_PATH.write_text(text, encoding="utf-8")
    try:
        recompute_resume_embedding()
        import scraper
        scraper._resume_embedding = None
        return {
            "message": "Resume uploaded and embedding computed successfully",
            "characters_extracted": len(text),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute embedding: {e}")


@app.get("/resume", tags=["Resume"])
def get_resume():
    """Check if a resume is uploaded."""
    from embeddings import RESUME_PATH, RESUME_EMBEDDING_PATH
    return {
        "resume_exists": RESUME_PATH.exists(),
        "embedding_exists": RESUME_EMBEDDING_PATH.exists(),
        "preview": RESUME_PATH.read_text()[:300] + "..." if RESUME_PATH.exists() else None,
    }


@app.post("/rescore", tags=["Resume"])
def rescore_all_jobs(db: Session = Depends(get_db)):
    """
    Rescore all jobs in the database against the current resume embedding.
    Useful after uploading a new resume or if scoring was skipped during scrape.
    """
    from embeddings import is_ollama_running, get_resume_embedding, score_job, build_job_text

    if not is_ollama_running():
        raise HTTPException(status_code=503, detail="Ollama is not running. Start it with: ollama serve")

    try:
        resume_embedding = get_resume_embedding()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No resume found. Upload one via POST /resume first.")

    jobs = db.query(Job).all()
    scored = 0
    errors = 0

    for job in jobs:
        try:
            job_text = build_job_text(
                job.title or "",
                job.company or "",
                job.description or "",
                job.tech_stack or "",
            )
            job.fit_score = score_job(job_text, resume_embedding)
            scored += 1
        except Exception:
            errors += 1

    db.commit()
    return {
        "message": f"Rescored {scored} jobs",
        "scored": scored,
        "errors": errors,
        "total": len(jobs),
    }


# ─── CLEANUP ────────────────────────────────────────────────────────────────────

@app.post("/jobs/cleanup", tags=["Jobs"])
def cleanup_old_found_jobs(
    days: int = Query(90, description="Delete 'found' jobs older than this many days since posting"),
    db: Session = Depends(get_db),
):
    """Remove stale 'found' jobs you never acted on, based on posted date (or scrape date as fallback)."""
    from cleanup import cleanup_stale_found_jobs
    return cleanup_stale_found_jobs(db, days=days)

@app.post("/jobs/cleanup/blacklisted", tags=["Jobs"])
def purge_blacklisted_jobs(db: Session = Depends(get_db)):
    from cleanup import remove_blacklisted_jobs
    return remove_blacklisted_jobs(db)

@app.post("/dedup", tags=["Jobs"])
def deduplicate_jobs(db: Session = Depends(get_db)):
    """
    Remove duplicate jobs from the database.
    Keeps the most recently created entry for each company+title combo.
    Also deduplicates by job_url.
    """
    all_jobs = db.query(Job).order_by(Job.created_at.desc()).all()
    seen_urls = set()
    seen_titles = set()
    to_delete = []

    for job in all_jobs:
        # Check by URL first
        if job.job_url and job.job_url in seen_urls:
            to_delete.append(job.id)
            continue
        # Check by company+title
        key = f"{job.company.lower().strip()}||{job.title.lower().strip()}"
        if key in seen_titles:
            to_delete.append(job.id)
            continue
        # Mark as seen
        if job.job_url:
            seen_urls.add(job.job_url)
        seen_titles.add(key)

    for job_id in to_delete:
        db.query(Job).filter(Job.id == job_id).delete()

    db.commit()
    return {
        "message": f"Removed {len(to_delete)} duplicate jobs",
        "deleted": len(to_delete),
        "remaining": db.query(Job).count()
    }




# ─── SCHEDULER ────────────────────────────────────────────────────────────────

@app.get("/scheduler", tags=["Scheduler"])
def scheduler_status():
    """Get scheduler status, next run time, last run results, and search configs."""
    return get_scheduler_status()


@app.post("/scheduler/run", tags=["Scheduler"])
def trigger_now(background_tasks: BackgroundTasks):
    """Trigger all scheduled searches immediately without waiting for next interval."""
    background_tasks.add_task(run_scheduled_scrapes)
    return {"message": "Scrape triggered in background"}


@app.patch("/scheduler", tags=["Scheduler"])
def update_scheduler(
    enabled: Optional[bool] = None,
    interval_hours: Optional[int] = None,
):
    """Enable/disable scheduler or change interval."""
    config = load_config()
    if enabled is not None:
        config["enabled"] = enabled
    if interval_hours is not None:
        if not 1 <= interval_hours <= 168:
            raise HTTPException(status_code=400, detail="interval_hours must be between 1 and 168")
        config["interval_hours"] = interval_hours
    save_config(config)

    # Restart scheduler with new settings
    stop_scheduler()
    start_scheduler()
    return get_scheduler_status()


@app.put("/scheduler/searches", tags=["Scheduler"])
def update_searches(searches: list[ScrapeRequest]):
    """Replace the full list of scheduled search configs."""
    config = load_config()
    config["searches"] = [s.model_dump() for s in searches]
    save_config(config)
    return {"message": f"Updated {len(searches)} search configs", "searches": config["searches"]}

# ─── HEALTH ───────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=9500, reload=True)
