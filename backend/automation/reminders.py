"""Background appointment reminder — sends WhatsApp message 1 hour before appointment."""

import os
import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy import select, and_
from database import async_session
from models import Appointment, Lead, AISetting

logger = logging.getLogger(__name__)

BRIDGE_URL = os.getenv("WHATSAPP_BRIDGE_URL", "http://localhost:3001")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Check every 2 minutes
CHECK_INTERVAL = 120
# Send reminder 1 hour before
REMINDER_BEFORE_MINUTES = 60


async def send_reminder_message(phone: str, appointment, settings):
    """Send a WhatsApp reminder message for an upcoming appointment."""
    import httpx

    message = (
        f"⏰ *Appointment Reminder*\n\n"
        f"Hi! This is a reminder that you have an appointment scheduled:\n\n"
        f"📅 *Date:* {appointment.date}\n"
        f"🕐 *Time:* {appointment.start_time} - {appointment.end_time}\n"
    )
    if appointment.title and appointment.title != "Appointment":
        message += f"📋 *Subject:* {appointment.title}\n"
    if appointment.notes:
        message += f"📝 *Notes:* {appointment.notes}\n"
    message += f"\nPlease be on time. If you need to reschedule, let us know!"

    wa_mode = getattr(settings, 'wa_connection_mode', 'qr') or 'qr'

    try:
        if wa_mode == "cloud_api":
            from routers.whatsapp import _send_cloud_api_text
            result = await _send_cloud_api_text(phone, message, settings)
            if result.get("success"):
                logger.info(f"[Reminder] ✅ Sent reminder to {phone} via Cloud API for {appointment.date} {appointment.start_time}")
                return True
            else:
                logger.error(f"[Reminder] ❌ Cloud API send failed: {result.get('error')}")
                return False
        else:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    f"{BRIDGE_URL}/send",
                    json={"phone": phone, "message": message},
                )
                resp = r.json()
                if resp.get("success", True):
                    logger.info(f"[Reminder] ✅ Sent reminder to {phone} via QR bridge for {appointment.date} {appointment.start_time}")
                    return True
                else:
                    logger.error(f"[Reminder] ❌ Bridge send failed: {resp.get('error')}")
                    return False
    except Exception as e:
        logger.error(f"[Reminder] ❌ Failed to send reminder to {phone}: {type(e).__name__}: {e}")
        return False


async def check_and_send_reminders():
    """Check for upcoming appointments and send reminders."""
    try:
        async with async_session() as session:
            async with session.begin():
                now = datetime.utcnow()
                reminder_window = now + timedelta(minutes=REMINDER_BEFORE_MINUTES)

                # Format current date and time for comparison
                today_str = now.strftime("%Y-%m-%d")
                tomorrow_str = (now + timedelta(days=1)).strftime("%Y-%m-%d")

                # Find confirmed appointments that need reminders
                # Look at today and tomorrow (to catch appointments early morning)
                result = await session.execute(
                    select(Appointment).where(
                        Appointment.status == "confirmed",
                        Appointment.reminder_sent == 0,
                        Appointment.lead_id.isnot(None),
                        Appointment.date.in_([today_str, tomorrow_str]),
                    )
                )
                appointments = result.scalars().all()

                if not appointments:
                    return

                for appt in appointments:
                    try:
                        # Parse appointment datetime
                        appt_datetime = datetime.strptime(
                            f"{appt.date} {appt.start_time}", "%Y-%m-%d %H:%M"
                        )

                        # Check if within reminder window (between now and now+60min)
                        if now <= appt_datetime <= reminder_window:
                            # Get lead's phone number
                            lead_result = await session.execute(
                                select(Lead).where(Lead.id == appt.lead_id)
                            )
                            lead = lead_result.scalar_one_or_none()

                            if lead and lead.phone_number:
                                # Get AI settings for THIS appointment's business
                                settings_result = await session.execute(
                                    select(AISetting).where(AISetting.business_id == appt.business_id)
                                )
                                settings = settings_result.scalar_one_or_none()

                                success = await send_reminder_message(
                                    lead.phone_number, appt, settings
                                )
                                if success:
                                    appt.reminder_sent = 1
                                    await session.flush()
                    except Exception as e:
                        logger.error(f"[Reminder] Error processing appointment {appt.id}: {type(e).__name__}: {e}")

    except Exception as e:
        logger.error(f"[Reminder] Background check error: {type(e).__name__}: {e}")


async def reminder_loop():
    """Background loop that checks for reminders every CHECK_INTERVAL seconds."""
    logger.info(f"[Reminder] Background reminder service started (check every {CHECK_INTERVAL}s, remind {REMINDER_BEFORE_MINUTES}min before)")
    while True:
        await asyncio.sleep(CHECK_INTERVAL)
        try:
            await check_and_send_reminders()
        except Exception as e:
            logger.error(f"[Reminder] Loop error: {type(e).__name__}: {e}")
