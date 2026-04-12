'use client';
import { useState, useEffect, useRef } from 'react';
const API = '/api';

export default function Conversations() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef(null);

  useEffect(() => { fetch(`${API}/conversations`).then(r => r.json()).then(d => { setConversations(d); if (d.length > 0) setActiveId(d[0].id); }).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!activeId) return; fetch(`${API}/conversations/${activeId}/messages`).then(r => r.json()).then(setMessages).catch(() => setMessages([])); }, [activeId]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const activeConv = conversations.find(c => c.id === activeId);
  const activeLead = activeConv?.lead;
  const filtered = conversations.filter(c => { if (!search) return true; const q = search.toLowerCase(); return (c.lead?.name||'').toLowerCase().includes(q) || (c.lead?.phone_number||'').includes(q); });
  const timeAgo = dt => { if (!dt) return ''; const m = Math.floor((Date.now()-new Date(dt).getTime())/60000); if (m<1) return 'Just now'; if (m<60) return `${m}m ago`; const h = Math.floor(m/60); if (h<24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; };
  const formatTime = dt => dt ? new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  if (loading) return <div className="loading"><div className="spinner"></div>Loading conversations...</div>;

  return (
    <div style={{ margin: '-24px -28px', height: 'calc(100vh - 56px)' }}>
      <div className="split-pane">
        <div className="split-left">
          <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Conversations</h2>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12 }}>All WhatsApp threads managed by your AI</p>
            <input className="form-input" placeholder="🔍 Search conversations..." value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 12, padding: '8px 12px' }} />
          </div>
          <div style={{ padding: 8, flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, padding: '8px 10px 6px' }}>All Conversations</div>
            {filtered.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No conversations yet</div> :
             filtered.map(conv => { const lead = conv.lead||{}; const isA = conv.id === activeId;
              return (<div key={conv.id} onClick={() => setActiveId(conv.id)} style={{ display: 'flex', gap: 10, padding: '12px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: isA ? 'rgba(16,185,129,0.08)' : 'transparent', borderLeft: isA ? '3px solid var(--accent)' : '3px solid transparent', transition: 'all 0.15s', marginBottom: 2 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `hsl(${(lead.name||'').charCodeAt(0)*37%360},60%,45%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{(lead.name||'?')[0].toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontWeight: 600, fontSize: 13 }}>{lead.name||'Unknown'}</span><span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{timeAgo(conv.created_at)}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.phone_number}</div>
                  <div style={{ marginTop: 4 }}><span className={`lead-badge ${lead.lead_status||'new'}`} style={{ fontSize: 9, padding: '1px 8px' }}><span className="badge-dot" style={{ width: 4, height: 4 }}></span>{(lead.lead_status||'new').toUpperCase()}</span></div>
                </div>
              </div>);
            })}
          </div>
        </div>
        <div className="split-right" style={{ background: 'var(--bg-primary)' }}>
          {activeLead ? (<>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: `hsl(${(activeLead.name||'').charCodeAt(0)*37%360},60%,45%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 16 }}>{(activeLead.name||'?')[0].toUpperCase()}</div>
                <div><div style={{ fontWeight: 600, fontSize: 14 }}>{activeLead.name}</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{activeLead.phone_number}</div></div>
              </div>
              <span className={`lead-badge ${activeLead.lead_status}`}><span className="badge-dot"></span>{(activeLead.lead_status||'new').toUpperCase()} — {activeLead.lead_score}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {messages.map(msg => (<div key={msg.id} style={{ marginBottom: 16 }}>
                {msg.sender_type === 'ai' && <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--accent)', marginBottom: 4, fontWeight: 600 }}>🤖 AI Agent</div>}
                <div style={{ maxWidth: '75%', marginLeft: msg.sender_type === 'ai' ? 'auto' : 0, padding: '10px 16px', borderRadius: msg.sender_type === 'ai' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: msg.sender_type === 'ai' ? 'var(--accent)' : 'var(--bg-card)', color: msg.sender_type === 'ai' ? 'white' : 'var(--text-primary)', fontSize: 13, lineHeight: 1.5, border: msg.sender_type === 'ai' ? 'none' : '1px solid var(--border-color)' }}>{msg.message_text}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4, textAlign: msg.sender_type === 'ai' ? 'right' : 'left' }}>{formatTime(msg.created_at)}</div>
              </div>))}
              <div ref={chatEndRef}></div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 10, background: 'var(--bg-secondary)' }}>
              <input className="form-input" placeholder="Type a message to override AI..." style={{ flex: 1 }} disabled /><button className="btn btn-primary" disabled>Send</button>
            </div>
          </>) : <div className="empty-state" style={{ margin: 'auto' }}><div className="empty-icon">💬</div><p>Select a conversation to view the chat thread</p></div>}
        </div>
      </div>
    </div>
  );
}
