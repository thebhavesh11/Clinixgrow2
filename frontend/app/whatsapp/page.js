'use client';
import { useState, useEffect } from 'react';
const API = '/api';

export default function WhatsApp() {
  const [status, setStatus] = useState({ connected: false, hasQR: false, info: null, error: null });
  const [qrImage, setQrImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [aiSettings, setAiSettings] = useState(null);

  const showToast = (msg, type) => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 3500); };
  const fetchQR = async () => { try { const r = await fetch(`${API}/whatsapp/qr`); const d = await r.json(); if (d.qr) setQrImage(d.qr); } catch {} };
  const checkStatus = async () => { try { const r = await fetch(`${API}/whatsapp/status`); const d = await r.json(); setStatus(d); if (d.hasQR) fetchQR(); } catch { setStatus({ connected: false, hasQR: false, info: null, error: 'Backend unreachable' }); } finally { setLoading(false); } };
  const fetchAI = async () => { try { const r = await fetch(`${API}/ai-settings`); const d = await r.json(); setAiSettings(d); } catch {} };

  useEffect(() => { checkStatus(); fetchAI(); const iv = setInterval(checkStatus, 8000); return () => clearInterval(iv); }, []);

  const disconnect = async () => { if (!confirm('Disconnect? You will need to scan QR again.')) return; try { await fetch(`${API}/whatsapp/disconnect`, { method: 'POST' }); showToast('Disconnected.', 'success'); setQrImage(null); checkStatus(); } catch { showToast('Disconnect failed', 'error'); } };
  const restart = async () => { try { await fetch(`${API}/whatsapp/restart`, { method: 'POST' }); showToast('Restarting...', 'success'); setTimeout(checkStatus, 5000); } catch { showToast('Restart failed', 'error'); } };

  const toggleGroupReplies = async () => {
    const newVal = aiSettings.group_replies ? 0 : 1;
    try {
      const r = await fetch(`${API}/ai-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...aiSettings, group_replies: newVal }) });
      if (r.ok) { setAiSettings({ ...aiSettings, group_replies: newVal }); showToast(newVal ? 'Group replies ON' : 'Group replies OFF', 'success'); }
    } catch { showToast('Failed to update', 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div>Loading WhatsApp status...</div>;

  return (<>
    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>WhatsApp Connection</h2>
    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24 }}>Manage linked WhatsApp sessions</p>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="card-header" style={{ textAlign: 'center' }}>WhatsApp Web Connection</div>
        {status.connected ? (<div style={{ padding: '30px 0' }}><div style={{ fontSize: 48, marginBottom: 12 }}>✅</div><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>Connected</div>{status.info && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{status.info.pushname||'WhatsApp User'}</div>}</div>) : (<>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: 8 }}>Scan this QR code with WhatsApp on your phone to connect.</p>
          {qrImage ? <div style={{ marginBottom: 16 }}><img src={qrImage} alt="QR" style={{ width: 220, height: 220, borderRadius: 8, border: '2px solid var(--border-color)' }} /></div> :
          <div style={{ width: 220, height: 220, margin: '0 auto 16px', borderRadius: 8, border: '2px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--text-tertiary)', fontSize: 13 }}><div style={{ fontSize: 28, marginBottom: 8 }}>📱</div>{status.error ? <span style={{ color: 'var(--danger)', fontSize: 12, maxWidth: 160, textAlign: 'center' }}>{status.error}</span> : 'Waiting for QR code...'}</div>}
        </>)}
        <button className="btn btn-primary" onClick={() => { fetchQR(); checkStatus(); }} style={{ marginBottom: 10 }}>Generate QR Code</button>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.8, marginTop: 12 }}>1. Open WhatsApp on your phone<br/>2. Go to Settings → Linked Devices<br/>3. Tap "Link a Device" and scan</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          {status.connected && <button className="btn btn-danger" onClick={disconnect}>Disconnect & Change Number</button>}
          <button className="btn btn-secondary" onClick={restart}>🔄 Restart Connection</button>
          <button className="btn btn-secondary" onClick={checkStatus}>↻ Refresh Status</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card">
          <div className="card-header">Reply Settings</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Reply to Group Messages</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>When enabled, the AI will respond to messages in WhatsApp groups</div>
            </div>
            <div onClick={toggleGroupReplies} style={{ width: 44, height: 24, borderRadius: 12, background: aiSettings?.group_replies ? 'var(--accent)' : 'var(--border-color)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: aiSettings?.group_replies ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: aiSettings?.group_replies ? 'var(--success)' : 'var(--text-tertiary)', marginTop: 8, fontWeight: 600, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border-color)' }}>
            {aiSettings?.group_replies ? '🟢 Group replies are ON' : '⚫ Group replies are OFF'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Reply to Saved Contacts</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>When OFF, the AI only replies to new/unsaved numbers (not your contacts)</div>
            </div>
            <div onClick={async () => { const newVal = aiSettings.reply_to_contacts ? 0 : 1; try { const r = await fetch(`${API}/ai-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...aiSettings, reply_to_contacts: newVal }) }); if (r.ok) { setAiSettings({ ...aiSettings, reply_to_contacts: newVal }); showToast(newVal ? 'Replying to all' : 'Only new numbers', 'success'); } } catch {} }} style={{ width: 44, height: 24, borderRadius: 12, background: aiSettings?.reply_to_contacts ? 'var(--accent)' : 'var(--border-color)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: aiSettings?.reply_to_contacts ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: aiSettings?.reply_to_contacts ? 'var(--success)' : 'var(--warning, #f59e0b)', marginTop: 8, fontWeight: 600 }}>
            {aiSettings?.reply_to_contacts ? '🟢 Replying to everyone (contacts + new numbers)' : '🟡 Only replying to new/unsaved numbers'}
          </div>
        </div>
        <div className="card">
          <div className="card-header">Reply Delay</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>Add a delay before the bot replies to make it look more human and avoid WhatsApp bans.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[0, 3, 5, 10, 15, 30].map(s => (
              <div key={s} onClick={async () => { try { const r = await fetch(`${API}/ai-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...aiSettings, reply_delay: s }) }); if (r.ok) { setAiSettings({ ...aiSettings, reply_delay: s }); showToast(`Reply delay set to ${s}s`, 'success'); } } catch {} }} style={{ padding: '8px 16px', borderRadius: 8, border: `2px solid ${(aiSettings?.reply_delay || 0) === s ? 'var(--accent)' : 'var(--border-color)'}`, background: (aiSettings?.reply_delay || 0) === s ? 'rgba(16,185,129,0.1)' : 'var(--bg-primary)', color: (aiSettings?.reply_delay || 0) === s ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s' }}>
                {s === 0 ? 'Instant' : `${s}s`}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10 }}>
            Current delay: <strong style={{ color: 'var(--text-primary)' }}>{(aiSettings?.reply_delay || 0) === 0 ? 'No delay (instant)' : `${aiSettings?.reply_delay} seconds`}</strong>
          </div>
        </div>
        <div className="card">
          <div className="card-header">Typing Indicator</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Show "typing..." to Customer</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Displays a typing animation in the chat during the reply delay</div>
            </div>
            <div onClick={async () => { const newVal = aiSettings.typing_indicator ? 0 : 1; try { const r = await fetch(`${API}/ai-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...aiSettings, typing_indicator: newVal }) }); if (r.ok) { setAiSettings({ ...aiSettings, typing_indicator: newVal }); showToast(newVal ? 'Typing indicator ON' : 'Typing indicator OFF', 'success'); } } catch {} }} style={{ width: 44, height: 24, borderRadius: 12, background: aiSettings?.typing_indicator ? 'var(--accent)' : 'var(--border-color)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: aiSettings?.typing_indicator ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: aiSettings?.typing_indicator ? 'var(--success)' : 'var(--text-tertiary)', marginTop: 8, fontWeight: 600 }}>
            {aiSettings?.typing_indicator ? '🟢 Typing indicator is ON' : '⚫ Typing indicator is OFF'}
          </div>
        </div>
        <div className="card">
          <div className="card-header">Auto Handover to Human</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Stop AI after set replies</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>AI stops replying after a set number of messages and hands over to you</div>
            </div>
            <div onClick={async () => { const newVal = aiSettings.auto_handover ? 0 : 1; try { const r = await fetch(`${API}/ai-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...aiSettings, auto_handover: newVal }) }); if (r.ok) { setAiSettings({ ...aiSettings, auto_handover: newVal }); showToast(newVal ? 'Auto handover ON' : 'Auto handover OFF', 'success'); } } catch {} }} style={{ width: 44, height: 24, borderRadius: 12, background: aiSettings?.auto_handover ? 'var(--accent)' : 'var(--border-color)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: aiSettings?.auto_handover ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: aiSettings?.auto_handover ? 'var(--success)' : 'var(--text-tertiary)', marginTop: 8, fontWeight: 600 }}>
            {aiSettings?.auto_handover ? '🟢 Auto handover is ON' : '⚫ Auto handover is OFF'}
          </div>
          {aiSettings?.auto_handover ? (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
              <label className="form-label" style={{ fontSize: 12 }}>Hand over after how many AI replies?</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <input className="form-input" type="number" min="1" max="100" value={aiSettings?.handover_after || 10} onChange={e => setAiSettings({ ...aiSettings, handover_after: parseInt(e.target.value) || 10 })} style={{ width: 80, textAlign: 'center', fontSize: 14, fontWeight: 700 }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>replies</span>
                <button className="btn btn-primary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={async () => { try { const r = await fetch(`${API}/ai-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...aiSettings }) }); if (r.ok) showToast(`Handover after ${aiSettings.handover_after} replies`, 'success'); } catch {} }}>Save</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>After {aiSettings?.handover_after || 10} AI replies, the lead will be marked as "Handover" and the AI will stop replying to that number.</div>
            </div>
          ) : null}
        </div>
        <div className="card"><div className="card-header">Connection Settings</div>
          <div className="form-group"><label className="form-label">Business WhatsApp Number</label><input className="form-input" placeholder="+92 300 0000000" disabled /></div>
          <div className="form-group"><label className="form-label">Session Name</label><input className="form-input" defaultValue="main-session" disabled /></div>
          <div className="form-group"><label className="form-label">Auto-reconnect</label><select className="form-select" defaultValue="yes" disabled><option value="yes">Yes</option><option value="no">No</option></select></div>
        </div>
        <div className="card"><div className="card-header">Message Settings</div>
          <div className="form-group"><label className="form-label">Typing Indicator</label><select className="form-select" defaultValue="enabled" disabled><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></div>
          <div className="form-group"><label className="form-label">Read Receipts</label><select className="form-select" defaultValue="after" disabled><option value="after">After reply</option><option value="immediate">Immediately</option><option value="never">Never</option></select></div>
          <div className="form-group"><label className="form-label">Business Hours Only</label><select className="form-select" defaultValue="24/7" disabled><option value="24/7">24/7</option><option value="hours">Business hours only</option></select></div>
        </div>
      </div>
    </div>
    {toast && <div className={`toast toast-${toast.type}`}>{toast.type==='success'?'✅':'❌'} {toast.message}</div>}
  </>);
}

