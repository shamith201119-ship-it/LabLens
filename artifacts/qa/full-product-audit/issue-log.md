# LabLens QA Issue Log

**Audit Scope:** Phases 1 through 7 Full Product Acceptance Audit  
**Date:** 2026-11-10  
**Triage Policy:** P0 = Critical (Blocker), P1 = Major, P2 = Moderate, P3 = Minor  

---

### Discovered & Remediated Issues

| Issue ID | Severity | Category | Component | Description & Root Cause | Remediation & Fix | Post-Fix Verification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ISSUE-01** | P2 (Moderate) | UX / Navigation | `src/pages/ReportsPage.tsx` | Each report row in the Reports library had "Download" and "Delete" buttons, but lacked a direct "View" action button linking to `/app/reports/{id}`. Users could only access the viewer via other indirect links or typing the URL. | Added `<ButtonLink to="/app/reports/${report.id}" variant="primary" size="sm">View</ButtonLink>` to the report row action group in `ReportsPage.tsx`. | Verified in browser. Clicking "View" seamlessly opens `/app/reports/:reportId`. |
| **ISSUE-02** | P2 (Moderate) | UX / Workflow | `src/pages/NewReportPage.tsx` | After a successful upload, the user was shown a success note with a link to "My reports", requiring an extra navigation step to open the newly uploaded document for extraction. | Updated `handleUpload` to capture the newly generated `report.id` in component state (`uploadedId`) and render a direct `<Link to="/app/reports/${uploadedId}">Open report now &rarr;</Link>`. | Verified in browser. Users can immediately proceed to document extraction in one click. |
| **ISSUE-03** | P3 (Minor - Guardrail Audit) | Data Integrity / Safety | `backend/app/services/history_service.py` | Longitudinal trend calculations must never subtract incompatible units or divide by zero. Audited `get_biomarker_history()` for unit compatibility safety. | Code audit confirmed `first["unit"] == latest["unit"]` is strictly enforced before arithmetic delta calculation. When units differ, an explicit explanation is emitted and direct subtraction is withheld. Zero division in percentage change is guarded with `if first["value_numeric"] != 0`. | Verified across test suite (`tests/test_phase7_history.py`) and browser automation. |

---

### Defect Summary
- **P0 Critical:** 0
- **P1 Major:** 0
- **P2 Moderate:** 2 (both successfully remediated and verified)
- **P3 Minor:** 1 (audited and verified clean)
- **Remaining Open Blockers:** 0
