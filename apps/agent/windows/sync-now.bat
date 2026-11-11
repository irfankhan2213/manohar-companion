@echo off
title Manohar Companion - Tally Sync (Port 25853)
cd /d "%~dp0"
call run-agent.bat sync --tally=http://127.0.0.1:25853
pause
