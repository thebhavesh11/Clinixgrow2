"""Business Knowledge Base CRUD router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Business
from schemas import BusinessCreate, BusinessUpdate, BusinessResponse

router = APIRouter(prefix="/api/business", tags=["Business"])


@router.get("", response_model=BusinessResponse)
async def get_business(db: AsyncSession = Depends(get_db)):
    """Get the primary business profile."""
    result = await db.execute(select(Business).where(Business.id == 1))
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


@router.post("", response_model=BusinessResponse)
async def create_business(data: BusinessCreate, db: AsyncSession = Depends(get_db)):
    """Create a new business profile."""
    business = Business(**data.model_dump())
    db.add(business)
    await db.flush()
    await db.refresh(business)
    return business


@router.put("", response_model=BusinessResponse)
async def update_business(data: BusinessUpdate, db: AsyncSession = Depends(get_db)):
    """Update the primary business profile."""
    result = await db.execute(select(Business).where(Business.id == 1))
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    for key, value in data.model_dump().items():
        setattr(business, key, value)
    await db.flush()
    await db.refresh(business)
    return business
