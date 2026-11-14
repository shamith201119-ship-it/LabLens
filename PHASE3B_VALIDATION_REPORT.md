# LabLens Phase 3B — Accuracy Acceptance Validation Report

## Synthetic test cases

15 cases in `backend/tests/test_phase3b_benchmark.py`:
1. CBC multi-column
2. Lipid profile
3. Glucose + HbA1c
4. Liver function
5. Kidney function
6. Decimal precision
7. Qualitative values
8. One-sided less-than range
9. One-sided greater-than range
10. Missing unit
11. Missing reference range
12. Unsupported test name
13. Multi-page
14. Wrapped reference interval
15. Multi-measurement single line (best-effort)

## Results

All 15 benchmark tests: **PASS**.

Field-level outcomes:
- Test-name accuracy: normalized correctly for all supported aliases; unsupported names preserved with low confidence and flagged needs_review.
- Numeric exact-match: correct for all decimal cases (0.95 preserved).
- Unit accuracy: extracted where present; missing units flagged needs_review.
- Reference-range accuracy: attached when on following line; missing ranges → derived_flag unknown.
- Derived flag: below_range/within_range/above_range computed only from printed range; qualitative values → qualitative; missing range → unknown.
- Uncertainty detection: low-confidence/missing-unit/missing-range cases flagged needs_review.

## Fixes implemented during validation

1. Result numeric set to None for qualifier values (<, >) — avoids treating a threshold as a measurement.
2. Missing units now force needs_review status.
3. Range attachment to preceding measurement when on a separate "Reference range:" line, with derived-flag recomputation.

## Corrections/audit verification

- PATCH updates fields and writes to measurement_corrections audit table.
- Verify endpoint sets status to verified.
- Values persist across requests (SQLite).

## Backend tests

- test_reports.py: 19 passed.
- test_measurements.py: 1 passed.
- test_phase3b_benchmark.py: 15 passed.
- test_extraction.py: 4 passed (2 slow due to OCR).
- Total: 39 passed (excluding slow OCR image test timing).

## Frontend

- typecheck: pass.
- lint: pass.
- build: pass.

## Remaining unsupported layouts

- Multi-column tables with wrapped cells may misassociate; flagged for review.
- Wrapped reference intervals spanning multiple lines (best-effort).
- Non-English reports.
- Complex multi-measurement single lines.

## Known limitations

- Line-based parsing, not full layout-aware table reconstruction.
- OCR confidence not yet propagated to measurement confidence.
- No batch verification UI.
