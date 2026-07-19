"""Dashboard analytics router."""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
from database import get_db
from models import Lead, Message, Conversation, Appointment, CallLog
from schemas import DashboardResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardResponse)
async def get_dashboard(business_id: int = 1, db: AsyncSession = Depends(get_db)):
    """Get dashboard analytics scoped to a business. Returns zeroed response on error."""
    try:
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        bid = business_id

        # Total messages today (via conversations belonging to this business)
        result = await db.execute(
            select(func.count(Message.id))
            .join(Conversation)
            .where(Conversation.business_id == bid, Message.created_at >= today_start)
        )
        total_messages_today = result.scalar() or 0

        # Total leads today
        result = await db.execute(
            select(func.count(Lead.id)).where(Lead.business_id == bid, Lead.created_at >= today_start)
        )
        total_leads_today = result.scalar() or 0

        # Lead status breakdown
        result = await db.execute(
            select(func.count(Lead.id)).where(Lead.business_id == bid, Lead.lead_status == "hot")
        )
        hot_leads = result.scalar() or 0

        result = await db.execute(
            select(func.count(Lead.id)).where(Lead.business_id == bid, Lead.lead_status == "warm")
        )
        warm_leads = result.scalar() or 0

        result = await db.execute(
            select(func.count(Lead.id)).where(Lead.business_id == bid, Lead.lead_status == "cold")
        )
        cold_leads = result.scalar() or 0

        result = await db.execute(
            select(func.count(Lead.id)).where(Lead.business_id == bid, Lead.lead_status == "spam")
        )
        spam_leads = result.scalar() or 0

        # Active conversations (messages in last 24h)
        yesterday = datetime.utcnow() - timedelta(hours=24)
        result = await db.execute(
            select(func.count(func.distinct(Message.conversation_id)))
            .join(Conversation)
            .where(Conversation.business_id == bid, Message.created_at >= yesterday)
        )
        active_conversations = result.scalar() or 0

        # Total leads
        result = await db.execute(select(func.count(Lead.id)).where(Lead.business_id == bid))
        total_leads = result.scalar() or 0

        # Total conversations
        result = await db.execute(select(func.count(Conversation.id)).where(Conversation.business_id == bid))
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
            appointments_today=await _count_appointments_today(db, today_start, bid),
            upcoming_appointments=await _count_upcoming_appointments(db, bid),
            calls_today=await _count_calls_today(db, today_start, bid),
            total_call_minutes=await _total_call_minutes_today(db, today_start, bid),
        )
    except Exception as e:
        logger.error(f"[Dashboard] Error fetching analytics: {type(e).__name__}: {e}")
        return DashboardResponse()


async def _count_appointments_today(db, today_start, bid):
    today_str = today_start.strftime("%Y-%m-%d")
    result = await db.execute(
        select(func.count(Appointment.id)).where(
            Appointment.business_id == bid,
            Appointment.date == today_str,
            Appointment.status == "confirmed",
        )
    )
    return result.scalar() or 0


async def _count_upcoming_appointments(db, bid):
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    week_later = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")
    result = await db.execute(
        select(func.count(Appointment.id)).where(
            Appointment.business_id == bid,
            Appointment.date >= today_str,
            Appointment.date <= week_later,
            Appointment.status == "confirmed",
        )
    )
    return result.scalar() or 0


async def _count_calls_today(db, today_start, bid):
    result = await db.execute(
        select(func.count(CallLog.id)).where(
            CallLog.business_id == bid,
            CallLog.created_at >= today_start,
        )
    )
    return result.scalar() or 0


async def _total_call_minutes_today(db, today_start, bid):
    result = await db.execute(
        select(func.sum(CallLog.duration_seconds)).where(
            CallLog.business_id == bid,
            CallLog.created_at >= today_start,
        )
    )
    total_secs = result.scalar() or 0
    return total_secs // 60
