# Flash Assessment Agent 03 — Windows Tally Agent Flexibility, Multi-Company & OTA Auto-Update

## Role & Objective
You are **Flash Assessment Agent 03 (Windows Tally Agent & Sync Engineer)**. Assess how flexibly, reliably, and effortlessly the Windows Tally Agent (`apps/agent` & `tally-agent-windows.zip`) connects to any client TallyPrime setup, handles multi-company environments, recovers from errors, and updates itself Over-The-Air (OTA) without manual IT intervention. **Do not modify any files.**

## Target Files to Inspect
1. `apps/agent/src/index.ts`, `apps/agent/src/sync/engine.ts`, `apps/agent/src/sync/state.ts`
2. `apps/agent/src/tally/client.ts`, `apps/agent/src/tally/parser.ts`, `apps/agent/src/tally/templates.ts`
3. `apps/web/public/tally-agent-windows/run-agent.bat`, `watchdog.bat`, `install-service.bat`, `run-silent.vbs`
4. `apps/server/src/app.ts` (`/api/agent/*` L950–1195 and `/api/sync/*` L3170–3480)

## Granular Assessment Checklist
1. **Zero-Config Dynamic Agent Zip Generation**:
   - Assess replacing static `/tally-agent-windows.zip` with a dynamic `GET /api/agent/download-zip?companyId=...` endpoint that injects the tenant pre-configured `agent-state.json` directly into the `.zip` archive so the user never has to run `pair` or copy keys.
2. **Automatic Tally Port & Company Name Discovery**:
   - Assess scanning local ports (`9000..9010`, `9999`) or reading `tally.ini` when `127.0.0.1:9000` is unreachable, and fuzzy-matching Tally company names (ignoring FY suffixes or case differences).
3. **Multi-Company Support on a Single Tally PC**:
   - Assess upgrading `agent-state.json` and `SyncEngine` to loop through multiple mapped companies (`companies: Array<{ companyId, tallyName, lastAlterId }>`) on the same Windows machine.
4. **Over-The-Air (OTA) Silent Agent Self-Update**:
   - Design and assess `GET /api/agent/version` (SHA-256 hash) + `GET /api/agent/bundle` so `tally-agent.mjs` auto-updates itself whenever the cloud server is updated.
5. **Actionable Cloud Telemetry in Web UI**:
   - Assess sending `tallyPort`, `openTallyCompanies`, `tallyStatus`, `tallyError`, and `agentVersion` in `POST /api/agent/sync` so the Web App displays exact troubleshooting guidance.
6. **Windows Session 0 Service vs User Session Startup**:
   - Audit `install-service.bat` (`schtasks /ru SYSTEM` vs interactive user `ONLOGON`).

## Required Output Format
Return a detailed assessment of all 6 areas with exact file/line references and a step-by-step Phase 2 implementation spec.
