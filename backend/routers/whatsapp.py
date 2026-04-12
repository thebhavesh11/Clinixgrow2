"""WhatsApp bridge proxy router."""

import os
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from schemas import WhatsAppWebhook
import httpx

logger = logging.getLogger(__name__)

BRIDGE_URL = os.getenv("WHATSAPP_BRIDGE_URL", "http://localhost:3001")

router = APIRouter(prefix="/api/whatsapp", tags=["WhatsApp"])


@router.get("/status")
async def whatsapp_status():
    """Get WhatsApp connection status from bridge."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{BRIDGE_URL}/status")
            return r.json()
    except Exception:
        return {"connected": False, "info": None, "hasQR": False, "error": "Bridge unreachable"}


@router.get("/qr")
async def whatsapp_qr():
    """Get QR code from bridge."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{BRIDGE_URL}/qr")
            return r.json()
    except Exception:
        return {"qr": None, "error": "Bridge unreachable"}


@router.post("/send")
async def send_message(phone: str, message: str):
    """Send a message via bridge."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{BRIDGE_URL}/send", json={"phone": phone, "message": message})
            return r.json()
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/disconnect")
async def whatsapp_disconnect():
    """Disconnect/logout WhatsApp session."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{BRIDGE_URL}/logout")
            return r.json()
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/restart")
async def whatsapp_restart():
    """Restart WhatsApp client."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{BRIDGE_URL}/restart")
            return r.json()
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/webhook")
async def webhook(data: WhatsAppWebhook, db: AsyncSession = Depends(get_db)):
    """Receive incoming WhatsApp messages from bridge."""
    logger.info(f"[Webhook] Received message from {data.phone}: {data.message[:50]}...")
    try:
        from automation.engine import process_incoming_message
        result = await process_incoming_message(
            phone=data.phone,
            message=data.message,
            name=data.name,
            business_id=data.business_id,
            db=db,
        )
        return {"status": "processed", "result": result}
    except Exception as e:
        logger.error(f"[Webhook] Error processing message: {e}")
        return {"status": "error", "error": str(e)}
