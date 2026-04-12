"""Automation engine — orchestrates message processing pipeline."""

import os
import asyncio
import logging
import httpx
from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from models import Lead, Conversation, Message, AISetting, Business, BusinessMedia

logger = logging.getLogger(__name__)

BRIDGE_URL = os.getenv("WHATSAPP_BRIDGE_URL", "http://localhost:3001")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Per-phone lock: ensures messages from the same customer are processed one at a time
_phone_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


async def process_incoming_message(
    phone: str, message: str, name: str, business_id: int, db: AsyncSession
) -> dict:
    """Process an incoming WhatsApp message end-to-end (sequential per phone)."""
    async with _phone_locks[phone]:
        return await _process_message_inner(phone, message, name, business_id, db)


async def _process_message_inner(
    phone: str, message: str, name: str, business_id: int, db: AsyncSession
) -> dict:
    """Internal message processing — runs under per-phone lock."""

    # 1. Find or create lead
    result = await db.execute(select(Lead).where(Lead.phone_number == phone))
    lead = result.scalar_one_or_none()
    if not lead:
        lead = Lead(phone_number=phone, name=name or "Unknown", business_id=business_id)
        db.add(lead)
        await db.flush()
        await db.refresh(lead)
        logger.info(f"[Engine] Created new lead: {lead.name} ({lead.phone_number})")

    # 1b. Check if lead is handed over — AI should not reply
    if lead.lead_status == 'handover':
        logger.info(f"[Engine] Lead {lead.phone_number} is handed over — skipping AI reply")
        # Still save the incoming message
        result = await db.execute(
            select(Conversation).where(
                Conversation.lead_id == lead.id,
                Conversation.business_id == business_id,
            )
        )
        conv = result.scalar_one_or_none()
        if conv:
            db.add(Message(conversation_id=conv.id, sender_type="customer", message_text=message))
            await db.flush()
        return {"reply": None, "lead_id": lead.id, "handover": True}

    # 2. Find or create conversation
    result = await db.execute(
        select(Conversation).where(
            Conversation.lead_id == lead.id,
            Conversation.business_id == business_id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        conv = Conversation(lead_id=lead.id, business_id=business_id)
        db.add(conv)
        await db.flush()
        await db.refresh(conv)

    # 3. Save incoming message
    customer_msg = Message(
        conversation_id=conv.id,
        sender_type="customer",
        message_text=message,
    )
    db.add(customer_msg)
    await db.flush()

    # 4. Get AI settings and business info
    result = await db.execute(select(AISetting).where(AISetting.business_id == business_id))
    ai_settings = result.scalar_one_or_none()

    result = await db.execute(select(Business).where(Business.id == business_id))
    business = result.scalar_one_or_none()

    # 4b. Get business media catalog
    result = await db.execute(select(BusinessMedia).where(BusinessMedia.business_id == business_id))
    media_files = result.scalars().all()

    # 5. Build conversation history
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc())
        .limit(10)
    )
    history = list(reversed(result.scalars().all()))

    # 6. Generate AI reply
    ai_reply = await generate_ai_reply(ai_settings, business, history, message, media_files)

    # 7. Parse [MEDIA:ID] tags and send media files
    import re
    media_tags = re.findall(r'\[MEDIA:(\d+)\]', ai_reply)
    clean_reply = re.sub(r'\s*\[MEDIA:\d+\]\s*', ' ', ai_reply).strip()

    if media_tags:
        media_map = {m.id: m for m in media_files}
        for tag_id in media_tags:
            mid = int(tag_id)
            if mid in media_map:
                m = media_map[mid]
                try:
                    async with httpx.AsyncClient(timeout=30) as client:
                        await client.post(
                            f"{BRIDGE_URL}/send-media",
                            json={
                                "phone": phone,
                                "mediaUrl": f"{BACKEND_URL}/api/media/file/{m.id}",
                                "filename": m.original_filename,
                                "caption": m.name,
                            },
                        )
                    logger.info(f"[Engine] Sent media '{m.name}' to {phone}")
                except Exception as e:
                    logger.error(f"[Engine] Failed to send media: {e}")

    # 8. Save AI reply (clean version without tags)
    ai_msg = Message(
        conversation_id=conv.id,
        sender_type="ai",
        message_text=clean_reply,
    )
    db.add(ai_msg)
    await db.flush()

    # 8b. Check auto-handover: count AI messages and mark lead if limit reached
    auto_handover = getattr(ai_settings, 'auto_handover', 0) or 0
    handover_limit = getattr(ai_settings, 'handover_after', 10) or 10
    if auto_handover:
        result = await db.execute(
            select(func.count()).where(
                Message.conversation_id == conv.id,
                Message.sender_type == 'ai',
            )
        )
        ai_msg_count = result.scalar() or 0
        if ai_msg_count >= handover_limit:
            lead.lead_status = 'handover'
            await db.flush()
            logger.info(f"[Engine] Lead {lead.phone_number} auto-handed over after {ai_msg_count} AI replies")

    # 8c. Apply reply delay + typing indicator to avoid WhatsApp bans
    delay = getattr(ai_settings, 'reply_delay', 0) or 0
    show_typing = getattr(ai_settings, 'typing_indicator', 0) or 0
    if delay > 0:
        if show_typing:
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    await client.post(f"{BRIDGE_URL}/typing", json={"phone": phone})
                logger.info(f"[Engine] Typing indicator sent to {phone}")
            except Exception as e:
                logger.warning(f"[Engine] Failed to send typing: {e}")
        logger.info(f"[Engine] Waiting {delay}s before replying...")
        await asyncio.sleep(delay)

    # 9. Send text reply via WhatsApp
    if clean_reply:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"{BRIDGE_URL}/send",
                    json={"phone": phone, "message": clean_reply},
                )
            logger.info(f"[Engine] Replied to {phone}: {clean_reply[:50]}...")
        except Exception as e:
            logger.error(f"[Engine] Failed to send reply: {e}")

    # 10. Score lead
    await score_lead(lead, ai_settings, history, db)

    return {"reply": clean_reply, "lead_id": lead.id}


async def generate_ai_reply(ai_settings, business, history, current_message, media_files=None) -> str:
    """Generate an AI reply using the configured provider."""
    if not ai_settings or not ai_settings.api_key:
        logger.warning("[Engine] No AI settings or API key configured — using fallback")
        return "Thank you for your message! We'll get back to you shortly."

    # Build system prompt
    system_prompt = ai_settings.system_prompt or "You are a helpful business assistant. Be professional and concise."

    # Append business info as reference
    if business:
        biz_parts = []
        if business.name: biz_parts.append(f"Business: {business.name}")
        if business.industry: biz_parts.append(f"Industry: {business.industry}")
        if business.services: biz_parts.append(f"Services/Info: {business.services}")
        if business.pricing: biz_parts.append(f"Pricing: {business.pricing}")
        if business.location: biz_parts.append(f"Location: {business.location}")
        if business.working_hours: biz_parts.append(f"Working Hours: {business.working_hours}")
        if business.offers: biz_parts.append(f"Current Offers: {business.offers}")
        if business.faqs: biz_parts.append(f"FAQs: {business.faqs}")
        if biz_parts:
            system_prompt += "\n\n--- Business Reference Data ---\n" + "\n".join(biz_parts)

    # Append media catalog so AI knows what files are available
    if media_files:
        media_lines = []
        for m in media_files:
            desc = f" — {m.description}" if m.description else ""
            media_lines.append(f'[MEDIA:{m.id}] "{m.name}" ({m.file_type}){desc}')
        system_prompt += "\n\n--- Available Media Files ---\n"
        system_prompt += "You can send media files to the customer by including the tag exactly as shown (e.g. [MEDIA:1]) in your reply. Only include a media tag when it is relevant to the conversation.\n"
        system_prompt += "\n".join(media_lines)

    # Build messages array
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history:
        role = "assistant" if msg.sender_type == "ai" else "user"
        messages.append({"role": role, "content": msg.message_text})

    provider = ai_settings.provider.lower()

    # Default model fallbacks if model is empty
    model = (ai_settings.model or "").strip()
    if not model:
        model_defaults = {
            "openai": "gpt-4o-mini",
            "gemini": "gemini-1.5-flash",
            "openrouter": "openai/gpt-4o-mini",
        }
        model = model_defaults.get(provider, "gpt-4o-mini")
        logger.warning(f"[Engine] Model was empty — using default: {model}")

    logger.info(f"[Engine] Generating reply via {provider} / {model} (history: {len(history)} msgs)")

    try:
        if provider in ("openai", "openrouter"):
            from openai import AsyncOpenAI
            base_url = "https://openrouter.ai/api/v1" if provider == "openrouter" else None
            client = AsyncOpenAI(api_key=ai_settings.api_key, base_url=base_url)
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=ai_settings.temperature,
                max_tokens=ai_settings.max_tokens,
            )
            reply = response.choices[0].message.content.strip()
            logger.info(f"[Engine] AI reply generated ({len(reply)} chars)")
            return reply

        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=ai_settings.api_key)
            gmodel = genai.GenerativeModel(
                model,
                system_instruction=system_prompt,
            )
            chat_history = []
            for msg in history:
                role = "model" if msg.sender_type == "ai" else "user"
                chat_history.append({"role": role, "parts": [msg.message_text]})
            chat = gmodel.start_chat(history=chat_history)
            response = chat.send_message(current_message)
            reply = response.text.strip()
            logger.info(f"[Engine] AI reply generated ({len(reply)} chars)")
            return reply

        else:
            logger.warning(f"[Engine] Unknown provider: {provider}")
            return "Thank you for your message! We'll get back to you shortly."

    except Exception as e:
        logger.error(f"[Engine] AI ERROR ({provider}/{model}): {type(e).__name__}: {e}")
        return "Thank you for reaching out! Our team will respond shortly."


async def score_lead(lead, ai_settings, history, db):
    """Score a lead based on conversation history."""
    if not ai_settings or not ai_settings.api_key:
        return

    conversation_text = "\n".join(
        [f"{'Customer' if m.sender_type == 'customer' else 'AI'}: {m.message_text}" for m in history]
    )

    # Use the custom scoring prompt from settings, or fall back to default
    custom_scoring = ai_settings.scoring_prompt.strip() if ai_settings.scoring_prompt else ""

    if custom_scoring:
        scoring_prompt = f"""{custom_scoring}

Return ONLY a JSON object: {{"score": number, "label": "hot|warm|cold"}}

Conversation:
{conversation_text}"""
    else:
        scoring_prompt = f"""Analyze this conversation and score the lead from 0-100.
Return ONLY a JSON object: {{"score": number, "label": "hot|warm|cold"}}
- HOT (80-100): Ready to buy/visit, has budget clarity, urgency
- WARM (50-79): Interested but needs nurturing, comparing options
- COLD (0-49): Just browsing, no budget mentioned, vague interest

Conversation:
{conversation_text}"""

    try:
        provider = ai_settings.provider.lower()

        # Model fallback (same as generate_ai_reply)
        model = (ai_settings.model or "").strip()
        if not model:
            model_defaults = {
                "openai": "gpt-4o-mini",
                "gemini": "gemini-1.5-flash",
                "openrouter": "openai/gpt-4o-mini",
            }
            model = model_defaults.get(provider, "gpt-4o-mini")

        import json

        if provider in ("openai", "openrouter"):
            from openai import AsyncOpenAI
            base_url = "https://openrouter.ai/api/v1" if provider == "openrouter" else None
            client = AsyncOpenAI(api_key=ai_settings.api_key, base_url=base_url)
            response = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": scoring_prompt}],
                temperature=0.3,
                max_tokens=100,
            )
            text = response.choices[0].message.content.strip()

        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=ai_settings.api_key)
            gmodel = genai.GenerativeModel(model)
            response = gmodel.generate_content(scoring_prompt)
            text = response.text.strip()

        else:
            return

        # Parse JSON score
        if "{" in text:
            data = json.loads(text[text.index("{"):text.rindex("}") + 1])
            lead.lead_score = data.get("score", lead.lead_score)
            lead.lead_status = data.get("label", lead.lead_status)
            await db.flush()
            logger.info(f"[Engine] Lead scored: {lead.lead_score} ({lead.lead_status})")

    except Exception as e:
        logger.error(f"[Engine] Scoring error: {type(e).__name__}: {e}")

