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

set CRASH_COUNT=0

:LOOP
set "START_TIME=%time: =0%"
echo [%date% %time%] Launching Tally Sync Agent daemon... >> "%~dp0agent.log"

:: Run the agent and redirect all output and errors to agent.log
"%NODE_BIN%" tally-agent.mjs start >> "%~dp0agent.log" 2>&1
set EXIT_CODE=%errorlevel%

:: If process exits with 42, it's an intentional OTA update restart - restart immediately!
if %EXIT_CODE% equ 42 (
    echo [%date% %time%] [OTA] Agent updated successfully. Restarting daemon immediately... >> "%~dp0agent.log"
    set CRASH_COUNT=0
    goto LOOP
)

if %EXIT_CODE% equ 0 (
    set CRASH_COUNT=0
    goto LOOP
)

:: Calculate runtime duration to reset crash counter if agent was running stably (> 60s)
set "END_TIME=%time: =0%"
for /f "tokens=1-3 delims=:., " %%a in ("%START_TIME%") do (
    set /a "T1=(((1%%a-100)*3600)+((1%%b-100)*60)+(1%%c-100))"
)
for /f "tokens=1-3 delims=:., " %%a in ("%END_TIME%") do (
    set /a "T2=(((1%%a-100)*3600)+((1%%b-100)*60)+(1%%c-100))"
)
set /a "RUNTIME=T2-T1"
if %RUNTIME% lss 0 set /a "RUNTIME+=86400"
if %RUNTIME% gtr 60 set CRASH_COUNT=0

set /a CRASH_COUNT+=1
echo [%date% %time%] [WARNING] Agent process stopped (Exit Code: %EXIT_CODE%, Run Time: %RUNTIME%s, Crash Count: %CRASH_COUNT%). >> "%~dp0agent.log"

:: Boot-crash loop protection: if 3 rapid crashes occur, check for backup bundle and rollback
if %CRASH_COUNT% geq 3 (
    if exist "%~dp0tally-agent.mjs.bak" (
        echo [%date% %time%] [CRITICAL] Bad bundle detected. Rolling back to tally-agent.mjs.bak... >> "%~dp0agent.log"
        copy /y "%~dp0tally-agent.mjs.bak" "%~dp0tally-agent.mjs" >nul
        set CRASH_COUNT=0
        echo [%date% %time%] [INFO] Rollback completed. Restarting daemon... >> "%~dp0agent.log"
        goto LOOP
    ) else (
        echo [%date% %time%] [CRITICAL] Rapid crash detected (%CRASH_COUNT% crashes), but no tally-agent.mjs.bak found to restore! >> "%~dp0agent.log"
    )
)

echo [%date% %time%] Automatically restarting agent in 5 seconds... >> "%~dp0agent.log"

:: 5-second backoff before restart to avoid rapid spin loops on fatal errors
timeout /t 5 /nobreak >nul 2>&1
if errorlevel 1 ping 127.0.0.1 -n 6 >nul

goto LOOP
