import json
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Status = Literal["applied", "interview", "offer", "rejected", "withdrawn"]


def _blank_to_none(v):
    if isinstance(v, str) and not v.strip():
        return None
    return v.strip() if isinstance(v, str) else v


class JobBase(BaseModel):
    company: str = Field(min_length=1)
    role: str = Field(min_length=1)
    location: Optional[str] = None
    date_applied: Optional[date] = None
    salary_min: Optional[int] = Field(default=None, ge=0)
    salary_max: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None
    status: Status = "applied"
    job_description: Optional[str] = None
    job_url: Optional[str] = None

    _clean = field_validator(
        "location", "notes", "job_description", "job_url", "date_applied", mode="before"
    )(_blank_to_none)

    @field_validator("company", "role", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def _salary_order(self):
        if self.salary_min is not None and self.salary_max is not None and self.salary_min > self.salary_max:
            raise ValueError("salary_min can't be greater than salary_max")
        return self


class JobCreate(JobBase):
    pass


class JobUpdate(BaseModel):
    """Every field optional. Only fields you actually send are changed;
    send null to clear one."""

    company: Optional[str] = Field(default=None, min_length=1)
    role: Optional[str] = Field(default=None, min_length=1)
    location: Optional[str] = None
    date_applied: Optional[date] = None
    salary_min: Optional[int] = Field(default=None, ge=0)
    salary_max: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None
    status: Optional[Status] = None
    job_description: Optional[str] = None
    job_url: Optional[str] = None

    _clean = field_validator(
        "location", "notes", "job_description", "job_url", "date_applied", mode="before"
    )(_blank_to_none)


class JobEventOut(BaseModel):
    from_status: Optional[str]
    to_status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MatchDetails(BaseModel):
    strengths: list[str] = []
    gaps: list[str] = []
    suggestions: list[str] = []


class JobOut(BaseModel):
    id: int
    company: str
    role: str
    location: Optional[str]
    date_applied: Optional[date]
    salary_min: Optional[int]
    salary_max: Optional[int]
    notes: Optional[str]
    status: str
    job_description: Optional[str]
    job_url: Optional[str]
    match_score: Optional[int]
    match_summary: Optional[str]
    match_details: Optional[MatchDetails] = None
    matched_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    status_changed_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("match_details", mode="before")
    @classmethod
    def _parse_details(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return None
        return v


class JobDetailOut(JobOut):
    events: list[JobEventOut] = []


class DuplicateCheck(BaseModel):
    duplicates: list[JobOut]


class ExtractRequest(BaseModel):
    text: str = Field(min_length=20)


class ExtractResult(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    location: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None


class FollowUp(BaseModel):
    id: int
    company: str
    role: str
    date_applied: Optional[date]
    days_waiting: int


class Stats(BaseModel):
    total: int
    by_status: dict[str, int]
    applied_this_week: int
    weekly_goal: int
    follow_up_after_days: int
    response_rate: Optional[int]  # % of submitted applications that reached interview or beyond
    follow_ups: list[FollowUp]
    weekly_activity: list[dict]  # [{week_start: date, applied: n}] last 8 weeks
