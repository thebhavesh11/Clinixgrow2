/**
 * WhatsApp Web Bridge — connects WhatsApp Web to the FastAPI backend
 * Uses whatsapp-web.js with Puppeteer for automation
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

let client = null;
let latestQR = null;
let isConnected = false;
let connectionInfo = null;
let initError = null;
let readyTimestamp = null; // Track when client became ready — ignore messages before this

// ── AI Settings Cache (avoids hitting backend on every message) ──────
let _cachedSettings = null;
let _cachedSettingsTime = 0;
const SETTINGS_CACHE_TTL = 30000; // 30 seconds

async function getCachedSettings() {
    const now = Date.now();
    if (_cachedSettings && (now - _cachedSettingsTime) < SETTINGS_CACHE_TTL) {
        return _cachedSettings;
    }
    try {
        const res = await axios.get(`${BACKEND_URL}/api/ai-settings`, { timeout: 5000 });
        _cachedSettings = res.data;
        _cachedSettingsTime = now;
        return _cachedSettings;
    } catch (err) {
        console.error('[Bridge] Failed to fetch AI settings:', err.message);
        return _cachedSettings; // return stale cache if available
    }
}

// ── Global Error Handlers (prevent process crash) ────────────────────
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Bridge] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Bridge] Uncaught Exception:', err.message);
    // Don't exit — let the process recover
});

// ── WhatsApp Client ──────────────────────────────────────────────────
function createClient() {
    return new Client({
        authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
        authTimeoutMs: 0,
        takeoverOnConflict: true,
        takeoverTimeoutMs: 10000,
        webVersionCache: {
            type: 'none',
        },
        puppeteer: {
            executablePath: puppeteer.executablePath(),
            headless: 'new',
            timeout: 90000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
            ],
        },
    });
}

function initClient() {
    client = createClient();
    latestQR = null;
    isConnected = false;
    connectionInfo = null;
    initError = null;

    client.on('loading_screen', (percent, message) => {
        console.log(`[Bridge] Loading: ${percent}% - ${message}`);
    });

    client.on('qr', async (qr) => {
        console.log('[Bridge] QR code received');
        try {
            latestQR = await qrcode.toDataURL(qr, { width: 256 });
        } catch (err) {
            console.error('[Bridge] QR encode error:', err);
        }
    });

    client.on('ready', async () => {
        console.log('[Bridge] Client is ready!');
        isConnected = true;
        latestQR = null;
        initError = null;
        readyTimestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
        console.log(`[Bridge] Ready timestamp set: ${readyTimestamp} — will ignore older messages`);
        try {
            connectionInfo = client.info;
            console.log('[Bridge] Connected as:', connectionInfo?.pushname);
        } catch (err) {
            console.error('[Bridge] Error getting info:', err);
        }
    });

    client.on('authenticated', () => {
        console.log('[Bridge] Authenticated');
    });

    client.on('auth_failure', (msg) => {
        console.error('[Bridge] Auth failure:', msg);
        isConnected = false;
        initError = 'Authentication failed: ' + msg;
    });

    client.on('disconnected', (reason) => {
        console.log('[Bridge] Disconnected:', reason);
        isConnected = false;
        connectionInfo = null;
    });

    client.on('message', async (msg) => {
        try {
            if (msg.fromMe) return;

            // Skip old messages that arrived before the client was ready
            if (readyTimestamp && msg.timestamp && msg.timestamp < readyTimestamp) {
                return; // Silently ignore old messages
            }

            // Skip status updates, broadcasts, and newsletters — never interact with these
            if (msg.from === 'status@broadcast' || msg.from.includes('@broadcast') || msg.from.includes('@newsletter')) return;
            if (msg.isStatus) return;

            // Get cached settings (single fetch, not two)
            const settings = await getCachedSettings();

            // Handle group messages — check backend setting
            if (msg.from.includes('@g.us')) {
                if (!settings || !settings.group_replies) return;
            }

            // Strip all WhatsApp suffixes: @c.us, @g.us, @lid
            const phone = msg.from.replace(/@c\.us$/, '').replace(/@g\.us$/, '').replace(/@lid$/, '');
            const contact = await msg.getContact();
            const name = contact?.pushname || contact?.name || 'Unknown';
            const isGroup = msg.from.includes('@g.us');
            const isSavedContact = contact?.isMyContact || false;

            // Check if we should skip saved contacts
            if (!isGroup && isSavedContact) {
                if (settings && !settings.reply_to_contacts) {
                    console.log(`[Bridge] Skipping saved contact: ${name} (${phone})`);
                    return;
                }
            }

            console.log(`[Bridge] ${isGroup ? 'Group' : isSavedContact ? 'Contact' : 'New'} message from ${name} (${phone}): ${(msg.body || '').substring(0, 50)}...`);

            // Send to backend with clean phone + original msg.from for reply routing
            await axios.post(`${BACKEND_URL}/api/whatsapp/webhook`, {
                phone: isGroup ? msg.from : phone,
                message: msg.body || '',
                name: name,
                business_id: 1,
                is_group: isGroup,
                reply_to: msg.from, // Preserve original WhatsApp ID for sending replies
            }, { timeout: 30000 });
        } catch (err) {
            console.error('[Bridge] Message handler error:', err.message);
        }
    });

    console.log('[Bridge] Initializing WhatsApp client...');
    client.initialize().catch(err => {
        console.error('[Bridge] Init error:', err.message);
        initError = err.message;
    });
}

// ── API Routes ───────────────────────────────────────────────────────

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', connected: isConnected, uptime: process.uptime() });
});

app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        hasQR: !!latestQR,
        info: connectionInfo ? { pushname: connectionInfo.pushname, platform: connectionInfo.platform } : null,
        error: initError,
    });
});

app.get('/qr', (req, res) => {
    res.json({ qr: latestQR });
});

app.post('/send', async (req, res) => {
    const { phone, message } = req.body || {};
    if (!phone || !message) return res.status(400).json({ success: false, error: 'Missing phone or message' });
    if (!client || !isConnected) return res.status(503).json({ success: false, error: 'Not connected' });
    try {
        // If phone already has @ suffix, use it directly; otherwise try @lid then @c.us
        let chatId;
        if (phone.includes('@')) {
            chatId = phone;
        } else {
            // Try @lid first (newer format), fallback to @c.us
            try {
                chatId = `${phone}@lid`;
                await client.sendMessage(chatId, message);
                console.log(`[Bridge] Sent to ${phone} via @lid`);
                return res.json({ success: true });
            } catch (lidErr) {
                console.log(`[Bridge] @lid failed for ${phone}, trying @c.us: ${lidErr.message}`);
                chatId = `${phone}@c.us`;
            }
        }
        await client.sendMessage(chatId, message);
        console.log(`[Bridge] Sent to ${phone} via ${chatId.includes('@lid') ? '@lid' : '@c.us'}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[Bridge] Send error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/logout', async (req, res) => {
    try {
        if (client) await client.logout();
        isConnected = false;
        connectionInfo = null;
        latestQR = null;
        res.json({ success: true });
        setTimeout(() => initClient(), 2000);
    } catch (err) {
        console.error('[Bridge] Logout error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/restart', async (req, res) => {
    try {
        if (client) {
            try { await client.destroy(); } catch (e) {
                console.warn('[Bridge] Client destroy warning:', e.message);
            }
        }
        isConnected = false;
        connectionInfo = null;
        latestQR = null;
        res.json({ success: true, message: 'Restarting...' });
        setTimeout(() => initClient(), 2000);
    } catch (err) {
        console.error('[Bridge] Restart error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/send-media', async (req, res) => {
    const { phone, mediaUrl, filename, caption } = req.body || {};
    if (!phone || !mediaUrl) return res.status(400).json({ success: false, error: 'Missing phone or mediaUrl' });
    if (!client || !isConnected) return res.status(503).json({ success: false, error: 'Not connected' });
    try {
        const { MessageMedia } = require('whatsapp-web.js');
        // Download the file from backend
        const response = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const base64 = Buffer.from(response.data).toString('base64');

        // Detect MIME type from filename
        const ext = (filename || '').split('.').pop().toLowerCase();
        const mimeMap = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
            pdf: 'application/pdf',
            mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', webm: 'video/webm',
        };
        const mimetype = mimeMap[ext] || 'application/octet-stream';

        const media = new MessageMedia(mimetype, base64, filename || 'file');
        const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
        await client.sendMessage(chatId, media, { caption: caption || '' });
        console.log(`[Bridge] Sent media to ${phone}: ${filename}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[Bridge] Send media error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/typing', async (req, res) => {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ success: false, error: 'Missing phone' });
    if (!client || !isConnected) return res.status(503).json({ success: false, error: 'Not connected' });
    try {
        const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
        const chat = await client.getChatById(chatId);
        await chat.sendStateTyping();
        res.json({ success: true });
    } catch (err) {
        console.error('[Bridge] Typing error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Graceful Shutdown ────────────────────────────────────────────────
async function shutdown(signal) {
    console.log(`[Bridge] Received ${signal}, shutting down gracefully...`);
    try {
        if (client) {
            await client.destroy();
            console.log('[Bridge] WhatsApp client destroyed');
        }
    } catch (e) {
        console.error('[Bridge] Error during shutdown:', e.message);
    }
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start Server ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[Bridge] Running on port ${PORT}`);
    initClient();
});
