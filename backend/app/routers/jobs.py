from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Job, JobEvent, utcnow
from app.schemas import (
    DuplicateCheck,
    ExtractRequest,
    ExtractResult,
    JobCreate,
    JobDetailOut,
    JobOut,
    JobUpdate,
    Status,
)
from app.services import matcher, ollama
from app.config import REASONING_MODEL

router = APIRouter(prefix="/jobs", tags=["Jobs"])


def _get(db: Session, job_id: int) -> Job:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _apply_status(job: Job, new_status: str) -> None:
    """Single place that handles a status transition (including the first one)."""
    old = job.status
    if old == new_status:
        return
    job.status = new_status
    job.status_changed_at = utcnow()
    # Moving into "applied" with no date yet? Assume today.
    if new_status == "applied" and job.date_applied is None:
        job.date_applied = date.today()
    job.events.append(JobEvent(from_status=old, to_status=new_status))


@router.get("", response_model=list[JobOut])
def list_jobs(
    status: Optional[Status] = None,
    q: Optional[str] = Query(None, description="Search company, role, location, notes"),
    db: Session = Depends(get_db),
):
    query = db.query(Job)
    if status:
        query = query.filter(Job.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(Job.company.ilike(like), Job.role.ilike(like), Job.location.ilike(like), Job.notes.ilike(like))
        )
    return query.order_by(Job.updated_at.desc()).all()


@router.post("", response_model=JobDetailOut, status_code=201)
def create_job(data: JobCreate, db: Session = Depends(get_db)):
    job = Job(**data.model_dump(exclude={"status"}), status=None)
    _apply_status(job, data.status)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/duplicates", response_model=DuplicateCheck)
def find_duplicates(company: str, role: str = "", db: Session = Depends(get_db)):
    """Jobs at the same company (and, if given, a similar role). Used to warn before adding."""
    query = db.query(Job).filter(func.lower(Job.company) == company.strip().lower())
    if role.strip():
        query = query.filter(Job.role.ilike(f"%{role.strip()}%"))
    return {"duplicates": query.limit(5).all()}


@router.post("/extract", response_model=ExtractResult)
def extract_from_description(body: ExtractRequest):
    """Read a pasted job description and pull out company, role, location, salary."""
    try:
        ollama.ensure_ready(REASONING_MODEL)
        return matcher.extract_fields(body.text)
    except ollama.OllamaError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{job_id}", response_model=JobDetailOut)
def get_job(job_id: int, db: Session = Depends(get_db)):
    return _get(db, job_id)


@router.patch("/{job_id}", response_model=JobDetailOut)
def update_job(job_id: int, update: JobUpdate, db: Session = Depends(get_db)):
    job = _get(db, job_id)
    changes = update.model_dump(exclude_unset=True)

    for key in ("company", "role"):
        if key in changes and not changes[key]:
            raise HTTPException(status_code=400, detail=f"{key} can't be empty")

    new_status = changes.pop("status", None)
    for key, value in changes.items():
        setattr(job, key, value)

    if job.salary_min is not None and job.salary_max is not None and job.salary_min > job.salary_max:
        raise HTTPException(status_code=400, detail="salary_min can't be greater than salary_max")

    # If the JD changed, the old match no longer describes this job.
    if "job_description" in changes:
        job.match_score = job.match_summary = job.match_details = job.matched_at = None

    if new_status:
        _apply_status(job, new_status)

    job.updated_at = utcnow()
    db.commit()
    db.refresh(job)
    return job


@router.delete("/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    db.delete(_get(db, job_id))
    db.commit()
    return {"deleted": job_id}
