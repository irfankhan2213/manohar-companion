@echo off
title Manohar Traders - TallyPrime Sync Agent
color 0A
setlocal EnableDelayedExpansion

cd /d "%~dp0"

:: 1. Check for bundled portable node.exe first
if exist "%~dp0node.exe" (
    set "NODE_BIN=%~dp0node.exe"
    goto MENU
)

:: 2. Check for system installed Node.js
where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_BIN=node"
    goto MENU
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

:MENU
cls
echo =====================================================================
echo           MANOHAR TRADERS - TALLYPRIME CLOUD SYNC AGENT
echo =====================================================================
echo.
echo   [1] Check Status / Test Connection (Tally + Cloud)
echo   [2] Run Manual 2-Way Sync Now
echo   [3] Start Background Continuous Sync Daemon
echo   [4] Configure Settings (Cloud URL, Company, Secret Key)
echo   [5] Reset Sync Counter (Re-sync all data from scratch)
echo   [6] Exit
echo.
echo =====================================================================
set /p choice="Select an option (1-6): "

if "%choice%"=="1" goto STATUS
if "%choice%"=="2" goto SYNC
if "%choice%"=="3" goto START
if "%choice%"=="4" goto CONFIG
if "%choice%"=="5" goto RESET
if "%choice%"=="6" goto EXIT
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
"%NODE_BIN%" tally-agent.mjs start
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
set /p c_comp="Enter Company ID [or press Enter for c-1793000752410]: "
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