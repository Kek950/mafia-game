@echo off
title 🤠 Mafia Online - Frontier Launcher
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================================
echo               🤠 MAFIA ONLINE - FRONTIER LAUNCHER 🤠
echo ================================================================
echo.

:: 1. Verify Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in your system PATH!
    echo Please download and install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Check and install backend dependencies if missing
if not exist "backend\node_modules\" (
    echo [SETUP] First-time setup: Installing backend packages...
    cd backend && call npm install && cd ..
)

:: 3. Check and install frontend dependencies if missing
if not exist "frontend\node_modules\" (
    echo [SETUP] First-time setup: Installing frontend packages...
    cd frontend && call npm install && cd ..
)

:: 4. Clean up any lingering processes on ports 3001 and 5173
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%a >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%a >nul 2>nul
)

:: 5. Open the game in default web browser after 2.5 seconds
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5173"

:: 6. Launch the game servers
node run.js

echo.
echo Posse disbanded.
pause
