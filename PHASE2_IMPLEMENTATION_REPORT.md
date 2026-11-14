# LabLens Phase 2 — Secure Report Ingestion, Local Backend & Document Storage

## Backend files created

```
backend/
  app/
    __init__.py
    main.py
    config.py
    database.py
    schemas/__init__.py, report.py
    services/__init__.py
      file_validation.py
      report_storage.py
      report_service.py
    routes/__init__.py
      health.py
      reports.py
    models/__init__.py
  tests/
    __init__.py
    test_reports.py
  data/            (created at runtime; gitignored)
  requirements.txt
  .env.example
```

## Database schema

SQLite table `reports`:
- id TEXT PRIMARY KEY (UUID)
- original_filename TEXT NOT NULL
- file_extension TEXT NOT NULL
- media_type TEXT NOT NULL
- file_size_bytes INTEGER NOT NULL
- sha256_hash TEXT NOT NULL
- storage_key TEXT NOT NULL UNIQUE
- status TEXT NOT NULL DEFAULT 'uploaded'
- consent_timestamp TEXT
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL

Safety: WAL journal mode, foreign_keys ON, parameterised SQL.

## API endpoints

- GET /api/health — DB + storage connectivity, max file size.
- POST /api/reports — multipart upload (file + consent + consent_timestamp). Returns report metadata.
- GET /api/reports — list all (newest first).
- GET /api/reports/{id} — single metadata.
- GET /api/reports/{id}/download — attachment download after ID verification.
- DELETE /api/reports/{id} — remove record + file.
- DELETE /api/reports — delete all records + files.

CORS restricted to localhost:5173/5174. Backend binds 127.0.0.1:8000.

## Security validations

- Extension allowlist (pdf, jpg, jpeg, png).
- Weak content-type signal.
- Magic-byte detection; extension/content mismatch rejection.
- PDF structural validation via pypdf; encrypted PDFs rejected; empty pages rejected.
- Image decoding via Pillow (verify + load); format/extension match check.
- 20 MB streaming chunked read with early rejection.
- Empty file rejection.
- SVG/HTML/JS/executables/archives rejected by extension + magic mismatch.
- Random UUID storage keys; no user input in paths; path-traversal guards; no overwrites.
- Orphan file cleanup on DB insert failure; file removed on delete.
- No absolute paths or internal exceptions returned.

## File-storage strategy

Files stored at `backend/data/uploads/<uuid>.<ext>`, outside web root, never served statically. Downloads resolve the private storage key only after verifying the report record exists, served as attachments.

## Frontend integration

- src/lib/api.ts — typed client for health/list/upload/download/delete/delete-all.
- src/lib/product.ts — REPORT_STORAGE_AVAILABLE = true, PRODUCT_PHASE = 2.
- ReportsPage — real fetch, loading/error/empty states, download links, per-report delete, delete-all with confirmation.
- NewReportPage — real upload with consent checkbox, success/error feedback, status badge "Storage connected".

## Automated tests and outcomes

19 pytest tests in backend/tests/test_reports.py, all passing:
successful PDF/PNG/JPEG uploads, empty file, oversized, wrong extension, mime/signature mismatch, corrupted PDF, invalid image, no consent, list/get, download, delete individual, delete all, malformed ID, path traversal, duplicate file, failed storage write cleanup.

## Typecheck / lint / build

- Frontend: tsc --noEmit passes, eslint passes, vite build passes.
- Backend: pytest 19 passed, 2 warnings (deprecation only).

## Commands to start both services

Backend:
```
cd backend
py -3.12 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:
```
npm.cmd run dev
```

## Remaining limitations

- No OCR or medical interpretation (out of scope).
- Single-user local prototype; no auth or account isolation.
- No malware scanning (not claimed).
- No encryption at rest (not claimed).
- Frontend assumes backend on 127.0.0.1:8000 (configurable via VITE_API_BASE).
- No automated E2E browser test for the upload flow against the live backend.
- Vite JS chunk > 500 kB warning remains.
