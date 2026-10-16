import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import REASONING_MODEL
from app.db import SessionLocal, get_db
from app.models import Job, utcnow
from app.services import matcher, ollama, resume_store

router = APIRouter(prefix="/jobs/{job_id}/match", tags=["Resume match"])


@router.get("/stream")
def match_stream(job_id: int, db: Session = Depends(get_db)):
    """Run the reasoning model on one job, streaming its thinking via SSE.
    The final result is saved on the job."""
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not (job.job_description or "").strip():
        raise HTTPException(status_code=400, detail="Add a job description first; the match is based on it.")
    resume = resume_store.load()
    if not resume:
        raise HTTPException(status_code=400, detail="Upload your resume on the Resume page first.")
    try:
        ollama.ensure_ready(REASONING_MODEL)
    except ollama.OllamaError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # Copy plain values now; the request-scoped session closes before the
    # generator below runs.
    args = (resume, job.role, job.company, job.location, job.job_description)
    cancel_event = matcher.start_cancel_token(job_id)

    def events():
        db2 = SessionLocal()
        try:
            for ev in matcher.match_stream(*args, cancel_event=cancel_event):
                if ev["type"] == "done":
                    r = ev["result"]
                    j = db2.get(Job, job_id)
                    if j:
                        j.match_score = r["score"]
                        j.match_summary = r["summary"]
                        j.match_details = json.dumps(
                            {k: r[k] for k in ("strengths", "gaps", "suggestions")}
                        )
                        j.matched_at = utcnow()
                        db2.commit()
                yield f"data: {json.dumps(ev)}\n\n"
        finally:
            db2.close()
            matcher.clear_cancel_token(job_id)

    return StreamingResponse(events(), media_type="text/event-stream")


@router.post("/cancel")
def cancel_match(job_id: int):
    return {"cancelled": matcher.cancel(job_id)}


@router.delete("")
def clear_match(job_id: int, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.match_score = job.match_summary = job.match_details = job.matched_at = None
    db.commit()
    return {"cleared": job_id}
