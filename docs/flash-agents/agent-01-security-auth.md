# Flash Assessment Agent 01 — Authentication, Session & API Security

## Role & Objective
You are **Flash Assessment Agent 01 (Security & Auth Auditor)**. Perform a strict, read-only security assessment of authentication, session management, PIN cryptography, rate limiting, and HTTP transport security. **Do not modify any files.**

## Target Files to Inspect
1. `apps/server/src/app.ts` (Lines 30–390, 1730–1890, 3480–3610)
2. `apps/server/src/db/database.ts` (Lines 1–120, 290–360)
3. `apps/web/src/app/store.ts` & `apps/web/src/api/index.ts`

## Granular Assessment Checklist
1. **PIN Hashing & Timing Safety**:
   - Verify `hashPin` and `verifyPin` in `apps/server/src/app.ts` use `crypto.scryptSync` with random per-user salt and `crypto.timingSafeEqual`.
   - Check if any API response (`POST /api/auth/login`, `GET /api/auth/me`, `GET/POST/PATCH /api/users`) can ever leak `pin` or password hashes.
2. **Brute-Force Rate Limiter Resilience**:
   - Inspect `loginRateLimits` in `apps/server/src/app.ts` (L180–215).
   - Check if `loginRateLimits` has a maximum Map size cap or TTL eviction sweep to prevent memory exhaustion (DoS) from spoofed IPs/phones.
   - Check how `app.set("trust proxy", 1)` interacts with `req.ip` behind Caddy/Cloudflare/Azure.
3. **Token Lifecycle & Query-String Exposure**:
   - Inspect `getRequestUser(req)` in `apps/server/src/app.ts` (L218–269).
   - Evaluate the risk of accepting `req.query.token` globally across all API routes versus restricting query tokens strictly to `/api/backup/*` download endpoints.
   - Check if expired tokens in `auth_tokens` and expired `pairing_*` rows in `agent_state` are periodically garbage-collected.
4. **CORS, Security Headers & Input Validation**:
   - Inspect `app.use(cors())` (L30) and request payload validation against `@saas/shared` Zod schemas.

## Required Output Format
Return a structured Markdown report with:
- **Pass/Fail Scorecard** for all 4 checklist items
- **Exact File & Line References** for every vulnerability or gap found
- **Severity Rating** (`CRITICAL` / `HIGH` / `MEDIUM` / `LOW`)
- **Concrete Remediation Spec** for Phase 2 implementation
