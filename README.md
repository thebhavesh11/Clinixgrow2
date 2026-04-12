# ⚡ FlowBot AI — WhatsApp Automation Platform

AI-powered WhatsApp automation platform with lead scoring, intelligent responses, and media sharing.

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Next.js UI    │◄───►│  FastAPI Backend  │◄───►│ WhatsApp Bridge │
│   (port 3000)   │     │   (port 8000)     │     │  (port 3001)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │                         │
                         SQLite DB              WhatsApp Web.js
```

## 🚀 Quick Start — GitHub Codespaces

1. Click **"Code"** → **"Codespaces"** → **"Create codespace"**
2. Wait for the container to build (auto-installs all dependencies)
3. Run the app:
   ```bash
   bash start.sh
   ```
4. Open the **Ports** tab → Click the **port 3000** URL to open the frontend

## 💻 Quick Start — Local (Windows)

1. Install prerequisites:
   - [Python 3.10+](https://python.org)
   - [Node.js 18+](https://nodejs.org)

2. Install dependencies:
   ```bash
   cd backend && python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt
   cd ../frontend && npm install
   cd ../whatsapp-bridge && npm install
   ```

3. Start the app:
   ```bash
   start.bat
   ```

## 💻 Quick Start — Local (Linux / macOS)

1. Install prerequisites: Python 3.10+, Node.js 18+

2. Start everything:
   ```bash
   bash start.sh
   ```

## ⚙️ Environment Variables (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `WHATSAPP_BRIDGE_URL` | `http://localhost:3001` | WhatsApp bridge URL |
| `BACKEND_URL` | `http://localhost:8000` | Backend URL (used by bridge + engine) |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend URL (CORS) |

## 📁 Project Structure

```
├── backend/                  # FastAPI Python backend
│   ├── main.py              # App entry point
│   ├── database.py          # SQLite async setup
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── routers/             # API route handlers
│   │   ├── ai_settings.py
│   │   ├── business.py
│   │   ├── conversations.py
│   │   ├── dashboard.py
│   │   ├── leads.py
│   │   ├── media.py
│   │   └── whatsapp.py
│   └── automation/
│       └── engine.py        # AI message processing pipeline
├── frontend/                 # Next.js React frontend
│   ├── app/
│   │   ├── page.js          # Dashboard
│   │   ├── layout.js        # App layout + sidebar
│   │   ├── conversations/   # Chat view
│   │   ├── leads/           # Lead management
│   │   ├── businesses/      # Business config + AI settings
│   │   ├── whatsapp/        # WhatsApp connection
│   │   └── automation/      # System health
│   └── next.config.js
├── whatsapp-bridge/          # WhatsApp Web.js bridge
│   └── index.js
├── .devcontainer/            # Codespaces config
├── start.sh                  # Linux startup
├── start.bat                 # Windows startup
└── README.md
```

## 🔧 How It Works

1. **Customer sends message** on WhatsApp → Bridge receives it
2. **Bridge forwards** to Backend webhook (`/api/whatsapp/webhook`)
3. **Backend processes**: finds/creates lead, loads conversation history
4. **AI generates reply** using configured provider (OpenAI / Gemini / OpenRouter)
5. **Lead is scored** (Hot/Warm/Cold) based on conversation
6. **Reply sent back** through Bridge to WhatsApp with optional delay + typing indicator

## 📝 License

Private project — All rights reserved.
