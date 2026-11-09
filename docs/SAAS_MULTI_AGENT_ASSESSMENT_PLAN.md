# Manohar Companion SaaS — Multi-Agent Flash Assessment & Improvement Master Plan

> **Phase 1 Mode: Assessment & Architecture Blueprint Only (Zero Code Mutations)**
> Designed for parallel execution by **10 specialized Flash-model assessment agents**, where each agent audits one bounded subsystem with explicit file paths, line numbers, test probes, and pass/fail rubrics before Phase 2 fixes begin.

## 1. Multi-Agent Assessment Architecture (10 Flash Agents)

| Agent ID | Agent Spec File | Focus Pillar | Target Files Audited | Key Assessment Checkpoints |
|---|---|---|---|---|
| **Agent 01** | `docs/flash-agents/agent-01-security-auth.md` | **Auth, Session & API Security** | `apps/server/src/app.ts` (L30-390), `apps/server/src/db/database.ts` | PIN scrypt hashing, brute-force lockout Map bounds, sliding token expiry, CORS/CSP, query-token (`?token=`) exposure, Zod payload validation |
| **Agent 02** | `docs/flash-agents/agent-02-tenant-rbac-isolation.md` | **Multi-Tenant & Branch RBAC Isolation** | `apps/server/src/app.ts` (L110-165, all routes), `packages/shared/src/permissions.ts` | Cross-tenant IDOR on `:id` routes & foreign keys, `X-Tenant-Id` Dev header scoping, branch-level `companyIds` filtering, 18-permission matrix |
| **Agent 03** | `docs/flash-agents/agent-03-tally-windows-agent.md` | **Windows Tally Agent Flexibility & OTA** | `apps/agent/src/**`, `apps/web/public/tally-agent-windows/**`, `apps/server/src/app.ts` (L950-1195, L3170-3480) | Pre-paired dynamic `.zip` download, auto-detecting Tally port (`9000..9010`) & active company, multi-company sync loop, zero-touch OTA self-update, live UI telemetry |
| **Agent 04** | `docs/flash-agents/agent-04-onboarding-self-service.md` | **Frictionless Client Onboarding & Setup** | `apps/web/src/features/dev/DevClientsScreen.tsx`, `apps/web/src/features/settings/SettingsScreen.tsx`, `apps/server/src/app.ts` (L580-715) | 1-click onboarding kit, first-login 3-step guided setup wizard, sample demo mode with auto-purge on first real Tally sync, WhatsApp invite template |
| **Agent 05** | `docs/flash-agents/agent-05-accounting-ledger-logic.md` | **Receivables, Aging, Paise Math & Ledgers** | `packages/shared/src/aging.ts`, `money.ts`, `fifo.ts`, `apps/server/src/app.ts` (L718-950, L1195-1450) | Paise integer invariants, IST (`+05:30`) date boundary math, `hasDemoSeedBills` isolation, FIFO bill settlement, credit note & statement print accuracy |
| **Agent 06** | `docs/flash-agents/agent-06-inventory-challan-outbox.md` | **Inventory, Multi-Godown & Challan Outbox** | `apps/server/src/app.ts` (L1450-2020, L3360-3480), `apps/web/src/features/stock/**`, `challans/**` | Draft-to-queued stock deduction, stock reversal on challan cancel/delete, challan numbering & FY suffix, outbox retry backoff & dead-letter handling |
| **Agent 07** | `docs/flash-agents/agent-07-reminders-tasks-notifications.md` | **Reminders, Staff Tasks & Notifications** | `apps/server/src/app.ts` (L2020-2580), `apps/web/src/features/reminders/**`, `tasks/**` | Quiet-hours enforcement, `stopWhenPaid` & `remindersPaused` logic, task photo upload storage optimization, strict per-user notification privacy |
| **Agent 08** | `docs/flash-agents/agent-08-notebook-audit-activity.md` | **Private Notebooks, Formulas & Audit Trail** | `packages/shared/src/expression.ts`, `notebook.ts`, `apps/server/src/app.ts` (L2580-2850) | Per-user private notebook isolation, circular formula safety, activity audit log completeness & retention across all mutating endpoints |
| **Agent 09** | `docs/flash-agents/agent-09-frontend-ux-pwa-offline.md` | **Frontend State, Cache, i18n, Print & PWA** | `apps/web/src/app/**`, `apps/web/src/components/**`, `apps/web/src/features/print/**` | TanStack Query key scoping by `[tenantId, companyId]`, stale cache on tenant/company switch, Hindi/English i18n completeness, PWA service worker caching |
| **Agent 10** | `docs/flash-agents/agent-10-infra-db-backups-qa.md` | **Database, Backups, SaaS Billing & E2E QA** | `apps/server/src/db/database.ts`, `Dockerfile`, `docker-compose.yml`, `apps/web/e2e/**` | SQLite WAL `busy_timeout`, `sync_batches` pruning, automated backup restore verification, tenant subscription/plan quotas, Playwright E2E matrix |

## 2. Core SaaS Improvement Pillars (What Each Flash Agent Assesses)

### Pillar 1: Windows Tally Agent Flexibility & Zero-Touch Connectivity (Agent 03)
1. **Zero-Config Pre-Paired Agent Download (`GET /api/agent/download-zip`)**:
   - Instead of serving a static `/tally-agent-windows.zip` with stale credentials and asking the client to run `pair` or replace `agent-state.json`, assess streaming a dynamically generated `.zip` with the tenant's live `agent-state.json` already baked inside.
2. **Automatic Tally Port & Company Name Discovery**:
   - If `127.0.0.1:9000` fails, scan common Tally ports (`9000–9010`, `9999`) or inspect `tally.ini`, and auto-match the open company name (handling Tally's FY suffixes and case differences) so non-technical users never edit JSON files.
3. **Multi-Company Sync from One Windows Agent**:
   - Upgrade `agent-state.json` and `SyncEngine` to support an array of `companies: [{ companyId, tallyName, lastAlterId }]` so a single Windows agent can sync multiple sister companies open in TallyPrime.
4. **Over-The-Air (OTA) Silent Agent Self-Update**:
   - Add `GET /api/agent/version` (returning version + SHA-256 hash of `tally-agent.mjs`) and `GET /api/agent/bundle`. On startup and every hour, the Windows agent checks if a newer bundle exists on the cloud server, downloads it atomically, and lets `watchdog.bat` restart into the new code—eliminating manual re-downloads forever.
5. **Actionable Cloud Telemetry in Web UI**:
   - Include `tallyStatus` (`online` / `port_closed` / `company_mismatch`), `tallyPort`, `openTallyCompanies`, `agentVersion`, and `lastError` in `POST /api/agent/sync` so **Settings → Office PC** displays exact plain-English diagnostics.

### Pillar 2: Frictionless Client Onboarding & Self-Service (Agent 04)
1. **First-Login 3-Step Guided Onboarding Wizard**:
   - When a new Owner logs in and has 0 synced parties/bills, display a guided setup checklist on the Home Screen:
     - **Step 1**: Download Pre-Paired Windows Tally Agent (1 click, no pairing code needed)
     - **Step 2**: Invite Accounts, Sales & Godown Staff (`+ Add Staff`)
     - **Step 3**: Enable Automated Payment Reminders
2. **Interactive Demo Mode with Auto-Purge on First Live Sync**:
   - Allow new clients to explore the app with realistic sample data before connecting Tally, and automatically clear demo records the moment their real Tally Agent pushes its first sync batch.
3. **1-Click WhatsApp Welcome Pack in Dev Console**:
   - In `DevClientsScreen.tsx`, add a 1-click **Send Welcome Pack on WhatsApp** button that formats the login URL, Owner Phone, PIN, and direct Agent Setup link.

### Pillar 3: Security, Multi-Tenant Isolation & RBAC Hardening (Agents 01 & 02)
1. **Bounded Rate Limiter & Token Garbage Collection**:
   - Cap `loginRateLimits` Map size in `apps/server/src/app.ts` and periodically purge expired rows from `auth_tokens` and `pairing_*` keys in `agent_state`.
2. **Restrict `?token=` Query Auth to Download Routes Only**:
   - Prevent Bearer tokens from being accepted via URL query parameters on general JSON endpoints; use short-lived download nonces for `/api/backup/*`.
3. **Complete Foreign-Key & Branch (`companyIds`) Scoping**:
   - Verify every route (`collections`, `home/summary`, `reminders/replies`, `godowns`, `outbox`, `activity`) enforces `user.companyIds` branch restrictions and rejects cross-tenant foreign keys (`partyId`, `itemId`, `challanId`).
4. **Tenant-Scoped Frontend Permission Cache**:
   - Scope `localStorage` permission keys by `tenantId` (`manohar_custom_permissions_${tenantId}`) so switching tenants never leaks role matrices.

### Pillar 4: Accounting, Inventory, Challan & Outbox Integrity (Agents 05, 06, 07, 08)
1. **IST (`Asia/Kolkata`) Calendar Date Consistency**:
   - Replace UTC `new Date().toISOString().slice(0, 10)` in server aging/challan/adjustment defaults with an IST date helper so overdue days and voucher dates never shift by 1 day between 00:00 and 05:30 IST.
2. **Challan Cancellation / Stock Reversal & FY-Aware Numbering**:
   - Add a `cancelled` status (or delete handler) on challans that cleanly reverses the `stock_balances` delta and cancels the `outbox_items` entry; derive challan number suffixes from `company.financialYear` instead of hardcoded `/26-27`.
3. **Outbox Dead-Letter & Partial Tally Sync Recovery**:
   - Cap automatic outbox retries (e.g. `attempts <= 5` with exponential backoff) so a malformed voucher doesn't block subsequent queued challans or hammer Tally every 30s indefinitely.

### Pillar 5: Frontend UX, Database Concurrency & SaaS Operations (Agents 09 & 10)
1. **TanStack Query Key Isolation**:
   - Ensure every `useQuery` key in `apps/web/src/features/**` includes `[..., currentTenant?.id, currentCompanyId]` so workspace or company switching updates all cards instantaneously.
2. **SQLite WAL `busy_timeout` & `sync_batches` Pruning**:
   - Add `PRAGMA busy_timeout = 5000;` in `initDatabase()` and prune `sync_batches` older than 30 days (or keep latest 500 per company) to keep the SQLite file compact.
3. **Tenant Subscription & Quota Metadata**:
   - Add `plan`, `maxCompanies`, `maxUsers`, and `subscriptionExpiresAt` to `tenants` for full commercial SaaS lifecycle management.

## 3. Flash Agent Execution Protocol (4 Waves)

1. **Wave 1 (Parallel Flash Audit)**: Run Agents 01–10 against the codebase in read-only mode to produce `FindingScorecard` reports with exact file/line citations.
2. **Wave 2 (Synthesis & Prioritization)**: Merge findings into a master checklist ordered by `CRITICAL` → `HIGH` → `MEDIUM` → `ENHANCEMENT`.
3. **Wave 3 (Targeted Fixes)**: Implement approved fixes wave-by-wave with zero regressions.
4. **Wave 4 (Full Verification)**: Run the 42-point API QA audit, 12-point Tally Agent simulation, and Playwright multi-role E2E suite.
