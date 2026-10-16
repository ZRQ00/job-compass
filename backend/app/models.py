from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

# The pipeline, in order. "rejected" and "withdrawn" are terminal exits.
STATUSES = ["applied", "interview", "offer", "rejected", "withdrawn"]


def utcnow() -> datetime:
    """Naive UTC timestamp (SQLite has no timezone support)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Core tracker fields
    company: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    location: Mapped[str | None] = mapped_column(String)
    date_applied: Mapped[date | None] = mapped_column(Date)
    salary_min: Mapped[int | None] = mapped_column(Integer)
    salary_max: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="applied", nullable=False, index=True)
    job_description: Mapped[str | None] = mapped_column(Text)
    job_url: Mapped[str | None] = mapped_column(String)

    # Resume match (filled in only when you run it on a job)
    match_score: Mapped[int | None] = mapped_column(Integer)
    match_summary: Mapped[str | None] = mapped_column(Text)
    match_details: Mapped[str | None] = mapped_column(Text)  # JSON: strengths / gaps / suggestions
    matched_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    status_changed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    events: Mapped[list["JobEvent"]] = relationship(
        back_populates="job", cascade="all, delete-orphan", order_by="JobEvent.created_at"
    )


class Setting(Base):
    """Small key/value store for preferences you change in the app (e.g. weekly goal)."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(String, nullable=False)


class JobEvent(Base):
    """Timeline entry: status changes are logged automatically."""

    __tablename__ = "job_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[str | None] = mapped_column(String)
    to_status: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    job: Mapped[Job] = relationship(back_populates="events")
