@echo off
title Uninstall Manohar Tally Sync Agent
color 0C
cd /d "%~dp0"

echo =====================================================================
echo    Uninstalling Manohar Tally Sync Agent Auto-Start Service
echo =====================================================================
echo.

:: 1. Delete Windows Scheduled Task
echo [1/3] Removing Windows Scheduled Task...
schtasks /delete /tn "ManoharTallySyncAgent" /f >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Windows Scheduled Task removed.
) else (
    echo [INFO] Scheduled task not found or already removed.
)

:: 2. Remove Startup Folder shortcut
echo [2/3] Removing Windows Startup folder shortcut...
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP_DIR%\ManoharTallySync.vbs" (
    del /f /q "%STARTUP_DIR%\ManoharTallySync.vbs"
    echo [OK] Startup shortcut removed.
)

:: 3. Terminate running background agent & node instances
echo [3/3] Stopping any running background sync processes...
taskkill /f /im node.exe /fi "WINDOWTITLE eq Manohar*" >nul 2>&1
wmic process where "commandline like '%%tally-agent.mjs%%'" call terminate >nul 2>&1

echo.
echo =====================================================================
echo  [SUCCESS] Auto-start service uninstalled and background tasks stopped.
echo =====================================================================
echo.
pause
