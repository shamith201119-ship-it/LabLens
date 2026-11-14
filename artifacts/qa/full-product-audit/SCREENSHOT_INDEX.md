# LabLens QA Screenshot Index

**Audit Run:** 2026-11-10  
**Browser Engine:** Google Chrome Headless (v156.0.8078.80) via Playwright  
**Total Screenshots Captured:** 26  
**Visual Inspection Status:** ALL VERIFIED PASS

---

| # | Filename / Path | Route | Viewport | Visual Verification Details | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `screenshots/desktop/landing-desktop-1440.png` | `/` | 1440x900 (Full-page: 1440x16482) | Hero headline, interactive sample report preview, plain-language highlights, security banner. | PASS |
| 2 | `screenshots/desktop/landing-desktop-1280.png` | `/` | 1280x800 | Compact desktop viewport with proper card spacing and no horizontal overflow. | PASS |
| 3 | `screenshots/tablet/landing-tablet-768.png` | `/` | 768x1024 | Tablet view showing adjusted typography and two-column collapse into single column. | PASS |
| 4 | `screenshots/mobile/landing-mobile-390.png` | `/` | 390x844 (Full-page: 390x19053) | Mobile viewport showing hamburger navigation, fluid CTA buttons, and stacked sections. | PASS |
| 5 | `screenshots/mobile/landing-mobile-360.png` | `/` | 360x800 | Narrow mobile screen test showing zero horizontal overflow and legible typography. | PASS |
| 6 | `screenshots/desktop/dashboard-desktop.png` | `/app` | 1440x900 | Empty workspace state with onboarding prompt, quick action cards, and safety badges. | PASS |
| 7 | `screenshots/mobile/dashboard-mobile.png` | `/app` | 390x844 | Mobile dashboard with bottom navigation bar and accessible action targets. | PASS |
| 8 | `screenshots/desktop/reports-empty-desktop.png` | `/app/reports` | 1440x900 | Clean empty library state with icon, message, and 'Add a report' CTA. | PASS |
| 9 | `screenshots/desktop/upload-page-desktop.png` | `/app/reports/new` | 1440x900 | File dropzone, accepted formats list (PDF, PNG, JPG), file size limit, consent box. | PASS |
| 10 | `screenshots/workflows/upload-with-file-selected.png` | `/app/reports/new` | 1440x900 | Selected synthetic PDF file metadata, checked consent box, enabled upload button. | PASS |
| 11 | `screenshots/workflows/report-viewer-initial.png` | `/app/reports/:id` | 1440x1021 | Report viewer before extraction with 'Stored locally' status and action buttons. | PASS |
| 12 | `screenshots/workflows/report-extracted-text.png` | `/app/reports/:id` | 1440x3209 | Extracted document text with page count, extraction method, and clean raw text. | PASS |
| 13 | `screenshots/workflows/structured-measurements-table.png` | `/app/reports/:id` | 1440x3468 | Structured canonical biomarkers with original values, units, reference ranges, and flags. | PASS |
| 14 | `screenshots/workflows/analysis-findings-panel.png` | `/app/reports/:id` | 1440x3658 | Phase 4 Health Intelligence assessment findings, laboratory comparisons, and limitations. | PASS |
| 15 | `screenshots/workflows/phase5-explanations.png` | `/app/reports/:id` | 1440x3658 | Phase 5 Evidence-backed medical explanations with medical source references. | PASS |
| 16 | `screenshots/workflows/clinician-summary-screen.png` | `/app/reports/:id` | 1440x3767 | Appointment handoff document preview, section inclusion checkboxes, local private note. | PASS |
| 17 | `screenshots/print/clinician-summary-print-preview.png` | `/app/reports/:id` | Print Media (A4) | A4 print stylesheet preview: UI headers/buttons removed, clean print margins and tables. | PASS |
| 18 | `screenshots/workflows/find-care-section.png` | `/app/reports/:id` | 1440x3767 | Specialty selection, location input, Google Maps query preview, NMC & eSanjeevani links. | PASS |
| 19 | `screenshots/desktop/history-timeline-desktop.png` | `/app/history` | 1440x1243 | Chronological timeline of uploaded reports with effective dates and provenance badges. | PASS |
| 20 | `screenshots/mobile/history-timeline-mobile.png` | `/app/history` | 390x2077 | Mobile responsive timeline view with date tags, measurement counts, and detail links. | PASS |
| 21 | `screenshots/workflows/report-comparison-desktop.png` | `/app/history?tab=compare` | 1440x945 | Side-by-side comparison table showing Report A vs Report B with factual deltas. | PASS |
| 22 | `screenshots/workflows/biomarker-trends-desktop.png` | `/app/history?tab=trends` | 1440x1299 | Biomarker trend explorer with SVG graph, data points, neutral deltas, observation table. | PASS |
| 23 | `screenshots/desktop/settings-desktop.png` | `/app/settings` | 1440x900 | Settings overview explaining local-first storage, private retention, and data boundaries. | PASS |
| 24 | `screenshots/desktop/404-page-desktop.png` | `/invalid-route` | 1440x900 | 404 page with clear error message and button to return to dashboard. | PASS |
| 25 | `screenshots/workflows/ocr-extracted-image-result.png` | `/app/reports/:id` | 1440x1021 | OCR image extraction result for synthetic PNG displaying optical character recognition text. | PASS |
| 26 | `screenshots/workflows/reports-library-after-deletion.png` | `/app/reports` | 1440x900 | Reports library showing state update after safe deletion of disposable report. | PASS |

---

### Print-to-PDF Export
- **Path:** `artifacts/qa/full-product-audit/print-exports/clinician_summary_a.pdf`
- **File Size:** 240,697 bytes
- **Validation:** Clean multi-page PDF formatted to standard A4 dimensions with zero clipped tables or obscured text.
