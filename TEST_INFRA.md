# E2E Test Infra: SaaS Manohar Traders Production Updates

## Test Philosophy
- Opaque-box, requirement-driven. Derived from `ORIGINAL_REQUEST.md`.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Interaction + Real-World Workloads.
- Pass/Fail semantics: All tests must run cleanly via `pnpm test`, with 0 type errors (`pnpm typecheck`) and 0 lint errors (`pnpm lint`).

## Feature Inventory
| # | Feature | Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) |
|---|---------|--------|:-----------------:|:-----------------:|:----------------------:|
| 1 | Collections Party Differentiation (Sundry Debtors vs Creditors) | R1 | 5 | 5 | ✓ |
| 2 | Local Party Contact Numbers (Persistence & Non-Sync to Tally) | R1 | 5 | 5 | ✓ |
| 3 | Home Screen "Customers Owe You" Receivables Calculation | R2 | 5 | 5 | ✓ |
| 4 | Purchase Challan Item Search, Auto-Add Row & Descriptions | R3 | 5 | 5 | ✓ |
| 5 | Purchase Challan Round-Off Calculation Adjustment | R3 | 5 | 5 | ✓ |
| 6 | Past Challans History Filtering (Party & Date Range) | R4 | 5 | 5 | ✓ |
| 7 | Past Bills History Filtering (Party & Date Range) | R4 | 5 | 5 | ✓ |
| 8 | Mobile Header Viewport Layout Bug Fix (No Collision) | R5 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Vitest across `@saas/shared`, `@saas/server`, `@saas/web`, and `@saas/agent`.
- Command: `pnpm test`
- Location:
  - Unit/Component tests: `apps/web/src/test/`
  - Integration/Server tests: `apps/server/test/`
  - Domain arithmetic tests: `packages/shared/test/`
  - Sync tests: `apps/agent/test/`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | End-to-end Tally sync push with incoming party updates while preserving user-added local contact numbers | F1, F2 | High |
| 2 | Complex ledger reconciliation: customer with mixed invoices, credit notes, unadjusted advances, and verify Home screen and Collections screen match | F1, F2, F3 | High |
| 3 | Create purchase challan using item search, auto-add row, enter custom line notes, apply round-off, save, and edit | F4, F5 | High |
| 4 | Audit past challans and past bills by filtering across multiple party names and specific fiscal date ranges | F6, F7 | Medium |
| 5 | Mobile responsive inspection across 320px–640px verifying zero overlap between company selector and notification icon on all screens | F8 | Medium |

## Coverage Thresholds
- Tier 1: >= 5 test cases per feature
- Tier 2: >= 5 boundary/corner cases per feature
- Tier 3: Pairwise combination testing of feature interactions
- Tier 4: >= 5 realistic business workflow scenarios
