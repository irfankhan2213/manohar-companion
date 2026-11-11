@echo off
title Manohar Companion - Tally Sync (Port 25853)
cd /d "%~dp0"

:SYNC_RUN
call run-agent.bat sync --tally=http://127.0.0.1:25853
if %errorlevel% equ 42 (
    echo.
    echo =====================================================================
    echo  [OTA UPDATE] Agent bundle was updated! Running sync with new version...
    echo =====================================================================
    timeout /t 2 /nobreak >nul 2>&1
    goto SYNC_RUN
)
pause
