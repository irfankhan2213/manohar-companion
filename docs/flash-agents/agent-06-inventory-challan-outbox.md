# Flash Assessment Agent 06 — Inventory, Multi-Godown Sync, Challans & Outbox Queue

## Role & Objective
You are **Flash Assessment Agent 06 (Inventory & Supply Chain Auditor)**. Audit stock item CRUD, multi-godown balance tracking, delivery/sales/purchase challan lifecycles, and the 2-way Tally XML outbox queue. **Do not modify any files.**

## Target Files to Inspect
1. `apps/server/src/app.ts` (`/api/stock*` L1450–1795, `/api/godowns` L1796–1840, `/api/challans*` L1841–2050, `/api/sync/pull` & `/api/sync/ack` L3360–3480)
2. `apps/agent/src/sync/engine.ts` (`pullOutboxFromCloud`), `apps/agent/src/tally/templates.ts`
3. `apps/web/src/features/stock/**`, `apps/web/src/features/challans/**`, `apps/web/src/features/print/ChallanPrintScreen.tsx`

## Granular Assessment Checklist
1. **Challan Stock Deduction & Reversal Lifecycle**:
   - Inspect `POST /api/challans`, `PATCH /api/challans/:id/status`, and `POST /api/challans/:id/retry`.
   - Check what happens to `stock_balances` if a queued challan is edited, cancelled, or fails permanently in Tally (is stock ever double-deducted or left un-reversed?).
2. **Challan Auto-Numbering & Financial Year Suffix**:
   - Inspect `POST /api/challans` (L1918): `const autoNumber = \`${prefix}/${String(existingCount + 46).padStart(3, "0")}/26-27\`;`.
   - Assess collision risks if challans are deleted or if the company `financialYear` is not `26-27`.
3. **Tally Stock Sync vs Mobile Adjustments Race Condition**:
   - In `POST /api/sync/push` (L3330), Tally overwrites `stock_balances.qty` with `s.closingQty`. Check what happens if there is a `queued` (not yet synced to Tally) mobile challan or `stock_journal` adjustment in `outbox_items` when `POST /api/sync/push` runs first! (Note: in `engine.ts`, `pushToCloud` runs at Step 6a *before* `pullOutboxFromCloud` at Step 6b!).
4. **Outbox Retry Cap & Error Reporting**:
   - Check if `GET /api/sync/pull` retries failed items infinitely or if `attempts` is incremented and capped properly on Tally XML import failure.

## Required Output Format
Return a supply-chain & sync order audit report highlighting race conditions, stock math edge cases, file/line references, and Phase 2 fixes.
