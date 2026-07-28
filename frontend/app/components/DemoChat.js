'use client';
import { useState, useEffect, useRef } from 'react';
import { API, safeFetch } from '../lib/utils';
import { useClient } from '../lib/ClientContext';

export default function DemoChat({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const { selectedClientId } = useClient();

  const loadHistory = async () => {
    const [data] = await safeFetch(`${API}/demo-chat/history?business_id=${selectedClientId}`);
    if (Array.isArray(data)) setMessages(data);
  };

  useEffect(() => { loadHistory(); }, [selectedClientId]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');

    // Optimistic: show customer message immediately
    const tempMsg = { id: Date.now(), sender_type: 'customer', message_text: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempMsg]);

    setSending(true);
    const [data, err] = await safeFetch(`${API}/demo-chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, business_id: selectedClientId }),
    });
    setSending(false);

    if (data?.reply) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender_type: 'ai',
        message_text: data.reply,
        created_at: new Date().toISOString(),
      }]);
      if (data.booked_appointments?.length) {
        setMessages(prev => [...prev, {
          id: Date.now() + 2,
          sender_type: 'system',
          message_text: `📅 Appointment booked: ${data.booked_appointments.map(a => `${a.date} ${a.time}-${a.end_time}`).join(', ')}`,
          created_at: new Date().toISOString(),
        }]);
      }
    } else if (data?.error) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender_type: 'system',
        message_text: `❌ Error: ${data.error}`,
        created_at: new Date().toISOString(),
      }]);
    } else if (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender_type: 'system',
        message_text: `❌ ${err}`,
        created_at: new Date().toISOString(),
      }]);
    }
    inputRef.current?.focus();
  };

  const clearChat = async () => {
    setClearing(true);
    await safeFetch(`${API}/demo-chat/clear?business_id=${selectedClientId}`, { method: 'DELETE' });
    setMessages([]);
    setClearing(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="demo-chat-overlay">
      <div className="demo-chat-panel">
        {/* Header */}
        <div className="demo-chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="demo-chat-avatar">🧪</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>AI Test Chat</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Test your AI agent without WhatsApp</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={clearChat} disabled={clearing} className="demo-chat-btn-clear" title="Clear chat">
              {clearing ? '...' : '🗑️ Clear'}
            </button>
            <button onClick={onClose} className="demo-chat-btn-close" title="Close">✕</button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="demo-chat-banner">
          💡 You are chatting as a <strong>customer</strong>. Your AI agent will reply using the same logic as WhatsApp.
          Test appointment booking, lead handling, and responses here.
        </div>

        {/* Messages */}
        <div className="demo-chat-messages">
          {messages.length === 0 && (
            <div className="demo-chat-empty">
              <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Start Testing!</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                Send a message as a customer to see how your AI responds.
                <br />Try: "Hi", "I want to book an appointment", "What services do you offer?"
              </div>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`demo-msg demo-msg-${msg.sender_type}`}>
              {msg.sender_type === 'ai' && <div className="demo-msg-label demo-msg-label-ai">🤖 AI Agent</div>}
              {msg.sender_type === 'system' && <div className="demo-msg-label demo-msg-label-system">ℹ️ System</div>}
              <div className={`demo-msg-bubble demo-msg-bubble-${msg.sender_type}`}>
                {msg.message_text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="demo-msg demo-msg-ai">
              <div className="demo-msg-label demo-msg-label-ai">🤖 AI Agent</div>
              <div className="demo-msg-bubble demo-msg-bubble-ai demo-typing">
                <span className="demo-typing-dot"></span>
                <span className="demo-typing-dot"></span>
                <span className="demo-typing-dot"></span>
              </div>
            </div>
          )}
          <div ref={chatEndRef}></div>
        </div>

        {/* Input */}
        <div className="demo-chat-input-area">
          <textarea
            ref={inputRef}
            className="demo-chat-input"
            placeholder="Type as a customer... (Enter to send)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={sending}
          />
          <button
            className="demo-chat-send"
            onClick={sendMessage}
            disabled={sending || !input.trim()}
          >
            {sending ? '⏳' : '➤'}
          </button>
        </div>
      </div>
    </div>
  );
}
