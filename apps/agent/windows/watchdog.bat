@echo off
title Manohar Tally Sync Agent - 24/7 Watchdog Supervisor
cd /d "%~dp0"

:: 1. Locate Node.js executable
if exist "%~dp0node.exe" (
    set "NODE_BIN=%~dp0node.exe"
) else (
    set "NODE_BIN=node"
)

echo ===================================================================== >> "%~dp0agent.log"
echo [%date% %time%] Watchdog Supervisor Started (Auto-Restart Enabled) >> "%~dp0agent.log"
echo ===================================================================== >> "%~dp0agent.log"

:LOOP
echo [%date% %time%] Launching Tally Sync Agent daemon... >> "%~dp0agent.log"

:: Run the agent and redirect all output and errors to agent.log
"%NODE_BIN%" tally-agent.mjs start >> "%~dp0agent.log" 2>&1

:: If process exits (crash, network reset, memory abort), log and auto-restart
echo [%date% %time%] [WARNING] Agent process stopped (Exit Code: %errorlevel%). >> "%~dp0agent.log"
echo [%date% %time%] Automatically restarting agent in 5 seconds... >> "%~dp0agent.log"

:: 5-second backoff before restart to avoid rapid spin loops on fatal errors
timeout /t 5 /nobreak >nul 2>&1
if errorlevel 1 ping 127.0.0.1 -n 6 >nul

goto LOOP
