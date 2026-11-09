@echo off
title Manohar Companion - TallyPrime Sync Agent
color 0A
setlocal EnableDelayedExpansion

cd /d "%~dp0"

:: 1. Check for bundled portable node.exe first
if exist "%~dp0node.exe" (
    set "NODE_BIN=%~dp0node.exe"
    goto CHECK_ARGS
)

:: 2. Check for system installed Node.js
where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_BIN=node"
    goto CHECK_ARGS
)

:: 3. If neither is available, display error
echo.
echo ========================================================
echo  ERROR: Node.js is not found on this computer!
echo ========================================================
echo  Please install Node.js (v18 or higher) from:
echo  https://nodejs.org/ (Download the LTS version)
echo.
pause
exit /b 1

:CHECK_ARGS
if not "%~1"=="" (
    "%NODE_BIN%" tally-agent.mjs %*
    exit /b %errorlevel%
)
goto MENU

:MENU
cls
echo =====================================================================
echo          MANOHAR COMPANION - TALLYPRIME CLOUD SYNC AGENT
echo =====================================================================
echo.
echo   [1] Check Status / Test Connection (Tally + Cloud)
echo   [2] Run Manual 2-Way Sync Now
echo   [3] Start Background Continuous Sync Daemon
echo   [4] Pair Agent with Web App (Enter 6-digit Pairing Code)
echo   [5] Configure Settings Manually (Cloud URL, Company, Secret Key)
echo   [6] Reset Sync Counter (Re-sync all data from scratch)
echo   [7] Exit
echo.
echo =====================================================================
set /p choice="Select an option (1-7): "

if "%choice%"=="1" goto STATUS
if "%choice%"=="2" goto SYNC
if "%choice%"=="3" goto START
if "%choice%"=="4" goto PAIR
if "%choice%"=="5" goto CONFIG
if "%choice%"=="6" goto RESET
if "%choice%"=="7" goto EXIT
goto MENU

:STATUS
cls
echo Checking system status...
echo.
"%NODE_BIN%" tally-agent.mjs status
echo.
pause
goto MENU

:SYNC
cls
echo Running two-way sync with Tally and Cloud...
echo.
"%NODE_BIN%" tally-agent.mjs sync
echo.
pause
goto MENU

:START
cls
echo Starting Tally Sync Daemon... Press Ctrl+C to stop.
echo.
:DAEMON_LOOP
"%NODE_BIN%" tally-agent.mjs start
if %errorlevel% equ 42 (
    echo.
    echo =====================================================================
    echo  [OTA UPDATE] Agent bundle was updated! Restarting sync daemon...
    echo =====================================================================
    timeout /t 2 /nobreak >nul 2>&1
    goto DAEMON_LOOP
)
pause
goto MENU

:PAIR
cls
echo =====================================================================
echo                PAIR WITH WEB APP / ORGANIZATION
echo =====================================================================
echo Open your Web App -> Settings -> Desktop Tally Agent.
echo Click "Generate New" next to Pairing Code.
echo.
set /p p_code="Enter 6-digit Pairing Code: "
if "%p_code%"=="" (
    echo Pairing code cannot be empty.
    pause
    goto MENU
)
set /p p_url="Enter Cloud URL [or press Enter to keep default/current]: "
set CMD="%NODE_BIN%" tally-agent.mjs pair %p_code%
if not "%p_url%"=="" set CMD=!CMD! --cloud=%p_url%
!CMD!
echo.
pause
goto MENU

:CONFIG
cls
echo =====================================================================
echo                        CONFIGURATION SETUP
echo =====================================================================
echo Default Cloud: https://manohar.evolveexpert.com
echo Default Tally: http://127.0.0.1:9000
echo.
set /p c_url="Enter Cloud URL [or press Enter to keep default]: "
set /p c_comp="Enter Company ID: "
set /p c_key="Enter Agent Secret Key [or press Enter for default]: "
set /p c_tally="Enter Tally XML URL [or press Enter for http://127.0.0.1:9000]: "

set CMD="%NODE_BIN%" tally-agent.mjs config
if not "%c_url%"=="" set CMD=!CMD! --cloud=%c_url%
if not "%c_comp%"=="" set CMD=!CMD! --company=%c_comp%
if not "%c_key%"=="" set CMD=!CMD! --key=%c_key%
if not "%c_tally%"=="" set CMD=!CMD! --tally=%c_tally%

!CMD!
echo.
pause
goto MENU

:RESET
cls
echo WARNING: This will reset the AlterID counter to 0.
echo The next sync will re-read all ledgers, bills, and stock from Tally.
echo.
set /p confirm="Are you sure? (Y/N): "
if /i "%confirm%"=="Y" (
    "%NODE_BIN%" tally-agent.mjs reset
)
pause
goto MENU

:EXIT
exit /b 0
