from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./jobtracker.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Job(Base):
    __tablename__ = "jobs"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    company = Column(String, nullable=False)
    location = Column(String)
    job_type = Column(String)
    salary_min = Column(Integer)
    salary_max = Column(Integer)
    salary_currency = Column(String, default="USD")
    description = Column(Text)
    requirements = Column(Text)
    tech_stack = Column(Text)
    job_url = Column(String)
    source = Column(String)  # linkedin, indeed, etc
    status = Column(String, default="found")  # found, applied, interview, offer, rejected, skipped
    priority = Column(String)  # 1-apply, 2-reach, 3-skip
    fit_score = Column(Integer)  # 0-100, embedding-based semantic match
    reasoning_score = Column(Integer)  # 0-100, LLM-assessed match
    fit_reasoning = Column(Text)  # the LLM's explanation behind reasoning_score
    notes = Column(Text)
    applied_date = Column(DateTime)
    date_posted = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_remote = Column(Boolean, default=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)
