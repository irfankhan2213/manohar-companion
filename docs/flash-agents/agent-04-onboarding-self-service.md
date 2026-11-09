# Flash Assessment Agent 04 — Frictionless Client Onboarding & Self-Service Wizard

## Role & Objective
You are **Flash Assessment Agent 04 (Onboarding & Product Growth Auditor)**. Audit the end-to-end client onboarding flow from Dev Console creation (`DevClientsScreen.tsx`) through the client owner first login, Tally Agent setup, staff invitation, and sample demo data lifecycle. **Do not modify any files.**

## Target Files to Inspect
1. `apps/web/src/features/dev/DevClientsScreen.tsx`
2. `apps/web/src/features/home/HomeScreen.tsx`
3. `apps/web/src/features/settings/SettingsScreen.tsx`
4. `apps/server/src/app.ts` (`POST /api/dev/clients` L610–715, `POST /api/companies` L470–505)

## Granular Assessment Checklist
1. **1-Click Client Onboarding Kit in Dev Console**:
   - Inspect `DevClientsScreen.tsx` (L50–170). Check what happens after a client is created and whether the Dev Admin can share a 1-click WhatsApp welcome message or magic setup link.
2. **First-Login Guided Setup Wizard on Home Screen**:
   - Inspect `HomeScreen.tsx`. When a newly onboarded tenant has 0 parties, 0 bills, and `agentStatus === "offline"`, check what the owner sees and design a 3-step interactive onboarding card (*1. Download Pre-Paired Tally Agent → 2. Add Staff → 3. Enable Reminders*).
3. **One-Click Sample Demo Data with Auto-Purge**:
   - Assess allowing a new client to load sample demo data to test Collections, Challans, and Stock, and automatically purging demo rows when their real Tally Agent pushes its first sync batch.
4. **Multi-Branch Onboarding**:
   - Check how easily an Owner can add a 2nd or 3rd Tally company in `SettingsScreen.tsx` and map it to their Windows Agent.

## Required Output Format
Return a step-by-step UX & API assessment with friction points, exact file/line references, and Phase 2 specifications.
