"""
Job Compass API.

    Add jobs ──▶ Track status ──▶ Match against your resume
     /jobs        PATCH /jobs/{id}   /jobs/{id}/match/stream

Run from the backend/ folder:
    uvicorn app.main:app --reload --port 9500
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.db import init_db
from app.routers import jobs, matching, resume, settings, stats


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Job Compass API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs.router)
app.include_router(matching.router)
app.include_router(resume.router)
app.include_router(stats.router)
app.include_router(settings.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=9500, reload=True)
