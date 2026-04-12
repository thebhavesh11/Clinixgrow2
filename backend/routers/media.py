"""Business media file management — upload, list, update, delete, serve."""

import os
import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import BusinessMedia
from schemas import BusinessMediaResponse, BusinessMediaUpdate
from typing import List
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/media", tags=["media"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Map extensions to file types
EXT_MAP = {
    ".jpg": "image", ".jpeg": "image", ".png": "image", ".gif": "image", ".webp": "image",
    ".pdf": "pdf",
    ".mp4": "video", ".mov": "video", ".avi": "video", ".webm": "video", ".mkv": "video",
}


@router.get("", response_model=List[BusinessMediaResponse])
async def list_media(business_id: int = 1, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BusinessMedia)
        .where(BusinessMedia.business_id == business_id)
        .order_by(BusinessMedia.created_at.desc())
    )
    return result.scalars().all()


@router.post("/upload", response_model=BusinessMediaResponse)
async def upload_media(
    file: UploadFile = File(...),
    name: str = Form(""),
    description: str = Form(""),
    business_id: int = Form(1),
    db: AsyncSession = Depends(get_db),
):
    # Validate file type
    ext = os.path.splitext(file.filename or "")[1].lower()
    file_type = EXT_MAP.get(ext)
    if not file_type:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    # Generate unique filename
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / unique_name

    # Save file to disk
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Save record
    media = BusinessMedia(
        business_id=business_id,
        name=name or os.path.splitext(file.filename or "file")[0],
        description=description,
        file_type=file_type,
        file_path=str(file_path),
        original_filename=file.filename or "file",
    )
    db.add(media)
    await db.flush()
    await db.refresh(media)
    return media


@router.put("/{media_id}", response_model=BusinessMediaResponse)
async def update_media(
    media_id: int,
    data: BusinessMediaUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BusinessMedia).where(BusinessMedia.id == media_id))
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(404, "Media not found")

    if data.name is not None:
        media.name = data.name
    if data.description is not None:
        media.description = data.description
    await db.flush()
    await db.refresh(media)
    return media


@router.delete("/{media_id}")
async def delete_media(media_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BusinessMedia).where(BusinessMedia.id == media_id))
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(404, "Media not found")

    # Delete file from disk
    try:
        if os.path.exists(media.file_path):
            os.remove(media.file_path)
    except Exception:
        pass

    await db.delete(media)
    await db.flush()
    return {"success": True}


@router.get("/file/{media_id}")
async def serve_media(media_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BusinessMedia).where(BusinessMedia.id == media_id))
    media = result.scalar_one_or_none()
    if not media or not os.path.exists(media.file_path):
        raise HTTPException(404, "File not found")

    return FileResponse(
        media.file_path,
        filename=media.original_filename,
        media_type=_get_content_type(media.file_type, media.original_filename),
    )


def _get_content_type(file_type: str, filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    content_types = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp",
        ".pdf": "application/pdf",
        ".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/x-msvideo",
        ".webm": "video/webm", ".mkv": "video/x-matroska",
    }
    return content_types.get(ext, "application/octet-stream")
