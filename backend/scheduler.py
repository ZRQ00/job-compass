"""
Auto-scrape scheduler.
Runs configured searches every 6 hours in the background.
Also runs a daily cleanup of stale 'found' jobs.
Search configs are stored in scheduler_config.json next to this file.
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).parent / "scheduler_config.json"

DEFAULT_CONFIG = {
    "enabled": True,
    "interval_hours": 6,
    "cleanup_enabled": True,
    "cleanup_hour": 0,
    "cleanup_minute": 5,
    "cleanup_days": 90,
    "searches": [
        {
            "search_term": "AI Engineer",
            "location": "United States",
            "remote_only": False,
            "salary_min": 95000,
            "results_wanted": 50,
            "sites": ["linkedin", "indeed"],
        },
        {
            "search_term": "Full Stack Engineer AI",
            "location": "United States",
            "remote_only": False,
            "salary_min": 95000,
            "results_wanted": 50,
            "sites": ["linkedin", "indeed"],
        },
    ],
    "last_run": None,
    "last_run_result": None,
    "last_cleanup": None,
    "last_cleanup_result": None,
}


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        CONFIG_PATH.write_text(json.dumps(DEFAULT_CONFIG, indent=2))
        return DEFAULT_CONFIG.copy()
    config = json.loads(CONFIG_PATH.read_text())
    # Backfill any keys added in later versions so old config files don't break
    for key, value in DEFAULT_CONFIG.items():
        config.setdefault(key, value)
    return config


def save_config(config: dict):
    CONFIG_PATH.write_text(json.dumps(config, indent=2))


def run_scheduled_scrapes():
    """Run all configured searches. Called by the scheduler."""
    from database import SessionLocal
    from scraper import scrape_and_store
    from schemas import ScrapeRequest

    config = load_config()
    if not config.get("enabled", True):
        logger.info("Scheduler is disabled, skipping run")
        return

    logger.info(f"Scheduled scrape starting at {datetime.utcnow().isoformat()}")

    db = SessionLocal()
    total_added = 0
    total_found = 0
    results = []

    try:
        for search in config.get("searches", []):
            try:
                req = ScrapeRequest(**search)
                result = scrape_and_store(req, db)
                total_added += result["jobs_added"]
                total_found += result["jobs_found"]
                results.append({
                    "search_term": search["search_term"],
                    **result,
                })
                logger.info(
                    f"Search '{search['search_term']}': "
                    f"found={result['jobs_found']}, added={result['jobs_added']}"
                )
            except Exception as e:
                logger.error(f"Search '{search.get('search_term')}' failed: {e}")
                results.append({
                    "search_term": search.get("search_term"),
                    "error": str(e),
                })
    finally:
        db.close()

    # Save run results to config
    config["last_run"] = datetime.utcnow().isoformat()
    config["last_run_result"] = {
        "total_found": total_found,
        "total_added": total_added,
        "searches": results,
    }
    save_config(config)

    logger.info(f"Scheduled scrape done. Total added: {total_added}")


def run_daily_cleanup():
    """Remove stale 'found' jobs. Called by the scheduler once a day."""
    from database import SessionLocal
    from cleanup import cleanup_stale_found_jobs

    config = load_config()
    if not config.get("cleanup_enabled", True):
        logger.info("Daily cleanup is disabled, skipping run")
        return

    days = config.get("cleanup_days", 90)
    logger.info(f"Daily cleanup starting at {datetime.utcnow().isoformat()} (days={days})")

    db = SessionLocal()
    try:
        result = cleanup_stale_found_jobs(db, days=days)
        logger.info(f"Daily cleanup done. Removed {result['deleted']} stale jobs.")
    except Exception as e:
        logger.error(f"Daily cleanup failed: {e}")
        result = {"error": str(e)}
    finally:
        db.close()

    config["last_cleanup"] = datetime.utcnow().isoformat()
    config["last_cleanup_result"] = result
    save_config(config)


# Global scheduler instance
_scheduler = BackgroundScheduler(timezone="UTC")


def start_scheduler():
    config = load_config()

    if config.get("enabled", True):
        hours = config.get("interval_hours", 6)
        _scheduler.add_job(
            run_scheduled_scrapes,
            trigger=IntervalTrigger(hours=hours),
            id="auto_scrape",
            name="Auto Scrape",
            replace_existing=True,
            misfire_grace_time=300,  # 5 min grace if server was down
        )
        logger.info(f"Auto-scrape job added — every {hours} hours")
    else:
        logger.info("Auto-scrape disabled in config, not scheduling")

    if config.get("cleanup_enabled", True):
        hour = config.get("cleanup_hour", 0)
        minute = config.get("cleanup_minute", 5)
        _scheduler.add_job(
            run_daily_cleanup,
            trigger=CronTrigger(hour=hour, minute=minute),
            id="daily_cleanup",
            name="Daily Cleanup",
            replace_existing=True,
            misfire_grace_time=3600,  # 1 hour grace — fine for a once-a-day job
        )
        logger.info(f"Daily cleanup job added — runs at {hour:02d}:{minute:02d} UTC")
    else:
        logger.info("Daily cleanup disabled in config, not scheduling")

    if not _scheduler.running:
        _scheduler.start()


def stop_scheduler():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def get_scheduler_status() -> dict:
    config = load_config()
    scrape_job = _scheduler.get_job("auto_scrape") if _scheduler.running else None
    cleanup_job = _scheduler.get_job("daily_cleanup") if _scheduler.running else None
    return {
        "running": _scheduler.running,
        "enabled": config.get("enabled", True),
        "interval_hours": config.get("interval_hours", 6),
        "searches": config.get("searches", []),
        "last_run": config.get("last_run"),
        "last_run_result": config.get("last_run_result"),
        "next_run": scrape_job.next_run_time.isoformat() if scrape_job and scrape_job.next_run_time else None,
        "cleanup_enabled": config.get("cleanup_enabled", True),
        "cleanup_days": config.get("cleanup_days", 90),
        "last_cleanup": config.get("last_cleanup"),
        "last_cleanup_result": config.get("last_cleanup_result"),
        "next_cleanup": cleanup_job.next_run_time.isoformat() if cleanup_job and cleanup_job.next_run_time else None,
    }