'use client';
import { useState, useEffect } from 'react';
import { API, safeFetch } from '../lib/utils';
import { useClient } from '../lib/ClientContext';

function fmtDuration(secs) {
  if (!secs) return '0s';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function VoiceAgentPage() {
  const [tab, setTab] = useState('config');
  const [settings, setSettings] = useState(null);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedCall, setSelectedCall] = useState(null);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const { bUrl, selectedClientId } = useClient();

  useEffect(() => { if (selectedClientId) loadAll(); }, [selectedClientId]);

  async function loadAll() {
    setLoading(true);
    const [sData] = await safeFetch(bUrl('/voice/settings'));
    const [cData] = await safeFetch(bUrl('/voice/calls'));
    if (sData) setSettings(sData);
    setCalls(Array.isArray(cData) ? cData : []);
    setLoading(false);
  }

  async function saveSettings() {
    setSaving(true);
    const [_, err] = await safeFetch(bUrl('/voice/settings'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (err) { showToast(err, 'error'); return; }
    showToast('Settings saved!', 'success');
  }

  async function testConnection() {
    const [data, err] = await safeFetch(bUrl('/voice/test'), { method: 'POST' });
    if (err) { showToast(err, 'error'); return; }
    if (data?.success) showToast(data.message, 'success');
    else showToast(data?.message || 'Test failed', 'error');
  }

  async function createAssistant() {
    const [data, err] = await safeFetch(bUrl('/voice/create-assistant'), { method: 'POST' });
    if (err) { showToast(err, 'error'); return; }
    if (data?.success) {
      showToast(data.message, 'success');
      setSettings(s => ({ ...s, vapi_assistant_id: data.assistant_id }));
    } else showToast(data?.message || 'Failed', 'error');
  }

  async function syncAssistant() {
    const [data, err] = await safeFetch(bUrl('/voice/sync-assistant'), { method: 'PUT' });
    if (err) { showToast(err, 'error'); return; }
    if (data?.success) showToast(data.message, 'success');
    else showToast(data?.message || 'Sync failed', 'error');
  }

  async function makeTestCall() {
    if (!testPhone) { showToast('Enter a phone number', 'error'); return; }
    setTesting(true);
    const [data, err] = await safeFetch(bUrl('/voice/call'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: testPhone }),
    });
    setTesting(false);
    if (err) { showToast(err, 'error'); return; }
    if (data?.success) {
      showToast('Call initiated! ' + data.message, 'success');
      setTimeout(() => loadAll(), 3000);
    } else showToast(data?.message || 'Call failed', 'error');
  }

  function upd(field, value) { setSettings(s => ({ ...s, [field]: value })); }
  function showToast(msg, type) { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }
  function copyWebhookUrl() {
    const url = `${window.location.origin}/api/voice/webhook`;
    navigator.clipboard?.writeText(url);
    showToast('Webhook URL copied!', 'success');
  }

  function parseTranscript(text) {
    if (!text) return [];
    return text.split('\n').filter(Boolean).map((line, i) => {
      const isAI = line.startsWith('AI:');
      const isCust = line.startsWith('Customer:');
      return { id: i, role: isAI ? 'ai' : isCust ? 'customer' : 'other', text: line.replace(/^(AI|Customer|assistant|user):\s*/i, '') };
    });
  }

  if (loading) return <div className="loading"><div className="spinner"></div>Loading voice agent...</div>;

  return (<>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Voice Agent</h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>AI phone agent powered by Vapi.ai</p>
      </div>
      <div className={`voice-active-indicator ${settings?.is_active ? 'active' : 'inactive'}`}>
        <span className="pulse-dot"></span>
        {settings?.is_active ? 'Active' : 'Inactive'}
      </div>
    </div>

    <div className="tabs" style={{ marginTop: 16 }}>
      <div className={`tab ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}>⚙️ Configuration</div>
      <div className={`tab ${tab === 'calls' ? 'active' : ''}`} onClick={() => setTab('calls')}>📞 Call Logs ({calls.length})</div>
      <div className={`tab ${tab === 'test' ? 'active' : ''}`} onClick={() => setTab('test')}>🎯 Test Call</div>
    </div>

    {/* ═══ CONFIG TAB ═══ */}
    {tab === 'config' && settings && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Vapi Connection */}
        <div className="voice-config-grid">
          <div className="voice-config-section">
            <div className="section-title">🔑 Vapi Connection</div>
            <div className="form-group">
              <label className="form-label">Vapi API Key</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" type="password" value={settings.vapi_api_key || ''} onChange={e => upd('vapi_api_key', e.target.value)} placeholder="Enter Vapi API key" />
                <button className="btn btn-secondary btn-sm" onClick={testConnection} style={{ whiteSpace: 'nowrap' }}>🔍 Test</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Assistant ID</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" value={settings.vapi_assistant_id || ''} onChange={e => upd('vapi_assistant_id', e.target.value)} placeholder="Auto-created or paste existing" />
                {!settings.vapi_assistant_id
                  ? <button className="btn btn-primary btn-sm" onClick={createAssistant} style={{ whiteSpace: 'nowrap' }}>✨ Create</button>
                  : <button className="btn btn-secondary btn-sm" onClick={syncAssistant} style={{ whiteSpace: 'nowrap' }}>🔄 Sync</button>
                }
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Vapi Phone Number ID</label>
              <input className="form-input" value={settings.vapi_phone_id || ''} onChange={e => upd('vapi_phone_id', e.target.value)} placeholder="From Vapi dashboard" />
            </div>
            <div className="form-group">
              <label className="form-label">Display Phone Number</label>
              <input className="form-input" value={settings.phone_number || ''} onChange={e => upd('phone_number', e.target.value)} placeholder="+91XXXXXXXXXX" />
            </div>
          </div>

          <div className="voice-config-section">
            <div className="section-title">🎤 Voice Settings</div>
            <div className="form-group">
              <label className="form-label">Agent Name</label>
              <input className="form-input" value={settings.agent_name || ''} onChange={e => upd('agent_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Language</label>
              <select className="form-select" value={settings.language || 'hi-IN'} onChange={e => upd('language', e.target.value)}>
                <option value="hi-IN">Hindi (hi-IN)</option>
                <option value="en-US">English US (en-US)</option>
                <option value="en-IN">English India (en-IN)</option>
                <option value="multi">Multilingual</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Voice Provider</label>
              <select className="form-select" value={settings.voice_provider || '11labs'} onChange={e => upd('voice_provider', e.target.value)}>
                <option value="11labs">ElevenLabs</option>
                <option value="playht">PlayHT</option>
                <option value="deepgram">Deepgram</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Voice ID (from provider)</label>
              <input className="form-input" value={settings.voice_id || ''} onChange={e => upd('voice_id', e.target.value)} placeholder="Leave empty for default" />
            </div>
            <div className="form-group">
              <label className="form-label">First Message (Greeting)</label>
              <input className="form-input" value={settings.first_message || ''} onChange={e => upd('first_message', e.target.value)} placeholder="Hello! How can I help you?" />
            </div>
          </div>
        </div>

        {/* System Prompt + Features */}
        <div className="voice-config-grid">
          <div className="voice-config-section">
            <div className="section-title">🧠 System Prompt</div>
            <div className="form-group">
              <label className="form-label">Custom instructions for the voice agent</label>
              <textarea className="form-textarea" value={settings.system_prompt || ''} onChange={e => upd('system_prompt', e.target.value)} placeholder="You are a helpful AI assistant for our business..." rows={8} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              💡 Business info (services, pricing, FAQs) is automatically appended from your Business settings.
            </p>
          </div>

          <div className="voice-config-section">
            <div className="section-title">⚡ Features & Webhook</div>
            <div className="form-group">
              <label className="form-label">Capabilities</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!settings.can_book_appointments} onChange={e => upd('can_book_appointments', e.target.checked ? 1 : 0)} />
                  📅 Can book appointments
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!settings.can_transfer_call} onChange={e => upd('can_transfer_call', e.target.checked ? 1 : 0)} />
                  📲 Can transfer call to human
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!settings.is_active} onChange={e => upd('is_active', e.target.checked ? 1 : 0)} />
                  🟢 Voice agent active
                </label>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 16 }}>
              <label className="form-label">Webhook URL (paste in Vapi dashboard)</label>
              <div className="webhook-url-box">
                <span style={{ flex: 1 }}>{typeof window !== 'undefined' ? `${window.location.origin}/api/voice/webhook` : '/api/voice/webhook'}</span>
                <button className="copy-btn" onClick={copyWebhookUrl}>📋 Copy</button>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">Webhook Secret (optional)</label>
              <input className="form-input" value={settings.webhook_secret || ''} onChange={e => upd('webhook_secret', e.target.value)} placeholder="Auto-generated" />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>
            {saving ? '⏳ Saving...' : '💾 Save Settings'}
          </button>
        </div>
      </div>
    )}

    {/* ═══ CALL LOGS TAB ═══ */}
    {tab === 'calls' && (
      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ flex: 1 }}>
          {calls.length > 0 ? (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Phone</th>
                    <th>Lead</th>
                    <th>Direction</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Appts</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map(c => (
                    <tr key={c.id} className="call-row" onClick={() => setSelectedCall(c)} style={{ background: selectedCall?.id === c.id ? 'rgba(99, 102, 241, 0.06)' : '' }}>
                      <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{new Date(c.created_at).toLocaleString()}</td>
                      <td style={{ fontWeight: 600 }}>{c.phone_number || '—'}</td>
                      <td>{c.lead ? c.lead.name : '—'}</td>
                      <td><span className={`call-direction ${c.direction}`}>{c.direction === 'inbound' ? '📞↙ In' : '📞↗ Out'}</span></td>
                      <td className="call-duration">{fmtDuration(c.duration_seconds)}</td>
                      <td><span className={`call-status ${c.status}`}>{c.status}</span></td>
                      <td>{c.appointments_booked > 0 ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>📅 {c.appointments_booked}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📞</div>
              <p>No calls yet. Configure your voice agent and make a test call!</p>
            </div>
          )}
        </div>

        {/* Call detail panel */}
        {selectedCall && (
          <div style={{ width: 400, minWidth: 400 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700 }}>Call Details</h4>
                <button className="modal-close" onClick={() => setSelectedCall(null)} style={{ width: 28, height: 28 }}>✕</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 16 }}>
                <div><span style={{ color: 'var(--text-tertiary)' }}>Phone:</span><br/><strong>{selectedCall.phone_number}</strong></div>
                <div><span style={{ color: 'var(--text-tertiary)' }}>Direction:</span><br/><span className={`call-direction ${selectedCall.direction}`}>{selectedCall.direction}</span></div>
                <div><span style={{ color: 'var(--text-tertiary)' }}>Duration:</span><br/><strong>{fmtDuration(selectedCall.duration_seconds)}</strong></div>
                <div><span style={{ color: 'var(--text-tertiary)' }}>Status:</span><br/><span className={`call-status ${selectedCall.status}`}>{selectedCall.status}</span></div>
                <div><span style={{ color: 'var(--text-tertiary)' }}>Cost:</span><br/><strong>${selectedCall.cost?.toFixed(4) || '0.00'}</strong></div>
                <div><span style={{ color: 'var(--text-tertiary)' }}>Ended:</span><br/><span>{selectedCall.ended_reason || '—'}</span></div>
              </div>

              {selectedCall.summary && (
                <div style={{ marginBottom: 16 }}>
                  <div className="card-header">Summary</div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{selectedCall.summary}</p>
                </div>
              )}

              {selectedCall.recording_url && (
                <div style={{ marginBottom: 16 }}>
                  <div className="card-header">Recording</div>
                  <div className="audio-player">
                    <audio controls src={selectedCall.recording_url} preload="none" />
                  </div>
                </div>
              )}

              {selectedCall.transcript && (
                <div>
                  <div className="card-header">Transcript</div>
                  <div className="transcript-viewer">
                    {parseTranscript(selectedCall.transcript).map(msg => (
                      <div key={msg.id} className={`transcript-msg ${msg.role}`}>
                        <div className="msg-role">{msg.role === 'ai' ? '🤖 AI' : msg.role === 'customer' ? '👤 Customer' : msg.role}</div>
                        {msg.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )}

    {/* ═══ TEST CALL TAB ═══ */}
    {tab === 'test' && (
      <div className="card" style={{ maxWidth: 500 }}>
        <div className="section-title" style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🎯 Make a Test Call</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Test your voice agent by making an outbound call. The AI will call the given number and start a conversation.
        </p>

        {!settings?.vapi_assistant_id && (
          <div style={{ padding: 12, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--warning)' }}>
            ⚠️ Create a Vapi assistant first in the Configuration tab before making calls.
          </div>
        )}

        {!settings?.vapi_phone_id && (
          <div style={{ padding: 12, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--warning)' }}>
            ⚠️ Add a Phone Number ID from Vapi dashboard in the Configuration tab.
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Phone Number (with country code)</label>
          <input className="form-input" value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+919876543210" />
        </div>

        <button
          className="btn btn-primary"
          onClick={makeTestCall}
          disabled={testing || !settings?.vapi_assistant_id || !settings?.vapi_phone_id}
          style={{ width: '100%', padding: '12px 20px', fontSize: 14 }}
        >
          {testing ? '📞 Calling...' : '📞 Make Test Call'}
        </button>

        <div style={{ marginTop: 20, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.8 }}>
          <strong>How it works:</strong><br/>
          1. AI will call the number using your Vapi phone<br/>
          2. It will greet with your configured first message<br/>
          3. The AI can answer business questions, check slots, book appointments<br/>
          4. After the call ends, transcript & recording appear in Call Logs
        </div>
      </div>
    )}

    {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
  </>);
}
