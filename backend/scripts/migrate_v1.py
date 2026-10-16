"""
Bring your data over from the old (scraper-era) Job Compass.

Reads   backend/jobtracker.db  and  backend/resume.txt   (the v1 files)
Writes  backend/data/jobcompass.db  and  backend/data/resume.txt

It migrates jobs you actually did something with: anything you added
manually, plus anything with status applied / interview / offer / rejected /
skipped. Scraped jobs still sitting in "found" are left behind. Manually added
"found" jobs come over as "applied" (with no date) since there's no "saved"
status any more.

    cd backend
    python -m scripts.migrate_v1            # preview only, writes nothing
    python -m scripts.migrate_v1 --apply    # do it

Safe to re-run: jobs already present (same company + role + link) are skipped.
The old database is only read, never modified.
"""
import argparse
import shutil
import sqlite3
import sys
from datetime import date, datetime
from pathlib import Path

from app.config import BACKEND_DIR, RESUME_PATH
from app.db import SessionLocal, init_db
from app.models import Job, JobEvent

STATUS_MAP = {
    "found": "applied",
    "applied": "applied",
    "interview": "interview",
    "offer": "offer",
    "rejected": "rejected",
    "skipped": "withdrawn",
}
ACTED_ON = {"applied", "interview", "offer", "rejected", "skipped"}


def _date(v) -> date | None:
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "")).date()
    except ValueError:
        return None


def _dt(v) -> datetime | None:
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", ""))
    except ValueError:
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--old-db", default=str(BACKEND_DIR / "jobtracker.db"))
    ap.add_argument("--apply", action="store_true", help="actually write (default is a dry run)")
    args = ap.parse_args()

    old_path = Path(args.old_db)
    if not old_path.exists():
        print(f"No old database at {old_path}. Nothing to migrate.")
        return 1

    con = sqlite3.connect(old_path)
    con.row_factory = sqlite3.Row
    rows = [dict(r) for r in con.execute("SELECT * FROM jobs ORDER BY created_at")]
    con.close()

    picked = []
    for r in rows:
        status = r.get("status") or "found"
        if status not in STATUS_MAP:  # e.g. "archived"
            continue
        if status in ACTED_ON or r.get("source") == "manual":
            picked.append(r)

    init_db()
    db = SessionLocal()
    existing = {
        (j.company.lower(), j.role.lower(), j.job_url or "") for j in db.query(Job).all()
    }

    to_add = []
    for r in picked:
        key = ((r["company"] or "").lower(), (r["title"] or "").lower(), r.get("job_url") or "")
        if key in existing:
            continue
        existing.add(key)
        status = STATUS_MAP[r.get("status") or "found"]
        created = _dt(r.get("created_at")) or datetime.utcnow()
        job = Job(
            company=r["company"] or "Unknown",
            role=r["title"] or "Unknown",
            location=r.get("location"),
            date_applied=_date(r.get("applied_date")),
            salary_min=r.get("salary_min"),
            salary_max=r.get("salary_max"),
            notes=r.get("notes"),
            status=status,
            job_description=r.get("description"),
            job_url=r.get("job_url"),
            match_score=r.get("reasoning_score"),
            match_summary=r.get("fit_reasoning"),
            matched_at=_dt(r.get("updated_at")) if r.get("reasoning_score") is not None else None,
            created_at=created,
            updated_at=_dt(r.get("updated_at")) or created,
            status_changed_at=_dt(r.get("updated_at")) or created,
        )
        job.events = [JobEvent(from_status=None, to_status=status, created_at=created)]
        to_add.append(job)

    by_status: dict[str, int] = {}
    for j in to_add:
        by_status[j.status] = by_status.get(j.status, 0) + 1

    print(f"Old database: {len(rows)} jobs")
    print(f"Selected:     {len(picked)} (manual or acted on)")
    print(f"New to add:   {len(to_add)}  {by_status}")

    old_resume = BACKEND_DIR / "resume.txt"
    copy_resume = old_resume.exists() and not RESUME_PATH.exists()
    if copy_resume:
        print(f"Resume:       will copy {old_resume.name} -> data/{RESUME_PATH.name}")

    if not args.apply:
        print("\nDry run. Re-run with --apply to write.")
        db.close()
        return 0

    db.add_all(to_add)
    db.commit()
    db.close()
    if copy_resume:
        shutil.copy2(old_resume, RESUME_PATH)
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
