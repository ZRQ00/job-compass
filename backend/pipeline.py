"""
Daily pipeline: scrape -> embed/score (handled inside scraper) -> select best N -> reason about them.
"""
from datetime import datetime
from sqlalchemy.orm import Session

from database import Job
from schemas import ScrapeRequest
from scraper import scrape_and_store
from reasoning import reason_job_fit
from embeddings import load_resume


def run_daily_pipeline(
    request: ScrapeRequest,
    db: Session,
    top_n: int = 10,
    min_embedding_score: int = 0,
) -> dict:
    """Scrape, then run the reasoning model on only the best N matches from this run."""
    run_started_at = datetime.utcnow()

    scrape_result = scrape_and_store(request, db)

    candidates = (
        db.query(Job)
        .filter(Job.created_at >= run_started_at)
        .filter(Job.status == "found")
        .filter(Job.fit_score.isnot(None))
        .filter(Job.fit_score >= min_embedding_score)
        .order_by(Job.fit_score.desc())
        .limit(top_n)
        .all()
    )

    try:
        resume_text = load_resume()
    except FileNotFoundError:
        resume_text = None

    reasoned, errors = 0, 0
    if resume_text:
        for job in candidates:
            try:
                result = reason_job_fit(resume_text, job.title, job.company, job.description or "")
                job.reasoning_score = result["score"]
                job.fit_reasoning = result["reasoning"]
                reasoned += 1
            except Exception:
                errors += 1
        db.commit()

    return {
        **scrape_result,
        "candidates_considered": len(candidates),
        "reasoned": reasoned,
        "reasoning_errors": errors,
    }