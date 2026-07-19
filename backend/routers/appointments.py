"""Appointment booking & working hours router."""

import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import get_db
from models import Appointment, WorkingHours, Lead
from schemas import (
    AppointmentCreate, AppointmentUpdate, AppointmentResponse,
    WorkingHoursItem, WorkingHoursResponse, WorkingHoursUpdate,
    SlotResponse,
)
from typing import List, Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/appointments", tags=["Appointments"])


# ══════════════════════════════════════════════════════════════════════
#  WORKING HOURS
# ══════════════════════════════════════════════════════════════════════

@router.get("/working-hours", response_model=List[WorkingHoursResponse])
async def get_working_hours(business_id: int = 1, db: AsyncSession = Depends(get_db)):
    """Get working hours for all 7 days."""
    result = await db.execute(
        select(WorkingHours)
        .where(WorkingHours.business_id == business_id)
        .order_by(WorkingHours.day_of_week)
    )
    return result.scalars().all()


@router.put("/working-hours", response_model=List[WorkingHoursResponse])
async def update_working_hours(data: WorkingHoursUpdate, business_id: int = 1, db: AsyncSession = Depends(get_db)):
    """Bulk update working hours for all 7 days."""
    for day_data in data.days:
        result = await db.execute(
            select(WorkingHours).where(
                WorkingHours.business_id == business_id,
                WorkingHours.day_of_week == day_data.day_of_week,
            )
        )
        wh = result.scalar_one_or_none()
        if wh:
            wh.is_open = day_data.is_open
            wh.start_time = day_data.start_time
            wh.end_time = day_data.end_time
            wh.break_start = day_data.break_start
            wh.break_end = day_data.break_end
            wh.slot_duration = day_data.slot_duration
        else:
            db.add(WorkingHours(business_id=business_id, **day_data.model_dump()))

    await db.flush()
    logger.info(f"[Appointments] Working hours updated for business {business_id}")

    result = await db.execute(
        select(WorkingHours)
        .where(WorkingHours.business_id == business_id)
        .order_by(WorkingHours.day_of_week)
    )
    return result.scalars().all()


# ══════════════════════════════════════════════════════════════════════
#  SLOT AVAILABILITY
# ══════════════════════════════════════════════════════════════════════

def _generate_slots(start: str, end: str, duration: int, break_start: str = "", break_end: str = "") -> list[dict]:
    """Generate time slots between start and end, skipping break period."""
    slots = []
    st = datetime.strptime(start, "%H:%M")
    et = datetime.strptime(end, "%H:%M")

    bs = datetime.strptime(break_start, "%H:%M") if break_start else None
    be = datetime.strptime(break_end, "%H:%M") if break_end else None

    current = st
    while current + timedelta(minutes=duration) <= et:
        slot_end = current + timedelta(minutes=duration)
        # Skip if slot overlaps with break
        if bs and be:
            if not (slot_end <= bs or current >= be):
                current = slot_end
                continue
        slots.append({
            "time": current.strftime("%H:%M"),
            "end_time": slot_end.strftime("%H:%M"),
        })
        current = slot_end
    return slots


@router.get("/slots", response_model=List[SlotResponse])
async def get_available_slots(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    business_id: int = 1,
    db: AsyncSession = Depends(get_db),
):
    """Get available time slots for a specific date."""
    try:
        target_date = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    day_of_week = target_date.weekday()  # 0=Monday ... 6=Sunday

    # Get working hours for this day
    result = await db.execute(
        select(WorkingHours).where(
            WorkingHours.business_id == business_id,
            WorkingHours.day_of_week == day_of_week,
        )
    )
    wh = result.scalar_one_or_none()

    if not wh or not wh.is_open:
        return []  # Closed on this day

    # Generate all possible slots
    all_slots = _generate_slots(
        wh.start_time, wh.end_time, wh.slot_duration,
        wh.break_start or "", wh.break_end or "",
    )

    # Get existing confirmed appointments for this date
    result = await db.execute(
        select(Appointment).where(
            Appointment.business_id == business_id,
            Appointment.date == date,
            Appointment.status == "confirmed",
        )
    )
    booked = result.scalars().all()
    booked_times = {(a.start_time, a.end_time) for a in booked}

    # Mark availability
    slots_response = []
    for slot in all_slots:
        is_booked = any(
            not (slot["end_time"] <= b_start or slot["time"] >= b_end)
            for b_start, b_end in booked_times
        )
        slots_response.append(SlotResponse(
            time=slot["time"],
            end_time=slot["end_time"],
            available=not is_booked,
        ))

    return slots_response


# ══════════════════════════════════════════════════════════════════════
#  APPOINTMENTS CRUD
# ══════════════════════════════════════════════════════════════════════

@router.get("", response_model=List[AppointmentResponse])
async def list_appointments(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    status: Optional[str] = None,
    business_id: int = 1,
    db: AsyncSession = Depends(get_db),
):
    """List appointments with optional date range and status filter."""
    query = (
        select(Appointment)
        .options(selectinload(Appointment.lead))
        .where(Appointment.business_id == business_id)
    )

    if from_date:
        query = query.where(Appointment.date >= from_date)
    if to_date:
        query = query.where(Appointment.date <= to_date)
    if status:
        query = query.where(Appointment.status == status)

    query = query.order_by(Appointment.date, Appointment.start_time)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{appointment_id}", response_model=AppointmentResponse)
async def get_appointment(appointment_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single appointment."""
    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.lead))
        .where(Appointment.id == appointment_id)
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(404, "Appointment not found")
    return appt


@router.post("", response_model=AppointmentResponse)
async def create_appointment(data: AppointmentCreate, db: AsyncSession = Depends(get_db)):
    """Create a new appointment."""
    # Auto-calculate end_time if not provided
    end_time = data.end_time
    if not end_time:
        try:
            st = datetime.strptime(data.start_time, "%H:%M")
            # Get slot duration from working hours
            target_date = datetime.strptime(data.date, "%Y-%m-%d")
            result = await db.execute(
                select(WorkingHours).where(
                    WorkingHours.business_id == data.business_id,
                    WorkingHours.day_of_week == target_date.weekday(),
                )
            )
            wh = result.scalar_one_or_none()
            duration = wh.slot_duration if wh else 30
            end_time = (st + timedelta(minutes=duration)).strftime("%H:%M")
        except ValueError:
            raise HTTPException(400, "Invalid time format. Use HH:MM")

    # Check for conflicts
    result = await db.execute(
        select(Appointment).where(
            Appointment.business_id == data.business_id,
            Appointment.date == data.date,
            Appointment.status == "confirmed",
        )
    )
    existing = result.scalars().all()
    for appt in existing:
        if not (end_time <= appt.start_time or data.start_time >= appt.end_time):
            raise HTTPException(
                409,
                f"Time slot conflicts with existing appointment ({appt.start_time}-{appt.end_time})"
            )

    appointment = Appointment(
        business_id=data.business_id,
        lead_id=data.lead_id,
        title=data.title,
        date=data.date,
        start_time=data.start_time,
        end_time=end_time,
        notes=data.notes,
        booked_by=data.booked_by,
    )
    db.add(appointment)
    await db.flush()
    await db.refresh(appointment)

    # Load lead relationship
    if appointment.lead_id:
        result = await db.execute(
            select(Appointment)
            .options(selectinload(Appointment.lead))
            .where(Appointment.id == appointment.id)
        )
        appointment = result.scalar_one()

    logger.info(f"[Appointments] Created: {appointment.date} {appointment.start_time}-{appointment.end_time} by {appointment.booked_by}")
    return appointment


@router.put("/{appointment_id}", response_model=AppointmentResponse)
async def update_appointment(appointment_id: int, data: AppointmentUpdate, db: AsyncSession = Depends(get_db)):
    """Update an appointment (reschedule, cancel, update notes, etc.)."""
    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.lead))
        .where(Appointment.id == appointment_id)
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(404, "Appointment not found")

    # Track if time changed for conflict check
    new_date = data.date or appt.date
    new_start = data.start_time or appt.start_time
    new_end = data.end_time or appt.end_time
    time_changed = (new_date != appt.date or new_start != appt.start_time or new_end != appt.end_time)

    # If rescheduling, check for conflicts
    if time_changed and (data.status or appt.status) == "confirmed":
        result = await db.execute(
            select(Appointment).where(
                Appointment.business_id == appt.business_id,
                Appointment.date == new_date,
                Appointment.status == "confirmed",
                Appointment.id != appointment_id,
            )
        )
        existing = result.scalars().all()
        for ex in existing:
            if not (new_end <= ex.start_time or new_start >= ex.end_time):
                raise HTTPException(409, f"Conflicts with existing appointment ({ex.start_time}-{ex.end_time})")

    # Apply updates
    if data.title is not None:
        appt.title = data.title
    if data.date is not None:
        appt.date = data.date
    if data.start_time is not None:
        appt.start_time = data.start_time
    if data.end_time is not None:
        appt.end_time = data.end_time
    if data.status is not None:
        appt.status = data.status
    if data.notes is not None:
        appt.notes = data.notes
    if data.lead_id is not None:
        appt.lead_id = data.lead_id

    # Reset reminder if rescheduled
    if time_changed:
        appt.reminder_sent = 0

    await db.flush()
    await db.refresh(appt)
    logger.info(f"[Appointments] Updated id={appointment_id}: {appt.date} {appt.start_time} status={appt.status}")
    return appt


@router.delete("/{appointment_id}")
async def delete_appointment(appointment_id: int, db: AsyncSession = Depends(get_db)):
    """Delete an appointment permanently."""
    result = await db.execute(select(Appointment).where(Appointment.id == appointment_id))
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(404, "Appointment not found")

    await db.delete(appt)
    await db.flush()
    logger.info(f"[Appointments] Deleted id={appointment_id}")
    return {"success": True}
