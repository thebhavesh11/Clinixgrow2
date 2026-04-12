"""Pydantic schemas for request/response validation."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ── Business ──────────────────────────────────────────────
class BusinessBase(BaseModel):
    name: str = "My Business"
    industry: str = ""
    services: str = ""
    pricing: str = ""
    faqs: str = ""
    location: str = ""
    offers: str = ""
    working_hours: str = ""


class BusinessCreate(BusinessBase):
    pass


class BusinessUpdate(BusinessBase):
    pass


class BusinessResponse(BusinessBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── AI Settings ───────────────────────────────────────────
class AISettingBase(BaseModel):
    provider: str = "openai"
    api_key: str = ""
    model: str = "gpt-4o-mini"
    temperature: float = 0.7
    max_tokens: int = 500
    system_prompt: str = ""
    scoring_prompt: str = ""
    group_replies: int = 0
    reply_delay: int = 0
    typing_indicator: int = 0
    reply_to_contacts: int = 1
    auto_handover: int = 0
    handover_after: int = 10


class AISettingCreate(AISettingBase):
    business_id: int = 1


class AISettingUpdate(AISettingBase):
    pass


class AISettingResponse(AISettingBase):
    id: int
    business_id: int
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Lead ──────────────────────────────────────────────────
class LeadResponse(BaseModel):
    id: int
    phone_number: str
    name: str
    business_id: int
    lead_score: int
    lead_status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Conversation ─────────────────────────────────────────
class ConversationResponse(BaseModel):
    id: int
    lead_id: int
    business_id: int
    created_at: datetime
    lead: Optional[LeadResponse] = None

    class Config:
        from_attributes = True


# ── Message ───────────────────────────────────────────────
class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    sender_type: str
    message_text: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Dashboard ─────────────────────────────────────────────
class DashboardResponse(BaseModel):
    total_messages_today: int = 0
    total_leads_today: int = 0
    hot_leads: int = 0
    warm_leads: int = 0
    cold_leads: int = 0
    spam_leads: int = 0
    active_conversations: int = 0
    total_leads: int = 0
    total_conversations: int = 0


# ── Business Media ────────────────────────────────────────
class BusinessMediaResponse(BaseModel):
    id: int
    business_id: int
    name: str
    description: str
    file_type: str
    original_filename: str
    created_at: datetime

    class Config:
        from_attributes = True


class BusinessMediaUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


# ── WhatsApp Webhook ─────────────────────────────────────
class WhatsAppWebhook(BaseModel):
    phone: str
    message: str
    name: Optional[str] = "Unknown"
    business_id: int = 1
    is_group: bool = False

