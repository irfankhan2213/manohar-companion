@echo off
title Install Manohar Tally Agent Windows Task
color 0B
cd /d "%~dp0"

echo ========================================================
echo   Setting up Manohar Tally Agent Windows Startup Task
echo ========================================================
echo.

set AGENT_PATH=%~dp0run-silent.vbs

if exist "%~dp0node.exe" (
    set "NODE_EXEC=%~dp0node.exe"
) else (
    set "NODE_EXEC=node"
)

echo Set WshShell = CreateObject("WScript.Shell") > "%AGENT_PATH%"
echo WshShell.Run "cmd /c cd /d ""%~dp0"" && ""%NODE_EXEC%"" tally-agent.mjs start", 0, False >> "%AGENT_PATH%"

echo Registering Startup Shortcut...
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
copy /y "%AGENT_PATH%" "%STARTUP_DIR%\ManoharTallySync.vbs" >nul

echo.
echo [SUCCESS] The Tally Agent has been registered to start automatically
echo in the background whenever Windows boots up!
echo.
pause