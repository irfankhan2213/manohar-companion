@echo off
title Install Manohar Tally Sync Agent - 24/7 Cloud Background Service
color 0B
cd /d "%~dp0"

echo =====================================================================
echo    Installing Manohar Tally Sync Agent (24/7 Automated Cloud Service)
echo =====================================================================
echo.

:: 1. Verify files exist
if not exist "%~dp0watchdog.bat" (
    echo [ERROR] watchdog.bat not found in "%~dp0".
    pause
    exit /b 1
)

:: 2. Register Windows Scheduled Task (Runs on System Startup & User Logon with Highest Privileges)
echo [1/3] Registering Windows Scheduled Task for Auto-Start on System Boot...
set "VBS_PATH=%~dp0run-silent.vbs"

schtasks /create /tn "ManoharTallySyncAgent" /tr "wscript.exe \"%VBS_PATH%\"" /sc onstart /ru SYSTEM /rl highest /f >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] System-level task requires Administrator. Registering User Logon Task...
    schtasks /create /tn "ManoharTallySyncAgent" /tr "wscript.exe \"%VBS_PATH%\"" /sc onlogon /rl highest /f >nul 2>&1
)

if %errorlevel% equ 0 (
    echo [OK] Windows Scheduled Task registered successfully!
) else (
    echo [NOTE] Scheduled task creation skipped (insufficient permissions). Using Startup folder.
)

:: 3. Double-layer redundancy: Also install in Windows Startup folder
echo [2/3] Adding shortcut to Windows Startup folder...
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP_DIR%" (
    copy /y "%VBS_PATH%" "%STARTUP_DIR%\ManoharTallySync.vbs" >nul
    echo [OK] Startup shortcut installed in Windows Startup folder!
)

:: 4. Immediately launch background watchdog
echo [3/3] Starting background sync agent right now...
wscript.exe "%VBS_PATH%"

echo.
echo =====================================================================
echo  [SUCCESS] Manohar Tally Sync Agent is now fully automated!
echo =====================================================================
echo  - It runs 24/7 silently in the background (no popup windows).
echo  - It auto-starts whenever Windows boots up or restarts.
echo  - If it ever shuts down or crashes, the watchdog restarts it in 5s.
echo  - Live status and logs are saved to: "%~dp0agent.log"
echo.
pause
