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
if exist "%STARTUP_DIR%\ManoharTallySync.lnk" (
    del /f /q "%STARTUP_DIR%\ManoharTallySync.lnk"
    echo [OK] Startup shortcut (.lnk) removed.
)
if exist "%STARTUP_DIR%\ManoharTallySync.vbs" (
    del /f /q "%STARTUP_DIR%\ManoharTallySync.vbs"
    echo [OK] Legacy startup script (.vbs) removed.
)

:: 3. Terminate running background supervisor & agent instances
echo [3/3] Stopping any running background sync processes...
taskkill /f /im node.exe /fi "WINDOWTITLE eq Manohar*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq Manohar*" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*watchdog.bat*' -or $_.CommandLine -like '*run-silent.vbs*' -or $_.CommandLine -like '*tally-agent.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

echo.
echo =====================================================================
echo  [SUCCESS] Auto-start service uninstalled and background tasks stopped.
echo =====================================================================
echo.
pause
