from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services import resume_store

router = APIRouter(prefix="/resume", tags=["Resume"])


class ResumeText(BaseModel):
    text: str


@router.get("")
def get_resume():
    return resume_store.info()


@router.post("")
async def upload_resume(file: UploadFile = File(...)):
    """Upload a PDF, DOCX, or plain-text resume."""
    name = (file.filename or "").lower()
    if not name.endswith((".pdf", ".txt", ".md", ".docx")):
        raise HTTPException(status_code=400, detail="Upload a PDF, DOCX, TXT or MD file")
    text = resume_store.extract_text(name, await file.read())
    if not text:
        raise HTTPException(status_code=400, detail="Couldn't extract any text from that file")
    resume_store.save(text)
    return resume_store.info()


@router.put("")
def replace_resume_text(body: ResumeText):
    """Save edited resume text directly (e.g. after fixing PDF extraction glitches)."""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Resume text is empty")
    resume_store.save(body.text.strip())
    return resume_store.info()


@router.delete("")
def delete_resume():
    resume_store.delete()
    return resume_store.info()
