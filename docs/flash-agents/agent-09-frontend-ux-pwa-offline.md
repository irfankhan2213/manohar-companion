# Flash Assessment Agent 09 — Frontend State, TanStack Query Cache, i18n, Print & PWA

## Role & Objective
You are **Flash Assessment Agent 09 (Frontend Architecture & UX Auditor)**. Audit React state management (`useAppStore`), TanStack Query cache invalidation across tenant/company switches, English/Hindi localization, print views, and PWA service worker behavior. **Do not modify any files.**

## Target Files to Inspect
1. `apps/web/src/app/App.tsx`, `apps/web/src/app/store.ts`, `apps/web/src/api/index.ts`
2. All feature screens in `apps/web/src/features/**` and UI components in `apps/web/src/components/ui/**`
3. `apps/web/src/i18n/**` (or translation hooks), `apps/web/public/manifest.webmanifest`

## Granular Assessment Checklist
1. **TanStack Query Cache Key Scoping (`tenantId` & `companyId`)**:
   - Audit every `useQuery({ queryKey: [...] })` across all screens (`HomeScreen`, `CollectionsScreen`, `PartyDetailScreen`, `StockScreen`, `StockDetailScreen`, `ChallansScreen`, `TasksScreen`, `RemindersScreen`, `NotebookScreen`, `ActivityScreen`, `SettingsScreen`, `NotificationBell`, `Sidebar`, `CompanyMenu`).
   - Identify any `queryKey` that omits `currentTenant?.id` or `currentCompanyId`, which causes stale data to display when switching companies or Dev workspaces!
2. **Logout & Tenant Switch State Cleanup**:
   - Check if `handleSignOut` in `SettingsScreen.tsx` / `UserAuthMenu.tsx` calls `queryClient.clear()` so the next user logging in on the same browser never briefly flashes the previous user cached queries.
3. **Print Layouts (`ChallanPrintScreen` & `StatementPrintScreen`)**:
   - Verify whether `/print/challan/:id` and `/print/statement/:partyId` are protected by authentication (`RequireAuth`) in `App.tsx` (L114–116) and whether they render dynamic company GSTIN, address, and phone instead of hardcoded Manohar Traders text.
4. **PWA & Service Worker Cache Busting**:
   - Check how `sw.js` caches `/api/*` requests and whether API responses could ever be served stale by the service worker.

## Required Output Format
Return a screen-by-screen Frontend & UX audit table with exact `queryKey` bugs, print/auth findings, file/line references, and Phase 2 fixes.
