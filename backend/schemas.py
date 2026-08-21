from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ScrapeRequest(BaseModel):
    search_term: str = "AI Engineer"
    location: str = "United States"
    results_wanted: int = 50
    hours_old: int = 168  # 1 week
    remote_only: bool = True
    salary_min: int = 150000
    sites: List[str] = ["linkedin", "indeed", "glassdoor", "zip_recruiter"]

class JobCreate(BaseModel):
    title: str
    company: str
    location: Optional[str] = None
    job_type: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    salary_currency: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    tech_stack: Optional[str] = None
    job_url: Optional[str] = None
    source: Optional[str] = "manual"
    status: Optional[str] = "found"
    priority: Optional[str] = None
    notes: Optional[str] = None
    is_remote: Optional[bool] = None
    date_posted: Optional[datetime] = None
    
class JobUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    fit_score: Optional[int] = None
    applied_date: Optional[datetime] = None


class JobResponse(BaseModel):
    id: int
    title: str
    company: str
    location: Optional[str]
    job_type: Optional[str]
    salary_min: Optional[int]
    salary_max: Optional[int]
    salary_currency: Optional[str]
    description: Optional[str]
    requirements: Optional[str]
    tech_stack: Optional[str]
    job_url: Optional[str]
    source: Optional[str]
    status: str
    priority: Optional[str]
    fit_score: Optional[int]
    notes: Optional[str]
    applied_date: Optional[datetime]
    created_at: datetime
    is_remote: Optional[bool]
    date_posted: Optional[datetime]
    reasoning_score: Optional[int]
    fit_reasoning: Optional[str]

    class Config:
        from_attributes = True


class ScrapeResponse(BaseModel):
    message: str
    jobs_found: int
    jobs_added: int
    jobs_duplicate: int


class StatsResponse(BaseModel):
    total: int
    found: int
    applied: int
    interview: int
    offer: int
    rejected: int
    skipped: int
