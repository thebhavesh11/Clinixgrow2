"""Dashboard analytics router."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
from database import get_db
from models import Lead, Message, Conversation
from schemas import DashboardResponse

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardResponse)
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    """Get dashboard analytics."""
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # Total messages today
    result = await db.execute(
        select(func.count(Message.id)).where(Message.created_at >= today_start)
    )
    total_messages_today = result.scalar() or 0

    # Total leads today
    result = await db.execute(
        select(func.count(Lead.id)).where(Lead.created_at >= today_start)
    )
    total_leads_today = result.scalar() or 0

    # Lead status breakdown (all time)
    result = await db.execute(
        select(func.count(Lead.id)).where(Lead.lead_status == "hot")
    )
    hot_leads = result.scalar() or 0

    result = await db.execute(
        select(func.count(Lead.id)).where(Lead.lead_status == "warm")
    )
    warm_leads = result.scalar() or 0

    result = await db.execute(
        select(func.count(Lead.id)).where(Lead.lead_status == "cold")
    )
    cold_leads = result.scalar() or 0

    result = await db.execute(
        select(func.count(Lead.id)).where(Lead.lead_status == "spam")
    )
    spam_leads = result.scalar() or 0

    # Active conversations (with messages in last 24h)
    yesterday = datetime.utcnow() - timedelta(hours=24)
    result = await db.execute(
        select(func.count(func.distinct(Message.conversation_id)))
        .where(Message.created_at >= yesterday)
    )
    active_conversations = result.scalar() or 0

    # Total leads
    result = await db.execute(select(func.count(Lead.id)))
    total_leads = result.scalar() or 0

    # Total conversations
    result = await db.execute(select(func.count(Conversation.id)))
    total_conversations = result.scalar() or 0

    return DashboardResponse(
        total_messages_today=total_messages_today,
        total_leads_today=total_leads_today,
        hot_leads=hot_leads,
        warm_leads=warm_leads,
        cold_leads=cold_leads,
        spam_leads=spam_leads,
        active_conversations=active_conversations,
        total_leads=total_leads,
        total_conversations=total_conversations,
    )
