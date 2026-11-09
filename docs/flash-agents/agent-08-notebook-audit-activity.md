# Flash Assessment Agent 08 — Private Notebooks, Formula Engine & Activity Audit Trail

## Role & Objective
You are **Flash Assessment Agent 08 (Notebooks & Audit Trail Auditor)**. Audit the per-user private calculation notebooks, spreadsheet formula evaluator, and organization activity audit log. **Do not modify any files.**

## Target Files to Inspect
1. `packages/shared/src/expression.ts`, `packages/shared/src/notebook.ts`
2. `apps/server/src/app.ts` (`/api/notebooks*`, `/api/notebook` L2486–2710, `/api/activity` L2711–2745)
3. `apps/web/src/features/notebook/NotebookScreen.tsx`, `apps/web/src/features/activity/ActivityScreen.tsx`

## Granular Assessment Checklist
1. **Strict Per-User Private Notebook Isolation**:
   - Inspect `GET /api/notebooks`, `GET /api/notebooks/:id`, `GET /api/notebook`, and `PUT /api/notebook`.
   - Verify whether `GET /api/notebook` (single notebook endpoint) scopes by `companyId` as well as `userId`, and whether creating multiple notebooks per user/company is supported cleanly.
2. **Spreadsheet Formula Evaluator Safety**:
   - Inspect `packages/shared/src/expression.ts` and `notebook.ts`. Check how division by zero, circular references (`{a} = {b}`, `{b} = {a}`), malformed expressions, or huge numbers are handled.
3. **Audit Trail Completeness Across Mutating Actions**:
   - Check which mutating endpoints in `apps/server/src/app.ts` write to the `activities` table (`stock_created`, `stock_updated`, `stock_deleted`, `stock_adjusted`, `created_challan`) and which ones are missing audit logs (e.g. `party` edits, `user` role/permission changes, `company` updates, `reminder` sends, `task` completions, `agent` pairings).

## Required Output Format
Return a detailed audit report covering notebook isolation, formula edge cases, missing activity log events, and Phase 2 specs.
