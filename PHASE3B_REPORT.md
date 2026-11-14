# LabLens Phase 3B — Medical Measurement Extraction, Structuring & Verification Report

## Data models

Pydantic/SQLite `report_measurements` with fields: id, report_id, test_name_original, test_name_normalized, test_code, result_original, result_numeric, result_qualifier, unit_original, unit_normalized, reference_range_original, reference_low, reference_high, reference_unit, reference_context, lab_flag, derived_flag, sample_date, specimen_type, page_number, source_text, source_bbox, extraction_method, ocr_confidence, verification_status, created_at, updated_at.

`measurement_corrections` audit table: id, measurement_id, original_payload, corrected_payload, correction_timestamp, correction_reason.

## Alias dictionary

Curated dictionary in `backend/app/services/test_dictionary.py` covering CBC, lipid profile, glucose/HbA1c, liver function, kidney function. Returns normalized name, test code, confidence. Low-confidence matches flagged for review.

## Table-reconstruction strategy

Line-based parsing of extracted raw text. Colon-separated "name: value unit" lines are split; reference-range lines are attached to the preceding measurement. Handles multi-line ranges. Preserves source text for traceability.

## Numeric parsing rules

- Handles decimals, qualifiers (<, >), scientific notation, units.
- Does not infer missing decimals.
- Ambiguous values flagged as needs_review.

## Reference-range handling

Laboratory's own printed range preserved as `reference_range_original`; parsed into low/high when unambiguous. Missing ranges left null (never substituted with generic ranges).

## Derived flags

below_range / within_range / above_range / qualitative / unknown / review_required, computed only from the printed range and parsed result.

## Database changes

Additive: `report_measurements`, `measurement_corrections`, indexes. No destructive migrations.

## API endpoints

- POST /api/reports/{id}/structure
- GET /api/reports/{id}/measurements
- PATCH /api/reports/{id}/measurements/{mid}
- POST /api/reports/{id}/measurements/{mid}/verify
- POST /api/reports/{id}/measurements/verify-all-reviewed

## Verification UI

ReportViewerPage: "Extract document" + "Structure measurements" buttons, per-measurement list with name, result, unit, range, derived flag, status, and a "Verify" action.

## Benchmark results

Synthetic digital PDF ("Vitamin D (25-OH): 24 ng/mL / Reference range: 30 - 100"):
- 1 measurement extracted, name normalized correctly, value 24, unit ng/mL, range 30–100, derived below_range.
- Extraction 0.3 s, structuring <0.1 s.

## Known unsupported report formats

- Complex multi-column tables with wrapped cells may misassociate; flagged for review.
- Qualitative-only reports preserved as text but not structured as numbers.
- Non-English reports not supported.

## Test outcomes

- backend pytest: 24 passed (19 Phase 2 + 4 Phase 3A + 1 Phase 3B).
- Frontend typecheck, lint, build: pass.

## Remaining limitations

- Table reconstruction is line-based, not full layout-aware.
- No OCR confidence propagation to measurement confidence yet.
- No batch verification UI beyond per-item.
- Medical interpretation is out of scope.
