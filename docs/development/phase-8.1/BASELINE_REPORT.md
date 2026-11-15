# LabLens Phase 8.1 — Baseline Diagnostic Report
**Date:** 2026-11-11  
**Environment:** Windows 10/11, Intel Core i3 10th Gen (CPU-only, no CUDA), 8 GB RAM, Python 3.12, Vite/React.

---

## 1. Executive Summary

A forensic diagnosis was conducted on the LabLens ingestion, text extraction, OCR, and measurement structuring pipelines in response to reported user unreliability:
- PNG uploads appearing to fail or hang indefinitely.
- Excessive extraction latency on images and scans (~103s per page).
- Incorrect measurement extraction (splitting test names like HbA1c on numbers, parsing patient metadata as lab tests).
- Dropped biomarkers from table rows when OCR bounding boxes fragmented test names and values.

---

## 2. Forensic Diagnosis & Root Causes

### 2.1 The "Stuck Uploading" Failure in Browser
1. **Separation of Concerns:** The actual HTTP upload endpoint (`POST /api/reports`) takes only **0.10s–0.30s** and saves the raw file bytes with SHA-256 hash.
2. **React StrictMode Cancellation Bug:** In `ProcessingExperience.tsx`, a 400ms `setTimeout` with a ref check was cleared on StrictMode's simulated unmount. Because `hasStarted.current` remained `true`, the effect never re-scheduled, leaving the UI permanently on the initial "uploading" animation without triggering extraction.
3. **Quality Warning Status Mismatch:** When an image triggered a quality assessment warning (e.g., low resolution or blur), the backend job completed with `status="review_required"`. The frontend polling loop only checked for `"completed"` or `"failed"`, thereby ignoring `"review_required"` and polling until timing out after 60 seconds.

### 2.2 OCR Latency (103 seconds per image)
- In `backend/app/services/extraction_service.py`, every image upload was subjected to a redundant 4-pass loop over preprocessed variants (`original`, `grayscale`, `adaptive_threshold`, `denoised`).
- Each pass on CPU took ~16–25 seconds, multiplying latency to over 103 seconds and creating massive CPU thrashing on Core i3 hardware.

### 2.3 Measurement Structuring Inaccuracies
1. **Line-by-Line Regex Fragment Collision:** PaddleOCR output returns spatial bounding boxes. In multi-column tables, `test_name` and `result/range` often arrived in separate bounding boxes on the same horizontal line. Naive `raw_text.splitlines()` evaluated each separately, dropping 4 out of 5 tests in CBC reports because test name lines had no numbers and value lines had no test names.
2. **Alphanumeric Code Mangling:** Regex `([<>]?\s*\d+)` matched the `1` inside `A1c` in `Hemoglobin A1c 6.2 %`, parsing test as `Hemoglobin`, value as `1`, and unit as `c`.
3. **Metadata Header Pollution:** Header lines like `Patient: Synthetic Jane Doe Date: 2026-11-10` matched the colon format and were incorrectly parsed as a biomarker `Patient` with value `2026`.
4. **Inequality Reference Range Blindspot:** Ranges such as `< 200 mg/dL` or `< 150 mg/dL` were unparsed or greedily swallowed, resulting in `None` reference ranges and inaccurate flags.

---

## 3. Baseline Performance & Accuracy Metrics

| Metric | Clean Digital PDF | CBC Scanned PNG (OCR) | Key-Value PDF |
| :--- | :---: | :---: | :---: |
| **Upload Time** | 0.18s | 0.10s | 0.11s |
| **Extraction Time** | 0.28s | **103.33s** | 0.48s |
| **Structuring Time** | 0.29s | 0.13s | 0.32s |
| **Ground Truth Biomarkers** | 5 | 5 | 4 |
| **Biomarkers Extracted** | 6 (1 false positive) | **1** (4 dropped) | 4 |
| **Biomarker Recall** | 80% (mangled A1c) | **20%** | 100% |
| **Biomarker Precision** | 83% (false patient test) | 100% | 100% |
