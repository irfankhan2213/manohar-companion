# UI build spec: multi-company TallyPrime companion

Working title: PRODUCT_NAME (white-label). Do not put "Tally" in the product name, it is a trademark of Tally Solutions.
Version 2 (calm redesign). Written 17 October 2026.

---

## 0. Rules for the agent (read first)

1. Read this whole file before writing any code.
2. Build in the phases in section 14. Stop at every checkpoint, report, and wait. Do not start the next phase until told.
3. This round is UI only. There is no real backend, login, Tally agent, WhatsApp connection or PDF service. All data comes from a mock API behind an interface (section 6), so the real API can replace it later without touching screens.
4. **The feel beats the feature list.** If a screen feels crowded, rushed or busy, remove things or move them behind a tap. Never add something to a main screen just because it exists in the data.
5. Build only what is written here. If something is unclear, choose the simplest option that fits, write the choice in `docs/DECISIONS.md`, and carry on. Ask only if you are blocked.
6. Never say something works unless you ran it. Before every checkpoint run typecheck, lint, unit tests and the screenshot script, then look at the screenshots at 390x844 and 1280x800 and judge them with the review checklist in section 12.
7. Commit at the end of each phase with conventional commit messages and tag it `phase-N`.
8. Keep files under about 300 lines, components small, no dead code. Every shortcut goes into `docs/DECISIONS.md`.
9. All user-visible text goes through the i18n layer from the start (section 11).

---

## 1. Product context

A web app (installable as a phone app) for Indian traders and distributors who keep their books in TallyPrime. A small program on the Tally PC will later feed the cloud. This round builds only what users see.

What users do in it:

- See who owes them money and send payment reminders on WhatsApp.
- See stock per company and combined across companies.
- Create and look up challans (sales, purchase, delivery).
- Keep a notebook of tables where typing `10*2` gives `20`, like Tally.
- See PDFs of statements, challans and notebooks.
- Let different staff see and do different things (roles).

Facts that shape the design:

- Most users are on iPhone. Design phone first.
- One customer (tenant) can have several Tally companies, with a different view per company plus an "All companies" view.
- Tally ledgers do not always say which bill a payment cleared. When that is missing, the app matches payments to the oldest invoices first (FIFO) and marks those bills as estimated.
- The financial year runs 1 April to 31 March. Voucher numbers look like `GST/012/26-27`.
- Staff may read Hindi. Money uses Indian grouping (₹1,32,300).
- These people are busy and handle money. The app should make them feel calm and in control, never hurried.

---

## 2. Tech stack (use exactly this)

| Area | Choice |
|---|---|
| Runtime and tooling | Node 20+, pnpm workspaces, TypeScript strict (`noUncheckedIndexedAccess` on) |
| Build | Vite 5+ |
| UI | React 18, React Router 6 |
| Styling | Tailwind CSS 3.4 with design tokens as CSS variables in `src/styles/tokens.css`, mapped in `tailwind.config.ts`. Use `rem` units so text scales with the user's font size setting. |
| Headless primitives | Radix UI (dialog, tabs, popover, dropdown-menu, switch, select, checkbox) and `vaul` for bottom sheets with snap points (detents). Style everything yourself. |
| Data fetching | TanStack Query 5 |
| UI state | Zustand with `persist` (session: role, company, language) |
| Forms | react-hook-form with zod resolvers |
| Validation and types | zod in the shared package, types inferred from schemas |
| Dates | date-fns |
| Exact arithmetic | decimal.js (notebook and money maths) |
| Lists | TanStack Virtual for lists over 100 rows |
| Icons | lucide-react, one stroke weight (1.75), no emoji icons |
| Class helpers | clsx and tailwind-merge |
| i18n | i18next and react-i18next, two languages: `en`, `hi` |
| PWA | vite-plugin-pwa (generateSW, prompt for update) and `@vite-pwa/assets-generator` for icons |
| Fonts | System font stack first so iPhone shows its native font: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter Variable", Inter, system-ui, "Noto Sans Devanagari", "Kohinoor Devanagari", "Nirmala UI", sans-serif`. Bundle `@fontsource-variable/inter` (Latin only) as the fallback for Android and Windows. Tabular numerals on all numbers. |
| Motion | CSS transitions only (no animation library) |
| Tests | Vitest and React Testing Library, Playwright for screenshots and smoke tests, `@axe-core/playwright` for accessibility |
| Lint and format | ESLint (typescript-eslint, react-hooks, jsx-a11y) and Prettier |

Do not add a component kit (no MUI, Chakra, Ant, or shadcn presets used unchanged). Do not add mathjs: the notebook uses a small custom parser (section 9.6) to keep the bundle small and avoid any `eval`.

---

## 3. Design System & Tokens

Tokens defined in `src/styles/tokens.css`:
- `--bg`: `#F5F5F7`
- `--surface`: `#FFFFFF`
- `--label`: `#1D1D1F`
- `--label-2`: `#6E6E73`
- `--label-3`: `#8E8E93`
- `--separator`: `#D2D2D7`
- `--fill`: `#E8E8ED`
- `--accent`: `#0F6B66`
- `--accent-soft`: `#E1EFEE`
- `--danger`: `#B3261E`
- `--warn`: `#9A5B00`
- `--ok`: `#2E7D4F`
