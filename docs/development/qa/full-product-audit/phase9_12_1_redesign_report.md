# Phase 9.12.1 â€” Verification workspace redesign

**Status:** implemented and verified
**Scope:** `src/pages/VerificationPage.tsx` and the verification components/styles only.
**Environment:** isolated QA stack â€” backend `127.0.0.1:8001` (`LABLENS_DATA_DIR=%TEMP%\opencode\lablens-phase9116-qa`), preview `127.0.0.1:5174`. The dev stack (`:5173` / `:8000`) and `backend/data/lablens.db` were not used or modified.

---

## What changed

The split-screen document viewer and dense measurement list were replaced with a single-column measurement card workspace:

- Header: **Verify your results** / *Compare each value with your report. Select the values that match.* / one helper line: *You're checking transcription accuracy, not medical normality.* The step indicator is retained; decorative progress elements are gone.
- Toolbar: total count, confirmed count, and exactly one **View original report** action. The donut ring, statistics panel, status filter chips, and permanent search box were removed.
- Cards: responsive 3 / 2 / 1-column grid (3 columns â‰¥ 1280 px, 2 columns 641â€“1279 px, 1 column â‰¤ 640 px). Each card shows a real checkbox, name, prominent value, unit, page, and a contextual `View in report` / `Edit` pair. The whole card (label, foot, and padding) toggles selection; the two actions are siblings outside the label.
- Selection: subtle lime-tinted card, checkbox tick, `N selected` live count, and exactly one sticky **ConfirmBar**.
- Zero selected: disabled `Select at least one result to continue` with a neutral, readable treatment (5.22:1 contrast).
- One selected: `Confirm 1 result & continue`; many: `Confirm N results & continue`.
- Corrections remain available through the existing inspection flow: validation, original extracted value, correction audit row, reset to `needs_review`, and explicit re-verification. The editor is a modal, not an always-open rail.
- `View original report` opens the existing `SourcePanel` + unchanged `DocumentStage` in a portal modal. Zoom, pan, fit/reset, page navigation, digital/scanned pages, OCR text toggle, download, and source highlighting are preserved. Closing restores focus, scroll position, and selection.
- One sticky action only: the old `SelectionBar`, footer **Confirm results & continue**, per-measurement **Confirm this result**, and per-card confirm icons are gone.
- The all-confirmed edge offers `Continue to your results` instead of a dead disabled button; the count line reads `N of N confirmed`.
- Zero-measurement reports show an honest empty state with `Back to my reports` and no confirmation bar.

## Before / after screenshots

| | Desktop (1440) | Mobile |
|---|---|---|
| Before | `docs/development/qa/full-product-audit/screenshots/phase9_12_0_before/before-verify-1440.png` | `.../before-verify-390.png` |
| After | `docs/development/qa/full-product-audit/screenshots/phase9_12_1_final/after-1440.png` | `.../after-390.png` (full page: `after-390-full.png`) |
| After, selected | `.../after-1024-selected.png`, `after-1440-all-confirmed.png` | `.../after-390-selected.png` |
| Viewer | `.../after-viewer-1024.png`, `after-viewer-scanned-1024.png` | `.../after-viewer-390.png` |
| Completion | `.../after-completion-partial-1440.png`, `after-completion-full-1440.png` | â€” |
| Empty state | `.../after-empty-1440.png` | `.../after-empty-390.png` |

Both before captures and after captures use the same clean five-measurement fixture content (`Glucose 112`, `HbA1c 6.2`, `Creatinine 0.95`, `Total Cholesterol 220`, `Triglycerides 165`), uploaded fresh to the isolated stack.

---

## QA results

### Card-grid and confirmation harness

`docs/development/qa/full-product-audit/phase9_12_1_verification.cjs`
Result: **179 passed, 0 failed** (`phase9_12_1_verification_results.json`, run 2026-11-15T03:57:49Z â†’ 03:58:37Z).
23 screenshots in `screenshots/phase9_12_1_final/`; zero console/page errors.

The harness uploads a fresh clean report (`ba8cfffe-1f0b-4c62-8a26-b40022297f56` for the final run), so every confirmation starts from zero. It also uses the isolated 2-page scanned report and the supplied `RESULTS 822` report read-only.

| # | Required check | Evidence | Result |
|---|---|---|---|
| 1 | Grid completeness / responsive columns | 5/5 cards at 1920, 1440, 1280, 1024, 768, 390, 360; 3/3/3/2/2/1/1 columns; names, values, units, page | Pass |
| 2 | Selection | Card body, checkbox, and card foot all toggle; selected treatment and live count update; 2 selected after reselect | Pass |
| 3 | Zero-selection block | Disabled `Select at least one result to continue` at all 7 widths; contrast 5.22:1 | Pass |
| 4 | One / many CTA copy | `Confirm 1 result & continue`; `Confirm 2 results & continue`; `Confirm 3 results & continue` | Pass |
| 5 | Selected IDs only | POST body to `/measurements/verify-selected` contained exactly the two selected IDs | Pass |
| 6 | Unselected stay unconfirmed | Backend status check: the three unselected measurements remained unverified | Pass |
| 7 | Partial completion | `Partially reviewed`; 2 confirmed / 0 corrected / 3 unverified; acknowledgement gated; acknowledgement verifies nothing | Pass |
| 8 | Full completion | 5 reviewed / 5 confirmed / 1 corrected; `Continue to your results`; existing results hand-off; all-confirmed bar shows `5 of 5 confirmed` and `Continue to your results` | Pass |
| 9 | Correction + re-verification | Empty value blocks save; HbA1c corrected 6.2 â†’ 6.3; audit row recorded; status reset to `needs_review`; card edited marker/value; explicit re-confirm; 2/1/3 partial stats | Pass |
| 10 | Viewer open/close | Opens from card and toolbar; modal title; Escape/close; focus restored to opener; scroll 160 â†’ 160; selection 2 â†’ 2 | Pass |
| 11 | Highlight alignment | One source highlight; zoom 24% â†’ 30%; relative highlight delta < 0.01; reset restores frame; scanned page 2 highlight | Pass |
| 12 | Selection + scroll survival | Scroll position and both selected IDs survive the viewer round trip | Pass |
| 13 | Keyboard and touch | Tab reaches checkbox with visible ring; Space toggles; Enter opens viewer/detail; Escape restores focus; touch context shows actions without hover; tap selects/opens | Pass |
| 14 | No duplicate confirmation controls | Exactly one confirm button; no per-card confirm; no legacy selection bar or footer confirm | Pass |
| 15 | No overlapping sticky controls | Bar bottom equals nav top at 360/390/768; bar clears sidebar at 1024+; inner bar aligns with toolbar; CTA inside viewport; reserved bottom space clears last card and disclaimer at every width | Pass |
| 16 | No overflow / nested scrolling | `scrollWidth <= clientWidth` at all 7 widths (10 px reserved gutter); zero nested page scrollers at all 7 widths | Pass |

Additional checks in the same run: single confirmation control count, modal covering the mobile nav at 390, body scroll lock, toolbar opening without a highlight, scanned OCR text/visual toggle, and the `RESULTS 822` read-only assertions.

### Zero-measurement state

`docs/development/qa/full-product-audit/phase9_12_1_empty_state.cjs`
Result: **16 passed, 0 failed** (`phase9_12_1_empty_state_results.json`).
A valid digital PDF with no result rows was uploaded to the isolated stack (`07707a40-9851-4537-9581-888241f778da`); extraction and structuring produced 0 measurements. At 1440 and 390: empty state renders, no cards/grid, no confirm bar, `No measurements were extracted`, `Back to my reports` present, no horizontal overflow, no nested scrollers, no console errors.

### Frontend regression

- `npm run lint` â€” clean.
- `npm run typecheck` â€” clean.
- Production build with `VITE_API_BASE=http://127.0.0.1:8001` â€” success; `dist/assets/api-DKTZ8zOX.js` contains `127.0.0.1:8001`.

### Backend regression

- Focused run: `python -m pytest tests/test_verify_selected.py tests/test_corrected_state.py tests/test_phase9_9_2_analysis_freshness.py tests/test_pytest_db_isolation.py -q` â†’ **29 passed**.
- Full suite: `python -m pytest -q` â†’ **265 passed, 2 failed** (710.94 s). The two failures are the existing `test_pytest_db_isolation.py::test_pytest_uses_isolated_database` and `test_phase9_9_2_analysis_freshness.py::test_freshness_tests_use_isolated_database`. Cause: `backend/tests/test_phase9_7_2_page_image.py` sets `os.environ["LABLENS_DATA_DIR"]` at import time (lines 6â€“7) and does not restore it; when the full suite imports that module before the isolation assertions, those assertions compare against the leaked `lablens-phase972-page-imageâ€¦` temp directory. Both tests pass in isolation and in the focused run; the targeted trio `test_phase9_7_2_page_image.py` + the two isolation tests reproduces the leak (14 passed, 2 failed). No backend file was changed for this redesign.
- Real dev database: SHA-256 before and after all runs = `1202e73e3589dea286f011ead0f78b221546bf5160968c9688f5fdea48133bf7`, size 221184 bytes, last write 13-11-2026 22:39:01. Untouched.

### Legacy harnesses

`phase9_11_2_verification.cjs`, `phase9_11_3_inspection.cjs`, `phase9_11_4_completion.cjs`, `phase9_11_5_final_qa.cjs`, and the earlier probes assert the removed split-screen / row / selection-bar DOM (`.ve-workspace`, `.ve-row`, `.ve-selection`, etc.) and were not run against this redesign. The new `phase9_12_1_verification.cjs` covers the same user journeys against the current DOM.

---

## `RESULTS â€” 822` finding (separate from the redesign)

Investigated from the supplied screenshot; **not renamed, deleted, hidden, or corrected**.

| Field | Value |
|---|---|
| Report | `c1eb0e44-b50d-41ba-95ce-946317899c44` |
| File | `Screenshot 2026-11-10 122953.png` |
| Measurement ID | `74c75cff-5a15-45c2-8f2b-1487845faab3` |
| `test_name_original` / `test_name_normalized` | `RESULTS` / `RESULTS` |
| `result_original` / `result_numeric` | `822` / `822` |
| `test_code` | `null` |
| `unit_original` / `reference_range_original` | `null` / `null` |
| Page / method / OCR confidence | 1 / `ocr` / 0.8516576886177063 |
| `source_text` / `source_bbox` | `RESULTS 822` / `[7, 0, 860, 53]` |
| `verification_status` / `has_corrections` | `needs_review` / `false` |

The raw OCR for page 1 begins:

```
RESULTS 822
Test Result Units Reference Range Flag
```

**What it is:** the table caption/header line (`RESULTS` plus the number `822`) was emitted by the existing extraction/structuring pipeline as a candidate result row. It has no test code, unit, or reference range, so it cannot be matched to a known biomarker. It is one real backend row, not a duplicate introduced by the card grid.

**How analysis treats it:** the stored analysis for this report reports `total_measurements: 13`, `supported_measurements: 12`, `unsupported: 1`, `eligible_measurements: 0`, `needs_review: 4`. The unsupported row is excluded from analysis; it never becomes an assessment. It remains visible in the verification workspace as a normal card (`RESULTS` / `822`, page 1), retains its source bbox (the viewer would highlight the header line), and can be reviewed/corrected through the normal correction flow. No UI code filters it out.

**Recommendation for the extraction owners (not applied here):** reject table-caption/header candidates â€” e.g. rows with no test code, no unit, no reference range, and a label such as `RESULTS` â€” or add an explicit header-detection rule before candidate persistence. This should be fixed at extraction, not by hiding or renaming the row in the verification UI. OCR models, extraction algorithms, DB schema, and API contracts were not changed.

---

## Files changed

**Added**

- `src/components/verification/MeasurementCard.tsx`
- `src/components/verification/MeasurementGrid.tsx`
- `src/components/verification/ConfirmBar.tsx`
- `src/components/verification/ReportViewer.tsx`
- `src/components/verification/useDialogBehavior.ts`

**Modified**

- `src/pages/VerificationPage.tsx`
- `src/components/verification/InspectionPanel.tsx`
- `src/components/verification/SourcePanel.tsx`
- `src/lib/verification.ts`
- `src/styles/verification.css`

**Deleted (superseded)**

- `src/components/verification/MeasurementRow.tsx`
- `src/components/verification/MeasurementWorkspace.tsx`
- `src/components/verification/SelectionBar.tsx`
- `src/components/verification/FilterChips.tsx`
- `src/components/verification/ProgressRing.tsx`
- `src/components/verification/VerificationHeader.tsx`

**QA artifacts (new, untracked)**

- `docs/development/qa/full-product-audit/phase9_12_1_verification.cjs`
- `docs/development/qa/full-product-audit/phase9_12_1_empty_state.cjs`
- `docs/development/qa/full-product-audit/phase9_12_1_verification_results.json`
- `docs/development/qa/full-product-audit/phase9_12_1_empty_state_results.json`
- `docs/development/qa/full-product-audit/phase9_12_1_geometry.cjs`
- `docs/development/qa/full-product-audit/phase9_12_1_modals.cjs`
- `docs/development/qa/full-product-audit/phase9_12_0_before.cjs`
- `docs/development/qa/full-product-audit/fixtures/empty_valid_report.pdf`
- `docs/development/qa/full-product-audit/screenshots/phase9_12_0_before/`
- `docs/development/qa/full-product-audit/screenshots/phase9_12_1_final/`

**Unchanged:** `DocumentStage.tsx`, `ReviewCompletion.tsx`, all backend source, OCR models/algorithms, extraction algorithms, DB schema, and API contracts.

---

## Remaining limitations

- The automated UI run is **Chromium only**; Firefox/Safari were not available on this machine. No physical iOS/Android device was used; touch was exercised through Playwright touch emulation. `env(safe-area-inset-*)` offsets are implemented but were not physically validated on a notched device.
- No GPU is present; OCR/performance behaviour on GPU hardware was not profiled.
- Headless Chromiumâ€™s motion profile is not a substitute for a normal-motion visual review; reduced-motion overrides exist and modal entry animations are defined in CSS.
- The full backend suite has the pre-existing two-test import-order leak described above. It is unrelated to these frontend changes and was left untouched.
- The `RESULTS â€” 822` row is still present in the isolated QA database by design; it is a data-level extraction finding, not a UI defect, and was not modified.
- The zero-measurement fixture is synthetic; it verifies the empty-state UI but not every real-world â€œno rowsâ€ document.
- The legacy Phase 9.11 harnesses listed above are superseded and were not run.

---

## Reproduction

```powershell
# isolated backend on :8001 with LABLENS_DATA_DIR=%TEMP%\opencode\lablens-phase9116-qa
# preview server on :5174 serving the isolated build
cmd /c "set VITE_API_BASE=http://127.0.0.1:8001&& npm run build"

node docs/development/qa/full-product-audit/phase9_12_1_verification.cjs
node docs/development/qa/full-product-audit/phase9_12_1_empty_state.cjs

cmd /c "npm run lint"
cmd /c "npm run typecheck"

cd backend
python -m pytest tests/test_verify_selected.py tests/test_corrected_state.py tests/test_phase9_9_2_analysis_freshness.py tests/test_pytest_db_isolation.py -q
python -m pytest -q   # records the pre-existing isolation-order failures
```

Do not point either harness at the real dev stack: they upload synthetic reports and mutate verification/correction state.
