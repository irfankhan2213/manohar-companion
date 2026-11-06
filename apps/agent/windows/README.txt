================================================================================
MANOHAR TRADERS - TALLYPRIME CLOUD SYNC AGENT (24/7 AUTOMATED GUIDE)
================================================================================

1. EXTRACTION:
   - Right-click this ZIP file and choose "Extract All" to any folder 
     (e.g., C:\ManoharAgent or on Desktop).
   - Do NOT run scripts directly from inside the ZIP file without extracting.

2. PRE-CONFIGURED CREDENTIALS:
   - This agent is already pre-paired to your Manohar Traders cloud organization!
   - You do NOT need to enter pairing codes or manual configurations.
   - It includes a bundled portable node.exe (no Node.js installation needed).

3. ENABLE TALLYPRIME XML SERVER (ONCE):
   - Open TallyPrime on this machine.
   - Press F1 (Help) -> Settings -> Connectivity.
   - Set "TallyPrime acts as": "Both" (or "Server").
   - Set "Enable ODBC Server": "Yes".
   - Set Port: 9000 (or any available port, e.g. 9001, 9005, 9050, 9999).
     * NOTE: If you use a port other than 9000, open "agent-state.json" and 
       change "tallyUrl" to "http://127.0.0.1:<YOUR_PORT>" (e.g. "http://127.0.0.1:9005").
       Or choose Option [5] in "run-agent.bat".
   - Press Ctrl + A to save, then restart TallyPrime.

4. 24/7 UNATTENDED CLOUD AUTOMATION & AUTO-RESTART:
   - To make the agent run automatically 24/7 without human intervention:
     --> Double-click "install-service.bat" (Run as Administrator if prompted).
   - What this does:
     * Registers a native Windows Scheduled Task ("ManoharTallySyncAgent") that
       starts automatically whenever the machine boots up or restarts.
     * Uses an active Watchdog Supervisor loop: if the agent ever crashes,
       exits, or Tally disconnects, it automatically restarts in 5 seconds.
     * Runs completely silent in the background with zero pop-up windows.
     * Logs all sync activity, errors, and timestamps to "agent.log".

5. MANUAL MANAGEMENT & TESTING:
   - Double-click "run-agent.bat":
     [1] Check Status / Test connection to Tally (port 9000) and Cloud API.
     [2] Run a one-time manual 2-way sync.
     [3] Run in foreground console mode.
     [4] Re-pair with a new organization if ever needed.
     [6] Reset AlterID counter to re-sync all historical data.

6. TO STOP OR UNINSTALL AUTO-START:
   - Double-click "uninstall-service.bat" to remove the background task.
================================================================================
