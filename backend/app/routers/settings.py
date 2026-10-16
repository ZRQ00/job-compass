from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import settings as settings_service

router = APIRouter(prefix="/settings", tags=["Settings"])


class SettingsOut(BaseModel):
    weekly_goal: int
    follow_up_after_days: int


class SettingsUpdate(BaseModel):
    weekly_goal: Optional[int] = Field(default=None, ge=1, le=200)
    follow_up_after_days: Optional[int] = Field(default=None, ge=1, le=90)


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return settings_service.get_all(db)


@router.patch("", response_model=SettingsOut)
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db)):
    return settings_service.update(db, body.model_dump(exclude_none=True))
