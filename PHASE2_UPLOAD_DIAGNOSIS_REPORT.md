# LabLens — Phase 2 Upload Failure: Diagnosis & Fix Report

## 1. Exact root cause

The "Failed to fetch" error was caused by the **backend not running** at the time of the browser upload. The frontend's `fetch` to `http://127.0.0.1:8000/api/reports` could not establish a connection, so the browser threw a network error, which `api.ts` originally surfaced verbatim as "Failed to fetch".

Secondary improvement: error handling was too vague; network failures are now reported as a clear "backend unavailable" message.

No code defect in the upload handler, multipart parsing, validation, or storage was found. The API contract between frontend and backend matches (field name `file`, `consent` boolean form field).

## 2. How it was discovered

- `Invoke-RestMethod http://127.0.0.1:8000/api/health` returned "Unable to connect to the remote server" — backend process was not listening.
- Frontend dev server was running on port 5173; Vite config pins port 5173.
- `src/lib/api.ts` defaulted to `http://127.0.0.1:8000` (no `.env` present), so the URL itself was correct.
- Backend started cleanly with `py -3.12 -m uvicorn app.main:app --host 127.0.0.1 --port 8000` once the stale process/port conflict was cleared; `/api/health` returned status ok.

## 3. Files modified

- `src/lib/api.ts` — added `safeFetch` wrapper converting network errors to "LabLens could not connect to its local storage service...".
- `backend/app/config.py` — data dir default changed to `backend/data` (was `LabLens/data`).
- (No changes to validation, storage, routes, or schemas; they were already correct.)

## 4. Exact fix implemented

1. Start the FastAPI backend on 127.0.0.1:8000 (it had stopped).
2. Wrap all `fetch` calls in `api.ts` with a try/catch that throws a user-facing "backend unavailable" message instead of the raw "Failed to fetch".
3. Corrected backend data directory to `backend/data`.

## 5. Backend startup result

Command: `cd backend && py -3.12 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
Result: "Application startup complete." and "Uvicorn running on http://127.0.0.1:8000".

## 6. Health endpoint result

`GET /api/health` → `{ status: "ok", database: "ok", storage: "ok", max_file_size_bytes: 20971520 }`

## 7. PNG upload result (browser E2E)

- Selected `test.png` (77 bytes) in the New Analysis page; preview rendered.
- Checked consent; clicked "Store report locally".
- UI showed "Stored locally: test.png".
- Report appeared in My reports library.
- Backend record: id `795292d6-...`, ext png, size 77, status `uploaded`.

## 8. PDF upload result (API)

- `POST /api/reports` with synthetic PDF → 201, id `8d736544-...`, ext pdf, status uploaded.
- Download hash matched original (SHA-256).

## 9. JPEG upload result (API)

- `POST /api/reports` with synthetic JPEG → 201.

## 10. Download hash verification

Original PNG SHA-256: `c6f348f502f707bf0ae7b702a2b61aa691490bcb6a1ac261fdeb04d1640651a5`
Downloaded PNG SHA-256: `c6f348f502f707bf0ae7b702a2b61aa691490bcb6a1ac261fdeb04d1640651a5`
Match: true.

## 11. Delete verification

- `DELETE /api/reports/{id}` → 204.
- Subsequent GET → 404.
- Library total → 0.
- Stored file removed.

## 12. Invalid-file rejection

- Corrupted PNG (`bad.png` containing "not an image") → 400, not added to library.
- Upload without consent → 400.

## 13. Browser end-to-end test result

Playwright (headless Chromium) drove the real UI: file selection, consent checkbox, upload button, success message, library listing, delete. All steps passed with 0 console/page errors.

## 14. Backend test results

`pytest`: 19 passed, 2 warnings (deprecation only).

## 15. Typecheck / lint / build

- `npm.cmd run typecheck`: pass.
- `npm.cmd run lint`: pass (2 pre-existing warnings remain: SmoothScroll exhaustive-deps is now resolved; only unrelated).
- `npm.cmd run build`: pass (JS 674.49 kB / gzip 214.68, CSS 160.42 kB / gzip 28.02).

## 16. Remaining blockers

- Backend must be running for uploads to work; it is not auto-started by the frontend. Users must run the backend command.
- No automated E2E test wired into CI; the manual Playwright script is in the temp qa folder.
- Vite JS chunk > 500 kB warning remains (pre-existing, optional).

## 17. Exact instructions for running

Backend:
```
cd backend
py -3.12 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:
```
npm.cmd run dev
```

Open http://localhost:5173, go to "Add a report", select a file, check consent, click "Store report locally".
