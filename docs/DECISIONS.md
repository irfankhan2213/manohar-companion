# Architectural & Implementation Decisions Log

### 2026-10-19: Visual Aesthetic Alignment
- **Decision:** Follow UI Spec v2 (Apple Calm Inset Grouped Lists) rather than heavy neon glassmorphism.
- **Rationale:** Aligns with user preference and client requirements for a crisp, legible, distraction-free tool.

### 2026-10-19: Development Sequencing
- **Decision:** Build Phase 1 to Phase 6 UI prototype driven by an in-memory & localStorage mock database before scaffolding the real backend.
- **Rationale:** Allows client review of screens, workflows, and edge cases with zero external dependencies.

### 2026-10-19: Arithmetic Parser Selection
- **Decision:** Implement a lightweight recursive-descent parser with Decimal.js instead of importing mathjs.
- **Rationale:** Zero eval/security risk, minimal bundle size, and strictly controlled operators (`+`, `-`, `*`, `/`, `x`, `÷`, parentheses, and variable interpolation).

### 2026-10-19: Currency Representation
- **Decision:** Store all money values in integer `Paise` (1 Rupee = 100 paise).
- **Rationale:** Eliminates floating point rounding errors in financial transactions.
