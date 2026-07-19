'use client';
import { useState, useEffect } from 'react';
import { API, safeFetch, timeAgo, scoreColor } from '../lib/utils';
import { useClient } from '../lib/ClientContext';

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const { bUrl, selectedClientId } = useClient();

  useEffect(() => { if (selectedClientId) { setLoading(true); safeFetch(bUrl('/leads')).then(([d]) => { if (Array.isArray(d)) setLeads(d); }).finally(() => setLoading(false)); } }, [selectedClientId]);
  const filtered = filter === 'all' ? leads : leads.filter(l => l.lead_status === filter);

  if (loading) return <div className="loading"><div className="spinner"></div>Loading leads...</div>;

  return (<>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
      <div><h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Lead Management</h2><p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>AI-scored leads ranked by conversion potential</p></div>
      <button className="btn btn-secondary" onClick={() => { const csv = ['Contact,Phone,Score,Label,Created'].concat(leads.map(l => `${l.name},${l.phone_number},${l.lead_score},${l.lead_status},${l.created_at}`)).join('\n'); const b = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'leads.csv'; a.click(); }}>↓ Export CSV</button>
    </div>
    <div className="filter-bar">
      <button className={`filter-btn ${filter==='all'?'active':''}`} onClick={() => setFilter('all')}>All Leads</button>
      <button className={`filter-btn hot ${filter==='hot'?'active':''}`} onClick={() => setFilter('hot')}>🔥 Hot</button>
      <button className={`filter-btn warm ${filter==='warm'?'active':''}`} onClick={() => setFilter('warm')}>🔥 Warm</button>
      <button className={`filter-btn cold ${filter==='cold'?'active':''}`} onClick={() => setFilter('cold')}>❄ Cold</button>
      <button className={`filter-btn ${filter==='handover'?'active':''}`} style={filter==='handover'?{background:'rgba(168,85,247,0.12)',color:'#a855f7',borderColor:'#a855f7'}:{}} onClick={() => setFilter('handover')}>🤝 Handover</button>
    </div>
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {filtered.length === 0 ? <div className="empty-state" style={{ padding: 40 }}><div className="empty-icon">🔍</div><p>No leads found. Leads appear when customers message your WhatsApp.</p></div> :
      <table className="data-table"><thead><tr><th>Contact</th><th>AI Score</th><th>Label</th><th>Last Active</th><th>Actions</th></tr></thead><tbody>
        {filtered.map(l => (<tr key={l.id}>
          <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: `hsl(${(l.name||'').charCodeAt(0)*37%360},60%,45%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{(l.name||'?')[0].toUpperCase()}</div>
            <div><div style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{l.phone_number}</div></div>
          </div></td>
          <td><div className="score-display"><span className="score-number" style={{ color: scoreColor(l.lead_score) }}>{l.lead_score}/100</span><div className="score-bar"><div className="score-bar-fill" style={{ width: `${l.lead_score}%`, background: scoreColor(l.lead_score) }}></div></div></div></td>
          <td><span className={`lead-badge ${l.lead_status}`}><span className="badge-dot"></span>{(l.lead_status || 'new').toUpperCase()}</span></td>
          <td style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{timeAgo(l.created_at)}</td>
          <td><div style={{ display: 'flex', gap: 6 }}><button className="btn btn-secondary btn-sm">View</button><button className="btn btn-primary btn-sm">Call</button></div></td>
        </tr>))}
      </tbody></table>}
    </div>
  </>);
}
