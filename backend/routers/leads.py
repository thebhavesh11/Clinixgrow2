"""Leads router."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Lead
from schemas import LeadResponse
from typing import List

router = APIRouter(prefix="/api/leads", tags=["Leads"])


@router.get("", response_model=List[LeadResponse])
async def list_leads(db: AsyncSession = Depends(get_db)):
    """List all leads ordered by most recent first."""
    result = await db.execute(select(Lead).order_by(Lead.created_at.desc()))
    return result.scalars().all()


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(lead_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific lead by ID."""
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead
