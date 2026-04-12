"""Conversations and Messages router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import get_db
from models import Conversation, Message
from schemas import ConversationResponse, MessageResponse
from typing import List

router = APIRouter(prefix="/api/conversations", tags=["Conversations"])


@router.get("", response_model=List[ConversationResponse])
async def list_conversations(db: AsyncSession = Depends(get_db)):
    """List all conversations with lead info, ordered by most recent."""
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.lead))
        .order_by(Conversation.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(conversation_id: int, db: AsyncSession = Depends(get_db)):
    """Get all messages for a conversation."""
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()
    if not messages:
        # Check if conversation exists
        conv = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
        if not conv.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Conversation not found")
    return messages
