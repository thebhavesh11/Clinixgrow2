@echo off
title FlowBot AI - Startup
echo.
echo  ============================================
echo    FlowBot AI - Starting All Services
echo  ============================================
echo.

:: Kill any existing processes on ports 8000, 3000, 3001
echo [1/4] Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
timeout /t 2 >nul

:: Start Backend (FastAPI)
echo [2/4] Starting Backend (port 8000)...
start "FlowBot-Backend" cmd /c "cd /d "%~dp0backend" && py -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 3 >nul

:: Start WhatsApp Bridge
echo [3/4] Starting WhatsApp Bridge (port 3001)...
start "FlowBot-WhatsApp" cmd /c "cd /d "%~dp0whatsapp-bridge" && node index.js"
timeout /t 2 >nul

:: Start Frontend (Next.js)
echo [4/4] Starting Frontend (port 3000)...
start "FlowBot-Frontend" cmd /c "cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 >nul

echo.
echo  ============================================
echo    All Services Started!
echo  ============================================
echo.
echo    Backend:    http://localhost:8000
echo    Frontend:   http://localhost:3000
echo    WhatsApp:   http://localhost:3001
echo.
echo    Open http://localhost:3000 in your browser
echo  ============================================
echo.
pause
