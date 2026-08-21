#!/usr/bin/env python3
"""
JobTracker Database Cleanup Script
-----------------------------------
Run this from your backend/ directory:
    python cleanup.py          # show stats only
    python cleanup.py dedup    # remove duplicates
    python cleanup.py reset    # delete ALL jobs and start fresh
    python cleanup.py no-desc  # remove jobs with no description
    python cleanup.py stale [days]  # remove 'found' jobs older than N days (default 90)
"""

import sys
import os
from datetime import datetime, timedelta
from sqlalchemy import create_engine, and_, or_
from sqlalchemy.orm import sessionmaker, Session
from database import Job, Base

DATABASE_URL = "sqlite:///./jobtracker.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()


def show_stats():
    total = db.query(Job).count()
    print(f"\n{'='*40}")
    print(f"  Total jobs in database: {total}")
    print(f"{'='*40}")

    statuses = ["found", "applied", "interview", "offer", "rejected", "skipped"]
    for s in statuses:
        count = db.query(Job).filter(Job.status == s).count()
        if count:
            print(f"  {s:<12} {count}")

    sources = db.query(Job.source).distinct().all()
    print(f"\n  Sources:")
    for (source,) in sources:
        count = db.query(Job).filter(Job.source == source).count()
        print(f"  {source:<20} {count}")

    print(f"{'='*40}\n")


def find_duplicates():
    all_jobs = db.query(Job).order_by(Job.created_at.desc()).all()
    seen_urls = {}
    seen_titles = {}
    duplicates = []

    for job in all_jobs:
        is_dup = False

        if job.job_url:
            if job.job_url in seen_urls:
                duplicates.append((job.id, job.company, job.title, "duplicate URL"))
                is_dup = True
            else:
                seen_urls[job.job_url] = job.id

        if not is_dup:
            key = f"{job.company.lower().strip()}||{job.title.lower().strip()}"
            if key in seen_titles:
                duplicates.append((job.id, job.company, job.title, "duplicate title+company"))
                is_dup = True
            else:
                seen_titles[key] = job.id

    return duplicates


def dedup():
    print("\nScanning for duplicates...")
    duplicates = find_duplicates()

    if not duplicates:
        print("No duplicates found. Database is clean.")
        return

    print(f"\nFound {len(duplicates)} duplicates:\n")
    for job_id, company, title, reason in duplicates[:20]:
        print(f"  ID {job_id:<5} {company:<25} {title[:35]:<35} ({reason})")

    if len(duplicates) > 20:
        print(f"  ... and {len(duplicates) - 20} more")

    print(f"\nDelete {len(duplicates)} duplicates? (y/n): ", end="")
    confirm = input().strip().lower()

    if confirm != "y":
        print("Cancelled.")
        return

    for job_id, _, _, _ in duplicates:
        db.query(Job).filter(Job.id == job_id).delete()

    db.commit()
    remaining = db.query(Job).count()
    print(f"\nDone. Removed {len(duplicates)} duplicates. {remaining} jobs remaining.")


def reset():
    total = db.query(Job).count()
    print(f"\nThis will DELETE ALL {total} jobs from the database.")
    print("This cannot be undone.")
    print(f"\nType 'yes' to confirm: ", end="")
    confirm = input().strip().lower()

    if confirm != "yes":
        print("Cancelled.")
        return

    db.query(Job).delete()
    db.commit()
    print(f"\nDone. All {total} jobs deleted. Database is empty.")


def remove_no_description():
    """Remove jobs that have no description (likely bad scrape results)."""
    no_desc = db.query(Job).filter(
        (Job.description == None) |
        (Job.description == "") |
        (Job.description == "None")
    ).all()

    if not no_desc:
        print("No jobs without descriptions found.")
        return

    print(f"\nFound {len(no_desc)} jobs with no description:")
    for job in no_desc[:10]:
        print(f"  ID {job.id:<5} {job.company:<25} {job.title[:40]}")
    if len(no_desc) > 10:
        print(f"  ... and {len(no_desc) - 10} more")

    print(f"\nDelete these {len(no_desc)} jobs? (y/n): ", end="")
    confirm = input().strip().lower()

    if confirm != "y":
        print("Cancelled.")
        return

    for job in no_desc:
        db.delete(job)
    db.commit()
    print(f"\nDone. Removed {len(no_desc)} jobs with no description.")


def cleanup_stale_found_jobs(session: Session, days: int = 90) -> dict:
    """
    Delete jobs still in 'found' status whose posted date is older than `days`.
    Falls back to created_at when date_posted is missing — a job with no posted
    date that was scraped that long ago is just as stale.

    This is the reusable core used by both the CLI command below and by the
    API/scheduler — it takes a session as a parameter instead of relying on
    this module's own global `db`, so it works fine when imported elsewhere.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)
    query = session.query(Job).filter(
        Job.status == "found",
        or_(
            Job.date_posted < cutoff,
            and_(Job.date_posted.is_(None), Job.created_at < cutoff),
        ),
    )
    count = query.count()
    query.delete(synchronize_session=False)
    session.commit()
    return {"deleted": count, "cutoff": cutoff.isoformat(), "days": days}

def remove_blacklisted_jobs(session: Session) -> dict:
    """Delete any existing jobs from blacklisted companies."""
    from blacklist import load_blacklist
    terms = [t.lower() for t in load_blacklist()]
    if not terms:
        return {"deleted": 0}

    all_jobs = session.query(Job).all()
    to_delete = [j.id for j in all_jobs if j.company and any(t in j.company.lower() for t in terms)]
    if to_delete:
        session.query(Job).filter(Job.id.in_(to_delete)).delete(synchronize_session=False)
        session.commit()
    return {"deleted": len(to_delete)}

def stale(days: int = 90):
    """CLI wrapper: preview + confirm before deleting stale 'found' jobs."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    candidates = db.query(Job).filter(
        Job.status == "found",
        or_(
            Job.date_posted < cutoff,
            and_(Job.date_posted.is_(None), Job.created_at < cutoff),
        ),
    ).all()

    if not candidates:
        print(f"No 'found' jobs older than {days} days. Nothing to clean up.")
        return

    print(f"\nFound {len(candidates)} 'found' jobs older than {days} days:")
    for job in candidates[:10]:
        posted = job.date_posted.date() if job.date_posted else "unknown (using scrape date)"
        print(f"  ID {job.id:<5} {job.company:<25} {job.title[:35]:<35} (posted {posted})")
    if len(candidates) > 10:
        print(f"  ... and {len(candidates) - 10} more")

    print(f"\nDelete these {len(candidates)} jobs? (y/n): ", end="")
    confirm = input().strip().lower()
    if confirm != "y":
        print("Cancelled.")
        return

    result = cleanup_stale_found_jobs(db, days=days)
    print(f"\nDone. Removed {result['deleted']} stale jobs.")


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "stats"

    show_stats()

    if command == "dedup":
        dedup()
        show_stats()
    elif command == "reset":
        reset()
        show_stats()
    elif command == "no-desc":
        remove_no_description()
        show_stats()
    elif command == "stale":
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 90
        stale(days)
        show_stats()
    elif command == "stats":
        pass  # already printed above
    else:
        print("Commands:")
        print("  python cleanup.py          - show stats")
        print("  python cleanup.py dedup    - remove duplicate jobs")
        print("  python cleanup.py reset    - delete ALL jobs")
        print("  python cleanup.py no-desc  - remove jobs with no description")
        print("  python cleanup.py stale [days]  - remove 'found' jobs older than N days (default 90)")