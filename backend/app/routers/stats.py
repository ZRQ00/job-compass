import io
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload

from app.config import REASONING_MODEL
from app.db import get_db
from app.models import STATUSES, Job
from app.schemas import Stats
from app.services import exporter, ollama
from app.services import settings as settings_service

router = APIRouter(tags=["Stats & export"])


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


@router.get("/stats", response_model=Stats)
def stats(db: Session = Depends(get_db)):
    jobs = db.query(Job).options(selectinload(Job.events)).all()
    prefs = settings_service.get_all(db)
    today = date.today()
    this_week = _week_start(today)

    by_status = {s: 0 for s in STATUSES}
    for j in jobs:
        by_status[j.status] = by_status.get(j.status, 0) + 1

    # Response rate: of everything you actually submitted, how much got a
    # human response (interview or offer at any point)?
    submitted = [j for j in jobs if j.date_applied or any(e.to_status == "applied" for e in j.events)]
    responded = [
        j for j in submitted
        if j.status in ("interview", "offer") or any(e.to_status in ("interview", "offer") for e in j.events)
    ]
    response_rate = round(100 * len(responded) / len(submitted)) if submitted else None

    follow_ups = []
    for j in jobs:
        if j.status != "applied":
            continue
        since = j.date_applied or j.status_changed_at.date()
        waiting = (today - since).days
        if waiting >= prefs["follow_up_after_days"]:
            follow_ups.append(
                {"id": j.id, "company": j.company, "role": j.role, "date_applied": j.date_applied, "days_waiting": waiting}
            )
    follow_ups.sort(key=lambda f: -f["days_waiting"])

    weeks = [this_week - timedelta(weeks=i) for i in range(7, -1, -1)]
    counts = {w: 0 for w in weeks}
    for j in jobs:
        if j.date_applied:
            w = _week_start(j.date_applied)
            if w in counts:
                counts[w] += 1

    return Stats(
        total=len(jobs),
        by_status=by_status,
        applied_this_week=counts[this_week],
        weekly_goal=prefs["weekly_goal"],
        follow_up_after_days=prefs["follow_up_after_days"],
        response_rate=response_rate,
        follow_ups=follow_ups,
        weekly_activity=[{"week_start": w.isoformat(), "applied": counts[w]} for w in weeks],
    )


@router.get("/export/csv")
def export_csv(db: Session = Depends(get_db)):
    jobs = db.query(Job).order_by(Job.created_at.desc()).all()
    return StreamingResponse(
        io.StringIO(exporter.to_csv(jobs)),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=job_compass_{datetime.now():%Y%m%d}.csv"},
    )


@router.get("/export/xlsx")
def export_xlsx(db: Session = Depends(get_db)):
    jobs = db.query(Job).order_by(Job.created_at.desc()).all()
    return StreamingResponse(
        io.BytesIO(exporter.to_xlsx(jobs)),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=job_compass_{datetime.now():%Y%m%d}.xlsx"},
    )


@router.get("/health")
def health():
    return {"status": "ok", "ai": ollama.status(REASONING_MODEL)}
