"""SQLAlchemy ORM models for SmartFlow."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class Business(Base):
    __tablename__ = "businesses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, default="My Business")
    industry = Column(String(100), default="")
    services = Column(Text, default="")
    pricing = Column(Text, default="")
    faqs = Column(Text, default="")
    location = Column(String(255), default="")
    offers = Column(Text, default="")
    working_hours = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    leads = relationship("Lead", back_populates="business")
    conversations = relationship("Conversation", back_populates="business")
    ai_setting = relationship("AISetting", back_populates="business", uselist=False)


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(20), nullable=False)
    name = Column(String(255), default="Unknown")
    business_id = Column(Integer, ForeignKey("businesses.id"), default=1)
    lead_score = Column(Integer, default=0)
    lead_status = Column(String(20), default="new")  # new, hot, warm, cold, spam
    created_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business", back_populates="leads")
    conversations = relationship("Conversation", back_populates="lead")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False)
    business_id = Column(Integer, ForeignKey("businesses.id"), default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="conversations")
    business = relationship("Business", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    sender_type = Column(String(10), nullable=False)  # 'customer' or 'ai'
    message_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


class AISetting(Base):
    __tablename__ = "ai_settings"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), unique=True, default=1)
    provider = Column(String(50), default="openai")  # openai, gemini, openrouter
    api_key = Column(String(500), default="")
    model = Column(String(100), default="gpt-4o-mini")
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, default=500)
    system_prompt = Column(Text, default="")
    scoring_prompt = Column(Text, default="")
    group_replies = Column(Integer, default=0)  # 0=off, 1=on
    reply_delay = Column(Integer, default=0)  # seconds to wait before replying
    typing_indicator = Column(Integer, default=0)  # 0=off, 1=show typing during delay
    reply_to_contacts = Column(Integer, default=1)  # 1=reply to all, 0=only new/unsaved numbers
    auto_handover = Column(Integer, default=0)  # 0=off, 1=on
    handover_after = Column(Integer, default=10)  # number of AI replies before handover
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    business = relationship("Business", back_populates="ai_setting")


class BusinessMedia(Base):
    __tablename__ = "business_media"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), default=1)
    name = Column(String(255), nullable=False)  # user-defined label e.g. "Price List"
    description = Column(Text, default="")  # when/how to use this media
    file_type = Column(String(20), nullable=False)  # image, pdf, video
    file_path = Column(String(500), nullable=False)  # path on disk
    original_filename = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business")

