'use client';
import { useState, useEffect } from 'react';
import { API, safeFetch, timeAgo, scoreColor } from './lib/utils';
import { useClient } from './lib/ClientContext';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [health, setHealth] = useState({ whatsapp: null, api: null, db: null });
  const [loading, setLoading] = useState(true);
  const { bUrl, selectedClientId } = useClient();

  useEffect(() => {
    async function load() {
      try {
        const [d] = await safeFetch(bUrl('/dashboard'));
        const [l] = await safeFetch(bUrl('/leads'));
        const [w] = await safeFetch(`${API}/whatsapp/status`);
        setStats(d); setLeads(Array.isArray(l) ? l.slice(0, 5) : []);
        setHealth({ whatsapp: w?.connected ? 'ok' : 'error', api: d ? 'ok' : 'error', db: d ? 'ok' : 'error' });
      } catch { setHealth({ whatsapp: 'error', api: 'error', db: 'error' }); }
      finally { setLoading(false); }
    }
    if (selectedClientId) { load(); const iv = setInterval(load, 20000); return () => clearInterval(iv); }
  }, [selectedClientId]);

  if (loading) return <div className="loading"><div className="spinner"></div>Loading dashboard...</div>;
  const d = stats || {};

  return (<>
    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Command Center</h2>
    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24 }}>Real-time overview of all automation activity</p>
    <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
      <div className="stat-card blue"><div className="stat-label">Total Messages Today</div><div className="stat-value">{d.total_messages_today||0}</div><div className="stat-sub">+{d.total_leads_today||0} from today</div></div>
      <div className="stat-card red"><div className="stat-label">Hot Leads</div><div className="stat-value">{d.hot_leads||0}</div><div className="stat-sub">🔥 Ready to convert</div></div>
      <div className="stat-card orange"><div className="stat-label">Warm Leads</div><div className="stat-value">{d.warm_leads||0}</div><div className="stat-sub">✏ Follow up needed</div></div>
      <div className="stat-card cyan"><div className="stat-label">Cold Leads</div><div className="stat-value">{d.cold_leads||0}</div><div className="stat-sub">❄ Long-term nurture</div></div>
      <div className="stat-card green"><div className="stat-label">Appointments Today</div><div className="stat-value">{d.appointments_today||0}</div><div className="stat-sub">📅 {d.upcoming_appointments||0} upcoming this week</div></div>
      <div className="stat-card purple"><div className="stat-label">Calls Today</div><div className="stat-value">{d.calls_today||0}</div><div className="stat-sub">🎙️ {d.total_call_minutes||0} min total</div></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span className="card-header" style={{ marginBottom: 0 }}>Recent Activity</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Today</span>
        </div>
        {leads.length > 0 ? (
          <table className="data-table"><thead><tr><th>Contact</th><th>Score</th><th>Label</th><th>Last Active</th></tr></thead><tbody>
            {leads.map(l => (<tr key={l.id}><td><div style={{ fontWeight: 600 }}>{l.name}</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{l.phone_number}</div></td>
            <td><div className="score-display"><span className="score-number" style={{ color: scoreColor(l.lead_score) }}>{l.lead_score}</span><div className="score-bar"><div className="score-bar-fill" style={{ width: `${l.lead_score}%`, background: scoreColor(l.lead_score) }}></div></div></div></td>
            <td><span className={`lead-badge ${l.lead_status}`}><span className="badge-dot"></span>{(l.lead_status || 'new').toUpperCase()}</span></td>
            <td style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{timeAgo(l.created_at)}</td></tr>))}
          </tbody></table>
        ) : <div className="empty-state"><div className="empty-icon">📭</div><p>No leads yet. They appear when customers message your WhatsApp.</p></div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card"><div className="card-header">Lead Distribution</div>
          <div style={{ display: 'flex', gap: 24, marginTop: 12, marginBottom: 12 }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 30, fontWeight: 800, color: 'var(--hot)' }}>{d.hot_leads||0}</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Hot</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 30, fontWeight: 800, color: 'var(--warm)' }}>{d.warm_leads||0}</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Warm</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 30, fontWeight: 800, color: 'var(--cold)' }}>{d.cold_leads||0}</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Cold</div></div>
          </div>
          <div style={{ display: 'flex', height: 6, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
            {(d.hot_leads > 0 || d.warm_leads > 0 || d.cold_leads > 0) ? (<>
              <div style={{ width: `${((d.hot_leads||0)/Math.max((d.hot_leads||0)+(d.warm_leads||0)+(d.cold_leads||0),1))*100}%`, background: 'var(--hot)' }}></div>
              <div style={{ width: `${((d.warm_leads||0)/Math.max((d.hot_leads||0)+(d.warm_leads||0)+(d.cold_leads||0),1))*100}%`, background: 'var(--warm)' }}></div>
              <div style={{ width: `${((d.cold_leads||0)/Math.max((d.hot_leads||0)+(d.warm_leads||0)+(d.cold_leads||0),1))*100}%`, background: 'var(--cold)' }}></div>
            </>) : <div style={{ width: '100%' }}></div>}
          </div>
        </div>
        <div className="card"><div className="card-header">Platform Overview</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--text-secondary)' }}>Total Leads</span><span style={{ fontWeight: 700 }}>{d.total_leads||0}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--text-secondary)' }}>Total Conversations</span><span style={{ fontWeight: 700 }}>{d.total_conversations||0}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--text-secondary)' }}>Active Today</span><span style={{ fontWeight: 700, color: 'var(--accent)' }}>{d.active_conversations||0}</span></div>
          </div>
        </div>
        <div className="card"><div className="card-header">System Health</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            {[['WhatsApp API', health.whatsapp], ['AI Agent API', health.api], ['Database', health.db]].map(([n, s]) => (
              <div key={n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{n}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className={`health-dot ${s}`}></span>{s === 'ok' ? 'OK' : 'Offline'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </>);
}
