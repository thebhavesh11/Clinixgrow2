'use client';
import { useState } from 'react';
import { API, safeFetch } from '../lib/utils';
import { useClient } from '../lib/ClientContext';

export default function ClientsPage() {
  const { clients, selectedClientId, selectClient, loadClients } = useClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', industry: '', services: '', location: '' });
  const [toast, setToast] = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function createClient() {
    if (!form.name.trim()) { showToast('Client name is required', 'error'); return; }
    const [data, err] = await safeFetch(`${API}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (err) { showToast(err, 'error'); return; }
    showToast(`Client "${form.name}" created!`, 'success');
    setShowModal(false);
    setForm({ name: '', industry: '', services: '', location: '' });
    await loadClients();
    if (data?.id) selectClient(data.id);
  }

  async function deleteClient(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"?\n\nThis will permanently remove ALL data:\n- Leads\n- Conversations & Messages\n- Appointments\n- Call Logs\n- AI Settings\n- Voice Settings\n\nThis action cannot be undone!`)) return;
    setDeleting(id);
    const [_, err] = await safeFetch(`${API}/clients/${id}`, { method: 'DELETE' });
    setDeleting(null);
    if (err) { showToast(err, 'error'); return; }
    showToast(`Client "${name}" deleted`, 'success');
    await loadClients();
  }

  function showToast(msg, type) { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }

  return (<>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Manage Clients</h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Create and manage client accounts. Each client has isolated data.</p>
      </div>
      <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Client</button>
    </div>

    {clients.length > 0 ? (
      <div className="client-cards-grid">
        {clients.map(c => (
          <div key={c.id} className={`client-card ${c.id === selectedClientId ? 'active' : ''}`} onClick={() => selectClient(c.id)}>
            {c.id === selectedClientId && <div className="client-active-badge">✓ Active</div>}
            <div className="client-card-name">{c.name}</div>
            <div className="client-card-industry">{c.industry || 'No industry set'} {c.location ? `• ${c.location}` : ''}</div>
            <div className="client-card-stats">
              <div className="client-stat"><div className="client-stat-value">{c.leads_count}</div><div className="client-stat-label">Leads</div></div>
              <div className="client-stat"><div className="client-stat-value">{c.conversations_count}</div><div className="client-stat-label">Convos</div></div>
              <div className="client-stat"><div className="client-stat-value">{c.appointments_count}</div><div className="client-stat-label">Appts</div></div>
              <div className="client-stat"><div className="client-stat-value">{c.messages_count}</div><div className="client-stat-label">Msgs</div></div>
            </div>
            <div className="client-card-actions">
              <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); selectClient(c.id); }} style={{ flex: 1 }}>
                {c.id === selectedClientId ? '✓ Selected' : 'Switch to'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); deleteClient(c.id, c.name); }} disabled={deleting === c.id} style={{ color: 'var(--danger)' }}>
                {deleting === c.id ? '...' : '🗑'}
              </button>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="empty-state">
        <div className="empty-icon">👥</div>
        <p>No clients yet. Create your first client to get started!</p>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ marginTop: 16 }}>+ Create First Client</button>
      </div>
    )}

    {/* Create Client Modal */}
    {showModal && (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
        <div className="modal-content">
          <div className="modal-header">
            <h3>Create New Client</h3>
            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
          </div>
          <div className="form-group">
            <label className="form-label">Client / Business Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Sharma Dental Clinic" autoFocus />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Industry</label>
              <input className="form-input" value={form.industry} onChange={e => setForm(f => ({...f, industry: e.target.value}))} placeholder="e.g. Healthcare" />
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input className="form-input" value={form.location} onChange={e => setForm(f => ({...f, location: e.target.value}))} placeholder="e.g. Mumbai" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Services</label>
            <textarea className="form-textarea" value={form.services} onChange={e => setForm(f => ({...f, services: e.target.value}))} placeholder="List of services..." rows={3} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
            💡 AI settings, working hours, and voice settings will be auto-configured with defaults. You can customize them after creation.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={createClient}>👥 Create Client</button>
          </div>
        </div>
      </div>
    )}

    {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
  </>);
}
