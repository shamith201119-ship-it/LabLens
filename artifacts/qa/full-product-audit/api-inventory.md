# LabLens Backend API Inventory

**Audit Date:** 2026-11-10
**Backend Framework:** FastAPI (Python 3.12)
**Database:** SQLite (local private database)

---

| HTTP Method | Endpoint Path | Function Name | Purpose | Phase | Parameters / Payload | E2E QA Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | `health_check` | Service readiness check | Infra | None | VERIFIED (200 OK) |
| `POST` | `/api/reports` | `upload_report` | Upload and store PDF/image with consent | Phase 2 | `file: UploadFile`, `consent: bool` (form-data) | VERIFIED (201 Created) |
| `GET` | `/api/reports` | `list_reports` | List all stored reports with metadata | Phase 2 | None | VERIFIED (200 OK) |
| `GET` | `/api/reports/{report_id}` | `get_report` | Get detailed metadata for specific report | Phase 2 | `report_id: str` | VERIFIED (200 OK) |
| `DELETE` | `/api/reports/{report_id}` | `delete_report` | Delete report and disk files | Phase 2 | `report_id: str` | VERIFIED (204 No Content) |
| `DELETE` | `/api/reports` | `delete_all_reports` | Bulk delete (QA-isolated only) | Phase 2 | None | VERIFIED |
| `GET` | `/api/reports/{report_id}/download` | `download_report` | Download original uploaded document | Phase 2 | `report_id: str` | VERIFIED (200 OK, bytes verified) |
| `POST` | `/api/reports/{report_id}/extract` | `start_extraction` | Trigger text & page extraction (PDF/OCR) | Phase 3A | `report_id: str` | VERIFIED (202 Accepted) |
| `GET` | `/api/reports/{report_id}/extract/status` | `get_extraction_status`| Poll extraction job status | Phase 3A | `report_id: str` | VERIFIED (200 OK) |
| `GET` | `/api/reports/{report_id}/measurements` | `get_measurements` | Get extracted measurements | Phase 3B | `report_id: str` | VERIFIED (200 OK) |
| `POST` | `/api/reports/{report_id}/measurements/structure` | `structure_measurements` | Parse and normalize measurements | Phase 3B | `report_id: str` | VERIFIED (200 OK) |
| `PATCH` | `/api/reports/{report_id}/measurements/{measurement_id}` | `correct_measurement` | Update measurement values/units | Phase 3B | `measurement_id`, body payload | VERIFIED (200 OK) |
| `POST` | `/api/reports/{report_id}/measurements/{measurement_id}/verify` | `verify_measurement` | Mark measurement as verified | Phase 3B | `measurement_id` | VERIFIED (200 OK) |
| `POST` | `/api/reports/{report_id}/analyse` | `analyse_report` | Run deterministic health intelligence | Phase 4 | `report_id: str` | VERIFIED (200 OK) |
| `GET` | `/api/reports/{report_id}/analysis` | `get_analysis` | Retrieve stored analysis run | Phase 4 | `report_id: str` | VERIFIED (200 OK) |
| `POST` | `/api/reports/compare` | `compare_reports_endpoint` | Compare two reports side-by-side | Phase 4 | `{ report_ids: [id1, id2] }` | VERIFIED (200 OK) |
| `GET` | `/api/reports/{report_id}/explanations` | `get_explanations` | Evidence-backed medical explanations | Phase 5 | `report_id: str` | VERIFIED (200 OK) |
| `GET` | `/api/history` | `get_history_overview` | Timeline of all reports & biomarkers | Phase 7 | None | VERIFIED (200 OK) |
| `GET` | `/api/history/biomarkers/{biomarker_name}` | `get_biomarker_history` | Longitudinal trend points & deltas | Phase 7 | `biomarker_name: str` | VERIFIED (200 OK) |
| `POST` | `/api/history/compare` | `compare_history_reports` | Validated cross-report comparison | Phase 7 | `{ report_ids: [id1, id2] }` | VERIFIED (200 OK) |
