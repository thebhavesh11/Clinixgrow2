'use client';
import { useState, useEffect, useRef } from 'react';
import { API, safeFetch, timeAgo, formatTime } from '../lib/utils';

export default function Conversations() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const showToast = (msg, type) => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 3500); };

  const fetchConversations = async () => {
    const [d] = await safeFetch(`${API}/conversations`);
    const list = Array.isArray(d) ? d : [];
    setConversations(list);
    return list;
  };

  const fetchMessages = async (id) => {
    if (!id) return;
    const [d] = await safeFetch(`${API}/conversations/${id}/messages`);
    setMessages(Array.isArray(d) ? d : []);
  };

  useEffect(() => {
    fetchConversations().then(list => { if (list.length > 0) setActiveId(list[0].id); }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchMessages(activeId); }, [activeId]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Auto-refresh messages every 5 seconds for active conversation
  useEffect(() => {
    if (!activeId) return;
    const iv = setInterval(() => fetchMessages(activeId), 5000);
    return () => clearInterval(iv);
  }, [activeId]);

  const activeConv = conversations.find(c => c.id === activeId);
  const activeLead = activeConv?.lead;
  const isHandover = activeLead?.lead_status === 'handover';
  const filtered = conversations.filter(c => { if (!search) return true; const q = search.toLowerCase(); return (c.lead?.name || '').toLowerCase().includes(q) || (c.lead?.phone_number || '').includes(q); });

  const sendManualReply = async () => {
    if (!replyText.trim() || !activeId || sending) return;
    setSending(true);
    const [data, err] = await safeFetch(`${API}/conversations/${activeId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: replyText.trim() }),
    });
    setSending(false);
    if (data?.success) {
      showToast('Message sent! AI paused for this contact.', 'success');
      setReplyText('');
      fetchMessages(activeId);
      fetchConversations();
    } else if (data && !data.success) {
      // Message saved but send failed
      showToast(`Saved but send failed: ${data.error || 'Unknown'}`, 'error');
      setReplyText('');
      fetchMessages(activeId);
      fetchConversations();
    } else {
      showToast(err || 'Failed to send', 'error');
    }
  };

  const toggleAI = async () => {
    if (!activeId) return;
    const newStatus = isHandover ? 'warm' : 'handover';
    const [data, err] = await safeFetch(`${API}/conversations/${activeId}/lead-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (data?.success) {
      showToast(newStatus === 'handover' ? 'AI paused — you are in control' : 'AI resumed — bot will reply now', 'success');
      fetchConversations();
    } else {
      showToast(err || 'Failed', 'error');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendManualReply(); }
  };

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
             filtered.map(conv => { const lead = conv.lead || {}; const isA = conv.id === activeId; const isHO = lead.lead_status === 'handover';
              return (<div key={conv.id} onClick={() => setActiveId(conv.id)} style={{ display: 'flex', gap: 10, padding: '12px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: isA ? 'rgba(16,185,129,0.08)' : 'transparent', borderLeft: isA ? '3px solid var(--accent)' : '3px solid transparent', transition: 'all 0.15s', marginBottom: 2 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `hsl(${(lead.name || '').charCodeAt(0) * 37 % 360},60%,45%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{(lead.name || '?')[0].toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontWeight: 600, fontSize: 13 }}>{lead.name || 'Unknown'}</span><span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{timeAgo(conv.created_at)}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.phone_number}</div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className={`lead-badge ${lead.lead_status || 'new'}`} style={{ fontSize: 9, padding: '1px 8px' }}><span className="badge-dot" style={{ width: 4, height: 4 }}></span>{(lead.lead_status || 'new').toUpperCase()}</span>
                    {isHO && <span style={{ fontSize: 9, color: 'var(--warning, #f59e0b)', fontWeight: 700 }}>👤 YOU</span>}
                  </div>
                </div>
              </div>);
            })}
          </div>
        </div>
        <div className="split-right" style={{ background: 'var(--bg-primary)' }}>
          {activeLead ? (<>
            {/* Chat Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: `hsl(${(activeLead.name || '').charCodeAt(0) * 37 % 360},60%,45%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 16 }}>{(activeLead.name || '?')[0].toUpperCase()}</div>
                <div><div style={{ fontWeight: 600, fontSize: 14 }}>{activeLead.name}</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{activeLead.phone_number}</div></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`lead-badge ${activeLead.lead_status}`}><span className="badge-dot"></span>{(activeLead.lead_status || 'new').toUpperCase()} — {activeLead.lead_score}</span>
                <button onClick={toggleAI} className={`btn ${isHandover ? 'btn-primary' : 'btn-danger'}`} style={{ fontSize: 11, padding: '6px 14px' }}>
                  {isHandover ? '🤖 Resume AI' : '👤 Take Over'}
                </button>
              </div>
            </div>

            {/* Handover Banner */}
            {isHandover && (
              <div style={{ padding: '8px 20px', background: 'rgba(251,191,36,0.1)', borderBottom: '1px solid rgba(251,191,36,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: 'var(--warning, #f59e0b)', fontWeight: 600 }}>👤 You are in control — AI is paused for this contact</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Click "Resume AI" to let the bot reply again</div>
              </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {messages.map(msg => (<div key={msg.id} style={{ marginBottom: 16 }}>
                {msg.sender_type === 'ai' && <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--accent)', marginBottom: 4, fontWeight: 600 }}>🤖 AI Agent</div>}
                {msg.sender_type === 'human' && <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--warning, #f59e0b)', marginBottom: 4, fontWeight: 600 }}>👤 You (Manual)</div>}
                <div style={{
                  maxWidth: '75%',
                  marginLeft: (msg.sender_type === 'ai' || msg.sender_type === 'human') ? 'auto' : 0,
                  padding: '10px 16px',
                  borderRadius: (msg.sender_type === 'ai' || msg.sender_type === 'human') ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.sender_type === 'ai' ? 'var(--accent)' : msg.sender_type === 'human' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'var(--bg-card)',
                  color: (msg.sender_type === 'ai' || msg.sender_type === 'human') ? 'white' : 'var(--text-primary)',
                  fontSize: 13, lineHeight: 1.5,
                  border: (msg.sender_type === 'ai' || msg.sender_type === 'human') ? 'none' : '1px solid var(--border-color)'
                }}>{msg.message_text}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4, textAlign: (msg.sender_type === 'ai' || msg.sender_type === 'human') ? 'right' : 'left' }}>{formatTime(msg.created_at)}</div>
              </div>))}
              <div ref={chatEndRef}></div>
            </div>

            {/* Reply Input */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea
                  ref={inputRef}
                  className="form-input"
                  placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  style={{ flex: 1, resize: 'none', minHeight: 40, maxHeight: 120, fontFamily: 'inherit' }}
                />
                <button
                  className="btn btn-primary"
                  onClick={sendManualReply}
                  disabled={sending || !replyText.trim()}
                  style={{ height: 40, minWidth: 80 }}
                >
                  {sending ? '...' : '📩 Send'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                {isHandover
                  ? '👤 You are replying manually — AI is paused for this contact'
                  : '⚡ Sending a manual reply will pause AI for this contact'}
              </div>
            </div>
          </>) : <div className="empty-state" style={{ margin: 'auto' }}><div className="empty-icon">💬</div><p>Select a conversation to view the chat thread</p></div>}
        </div>
      </div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.type === 'success' ? '✅' : '❌'} {toast.message}</div>}
    </div>
  );
}
