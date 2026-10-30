@echo off
title Uninstall Manohar Tally Agent Windows Task
color 0C
cd /d "%~dp0"

echo ========================================================
echo   Removing Manohar Tally Agent Windows Startup Task
echo ========================================================
echo.

set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
if exist "%STARTUP_DIR%\ManoharTallySync.vbs" (
    del /f /q "%STARTUP_DIR%\ManoharTallySync.vbs"
    echo [SUCCESS] Startup task removed. The agent will no longer launch on boot.
) else (
    echo [INFO] Startup task was not installed or already removed.
)

if exist "%~dp0run-silent.vbs" (
    del /f /q "%~dp0run-silent.vbs"
)

echo.
pause
