# LabLens Phase 3A — Document Intelligence, OCR & Image Processing Report

## Dependencies and versions

Installed (Python 3.12, Windows 11 CPU):
- PyMuPDF 2.1.0 (fitz) — digital PDF text + word/bbox extraction.
- OpenCV 4.12.0 (opencv-python) — preprocessing + quality assessment.
- Pillow 13.0.0 — image handling.
- PaddlePaddle 3.3.1 (CPU) — inference runtime.
- PaddleOCR 3.7.0 — OCR engine (PP-OCRv6 medium det/rec, mobile-oriented pipeline).
- PaddleX 3.7.x — pipeline wrapper.

Compatibility note: PaddlePaddle 3.3.1 on Windows CPU crashes with
`NotImplementedError: ConvertPirAttribute2RuntimeAttribute ... onednn_instruction.cc`
when oneDNN/MKL-DNN is enabled. Fixed by setting
`FLAGS_use_mkldnn=0`, `FLAGS_enable_pir_api=0` and passing `enable_mkldnn=False`
to PaddleOCR. This is documented in `backend/app/services/ocr_engine.py`.

OCR deps are isolated in `backend/requirements-ocr.txt`; the basic backend
(`requirements.txt`) does not require them.

## OCR model and configuration

- Engine: PaddleOCR, English (`lang='en'`).
- Doc orientation classification: disabled.
- Doc unwarping: disabled.
- Textline orientation: disabled.
- MKL-DNN: disabled (stability fix).
- Lazy singleton initialisation (model not loaded at app startup).
- One page at a time; no concurrency.

## Database changes

Additive migration (no destructive changes) in `backend/app/database.py`:
- `extraction_jobs` (id, report_id FK, status, document_type, total_pages, processed_pages, started_at, completed_at, error_code, created_at, updated_at).
- `page_extractions` (id, report_id FK, page_number, extraction_method, raw_text, extraction_metadata JSON, page_width, page_height, text_detection_metadata JSON, created_at).
- Indexes on report_id for both.

Existing `reports` table and Phase 2 storage untouched.

## API endpoints

- POST /api/reports/{report_id}/extract — runs extraction, returns job summary.
- GET /api/reports/{report_id}/extraction — returns job + page-level results with text, method, metadata, warnings.

Duplicate extract requests are idempotent (returns existing completed job).

## Digital PDF extraction

- PyMuPDF `get_text("words")` for word-level bboxes + `get_text()` for raw text.
- Per-page classification: digital (≥40 chars), sparse (1–39), scanned (0).
- Sparse/mixed pages are rendered to PNG and OCR'd.
- Page width/height preserved. Reading order as returned by PyMuPDF.

## OCR pipeline

- Scanned PDF pages rendered at 200 DPI to PNG.
- Image uploads: OpenCV preprocess variants (original, grayscale, adaptive threshold, denoised); the variant yielding the most text is retained, and all variants are tried.
- PaddleOCR returns text + confidence + bbox for each line.
- Results stored per page with method "ocr", raw_text, OCR items, quality metadata.

## Image preprocessing

OpenCV pipeline (`backend/app/services/image_processor.py`):
- Read + dimension validation.
- Brightness/contrast/blur assessment (Laplacian variance).
- Flags: low_resolution (<800px), possibly_blurry (variance <50), low_contrast (std <25).
- Variants: original, grayscale, adaptive Gaussian threshold, fastNlMeans denoising.
- Original source image is never overwritten; only temp variants in a controlled tmp dir, cleaned after processing.

## Quality warnings

Structured warnings returned and shown in the UI, e.g.:
- "Image appears blurry; OCR may be inaccurate."
- "Low resolution; consider a higher-quality photo."
- "No text detected on this page."
- "Sparse text detected; page may need OCR."

No universal thresholds are claimed; they are calibrated heuristics.

## Resource management

- One page at a time; no concurrency.
- Lazy model init (not at startup).
- Temp images deleted after processing.
- Measured on the target laptop (Intel i3, 8 GB):
  - Digital PDF (1 page): ~0.3 s.
  - Image OCR (400×120 synthetic): ~15 s including model init on first call; subsequent pages reuse the singleton.
  - Model init (first OCR): ~10–30 s.
  - Peak memory observed: within 8 GB (PaddleOCR process ~1–2 GB).

## Frontend integration

- `src/lib/api.ts`: `triggerExtraction`, `getExtraction` + typed `ExtractionResult`/`ExtractionPage`.
- `ReportViewerPage`: real report view with "Extract document" button, status badge, per-page extracted text, warnings. Preview/unavailable routes preserved.

## Tests and outcomes

Backend:
- pytest: 23 passed (19 Phase 2 + 4 Phase 3A), 8 warnings (deprecation only).
- test_digital_pdf_extraction: pass (method digital, text contains "Vitamin D").
- test_image_ocr_extraction: pass (method ocr, text contains "Vitamin D").
- test_extraction_not_found: pass (404).
- test_extraction_idempotent: pass.

Real extraction verified:
- Digital PDF: "Vitamin D (25-OH): 24 ng/mL\nReference range: 30 - 100\n", 327 ms.
- Scanned-style PNG: "Vitamin D (25-OH)\n24 ng/mL\nReference: 30 - 100", 15.8 s.

Frontend:
- typecheck: pass.
- lint: pass.
- build: pass (JS 677.45 kB / gzip 215.26, CSS 160.71 kB / gzip 28.10).

## Known limitations

- OCR is slow on the i3 (10–30 s model init + ~10–15 s per page). Mobile/server models not used; default PaddleOCR v6 medium is heavier than ideal but the only reliably installable combo.
- No Tesseract cross-check (optional, not installed).
- Mixed PDFs are handled page-by-page.
- Quality thresholds are heuristic, not clinically calibrated.
- No medical measurement extraction or interpretation (out of scope for 3A).
- Original documents are never modified.

## Startup commands

Backend:
```
cd backend
py -3.12 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:
```
npm.cmd run dev
```

Install OCR deps (optional, separate):
```
cd backend
py -3.12 -m pip install -r requirements-ocr.txt
```
Set env vars before running OCR:
```
set FLAGS_use_mkldnn=0
set FLAGS_enable_pir_api=0
```
(These are set automatically in `ocr_engine.py`.)
