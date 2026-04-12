#!/bin/bash
# DevContainer setup script — runs after container creation
set -e

echo "📦 Installing backend dependencies..."
cd /workspaces/Smartflow2/backend
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

echo "📦 Installing frontend dependencies..."
cd /workspaces/Smartflow2/frontend
npm install

echo "📦 Installing WhatsApp bridge dependencies..."
cd /workspaces/Smartflow2/whatsapp-bridge
npm install

echo "✅ All dependencies installed! Run: bash start.sh"
