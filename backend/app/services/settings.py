"""
Preferences editable from the UI, stored in the database.
Env vars (config.py) only provide the defaults.
"""
from sqlalchemy.orm import Session

from app.config import FOLLOW_UP_AFTER_DAYS, WEEKLY_GOAL
from app.models import Setting

DEFAULTS: dict[str, int] = {
    "weekly_goal": WEEKLY_GOAL,
    "follow_up_after_days": FOLLOW_UP_AFTER_DAYS,
}


def get_all(db: Session) -> dict[str, int]:
    values = dict(DEFAULTS)
    for row in db.query(Setting).filter(Setting.key.in_(DEFAULTS)).all():
        try:
            values[row.key] = int(row.value)
        except ValueError:
            pass  # ignore a corrupted value, fall back to the default
    return values


def update(db: Session, changes: dict[str, int]) -> dict[str, int]:
    for key, value in changes.items():
        if key not in DEFAULTS:
            continue
        row = db.get(Setting, key)
        if row:
            row.value = str(value)
        else:
            db.add(Setting(key=key, value=str(value)))
    db.commit()
    return get_all(db)
