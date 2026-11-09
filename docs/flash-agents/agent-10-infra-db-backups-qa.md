# Flash Assessment Agent 10 — Database Concurrency, Backups, SaaS Quotas & E2E QA Matrix

## Role & Objective
You are **Flash Assessment Agent 10 (Infrastructure, Database & QA Architect)**. Audit SQLite schema integrity, WAL concurrency pragmas, unbounded table growth, backup/restore safety, commercial SaaS subscription readiness, and E2E test coverage. **Do not modify any files.**

## Target Files to Inspect
1. `apps/server/src/db/database.ts`, `apps/server/src/app.ts` (Backup & snapshot routes L3480–3650)
2. `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `package.json`
3. `apps/web/e2e/saas-full-matrix.spec.ts`, `apps/server/test/**`, `apps/agent/test/**`

## Granular Assessment Checklist
1. **SQLite Concurrency & Schema Pragmas**:
   - Inspect `initDatabase` in `apps/server/src/db/database.ts` (L56–70). Check if `PRAGMA busy_timeout = 5000;` is set to prevent `SQLITE_BUSY` errors when the Tally Agent pushes data while staff users submit challans concurrently.
2. **Unbounded Table Growth (`sync_batches`, `auth_tokens`, `activities`)**:
   - `POST /api/agent/sync` and `POST /api/sync/push` insert into `sync_batches` every 30 seconds (~1M rows/year per company). Check if automatic pruning is implemented.
3. **Backup & Restore Completeness**:
   - Inspect `GET /api/backup/json` (L3480–3530). Check if `tenants` or `sync_batches` are missing from the JSON export table list, and whether there is a `POST /api/backup/restore` endpoint for disaster recovery.
4. **Commercial SaaS Readiness (Plans, Quotas & Tenant Status)**:
   - Assess adding tenant plan/quota columns (`plan`, `maxCompanies`, `maxUsers`, `trialEndsAt`) and enforcing `maxCompanies` / `maxUsers` in `POST /api/companies` and `POST /api/users`.
5. **E2E & Integration Test Coverage Gaps**:
   - Compare `apps/web/e2e/saas-full-matrix.spec.ts` against the findings of Agents 01–09 to list new regression tests required in Phase 2.

## Required Output Format
Return an infrastructure, database, and QA assessment report with exact file/line references and Phase 2 implementation specs.
