================================================================================
MANOHAR TRADERS - TALLYPRIME SYNC AGENT (WINDOWS SETUP GUIDE)
================================================================================

1. EXTRACTION (IMPORTANT):
   - You MUST right-click this ZIP file and choose "Extract All" (Extract to Desktop).
   - Do NOT run run-agent.bat from inside the ZIP file directly.

2. PORTABLE NODE.JS INCLUDED:
   - This package includes a bundled portable node.exe.
   - You DO NOT need to install Node.js separately!

3. ENABLE TALLYPRIME XML SERVER:
   - Open TallyPrime on this PC.
   - Press F1 (Help) -> Settings -> Connectivity.
   - Set "TallyPrime acts as": "Both" (or "Server").
   - Set "Enable ODBC Server": "Yes".
   - Set Port: 9000.
   - Press Ctrl + A to save, then restart TallyPrime.

4. RUNNING THE AGENT:
   - Double-click "run-agent.bat".
   - Select Option [1] to verify connection to both Tally and Cloud.
   - Select Option [2] to run your first manual sync.
   - Select Option [3] to run continuous background sync.

5. AUTOMATIC STARTUP ON BOOT (OPTIONAL):
   - Double-click "install-service.bat" to start the sync agent automatically
     in the background whenever Windows starts up.
================================================================================