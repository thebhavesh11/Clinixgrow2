#!/bin/bash
# FlowBot AI — Start All Services (Linux / Codespaces)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo ""
echo "  ============================================"
echo "    FlowBot AI - Starting All Services"
echo "  ============================================"
echo ""

# Kill any existing processes on ports 8000, 3000, 3001
echo "[1/6] Cleaning up old processes..."
kill $(lsof -t -i:8000) 2>/dev/null || true
kill $(lsof -t -i:3000) 2>/dev/null || true
kill $(lsof -t -i:3001) 2>/dev/null || true
sleep 1

# Install backend dependencies
echo "[2/6] Installing backend dependencies..."
cd "$SCRIPT_DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt --quiet
cd "$SCRIPT_DIR"

# Install frontend dependencies
echo "[3/6] Installing frontend dependencies..."
cd "$SCRIPT_DIR/frontend"
npm install --silent
cd "$SCRIPT_DIR"

# Install WhatsApp bridge dependencies
echo "[4/6] Installing WhatsApp bridge dependencies..."
cd "$SCRIPT_DIR/whatsapp-bridge"
npm install --silent
cd "$SCRIPT_DIR"

# Start Backend (FastAPI)
echo "[5/6] Starting Backend (port 8000)..."
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd "$SCRIPT_DIR"
sleep 3

# Start WhatsApp Bridge
echo "[5/6] Starting WhatsApp Bridge (port 3001)..."
cd "$SCRIPT_DIR/whatsapp-bridge"
node index.js &
BRIDGE_PID=$!
cd "$SCRIPT_DIR"
sleep 2

# Start Frontend (Next.js)
echo "[6/6] Starting Frontend (port 3000)..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"
sleep 3

echo ""
echo "  ============================================"
echo "    All Services Started!"
echo "  ============================================"
echo ""
echo "    Backend:    http://localhost:8000"
echo "    Frontend:   http://localhost:3000"
echo "    WhatsApp:   http://localhost:3001"
echo ""
echo "    Open http://localhost:3000 in your browser"
echo "  ============================================"
echo ""
echo "  PIDs: Backend=$BACKEND_PID  Bridge=$BRIDGE_PID  Frontend=$FRONTEND_PID"
echo "  Press Ctrl+C to stop all services"
echo ""

# Wait for all background processes
trap "kill $BACKEND_PID $BRIDGE_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
