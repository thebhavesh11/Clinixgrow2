"""Voice Agent router — Vapi.ai integration, webhook handling, call management."""

import logging
import httpx
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from database import get_db
from models import VoiceSettings, CallLog, Lead, Business, Appointment, WorkingHours
from schemas import (
    VoiceSettingsResponse, VoiceSettingsUpdate,
    CallLogResponse, OutboundCallRequest,
)
from typing import List, Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["Voice Agent"])

VAPI_BASE = "https://api.vapi.ai"


# ══════════════════════════════════════════════════════════════════════
#  VOICE TOOLS — Functions the AI can call during voice calls
# ══════════════════════════════════════════════════════════════════════

def _get_voice_tools(can_book: bool = True) -> list:
    """Return Vapi tool definitions based on enabled features."""
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_business_info",
                "description": "Get business information. Use this when customer asks about services, pricing, working hours, location, offers, or any general business question.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "What info the customer wants. One of: services, pricing, hours, location, offers, faqs, all",
                        }
                    },
                    "required": ["query"],
                },
            },
        },
    ]

    if can_book:
        tools.extend([
            {
                "type": "function",
                "function": {
                    "name": "check_available_slots",
                    "description": "Check available appointment slots for a specific date. Call this BEFORE booking to show available times.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date": {
                                "type": "string",
                                "description": "Date in YYYY-MM-DD format. If customer says 'tomorrow', 'next Monday', etc., convert to actual date.",
                            }
                        },
                        "required": ["date"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "book_appointment",
                    "description": "Book an appointment for the customer. Only call this AFTER confirming the date and time with the customer.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date": {"type": "string", "description": "Date in YYYY-MM-DD format"},
                            "time": {"type": "string", "description": "Time in HH:MM format (24-hour)"},
                            "title": {"type": "string", "description": "Appointment reason/title"},
                        },
                        "required": ["date", "time"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "check_my_appointments",
                    "description": "Check customer's existing upcoming appointments.",
                    "parameters": {"type": "object", "properties": {}},
                },
            },
        ])

    return tools


# ══════════════════════════════════════════════════════════════════════
#  SETTINGS
# ══════════════════════════════════════════════════════════════════════

@router.get("/settings", response_model=VoiceSettingsResponse)
async def get_voice_settings(business_id: int = 1, db: AsyncSession = Depends(get_db)):
    """Get voice agent settings."""
    result = await db.execute(
        select(VoiceSettings).where(VoiceSettings.business_id == business_id)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = VoiceSettings(business_id=business_id, webhook_secret=secrets.token_hex(16))
        db.add(settings)
        await db.flush()
        await db.refresh(settings)
    return settings


@router.put("/settings", response_model=VoiceSettingsResponse)
async def update_voice_settings(
    data: VoiceSettingsUpdate,
    business_id: int = 1,
    db: AsyncSession = Depends(get_db),
):
    """Update voice agent settings."""
    result = await db.execute(
        select(VoiceSettings).where(VoiceSettings.business_id == business_id)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = VoiceSettings(business_id=business_id, webhook_secret=secrets.token_hex(16))
        db.add(settings)
        await db.flush()

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)

    await db.flush()
    await db.refresh(settings)
    logger.info(f"[Voice] Settings updated for business {business_id}")
    return settings


@router.post("/test")
async def test_vapi_connection(business_id: int = 1, db: AsyncSession = Depends(get_db)):
    """Test Vapi API key by listing assistants."""
    result = await db.execute(
        select(VoiceSettings).where(VoiceSettings.business_id == business_id)
    )
    settings = result.scalar_one_or_none()
    if not settings or not settings.vapi_api_key:
        raise HTTPException(400, "Vapi API key not configured")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{VAPI_BASE}/assistant",
                headers={"Authorization": f"Bearer {settings.vapi_api_key}"},
            )
            if r.status_code == 200:
                assistants = r.json()
                return {"success": True, "message": f"Connected! Found {len(assistants)} assistant(s)", "assistants": len(assistants)}
            else:
                return {"success": False, "message": f"API error: {r.status_code} - {r.text[:200]}"}
    except Exception as e:
        return {"success": False, "message": f"Connection failed: {type(e).__name__}: {e}"}


# ══════════════════════════════════════════════════════════════════════
#  VAPI ASSISTANT MANAGEMENT
# ══════════════════════════════════════════════════════════════════════

async def _build_voice_system_prompt(db: AsyncSession, business_id: int) -> str:
    """Build system prompt for voice assistant with business context."""
    result = await db.execute(select(Business).where(Business.id == business_id))
    business = result.scalar_one_or_none()

    prompt_parts = []

    # Get custom system prompt from voice settings
    vs_result = await db.execute(select(VoiceSettings).where(VoiceSettings.business_id == business_id))
    vs = vs_result.scalar_one_or_none()
    if vs and vs.system_prompt:
        prompt_parts.append(vs.system_prompt)

    # Add business context
    if business:
        prompt_parts.append("\n--- Business Information ---")
        if business.name:
            prompt_parts.append(f"Business Name: {business.name}")
        if business.industry:
            prompt_parts.append(f"Industry: {business.industry}")
        if business.services:
            prompt_parts.append(f"Services: {business.services}")
        if business.pricing:
            prompt_parts.append(f"Pricing: {business.pricing}")
        if business.location:
            prompt_parts.append(f"Location: {business.location}")
        if business.working_hours:
            prompt_parts.append(f"Working Hours: {business.working_hours}")
        if business.offers:
            prompt_parts.append(f"Current Offers: {business.offers}")
        if business.faqs:
            prompt_parts.append(f"FAQs: {business.faqs}")

    today = datetime.utcnow()
    prompt_parts.append(f"\nToday's date is {today.strftime('%Y-%m-%d')} ({['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][today.weekday()]}).")

    return "\n".join(prompt_parts)


@router.post("/create-assistant")
async def create_vapi_assistant(business_id: int = 1, db: AsyncSession = Depends(get_db)):
    """Create a new Vapi assistant with tools and system prompt."""
    result = await db.execute(
        select(VoiceSettings).where(VoiceSettings.business_id == business_id)
    )
    settings = result.scalar_one_or_none()
    if not settings or not settings.vapi_api_key:
        raise HTTPException(400, "Vapi API key not configured")

    system_prompt = await _build_voice_system_prompt(db, business_id)
    tools = _get_voice_tools(can_book=bool(settings.can_book_appointments))

    assistant_config = {
        "name": settings.agent_name or "AI Assistant",
        "firstMessage": settings.first_message or "Hello! How can I help you today?",
        "model": {
            "provider": "openai",
            "model": "gpt-4o",
            "messages": [{"role": "system", "content": system_prompt}],
            "tools": tools,
        },
        "voice": {
            "provider": settings.voice_provider or "11labs",
        },
        "transcriber": {
            "provider": "deepgram",
            "language": settings.language or "hi-IN",
        },
        "serverUrl": "",  # User sets this manually or via ngrok
    }

    # Add voice ID if specified
    if settings.voice_id:
        assistant_config["voice"]["voiceId"] = settings.voice_id

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{VAPI_BASE}/assistant",
                headers={
                    "Authorization": f"Bearer {settings.vapi_api_key}",
                    "Content-Type": "application/json",
                },
                json=assistant_config,
            )

            if r.status_code in (200, 201):
                data = r.json()
                settings.vapi_assistant_id = data.get("id", "")
                await db.flush()
                logger.info(f"[Voice] Created Vapi assistant: {settings.vapi_assistant_id}")
                return {"success": True, "assistant_id": settings.vapi_assistant_id, "message": "Assistant created successfully!"}
            else:
                logger.error(f"[Voice] Vapi create failed: {r.status_code} {r.text[:300]}")
                return {"success": False, "message": f"Vapi error ({r.status_code}): {r.text[:200]}"}
    except Exception as e:
        logger.error(f"[Voice] Create assistant error: {type(e).__name__}: {e}")
        return {"success": False, "message": f"Error: {type(e).__name__}: {e}"}


@router.put("/sync-assistant")
async def sync_vapi_assistant(business_id: int = 1, db: AsyncSession = Depends(get_db)):
    """Update existing Vapi assistant with latest system prompt and tools."""
    result = await db.execute(
        select(VoiceSettings).where(VoiceSettings.business_id == business_id)
    )
    settings = result.scalar_one_or_none()
    if not settings or not settings.vapi_api_key or not settings.vapi_assistant_id:
        raise HTTPException(400, "Vapi not configured or assistant not created")

    system_prompt = await _build_voice_system_prompt(db, business_id)
    tools = _get_voice_tools(can_book=bool(settings.can_book_appointments))

    update_config = {
        "name": settings.agent_name or "AI Assistant",
        "firstMessage": settings.first_message or "Hello! How can I help you today?",
        "model": {
            "provider": "openai",
            "model": "gpt-4o",
            "messages": [{"role": "system", "content": system_prompt}],
            "tools": tools,
        },
        "transcriber": {
            "provider": "deepgram",
            "language": settings.language or "hi-IN",
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.patch(
                f"{VAPI_BASE}/assistant/{settings.vapi_assistant_id}",
                headers={
                    "Authorization": f"Bearer {settings.vapi_api_key}",
                    "Content-Type": "application/json",
                },
                json=update_config,
            )
            if r.status_code == 200:
                logger.info(f"[Voice] Synced Vapi assistant {settings.vapi_assistant_id}")
                return {"success": True, "message": "Assistant synced successfully!"}
            else:
                return {"success": False, "message": f"Vapi error ({r.status_code}): {r.text[:200]}"}
    except Exception as e:
        return {"success": False, "message": f"Error: {type(e).__name__}: {e}"}


# ══════════════════════════════════════════════════════════════════════
#  WEBHOOK — Vapi sends events here
# ══════════════════════════════════════════════════════════════════════

@router.post("/webhook")
async def vapi_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle all Vapi webhook events — tool-calls, status-update, end-of-call-report."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    message = body.get("message", {})
    msg_type = message.get("type", "")
    call = message.get("call", body.get("call", {}))
    call_id = call.get("id", "")

    # Resolve business_id from assistant_id in the call
    bid = await _resolve_business_id(call, db)

    logger.info(f"[Voice Webhook] Received: type={msg_type} call_id={call_id} business_id={bid}")

    # ── Tool Calls ──
    if msg_type == "tool-calls":
        return await _handle_tool_calls(message, call, db, bid)

    # ── Status Update ──
    elif msg_type == "status-update":
        return await _handle_status_update(message, call, db, bid)

    # ── End of Call Report ──
    elif msg_type == "end-of-call-report":
        return await _handle_end_of_call(message, call, body, db, bid)

    # ── Assistant Request (dynamic config) ──
    elif msg_type == "assistant-request":
        return await _handle_assistant_request(call, db)

    return {"ok": True}


async def _resolve_business_id(call: dict, db: AsyncSession) -> int:
    """Resolve business_id from assistant_id in the Vapi call object."""
    assistant_id = call.get("assistantId", "")
    if assistant_id:
        result = await db.execute(
            select(VoiceSettings).where(VoiceSettings.vapi_assistant_id == assistant_id)
        )
        vs = result.scalar_one_or_none()
        if vs:
            return vs.business_id
    # Fallback: check if there's only one business
    result = await db.execute(select(VoiceSettings).limit(1))
    vs = result.scalar_one_or_none()
    return vs.business_id if vs else 1


async def _handle_tool_calls(message: dict, call: dict, db: AsyncSession, bid: int = 1):
    """Execute tool calls from Vapi and return results."""
    tool_calls = message.get("toolCallList", message.get("toolCalls", []))
    call_id = call.get("id", "")
    customer_phone = call.get("customer", {}).get("number", "")

    results = []
    for tc in tool_calls:
        tool_call_id = tc.get("id", "")
        func = tc.get("function", {})
        func_name = func.get("name", "")
        params = func.get("arguments", {})

        # Parse params if string
        if isinstance(params, str):
            import json
            try:
                params = json.loads(params)
            except:
                params = {}

        logger.info(f"[Voice Webhook] Tool call: {func_name}({params}) for {customer_phone}")

        result = ""
        try:
            if func_name == "check_available_slots":
                result = await _tool_check_slots(params, db, bid)
            elif func_name == "book_appointment":
                result = await _tool_book_appointment(params, customer_phone, call_id, db, bid)
            elif func_name == "get_business_info":
                result = await _tool_get_business_info(params, db, bid)
            elif func_name == "check_my_appointments":
                result = await _tool_check_my_appointments(customer_phone, db, bid)
            else:
                result = f"Unknown function: {func_name}"
        except Exception as e:
            logger.error(f"[Voice Webhook] Tool error: {type(e).__name__}: {e}")
            result = f"Error executing {func_name}: {str(e)}"

        results.append({"toolCallId": tool_call_id, "result": result})

    return {"results": results}


async def _tool_check_slots(params: dict, db: AsyncSession, bid: int = 1) -> str:
    """Check available appointment slots for a date."""
    date = params.get("date", "")
    if not date:
        return "Please provide a date. For example, 2026-06-15."

    try:
        target = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        return f"Invalid date format: {date}. Please use YYYY-MM-DD format."

    day_of_week = target.weekday()
    wh_result = await db.execute(
        select(WorkingHours).where(WorkingHours.business_id == bid, WorkingHours.day_of_week == day_of_week)
    )
    wh = wh_result.scalar_one_or_none()

    if not wh or not wh.is_open:
        day_name = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][day_of_week]
        return f"Sorry, we are closed on {day_name}. Please try another day."

    from routers.appointments import _generate_slots
    all_slots = _generate_slots(wh.start_time, wh.end_time, wh.slot_duration, wh.break_start or "", wh.break_end or "")

    # Get booked appointments
    booked_result = await db.execute(
        select(Appointment).where(Appointment.business_id == bid, Appointment.date == date, Appointment.status == "confirmed")
    )
    booked = booked_result.scalars().all()
    booked_times = {(a.start_time, a.end_time) for a in booked}

    available = []
    for slot in all_slots:
        is_booked = any(not (slot["end_time"] <= bs or slot["time"] >= be) for bs, be in booked_times)
        if not is_booked:
            available.append(slot["time"])

    if not available:
        return f"Sorry, all slots are fully booked on {date}. Please try another day."

    day_name = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][day_of_week]
    slot_list = ", ".join(available[:12])
    extra = f" and {len(available)-12} more" if len(available) > 12 else ""
    return f"Available slots on {date} ({day_name}): {slot_list}{extra}. Each slot is {wh.slot_duration} minutes."


async def _tool_book_appointment(params: dict, customer_phone: str, call_id: str, db: AsyncSession, bid: int = 1) -> str:
    """Book an appointment for the caller."""
    date = params.get("date", "")
    time = params.get("time", "")
    title = params.get("title", "Appointment")

    if not date or not time:
        return "I need both a date and time to book. Please provide them."

    # Get/create lead
    lead = None
    if customer_phone:
        clean_phone = customer_phone.lstrip("+")
        lead_result = await db.execute(select(Lead).where(Lead.phone_number == clean_phone))
        lead = lead_result.scalar_one_or_none()
        if not lead:
            # Try with + prefix
            lead_result = await db.execute(select(Lead).where(Lead.phone_number == customer_phone))
            lead = lead_result.scalar_one_or_none()

    # Calculate end time
    try:
        target = datetime.strptime(date, "%Y-%m-%d")
        wh_result = await db.execute(
            select(WorkingHours).where(WorkingHours.business_id == bid, WorkingHours.day_of_week == target.weekday())
        )
        wh = wh_result.scalar_one_or_none()
        duration = wh.slot_duration if wh else 30
        st = datetime.strptime(time, "%H:%M")
        end_time = (st + timedelta(minutes=duration)).strftime("%H:%M")
    except ValueError:
        return f"Invalid date/time format. Use YYYY-MM-DD for date and HH:MM for time."

    # Check conflicts
    conflict_result = await db.execute(
        select(Appointment).where(
            Appointment.business_id == bid, Appointment.date == date, Appointment.status == "confirmed"
        )
    )
    for c in conflict_result.scalars().all():
        if not (end_time <= c.start_time or time >= c.end_time):
            return f"Sorry, that slot is already booked. The appointment from {c.start_time} to {c.end_time} conflicts. Please choose another time."

    # Create appointment
    appt = Appointment(
        business_id=bid,
        lead_id=lead.id if lead else None,
        title=title,
        date=date,
        start_time=time,
        end_time=end_time,
        status="confirmed",
        booked_by="ai",
    )
    db.add(appt)
    await db.flush()

    # Update call log appointment count
    if call_id:
        cl_result = await db.execute(select(CallLog).where(CallLog.vapi_call_id == call_id))
        cl = cl_result.scalar_one_or_none()
        if cl:
            cl.appointments_booked = (cl.appointments_booked or 0) + 1
            await db.flush()

    logger.info(f"[Voice] Booked appointment via call: {date} {time}-{end_time} for {customer_phone}")
    day_name = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][target.weekday()]
    return f"Appointment booked successfully! Date: {date} ({day_name}), Time: {time} to {end_time}. The customer will receive a reminder before the appointment."


async def _tool_get_business_info(params: dict, db: AsyncSession, bid: int = 1) -> str:
    """Get business info based on query type."""
    query = params.get("query", "all").lower()
    result = await db.execute(select(Business).where(Business.id == bid))
    biz = result.scalar_one_or_none()
    if not biz:
        return "Business information is not configured yet."

    info_parts = []
    if query in ("services", "all"):
        info_parts.append(f"Services: {biz.services or 'Not specified'}")
    if query in ("pricing", "all"):
        info_parts.append(f"Pricing: {biz.pricing or 'Not specified'}")
    if query in ("hours", "working_hours", "all"):
        info_parts.append(f"Working Hours: {biz.working_hours or 'Not specified'}")
    if query in ("location", "address", "all"):
        info_parts.append(f"Location: {biz.location or 'Not specified'}")
    if query in ("offers", "deals", "all"):
        info_parts.append(f"Current Offers: {biz.offers or 'No current offers'}")
    if query in ("faqs", "all"):
        info_parts.append(f"FAQs: {biz.faqs or 'None'}")

    if not info_parts:
        # Fallback: return everything
        info_parts = [
            f"Business: {biz.name}",
            f"Services: {biz.services or 'Not specified'}",
            f"Pricing: {biz.pricing or 'Not specified'}",
            f"Location: {biz.location or 'Not specified'}",
        ]

    return "\n".join(info_parts)


async def _tool_check_my_appointments(customer_phone: str, db: AsyncSession, bid: int = 1) -> str:
    """Check caller's upcoming appointments."""
    if not customer_phone:
        return "I couldn't identify your phone number to look up appointments."

    clean_phone = customer_phone.lstrip("+")
    lead_result = await db.execute(select(Lead).where(
        (Lead.phone_number == clean_phone) | (Lead.phone_number == customer_phone)
    ))
    lead = lead_result.scalar_one_or_none()

    if not lead:
        return "You don't have any appointments with us yet. Would you like to book one?"

    today = datetime.utcnow().strftime("%Y-%m-%d")
    appt_result = await db.execute(
        select(Appointment).where(
            Appointment.lead_id == lead.id,
            Appointment.date >= today,
            Appointment.status == "confirmed",
        ).order_by(Appointment.date, Appointment.start_time)
    )
    appts = appt_result.scalars().all()

    if not appts:
        return "You don't have any upcoming appointments. Would you like to book one?"

    lines = [f"You have {len(appts)} upcoming appointment(s):"]
    for a in appts[:5]:
        lines.append(f"- {a.date} at {a.start_time} to {a.end_time} ({a.title})")
    return "\n".join(lines)


# ── Status Update Handler ──
async def _handle_status_update(message: dict, call: dict, db: AsyncSession, bid: int = 1):
    """Handle call status updates (in-progress, ended, etc.)."""
    status_obj = message.get("status", "")
    # Vapi can send status as string or in a nested object
    if isinstance(status_obj, dict):
        call_status = status_obj.get("status", "")
    else:
        call_status = str(status_obj)

    call_id = call.get("id", "")
    customer = call.get("customer", {})
    customer_phone = customer.get("number", "")

    if not call_id:
        return {"ok": True}

    # Find or create call log
    result = await db.execute(select(CallLog).where(CallLog.vapi_call_id == call_id))
    cl = result.scalar_one_or_none()

    if not cl:
        # Try to find/link lead
        lead_id = None
        if customer_phone:
            clean = customer_phone.lstrip("+")
            lr = await db.execute(select(Lead).where(
                (Lead.phone_number == clean) | (Lead.phone_number == customer_phone)
            ))
            lead = lr.scalar_one_or_none()
            if lead:
                lead_id = lead.id

        cl = CallLog(
            business_id=bid,
            lead_id=lead_id,
            vapi_call_id=call_id,
            phone_number=customer_phone,
            direction=call.get("type", "inbound"),
            status=call_status or "queued",
        )
        db.add(cl)
        await db.flush()
        logger.info(f"[Voice] Created call log: {call_id} phone={customer_phone} status={call_status}")
    else:
        cl.status = call_status or cl.status
        await db.flush()
        logger.info(f"[Voice] Updated call status: {call_id} → {call_status}")

    return {"ok": True}


# ── End of Call Report Handler ──
async def _handle_end_of_call(message: dict, call: dict, body: dict, db: AsyncSession, bid: int = 1):
    """Handle end-of-call report — save transcript, duration, cost, recording."""
    call_id = call.get("id", "")
    if not call_id:
        return {"ok": True}

    result = await db.execute(select(CallLog).where(CallLog.vapi_call_id == call_id))
    cl = result.scalar_one_or_none()

    if not cl:
        # Create if somehow missed
        cl = CallLog(business_id=bid, vapi_call_id=call_id, phone_number=call.get("customer", {}).get("number", ""))
        db.add(cl)
        await db.flush()

    # Update with report data
    cl.status = "ended"
    cl.ended_reason = message.get("endedReason", body.get("endedReason", ""))

    # Duration
    started_at = call.get("startedAt", "")
    ended_at = call.get("endedAt", "")
    if started_at and ended_at:
        try:
            start_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(ended_at.replace("Z", "+00:00"))
            cl.duration_seconds = int((end_dt - start_dt).total_seconds())
        except:
            pass

    # Cost
    cl.cost = float(message.get("cost", body.get("cost", 0)) or 0)

    # Recording
    cl.recording_url = message.get("recordingUrl", body.get("recordingUrl", "")) or ""

    # Transcript
    transcript = message.get("transcript", body.get("transcript", ""))
    if isinstance(transcript, list):
        # Array of transcript messages
        lines = []
        for t in transcript:
            role = t.get("role", "unknown")
            text = t.get("text", t.get("content", ""))
            if role == "assistant":
                lines.append(f"AI: {text}")
            elif role == "user":
                lines.append(f"Customer: {text}")
            else:
                lines.append(f"{role}: {text}")
        cl.transcript = "\n".join(lines)
    elif isinstance(transcript, str):
        cl.transcript = transcript

    # Summary
    cl.summary = message.get("summary", body.get("summary", "")) or ""

    await db.flush()
    logger.info(f"[Voice] End of call report: {call_id} duration={cl.duration_seconds}s cost=${cl.cost}")

    return {"ok": True}


# ── Assistant Request Handler ──
async def _handle_assistant_request(call: dict, db: AsyncSession):
    """Return dynamic assistant config for incoming calls."""
    # Try to match by phone number or fall back to first configured
    result = await db.execute(
        select(VoiceSettings).where(VoiceSettings.vapi_assistant_id.isnot(None))
    )
    settings = result.scalars().first()

    if not settings or not settings.vapi_assistant_id:
        return {"error": "Voice agent not configured"}

    return {"assistantId": settings.vapi_assistant_id}


# ══════════════════════════════════════════════════════════════════════
#  OUTBOUND CALLS
# ══════════════════════════════════════════════════════════════════════

@router.post("/call")
async def make_outbound_call(data: OutboundCallRequest, db: AsyncSession = Depends(get_db)):
    """Make an outbound call to a phone number via Vapi."""
    result = await db.execute(
        select(VoiceSettings).where(VoiceSettings.business_id == data.business_id)
    )
    settings = result.scalar_one_or_none()
    if not settings or not settings.vapi_api_key or not settings.vapi_assistant_id:
        raise HTTPException(400, "Voice agent not configured. Create assistant first.")

    if not settings.vapi_phone_id:
        raise HTTPException(400, "No phone number configured in Vapi. Add a phone number in Vapi dashboard and save the phone ID in settings.")

    call_config = {
        "assistantId": settings.vapi_assistant_id,
        "phoneNumberId": settings.vapi_phone_id,
        "customer": {
            "number": data.phone_number,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{VAPI_BASE}/call",
                headers={
                    "Authorization": f"Bearer {settings.vapi_api_key}",
                    "Content-Type": "application/json",
                },
                json=call_config,
            )

            if r.status_code in (200, 201):
                resp = r.json()
                # Create call log
                cl = CallLog(
                    business_id=data.business_id,
                    lead_id=data.lead_id,
                    vapi_call_id=resp.get("id", ""),
                    phone_number=data.phone_number,
                    direction="outbound",
                    status="queued",
                )
                db.add(cl)
                await db.flush()
                logger.info(f"[Voice] Outbound call initiated to {data.phone_number}")
                return {"success": True, "call_id": resp.get("id", ""), "message": "Call initiated!"}
            else:
                logger.error(f"[Voice] Outbound call failed: {r.status_code} {r.text[:300]}")
                return {"success": False, "message": f"Vapi error ({r.status_code}): {r.text[:200]}"}
    except Exception as e:
        return {"success": False, "message": f"Error: {type(e).__name__}: {e}"}


# ══════════════════════════════════════════════════════════════════════
#  CALL LOGS
# ══════════════════════════════════════════════════════════════════════

@router.get("/calls", response_model=List[CallLogResponse])
async def list_calls(
    direction: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    business_id: int = 1,
    db: AsyncSession = Depends(get_db),
):
    """List call logs."""
    query = (
        select(CallLog)
        .options(selectinload(CallLog.lead))
        .where(CallLog.business_id == business_id)
    )
    if direction:
        query = query.where(CallLog.direction == direction)
    if status:
        query = query.where(CallLog.status == status)

    query = query.order_by(CallLog.created_at.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/calls/{call_id}", response_model=CallLogResponse)
async def get_call(call_id: int, db: AsyncSession = Depends(get_db)):
    """Get single call log with transcript."""
    result = await db.execute(
        select(CallLog)
        .options(selectinload(CallLog.lead))
        .where(CallLog.id == call_id)
    )
    cl = result.scalar_one_or_none()
    if not cl:
        raise HTTPException(404, "Call not found")
    return cl
