'use client';
import { useState, useEffect } from 'react';
import { API, safeFetch } from '../lib/utils';

export default function WhatsApp() {
  const [status, setStatus] = useState({ connected: false, hasQR: false, info: null, error: null, mode: 'qr' });
  const [qrImage, setQrImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [aiSettings, setAiSettings] = useState(null);
  const [cloudForm, setCloudForm] = useState({ wa_app_id: '', wa_app_secret: '', wa_phone_number_id: '', wa_access_token: '', wa_verify_token: '', wa_business_account_id: '' });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState(null);
  const [subscribing, setSubscribing] = useState(false);
  const [customWebhookUrl, setCustomWebhookUrl] = useState('');

  const showToast = (msg, type) => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 3500); };
  const fetchQR = async () => { const [d] = await safeFetch(`${API}/whatsapp/qr`); if (d?.qr) setQrImage(d.qr); };
  const checkStatus = async () => { const [d] = await safeFetch(`${API}/whatsapp/status`); if (d) setStatus(d); else setStatus(s => ({ ...s, connected: false, error: 'Backend unreachable' })); if (d?.hasQR) fetchQR(); setLoading(false); };
  const fetchAI = async () => {
    const [d] = await safeFetch(`${API}/ai-settings`);
    if (d) {
      setAiSettings(d);
      setCloudForm({
        wa_app_id: d.wa_app_id || '', wa_app_secret: d.wa_app_secret || '',
        wa_phone_number_id: d.wa_phone_number_id || '', wa_access_token: d.wa_access_token || '',
        wa_verify_token: d.wa_verify_token || '', wa_business_account_id: d.wa_business_account_id || '',
      });
    }
  };

  useEffect(() => { checkStatus(); fetchAI(); const iv = setInterval(checkStatus, 8000); return () => clearInterval(iv); }, []);

  const currentMode = aiSettings?.wa_connection_mode || 'qr';

  const updateAISetting = async (updates) => {
    if (!aiSettings) return;
    const newSettings = { ...aiSettings, ...updates };
    const [data, err] = await safeFetch(`${API}/ai-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSettings) });
    if (data && !err) { setAiSettings(newSettings); return true; }
    showToast('Failed to update', 'error'); return false;
  };

  const switchMode = async (mode) => {
    const ok = await updateAISetting({ wa_connection_mode: mode });
    if (ok) { showToast(mode === 'cloud_api' ? 'Switched to Cloud API' : 'Switched to QR Scan', 'success'); setTestResult(null); setTimeout(checkStatus, 1000); }
  };

  const saveCloudSettings = async () => {
    setSaving(true);
    const ok = await updateAISetting({ ...cloudForm, wa_connection_mode: 'cloud_api' });
    setSaving(false);
    if (ok) { showToast('Cloud API settings saved!', 'success'); setTimeout(checkStatus, 1000); }
  };

  const testCloudConnection = async () => {
    // First save, then test
    setSaving(true);
    const saveOk = await updateAISetting({ ...cloudForm, wa_connection_mode: 'cloud_api' });
    setSaving(false);
    if (!saveOk) return;

    setTesting(true);
    setTestResult({ loading: true });
    const [d, err] = await safeFetch(`${API}/whatsapp/cloud/test`, { method: 'POST' });
    setTesting(false);
    if (d) {
      setTestResult(d);
      if (d.success) setTimeout(checkStatus, 1000);
    } else {
      setTestResult({ success: false, error: err || 'Connection test failed', checks: [] });
    }
  };

  const disconnect = async () => { if (!confirm('Disconnect? You will need to scan QR again.')) return; const [, err] = await safeFetch(`${API}/whatsapp/disconnect`, { method: 'POST' }); if (!err) { showToast('Disconnected.', 'success'); setQrImage(null); checkStatus(); } else { showToast('Disconnect failed', 'error'); } };
  const restart = async () => { const [, err] = await safeFetch(`${API}/whatsapp/restart`, { method: 'POST' }); if (!err) { showToast('Restarting...', 'success'); setTimeout(checkStatus, 5000); } else { showToast('Restart failed', 'error'); } };
  const toggleGroupReplies = async () => { const v = aiSettings?.group_replies ? 0 : 1; const ok = await updateAISetting({ group_replies: v }); if (ok) showToast(v ? 'Group replies ON' : 'Group replies OFF', 'success'); };

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/whatsapp/cloud/webhook` : '';

  const checkWebhookStatus = async () => {
    const [d] = await safeFetch(`${API}/whatsapp/cloud/webhook-status`);
    if (d) setWebhookStatus(d);
  };

  const subscribeWebhook = async () => {
    const url = customWebhookUrl.trim() || webhookUrl;
    if (!url) { showToast('Enter a webhook URL', 'error'); return; }
    if (!url.startsWith('https://')) { showToast('Webhook URL must start with https://', 'error'); return; }
    setSubscribing(true);
    const [d, err] = await safeFetch(`${API}/whatsapp/cloud/subscribe?webhook_url=${encodeURIComponent(url)}`, { method: 'POST' });
    setSubscribing(false);
    if (d?.success) {
      showToast('✅ Webhook subscribed! Meta will send messages now.', 'success');
      checkWebhookStatus();
    } else {
      showToast(d?.error || err || 'Subscribe failed', 'error');
    }
  };

  // Helper: render a credential input field
  const CredField = ({ label, field, placeholder, hint, type = 'text', required = false }) => (
    <div className="form-group" style={{ marginBottom: 14 }}>
      <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>{label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}</label>
      <input className="form-input" type={type} placeholder={placeholder} value={cloudForm[field]} onChange={e => setCloudForm({ ...cloudForm, [field]: e.target.value })} style={{ fontSize: 13 }} />
      {hint && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>{hint}</div>}
    </div>
  );

  if (loading) return <div className="loading"><div className="spinner"></div>Loading WhatsApp status...</div>;

  return (<>
    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>WhatsApp Connection</h2>
    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24 }}>Choose your connection method and manage settings</p>

    {/* ── MODE SELECTOR ── */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
      <div onClick={() => switchMode('qr')} style={{ padding: '20px', borderRadius: 12, border: `2px solid ${currentMode === 'qr' ? 'var(--accent)' : 'var(--border-color)'}`, background: currentMode === 'qr' ? 'rgba(16,185,129,0.08)' : 'var(--bg-secondary)', cursor: 'pointer', transition: 'all 0.3s', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: currentMode === 'qr' ? 'var(--accent)' : 'var(--text-primary)' }}>QR Code Scan</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>WhatsApp Web — Easy setup, scan & go</div>
        {currentMode === 'qr' && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>✓ Active</div>}
      </div>
      <div onClick={() => switchMode('cloud_api')} style={{ padding: '20px', borderRadius: 12, border: `2px solid ${currentMode === 'cloud_api' ? 'var(--accent)' : 'var(--border-color)'}`, background: currentMode === 'cloud_api' ? 'rgba(16,185,129,0.08)' : 'var(--bg-secondary)', cursor: 'pointer', transition: 'all 0.3s', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>☁️</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: currentMode === 'cloud_api' ? 'var(--accent)' : 'var(--text-primary)' }}>Cloud API (Official)</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Meta Business API — No ban risk, production-grade</div>
        {currentMode === 'cloud_api' && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>✓ Active</div>}
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* ── LEFT COLUMN: CONNECTION ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {currentMode === 'qr' ? (
          /* QR MODE */
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="card-header" style={{ textAlign: 'center' }}>WhatsApp Web Connection</div>
            {status.connected ? (<div style={{ padding: '30px 0' }}><div style={{ fontSize: 48, marginBottom: 12 }}>✅</div><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>Connected</div>{status.info && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{status.info.pushname || 'WhatsApp User'}</div>}</div>) : (<>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: 8 }}>Scan this QR code with WhatsApp on your phone to connect.</p>
              {qrImage ? <div style={{ marginBottom: 16 }}><img src={qrImage} alt="QR" style={{ width: 220, height: 220, borderRadius: 8, border: '2px solid var(--border-color)' }} /></div> :
              <div style={{ width: 220, height: 220, margin: '0 auto 16px', borderRadius: 8, border: '2px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--text-tertiary)', fontSize: 13 }}><div style={{ fontSize: 28, marginBottom: 8 }}>📱</div>{status.error ? <span style={{ color: 'var(--danger)', fontSize: 12, maxWidth: 160, textAlign: 'center' }}>{status.error}</span> : 'Waiting for QR code...'}</div>}
            </>)}
            <button className="btn btn-primary" onClick={() => { fetchQR(); checkStatus(); }} style={{ marginBottom: 10 }}>Generate QR Code</button>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.8, marginTop: 12 }}>1. Open WhatsApp on your phone<br/>2. Go to Settings → Linked Devices<br/>3. Tap "Link a Device" and scan</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
              {status.connected && <button className="btn btn-danger" onClick={disconnect}>Disconnect & Change Number</button>}
              <button className="btn btn-secondary" onClick={restart}>🔄 Restart</button>
              <button className="btn btn-secondary" onClick={checkStatus}>↻ Refresh</button>
            </div>
          </div>
        ) : (
          /* CLOUD API MODE — n8n-style credentials form */
          <>
            <div className="card">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>☁️ WhatsApp Cloud API Credentials</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.connected ? 'var(--success)' : 'var(--danger)' }}></span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: status.connected ? 'var(--success)' : 'var(--text-tertiary)' }}>{status.connected ? 'Connected' : 'Not Connected'}</span>
                </div>
              </div>

              {/* Connected info banner */}
              {status.connected && status.info && (
                <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>✅ {status.info.pushname || 'WhatsApp Business'}</div>
                  {status.info.phone_number && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>📞 {status.info.phone_number}</div>}
                </div>
              )}

              <CredField label="Access Token" field="wa_access_token" type="password" placeholder="EAAxxxxxxx..." required
                hint="System User → Generate Token → Select WhatsApp app → whatsapp_business_messaging permission" />
              <CredField label="App ID" field="wa_app_id" placeholder="e.g. 1234567890123" required
                hint="Meta Developer Dashboard → Your App → Settings → Basic → App ID" />
              <CredField label="App Secret" field="wa_app_secret" type="password" placeholder="e.g. abc123def456..." required
                hint="Meta Developer Dashboard → Your App → Settings → Basic → App Secret" />
              <CredField label="Phone Number ID" field="wa_phone_number_id" placeholder="e.g. 1234567890" required
                hint="WhatsApp → API Setup → Phone Number ID (not the phone number itself)" />
              <CredField label="WhatsApp Business Account ID" field="wa_business_account_id" placeholder="e.g. 1234567890" required
                hint="WhatsApp → API Setup → WhatsApp Business Account ID" />

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14, marginTop: 4 }}>
                <CredField label="Webhook Verify Token" field="wa_verify_token" placeholder="Any secret string you choose"
                  hint="You create this — enter the same token in Meta's webhook config" />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button className="btn btn-primary" onClick={testCloudConnection} disabled={testing || saving} style={{ flex: 1 }}>
                  {testing ? '🔄 Testing...' : saving ? '💾 Saving...' : '🔍 Save & Test Connection'}
                </button>
                <button className="btn btn-secondary" onClick={saveCloudSettings} disabled={saving}>
                  {saving ? '...' : '💾 Save Only'}
                </button>
              </div>
            </div>

            {/* TEST RESULTS */}
            {testResult && !testResult.loading && (
              <div className="card" style={{ border: `1px solid ${testResult.success ? 'var(--success)' : 'var(--danger)'}` }}>
                <div className="card-header" style={{ color: testResult.success ? 'var(--success)' : 'var(--danger)' }}>
                  {testResult.success ? '✅ Connection Successful!' : '❌ Connection Failed'}
                </div>

                {/* Step-by-step checks */}
                {testResult.checks && testResult.checks.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    {testResult.checks.map((c, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{c.status?.startsWith('✅') ? '✅' : '❌'}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{c.step}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.detail}</div>
                          {c.quality && <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Quality: {c.quality}</div>}
                          {c.warning && <div style={{ fontSize: 10, color: 'var(--warning, #f59e0b)', fontWeight: 600 }}>⚠️ {c.warning}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Success details */}
                {testResult.success && (
                  <div style={{ padding: 12, borderRadius: 8, background: 'rgba(16,185,129,0.06)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      <div>📞 Phone: <strong>{testResult.phone_number}</strong></div>
                      <div>🏢 Business: <strong>{testResult.business_name}</strong></div>
                      <div>✨ Verified Name: <strong>{testResult.verified_name}</strong></div>
                      <div>📊 Quality: <strong>{testResult.quality_rating}</strong></div>
                    </div>
                  </div>
                )}

                {/* Error details */}
                {!testResult.success && testResult.error && (
                  <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.06)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)', marginBottom: 6 }}>
                      Failed at: {testResult.step || 'Unknown'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{testResult.error}</div>
                    {testResult.error_details && (
                      <div style={{ fontSize: 11, padding: 10, background: 'var(--bg-secondary)', borderRadius: 6, fontFamily: 'monospace', lineHeight: 1.8 }}>
                        {testResult.error_details.http_status && <div>HTTP Status: <strong>{testResult.error_details.http_status}</strong></div>}
                        {testResult.error_details.code && <div>Error Code: <strong>{testResult.error_details.code}</strong></div>}
                        {testResult.error_details.type && <div>Error Type: <strong>{testResult.error_details.type}</strong></div>}
                        {testResult.error_details.message && <div>Message: <strong>{testResult.error_details.message}</strong></div>}
                        {testResult.error_details.subcode && <div>Subcode: <strong>{testResult.error_details.subcode}</strong></div>}
                        {testResult.error_details.fbtrace_id && <div>Trace ID: <strong>{testResult.error_details.fbtrace_id}</strong></div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* WEBHOOK SETUP */}
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🔗 Webhook Setup</span>
                <button className="btn btn-secondary" style={{ fontSize: 10, padding: '4px 10px' }} onClick={checkWebhookStatus}>Check Status</button>
              </div>

              {/* Webhook status */}
              {webhookStatus && (
                <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 6, background: webhookStatus.subscribed ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${webhookStatus.subscribed ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                  {webhookStatus.subscribed ? (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)' }}>✅ Webhook Subscribed</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>URL: {webhookStatus.callback_url}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Fields: {(webhookStatus.fields || []).join(', ')}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)' }}>❌ {webhookStatus.error || 'Not subscribed'}</div>
                  )}
                </div>
              )}

              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Enter your <strong>public HTTPS URL</strong> where Meta will send messages. Use ngrok for local dev.</p>

              <div className="form-group" style={{ marginBottom: 10 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Webhook Callback URL (must be HTTPS)</label>
                <input className="form-input" placeholder="https://your-domain.com/api/whatsapp/cloud/webhook" value={customWebhookUrl} onChange={e => setCustomWebhookUrl(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>Use ngrok: <code style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3 }}>ngrok http 8000</code> → copy the https URL + <code>/api/whatsapp/cloud/webhook</code></div>
              </div>

              <button className="btn btn-primary" onClick={subscribeWebhook} disabled={subscribing} style={{ width: '100%' }}>
                {subscribing ? '🔄 Subscribing...' : '🔗 Subscribe Webhook with Meta'}
              </button>

              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10, padding: 10, background: 'var(--bg-secondary)', borderRadius: 6, lineHeight: 1.8 }}>
                <strong>Steps:</strong><br/>
                1. Run <code>ngrok http 8000</code> in terminal<br/>
                2. Copy the <code>https://xxxx.ngrok.io</code> URL<br/>
                3. Add <code>/api/whatsapp/cloud/webhook</code> to it<br/>
                4. Paste above and click Subscribe<br/>
                5. Done! Messages will start flowing in 🎉
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT COLUMN: SETTINGS ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card">
          <div className="card-header">Reply Settings</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <div><div style={{ fontSize: 13, fontWeight: 600 }}>Reply to Group Messages</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>AI will respond in WhatsApp groups</div></div>
            <div onClick={toggleGroupReplies} style={{ width: 44, height: 24, borderRadius: 12, background: aiSettings?.group_replies ? 'var(--accent)' : 'var(--border-color)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}><div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: aiSettings?.group_replies ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} /></div>
          </div>
          <div style={{ fontSize: 11, color: aiSettings?.group_replies ? 'var(--success)' : 'var(--text-tertiary)', marginTop: 8, fontWeight: 600, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border-color)' }}>{aiSettings?.group_replies ? '🟢 Group replies are ON' : '⚫ Group replies are OFF'}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <div><div style={{ fontSize: 13, fontWeight: 600 }}>Reply to Saved Contacts</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>When OFF, AI only replies to new/unsaved numbers</div></div>
            <div onClick={async () => { const v = aiSettings?.reply_to_contacts ? 0 : 1; const ok = await updateAISetting({ reply_to_contacts: v }); if (ok) showToast(v ? 'Replying to all' : 'Only new numbers', 'success'); }} style={{ width: 44, height: 24, borderRadius: 12, background: aiSettings?.reply_to_contacts ? 'var(--accent)' : 'var(--border-color)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}><div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: aiSettings?.reply_to_contacts ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} /></div>
          </div>
          <div style={{ fontSize: 11, color: aiSettings?.reply_to_contacts ? 'var(--success)' : 'var(--warning, #f59e0b)', marginTop: 8, fontWeight: 600 }}>{aiSettings?.reply_to_contacts ? '🟢 Replying to everyone' : '🟡 Only new/unsaved numbers'}</div>
        </div>
        <div className="card">
          <div className="card-header">Reply Delay</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>Delay before bot replies to look more human{currentMode === 'qr' ? ' and avoid bans' : ''}.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[0, 3, 5, 10, 15, 30].map(s => (
              <div key={s} onClick={async () => { const ok = await updateAISetting({ reply_delay: s }); if (ok) showToast(`Delay: ${s}s`, 'success'); }} style={{ padding: '8px 16px', borderRadius: 8, border: `2px solid ${(aiSettings?.reply_delay || 0) === s ? 'var(--accent)' : 'var(--border-color)'}`, background: (aiSettings?.reply_delay || 0) === s ? 'rgba(16,185,129,0.1)' : 'var(--bg-primary)', color: (aiSettings?.reply_delay || 0) === s ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s' }}>{s === 0 ? 'Instant' : `${s}s`}</div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10 }}>Current: <strong style={{ color: 'var(--text-primary)' }}>{(aiSettings?.reply_delay || 0) === 0 ? 'No delay' : `${aiSettings?.reply_delay}s`}</strong></div>
        </div>
        {currentMode === 'qr' && (
          <div className="card">
            <div className="card-header">Typing Indicator</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>Show "typing..." to Customer</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Shows typing animation during reply delay</div></div>
              <div onClick={async () => { const v = aiSettings?.typing_indicator ? 0 : 1; const ok = await updateAISetting({ typing_indicator: v }); if (ok) showToast(v ? 'Typing ON' : 'Typing OFF', 'success'); }} style={{ width: 44, height: 24, borderRadius: 12, background: aiSettings?.typing_indicator ? 'var(--accent)' : 'var(--border-color)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}><div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: aiSettings?.typing_indicator ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} /></div>
            </div>
            <div style={{ fontSize: 11, color: aiSettings?.typing_indicator ? 'var(--success)' : 'var(--text-tertiary)', marginTop: 8, fontWeight: 600 }}>{aiSettings?.typing_indicator ? '🟢 Typing indicator ON' : '⚫ Typing indicator OFF'}</div>
          </div>
        )}
        <div className="card">
          <div className="card-header">Auto Handover to Human</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <div><div style={{ fontSize: 13, fontWeight: 600 }}>Stop AI after set replies</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>AI stops replying after a set number of messages</div></div>
            <div onClick={async () => { const v = aiSettings?.auto_handover ? 0 : 1; const ok = await updateAISetting({ auto_handover: v }); if (ok) showToast(v ? 'Handover ON' : 'Handover OFF', 'success'); }} style={{ width: 44, height: 24, borderRadius: 12, background: aiSettings?.auto_handover ? 'var(--accent)' : 'var(--border-color)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}><div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: aiSettings?.auto_handover ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} /></div>
          </div>
          <div style={{ fontSize: 11, color: aiSettings?.auto_handover ? 'var(--success)' : 'var(--text-tertiary)', marginTop: 8, fontWeight: 600 }}>{aiSettings?.auto_handover ? '🟢 Auto handover ON' : '⚫ Auto handover OFF'}</div>
          {aiSettings?.auto_handover ? (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
              <label className="form-label" style={{ fontSize: 12 }}>Hand over after how many AI replies?</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <input className="form-input" type="number" min="1" max="100" value={aiSettings?.handover_after || 10} onChange={e => setAiSettings({ ...aiSettings, handover_after: parseInt(e.target.value) || 10 })} style={{ width: 80, textAlign: 'center', fontSize: 14, fontWeight: 700 }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>replies</span>
                <button className="btn btn-primary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={async () => { const ok = await updateAISetting({ handover_after: aiSettings?.handover_after || 10 }); if (ok) showToast(`Handover after ${aiSettings?.handover_after || 10} replies`, 'success'); }}>Save</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
    {toast && <div className={`toast toast-${toast.type}`}>{toast.type === 'success' ? '✅' : '❌'} {toast.message}</div>}
  </>);
}
