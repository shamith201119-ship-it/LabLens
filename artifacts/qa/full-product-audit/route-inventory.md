# LabLens Application Route Inventory

**Audit Date:** 2026-11-10
**Application:** LabLens ("Your lab report. Finally, in plain language.")
**Scope:** Phases 1 through 7

---

| Route Path | View / Component | Purpose | Phase Introduced | Interactive Elements Tested | Browser Viewports Tested | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | `LandingPage` | Marketing home, hero, value props, sample report preview, security & privacy highlights | Phase 1 & 1.5 | CTA buttons, navigation anchors, sample tabs, mobile hamburger menu | Desktop (1440x900, 1280x800), Tablet (768x1024), Mobile (390x844, 360x800) | VERIFIED |
| `/app` | `DashboardPage` | User dashboard overview, quick stats, recent reports, quick upload CTA | Phase 1 | Quick action buttons, report links, empty state action | Desktop, Tablet, Mobile | VERIFIED |
| `/app/reports` | `ReportsPage` | Report library, list of uploaded reports, search by filename, delete action | Phase 1 & 2 | Search input, clear search, view link, single delete with confirmation | Desktop, Tablet, Mobile | VERIFIED |
| `/app/reports/new` | `NewReportPage` | File upload interface, drag-and-drop, consent checkbox, upload validation | Phase 2 | Consent checkbox, file picker, upload submit button, cancel | Desktop, Tablet, Mobile | VERIFIED |
| `/app/reports/:reportId` | `ReportViewerPage` | Document viewer, extraction triggers, structured measurements, Phase 4 analysis, Phase 5 explanations, Phase 6 clinician handoff & Find Care | Phases 2–6 | Extract button, structure measurements button, verify buttons, run analysis button, explanation accordions, clinician summary print button, inclusion checkboxes, Find Care provider selectors | Desktop, Tablet, Mobile | VERIFIED |
| `/app/history` | `HistoryPage` | Personal lab history, timeline, cross-report comparison, biomarker trend explorer | Phase 7 | Timeline search, sort toggle (newest/oldest), Report A & B selectors, Swap button, Compare button, Biomarker category filters, Biomarker list items, SVG trend chart points | Desktop, Tablet, Mobile | VERIFIED |
| `/app/settings` | `SettingsPage` | User preferences, local storage policy, data privacy controls | Phase 1 | Safety overview links, local cache information | Desktop, Tablet, Mobile | VERIFIED |
| `/*` (e.g. `/unknown-path`) | `NotFoundPage` | 404 error page with safe fallback navigation | Phase 1 | Return to home / dashboard button | Desktop, Mobile | VERIFIED |

---

### Internal Navigation & Shell
- **Desktop Sidebar (`AppSidebar`):** Links to `/app`, `/app/reports`, `/app/history`, `/app/reports/new`, `/app/settings`. Verified active state styling and hover transitions.
- **Mobile Navigation (`MobileNav`):** Fixed bottom navigation bar with responsive layout on mobile screens (`<= 800px`).
- **Safety Banner:** Appears consistently across views reminding users that data processing remains private and local.
