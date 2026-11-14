# LabLens Phase 8.1 — Issues Log & Forensic Root Cause Analysis

## Issue 1: PNG Uploads Appear Stuck on "Uploading" Animation Indefinitely
- **Component:** `src/components/ProcessingExperience.tsx` and `src/pages/UploadPage.tsx`
- **Symptom:** User drops a PNG file, clicks "Start analysis", and the UI displays the document upload animation without ever completing or moving forward.
- **Root Cause A (Effect Cancellation):** In `ProcessingExperience.tsx`, a 400ms `setTimeout` was combined with `hasStarted = useRef(false)`. During React development mode StrictMode double-mounting, the cleanup function cleared the timer, but `hasStarted.current` remained `true`. On remount, the guard returned early, completely preventing `runPipeline()` from executing.
- **Root Cause B (Terminal State Misalignment):** When the backend encountered image quality warnings (e.g. low resolution), it marked the extraction job as `status = "review_required"`. The frontend polling function `pollExtraction` only checked for `status === "completed"` or `status === "failed"`. It treated `review_required` as pending and looped until timing out after 60 seconds.
- **Resolution:**
  - Removed timer delays in `ProcessingExperience.tsx` and triggered pipeline execution reliably without premature cancellation.
  - Set initial stage to `'extracting'` directly upon entering `ProcessingExperience` since upload was already confirmed.
  - Updated polling and completion handlers in `ProcessingExperience.tsx` to recognize `review_required` as a terminal successful completion state.

---

## Issue 2: OCR Extraction Latency (103 seconds per 1-page image)
- **Component:** `backend/app/services/extraction_service.py` & `backend/app/services/image_processor.py`
- **Symptom:** Single-page image upload took ~103 seconds on Core i3 CPU.
- **Root Cause:** Redundant 4-pass OCR loop over `original`, `grayscale`, `adaptive_threshold`, and `denoised` variants. PaddleOCR's recognition models were invoked 4 consecutive times on every single upload regardless of image clarity.
- **Resolution:**
  - Streamlined image extraction to execute single-pass OCR on `original` directly.
  - Implemented conditional fallback: only retry on contrast-enhanced grayscale if primary pass detects zero text and quality check detects low contrast.
  - Eliminated redundant passes, reducing image processing latency by over 80% on warm models (down to ~4.5–16s for typical synthetic images).

---

## Issue 3: Table Row Bounding Box Fragmentation
- **Component:** `backend/app/services/extraction_service.py` & `backend/app/services/measurement_service.py`
- **Symptom:** Multi-column tables (such as CBC reports) dropped 80% of test rows during OCR extraction.
- **Root Cause:** PaddleOCR returns text bounding boxes representing word clusters or columns. Joining with naive `"\n".join()` resulted in test names on one line and numbers/ranges on the next. Line-by-line regex dropped test name lines (no numbers) and value lines (no test name).
- **Resolution:**
  - Implemented `assemble_ocr_lines()` in `backend/app/services/image_processor.py`.
  - Groups bounding boxes that share vertical bands (`abs(item_y - line_y) <= tolerance`), sorts items horizontally left-to-right, and sorts rows vertically top-to-bottom.
  - Automatically reconstructs table rows: `Hemoglobin 14.2 g/dL 12.0 - 16.0`.

---

## Issue 4: Alphanumeric Biomarker Name Splitting (HbA1c Mangling)
- **Component:** `backend/app/services/measurement_service.py`
- **Symptom:** `Hemoglobin A1c 6.2 % 4.0 - 5.6 High` was parsed as `Hemoglobin` with value `1` and unit `c`.
- **Root Cause:** The measurement value regex `([<>]?\s*\d+)` matched the first number in the line, which was the digit `1` in `A1c`.
- **Resolution:**
  - Enforced lookbehind assertion `(?:^|(?<=[\s:]))` to require standalone numeric values preceded by whitespace, colon, or start-of-line.
  - Prevents splitting on alphanumeric codes like `A1c`, `B12`, `T3`, `T4`, `CD4`.

---

## Issue 5: Metadata Header False Positives
- **Component:** `backend/app/services/measurement_service.py`
- **Symptom:** `Patient: Synthetic Jane Doe Date: 2026-11-10` was extracted as a biomarker named `Patient` with value `2026`.
- **Root Cause:** Line had colon formatting and numbers, passing naive `_parse_line()`.
- **Resolution:**
  - Added header and metadata keyword rejection: `patient`, `doctor`, `physician`, `dr.`, `mrn`, `dob`, `accession`, `account`, `specimen`, `collected`, `reported`, `page \d+ of \d+`.
  - Rejects header lines before numeric extraction occurs.

---

## Issue 6: Inequality Reference Range Misattribution
- **Component:** `backend/app/services/measurement_service.py`
- **Symptom:** `Total Cholesterol 220 mg/dL < 200 High` had its reference range unparsed or was misclassified.
- **Root Cause:** Naive inequality regex greedily matched `<` numbers even on lines containing only a single qualitative result (e.g. `Glucose: <100 mg/dL`), swallowing the result as a reference range.
- **Resolution:**
  - Added guard requiring multiple numbers/values on the line before treating trailing `< 200` as an inequality reference range.
  - Qualitative results with a single value (e.g. `CRP: <5 mg/L`) retain `qualifier="less_than"` and `result_numeric=None`.
