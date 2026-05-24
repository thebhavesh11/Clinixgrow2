'use client';
import { useState, useEffect } from 'react';
import { API, safeFetch } from '../lib/utils';

export default function Automation() {
  const [health, setHealth] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      const results = {};
      const [waData] = await safeFetch(`${API}/whatsapp/status`);
      results.whatsapp = waData?.connected ? 'ok' : 'warning';

      const [healthData] = await safeFetch(`/health`);
      results.api = healthData ? 'ok' : 'error';

      const [dashData] = await safeFetch(`${API}/dashboard`);
      results.db = dashData ? 'ok' : 'error';

      const [aiData] = await safeFetch(`${API}/ai-settings`);
      results.ai = aiData?.api_key ? 'ok' : 'warning';

      setHealth(results);
      setLoading(false);
    }
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, []);

  if (loading) return <div className="loading"><div className="spinner"></div>Checking system health...</div>;

  const statusLabel = { ok: 'Online', warning: 'Warning', error: 'Offline' };
  const statusColor = { ok: 'var(--success)', warning: 'var(--warning)', error: 'var(--danger)' };
  const services = [
    { name: 'WhatsApp API', key: 'whatsapp', icon: '📱', desc: 'WhatsApp Web bridge connection' },
    { name: 'AI Agent API', key: 'ai', icon: '🤖', desc: 'AI model provider connection' },
    { name: 'Backend API', key: 'api', icon: '⚙️', desc: 'FastAPI backend server' },
    { name: 'Database', key: 'db', icon: '🗄️', desc: 'SQLite database connection' },
  ];
  const workflowSteps = [
    { label: 'Message Receiver', desc: 'WhatsApp Bridge', icon: '📨', color: 'var(--info)' },
    { label: 'Webhook Handler', desc: 'FastAPI Backend', icon: '🔀', color: 'var(--accent)' },
    { label: 'Lead Identifier', desc: 'Database Lookup', icon: '🔍', color: 'var(--warm)' },
    { label: 'AI Agent', desc: 'Generate Reply', icon: '🤖', color: 'var(--hot)' },
    { label: 'Lead Scorer', desc: 'Classify Lead', icon: '📊', color: 'var(--success)' },
    { label: 'Reply Sender', desc: 'WhatsApp Bridge', icon: '📤', color: 'var(--info)' },
  ];

  return (<>
    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Automation</h2>
    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24 }}>API health monitoring and workflow status</p>

    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header">API Status</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16 }}>
        {services.map(svc => (
          <div key={svc.key} style={{ padding: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{svc.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{svc.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>{svc.desc}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 12, background: `${statusColor[health[svc.key]]||statusColor.error}15`, color: statusColor[health[svc.key]]||statusColor.error, fontSize: 12, fontWeight: 600 }}>
              <span className={`health-dot ${health[svc.key]||'error'}`}></span>
              {statusLabel[health[svc.key]]||'Unknown'}
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header">Message Processing Pipeline</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, padding: '30px 0', overflowX: 'auto' }}>
        {workflowSteps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ padding: '14px 18px', borderRadius: 'var(--radius)', border: `1px solid ${step.color}40`, background: `${step.color}10`, textAlign: 'center', minWidth: 120 }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{step.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 12, color: step.color }}>{step.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{step.desc}</div>
            </div>
            {i < workflowSteps.length - 1 && <div style={{ width: 30, height: 2, background: 'var(--border-color)', margin: '0 2px', flexShrink: 0 }}></div>}
          </div>
        ))}
      </div>
    </div>

    <div className="card">
      <div className="card-header">Webhook Configuration</div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="form-group"><label className="form-label">WhatsApp Bridge URL</label><input className="form-input" value="$WHATSAPP_BRIDGE_URL (default: localhost:3001)" disabled /></div>
        <div className="form-group"><label className="form-label">Backend Webhook URL</label><input className="form-input" value="$BACKEND_URL/api/whatsapp/webhook (default: localhost:8000)" disabled /></div>
      </div>
    </div>
  </>);
}
