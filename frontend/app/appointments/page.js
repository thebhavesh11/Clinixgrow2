'use client';
import { useState, useEffect, useMemo } from 'react';
import { API, safeFetch } from '../lib/utils';
import { useClient } from '../lib/ClientContext';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fmt(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function toDateKey(d) { return fmt(d); }

export default function AppointmentsPage() {
  const [tab, setTab] = useState('calendar');
  const [currentMonth, setCurrentMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selectedDate, setSelectedDate] = useState(fmt(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [slots, setSlots] = useState([]);
  const [leads, setLeads] = useState([]);
  const [workingHours, setWorkingHours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editAppt, setEditAppt] = useState(null);
  const [toast, setToast] = useState(null);
  const { bUrl, selectedClientId } = useClient();

  // Form state
  const [form, setForm] = useState({ title: 'Appointment', date: '', start_time: '', lead_id: '', notes: '' });

  // Load data
  useEffect(() => { loadAll(); }, [selectedClientId]);
  useEffect(() => { loadSlots(selectedDate); loadDayAppointments(); }, [selectedDate]);

  async function loadAll() {
    setLoading(true);
    const [lData] = await safeFetch(bUrl('/leads'));
    const [whData] = await safeFetch(bUrl('/appointments/working-hours'));
    setLeads(Array.isArray(lData) ? lData : []);
    setWorkingHours(Array.isArray(whData) ? whData : getDefaultWH());
    await loadMonthAppointments();
    await loadSlots(selectedDate);
    setLoading(false);
  }

  async function loadMonthAppointments() {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    const from = fmt(new Date(y, m, 1));
    const to = fmt(new Date(y, m + 1, 0));
    const [data] = await safeFetch(bUrl(`/appointments?from_date=${from}&to_date=${to}`));
    setAppointments(Array.isArray(data) ? data : []);
  }

  async function loadDayAppointments() {
    const [data] = await safeFetch(bUrl(`/appointments?from_date=${selectedDate}&to_date=${selectedDate}`));
    if (Array.isArray(data)) {
      setAppointments(prev => {
        const others = prev.filter(a => a.date !== selectedDate);
        return [...others, ...data];
      });
    }
  }

  async function loadSlots(date) {
    const [data] = await safeFetch(bUrl(`/appointments/slots?date=${date}`));
    setSlots(Array.isArray(data) ? data : []);
  }

  useEffect(() => { loadMonthAppointments(); }, [currentMonth]);

  // Calendar generation
  const calendarDays = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    let startOffset = (firstDay.getDay() + 6) % 7; // Monday=0
    const days = [];
    // Previous month
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(y, m, -i);
      days.push({ date: d, key: fmt(d), currentMonth: false });
    }
    // Current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(y, m, i);
      days.push({ date: d, key: fmt(d), currentMonth: true });
    }
    // Fill remaining
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(y, m + 1, i);
      days.push({ date: d, key: fmt(d), currentMonth: false });
    }
    return days;
  }, [currentMonth]);

  const todayKey = fmt(new Date());
  const apptsByDate = useMemo(() => {
    const map = {};
    appointments.forEach(a => { (map[a.date] = map[a.date] || []).push(a); });
    return map;
  }, [appointments]);

  const selectedAppts = (apptsByDate[selectedDate] || []).sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Actions
  function openBookModal(date, time) {
    setEditAppt(null);
    setForm({ title: 'Appointment', date: date || selectedDate, start_time: time || '', lead_id: '', notes: '' });
    setShowModal(true);
  }

  function openEditModal(appt) {
    setEditAppt(appt);
    setForm({ title: appt.title, date: appt.date, start_time: appt.start_time, lead_id: appt.lead_id || '', notes: appt.notes || '' });
    setShowModal(true);
  }

  async function saveAppointment() {
    if (!form.date || !form.start_time) { showToast('Date and time required', 'error'); return; }

    if (editAppt) {
      const [res, err] = await safeFetch(bUrl(`/appointments/${editAppt.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          date: form.date,
          start_time: form.start_time,
          notes: form.notes,
          lead_id: form.lead_id ? parseInt(form.lead_id) : null,
        }),
      });
      if (err) { showToast(err, 'error'); return; }
      showToast('Appointment updated!', 'success');
    } else {
      const [res, err] = await safeFetch(bUrl('/appointments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          date: form.date,
          start_time: form.start_time,
          notes: form.notes,
          lead_id: form.lead_id ? parseInt(form.lead_id) : null,
          booked_by: 'manual',
        }),
      });
      if (err) { showToast(err, 'error'); return; }
      showToast('Appointment booked!', 'success');
    }

    setShowModal(false);
    await loadMonthAppointments();
    await loadSlots(selectedDate);
    await loadDayAppointments();
  }

  async function cancelAppointment(id) {
    const [_, err] = await safeFetch(bUrl(`/appointments/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    if (err) { showToast(err, 'error'); return; }
    showToast('Appointment cancelled', 'success');
    await loadMonthAppointments();
    await loadSlots(selectedDate);
    await loadDayAppointments();
  }

  async function completeAppointment(id) {
    const [_, err] = await safeFetch(bUrl(`/appointments/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    if (err) { showToast(err, 'error'); return; }
    showToast('Marked as completed', 'success');
    await loadMonthAppointments();
    await loadSlots(selectedDate);
    await loadDayAppointments();
  }

  async function deleteAppointment(id) {
    const [_, err] = await safeFetch(bUrl(`/appointments/${id}`), { method: 'DELETE' });
    if (err) { showToast(err, 'error'); return; }
    showToast('Appointment deleted', 'success');
    await loadMonthAppointments();
    await loadSlots(selectedDate);
    await loadDayAppointments();
  }

  // Working Hours
  async function saveWorkingHours() {
    const [_, err] = await safeFetch(bUrl('/appointments/working-hours'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: workingHours }),
    });
    if (err) { showToast(err, 'error'); return; }
    showToast('Working hours saved!', 'success');
  }

  function updateWH(dayIndex, field, value) {
    setWorkingHours(prev => prev.map(wh => wh.day_of_week === dayIndex ? { ...wh, [field]: value } : wh));
  }

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function getDefaultWH() {
    return Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i, is_open: i < 5 ? 1 : 0, start_time: '09:00', end_time: '18:00',
      break_start: '13:00', break_end: '14:00', slot_duration: 30,
    }));
  }

  if (loading) return <div className="loading"><div className="spinner"></div>Loading appointments...</div>;

  return (<>
    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Appointments</h2>
    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>Manage bookings, calendar & working hours</p>

    <div className="tabs">
      <div className={`tab ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>📅 Calendar</div>
      <div className={`tab ${tab === 'working-hours' ? 'active' : ''}`} onClick={() => setTab('working-hours')}>🕐 Working Hours</div>
    </div>

    {tab === 'calendar' && (
      <div className="calendar-container">
        {/* Left — Calendar Grid */}
        <div className="calendar-main">
          <div className="calendar-header">
            <h3>{MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h3>
            <div className="calendar-nav">
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>‹</button>
              <button className="calendar-today-btn" onClick={() => { setCurrentMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelectedDate(todayKey); }}>Today</button>
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>›</button>
            </div>
          </div>

          <div className="calendar-weekdays">
            {DAY_SHORT.map(d => <div key={d} className="calendar-weekday">{d}</div>)}
          </div>

          <div className="calendar-grid">
            {calendarDays.map(day => {
              const dayAppts = apptsByDate[day.key] || [];
              const confirmed = dayAppts.filter(a => a.status === 'confirmed');
              return (
                <div
                  key={day.key}
                  className={`calendar-day ${!day.currentMonth ? 'other-month' : ''} ${day.key === todayKey ? 'today' : ''} ${day.key === selectedDate ? 'selected' : ''}`}
                  onClick={() => setSelectedDate(day.key)}
                >
                  <div className="day-number">{day.date.getDate()}</div>
                  {confirmed.slice(0, 3).map(a => (
                    <div key={a.id} className={`appt-chip ${a.status}`}>
                      {a.start_time} {a.title}
                    </div>
                  ))}
                  {confirmed.length > 3 && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>+{confirmed.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right — Selected Day Details */}
        <div className="calendar-sidebar">
          <div className="day-panel">
            <div className="day-panel-header">
              <h4>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h4>
              <button className="btn btn-primary btn-sm" onClick={() => openBookModal(selectedDate)}>+ Book</button>
            </div>

            {selectedAppts.length > 0 ? (
              <div className="appt-list">
                {selectedAppts.map(a => (
                  <div key={a.id} className="appt-item" onClick={() => openEditModal(a)}>
                    <div className="appt-time">{a.start_time} - {a.end_time}</div>
                    <div className="appt-info">
                      <div className="appt-title">{a.title}</div>
                      <div className="appt-lead">
                        {a.lead ? `${a.lead.name} (${a.lead.phone_number})` : 'Walk-in'}
                        {a.booked_by === 'ai' && ' • 🤖 AI booked'}
                      </div>
                    </div>
                    <span className={`appt-status-badge ${a.status}`}>{a.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '30px 10px' }}>
                <div className="empty-icon">📭</div>
                <p>No appointments on this day</p>
              </div>
            )}
          </div>

          {/* Available Slots */}
          <div className="day-panel">
            <div className="card-header">Available Slots</div>
            {slots.length > 0 ? (
              <div className="slot-picker">
                {slots.map(s => (
                  <div
                    key={s.time}
                    className={`time-slot ${!s.available ? 'booked' : ''}`}
                    onClick={() => s.available && openBookModal(selectedDate, s.time)}
                  >
                    {s.time}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>
                Closed on this day or no working hours configured
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {tab === 'working-hours' && (
      <div className="card" style={{ maxWidth: 900 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div className="card-header" style={{ marginBottom: 4 }}>Working Hours Configuration</div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Set your availability for each day. AI agent will suggest slots based on these hours.</p>
          </div>
          <button className="btn btn-primary" onClick={saveWorkingHours}>💾 Save Changes</button>
        </div>

        <table className="wh-table">
          <thead>
            <tr style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              <td>Day</td>
              <td>Status</td>
              <td>Open</td>
              <td>Close</td>
              <td>Break Start</td>
              <td>Break End</td>
              <td>Slot Duration</td>
            </tr>
          </thead>
          <tbody>
            {workingHours.sort((a, b) => a.day_of_week - b.day_of_week).map(wh => (
              <tr key={wh.day_of_week} className={`wh-row ${!wh.is_open ? 'closed' : ''}`}>
                <td>{DAY_NAMES[wh.day_of_week]}</td>
                <td>
                  <button
                    className={`wh-toggle ${wh.is_open ? 'on' : 'off'}`}
                    onClick={() => updateWH(wh.day_of_week, 'is_open', wh.is_open ? 0 : 1)}
                  />
                </td>
                <td>
                  <input type="time" className="wh-time-input" value={wh.start_time} disabled={!wh.is_open}
                    onChange={e => updateWH(wh.day_of_week, 'start_time', e.target.value)} />
                </td>
                <td>
                  <input type="time" className="wh-time-input" value={wh.end_time} disabled={!wh.is_open}
                    onChange={e => updateWH(wh.day_of_week, 'end_time', e.target.value)} />
                </td>
                <td>
                  <input type="time" className="wh-time-input" value={wh.break_start} disabled={!wh.is_open}
                    onChange={e => updateWH(wh.day_of_week, 'break_start', e.target.value)} />
                </td>
                <td>
                  <input type="time" className="wh-time-input" value={wh.break_end} disabled={!wh.is_open}
                    onChange={e => updateWH(wh.day_of_week, 'break_end', e.target.value)} />
                </td>
                <td>
                  <select className="wh-duration-select" value={wh.slot_duration} disabled={!wh.is_open}
                    onChange={e => updateWH(wh.day_of_week, 'slot_duration', parseInt(e.target.value))}>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {/* Booking / Edit Modal */}
    {showModal && (
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
        <div className="modal-content">
          <div className="modal-header">
            <h3>{editAppt ? 'Edit Appointment' : 'Book Appointment'}</h3>
            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
          </div>

          <div className="form-group">
            <label className="form-label">Title</label>
            <input className="form-input" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="Appointment title" />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" className="form-input" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Time</label>
              <input type="time" className="form-input" value={form.start_time} onChange={e => setForm(f => ({...f, start_time: e.target.value}))} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Link to Lead (Optional)</label>
            <select className="form-select" value={form.lead_id} onChange={e => setForm(f => ({...f, lead_id: e.target.value}))}>
              <option value="">— Walk-in / No lead —</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.name} ({l.phone_number})</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Any notes..." rows={3} />
          </div>

          <div className="modal-actions">
            {editAppt && editAppt.status === 'confirmed' && (
              <>
                <button className="btn btn-danger btn-sm" onClick={() => { cancelAppointment(editAppt.id); setShowModal(false); }}>Cancel Appt</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { completeAppointment(editAppt.id); setShowModal(false); }}>✓ Complete</button>
              </>
            )}
            {editAppt && (
              <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => { deleteAppointment(editAppt.id); setShowModal(false); }}>🗑 Delete</button>
            )}
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveAppointment}>
              {editAppt ? '💾 Update' : '📅 Book'}
            </button>
          </div>
        </div>
      </div>
    )}

    {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
  </>);
}
