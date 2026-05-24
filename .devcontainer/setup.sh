#!/bin/bash
# DevContainer setup script — runs after container creation
set -e

# Get the workspace root dynamically
WORKSPACE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "📁 Workspace: $WORKSPACE_DIR"

echo "📦 Installing backend dependencies..."
cd "$WORKSPACE_DIR/backend"
python3 -m pip install --upgrade pip -q
python3 -m pip install -r requirements.txt -q

echo "📦 Installing frontend dependencies..."
cd "$WORKSPACE_DIR/frontend"
npm install --silent

echo "📦 Installing WhatsApp bridge dependencies..."
cd "$WORKSPACE_DIR/whatsapp-bridge"
npm install --silent

echo ""
echo "✅ All dependencies installed!"
echo "🚀 Starting all services automatically..."
echo ""

# Auto-start all services
cd "$WORKSPACE_DIR"
bash start.sh
