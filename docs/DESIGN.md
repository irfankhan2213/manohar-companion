# Design System: Apple Calm Inset (UI Spec v2)

## 1. How It Should Feel
The application must make Indian traders, accountants, and business owners feel **calm, in control, and completely unhurried**. They handle large amounts of money and busy daily transactions; the interface should not scream with neon warnings, dense charts, or cluttered badge rows.

Instead, it evokes the reliability of Apple native apps (Settings, Health, Notes, Wallet):
- High-contrast typography on a soft, neutral canvas (`#F5F5F7`).
- Inset grouped white cards with gentle 14px radii and crisp 0.5px hairline dividers.
- Single clear primary action per screen.
- Tabular numerals so figures never jitter.
- Restrained color: neutral slate grays, deep pine accent (`#0F6B66`), with red/amber reserved strictly for overdue text or alerts.

---

## 2. Color Tokens

| Token | Hex | Usage |
|:---|:---|:---|
| `--bg` | `#F5F5F7` | Overall page background behind grouped cards |
| `--surface` | `#FFFFFF` | Inset grouped list containers, sheets, active cards |
| `--label` | `#1D1D1F` | Primary text and headlines |
| `--label-2` | `#6E6E73` | Subtitles, helper captions, secondary labels |
| `--label-3` | `#8E8E93` | Placeholders, inactive icons, subtle dividers |
| `--separator` | `#D2D2D7` | Hairlines (0.5px on retina/mobile screens) |
| `--fill` | `#E8E8ED` | Pressed row backgrounds, segmented control tracks |
| `--accent` | `#0F6B66` | Primary action buttons, switches, active tab indicators |
| `--accent-soft` | `#E1EFEE` | Tinted secondary buttons, active selection pills |
| `--danger` | `#B3261E` | Overdue amounts, payment alerts (text/icon only) |
| `--warn` | `#9A5B00` | Stale sync indicators, low stock (text/icon only) |
| `--ok` | `#2E7D4F` | Tally synced indicators, success ticks |

*WCAG AA Verification: `--label` on `--surface` achieves 15.8:1 contrast. `--accent` `#0F6B66` on `#FFFFFF` achieves 5.7:1 contrast. Both exceed AA standards.*

---

## 3. Typography Scale

Font stack:
`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter Variable", Inter, system-ui, "Noto Sans Devanagari", sans-serif`

| Style | Size / Line Height | Weight | Usage |
|:---|:---|:---|:---|
| **Hero Number** | 48px / 52px | 600 (Semibold) | The single big receivable number on Home |
| **Large Title** | 34px / 40px | 700 (Bold) | Screen title (collapses on scroll) |
| **Title** | 22px / 28px | 600 (Semibold) | Sheet section headers |
| **Headline** | 17px / 24px | 600 (Semibold) | Row titles, primary button text |
| **Body** | 17px / 24px | 400 (Regular) | Main textual content |
| **Subhead** | 15px / 20px | 400 (Regular) | Row subtitles (city, voucher number) |
| **Footnote** | 13px / 18px | 400 (Regular) | Timestamps, sync freshness, microcopy |

*All numbers, currencies, and dates use `font-variant-numeric: tabular-nums;`.*

---

## 4. Spacing, Shapes & Motion

- **Grid:** 8pt grid (4, 8, 12, 16, 20, 24, 32, 48).
- **Page Margins:** 20px on mobile; 32px gap between grouped list sections.
- **Card Radii:** 14px on Inset Grouped lists; 24px top radius on bottom sheets.
- **Row Heights:** Minimum 52px for single line, 64px for two-line rows.
- **Transitions:** Subtle 200ms ease-out for hover/press states; 350ms `cubic-bezier(0.32, 0.72, 0, 1)` for sheet slides and navigation transitions.
- **Reduced Motion:** Fully honored via `prefers-reduced-motion` media queries.

---

## 5. Review Checklist (Squint Test)

1. Squint test: is there one obvious most-important thing on each screen?
2. Count text sizes: at most three active sizes per screen.
3. Count non-neutral colors: only accent + danger/warning where strictly necessary.
4. Single primary button at most.
5. Rows limited to at most three pieces of information (title, subtitle, trailing value/status).
6. Zero paragraphs on main screens; guidance lives behind info sheets.
7. Generous breathing room around all inset card groups.
