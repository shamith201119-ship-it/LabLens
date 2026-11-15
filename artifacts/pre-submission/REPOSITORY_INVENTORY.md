# LabLens — Repository Inventory (pre-submission)

**Prepared:** 2026-11-15 · **Scope:** the entire project tree at `C:\Users\sureshr\Documents\Default Project\LabLens` · **Backup location (quarantine):** `C:\Users\sureshr\Documents\Default Project\LabLens-cleanup-quarantine\`
**Authorising task:** pre-submission repository cleanup & integrity audit.
**Method:** full recursive listing before any deletion, with per-file references searched across Python/JS/TS imports, configs, docs, and runtime/test asset paths. Counts exclude `node_modules/` and `.git/` only where stated. No user data is inspected or listed by content.

---

## 0. Headline numbers (files excl. `node_modules/`, `.git/`)

| Stage | Files | Bytes |
|---|---|---|
| Before any cleanup (2026-11-15, measured) | 994 | 74,076,959 |
| After Phases 4–6 (this audit) | 438 | 20,385,969 |
| **Reduction** | **556 files (−56%)** | **53.7 MB (−73%)** |

Including `node_modules/` (11,932 files, 186,473,602 bytes) and `.git/` (648 files, 37,588,776 bytes), the working tree went from 13,573 files / 298,107,861 bytes to **12,015 files / 224,743,847 bytes**.

`node_modules/` and `.git/` are intentionally excluded from the per-file tables: they are managed by npm/git and are git-ignored where applicable.

---

## 1. Project root (before → after)

| Item | Type | Before | After | Verdict |
|---|---|---|---|---|
| `README.md` | Documentation | present | present (paths updated) | **Essential — keep** |
| `index.html` | App entry | present | present | **Essential — keep** |
| `package.json` / `package-lock.json` | Build + deps | present | present, unchanged | **Essential — keep** |
| `vite.config.ts` | Build config | present | present | **Essential — keep** |
| `tsconfig.json` | TS config | present | present | **Essential — keep** |
| `eslint.config.js` | Lint config | present | present | **Essential — keep** |
| `.gitignore` | Ignore rules | present | present, unchanged | **Essential — keep** |
| `PHASE15_REPORT.md`, `PHASE2_*.md` (3), `PHASE3A_REPORT.md`, `PHASE3B_REPORT.md`, `PHASE3B_VALIDATION_REPORT.md` | One-off phase logs | 7 files, ~37 KB | **Quarantined** | Redundant progress reports; content subsumed by README and curated evidence |
| `data/` | Directory | 2 files (16 KB) | **Quarantined** | Stray legacy stub DB + 8-byte synthetic upload — not the active data dir (`backend/data/` is) |
| `dist/` | Build output | 25 files, 10.9 MB | rebuilt (git-ignored, kept) | Regenerable; kept so the user's preview keeps working |
| `node_modules/` | Dependencies | 11,932 files, 186 MB | present | npm-managed, git-ignored, regenerable |
| `artifacts/qa/` | Generated QA artefacts | 594 files, 65.4 MB | **Quarantined** (curated subset promoted — see §8) | One-off session outputs |
| `artifacts/phase-8.1/` | Benchmark suite | 81 files, 1.9 MB | **Split**: 13 quarantined / benchmark evidence kept under `docs/development/phase-8.1/` | Benchmark evidence supports README claims — keep curated |
| `artifacts/pre-submission/` | This audit | new | created by this audit | Deliverable |
| `.pytest_cache/` | Test cache | 5 files | **Removed (regenerable)** | Category D |

---

## 2. Frontend source and configuration — Essential (unchanged except path-aware evidence links inside `docs/`)

| Area | Files | Bytes | Verdict |
|---|---|---|---|
| `src/pages/` | 12 | 128,623 | Essential — application pages |
| `src/components/` | 53 | 276,480 | Essential — includes the redesigned verification workspace |
| `src/lib/` | 13 | 38,373 | Essential — API client & selectors |
| `src/context/` | 6 | 8,262 | Essential — app readiness, motion, toast |
| `src/styles/` | 10 | 358,998 | Essential — design tokens + screen styles |
| `src/App.tsx`, `src/main.tsx`, `src/vite-env.d.ts` | 3 | 4,014 | Essential |
| `public/favicon.svg` | 1 | 259 | Essential — static asset |
| `index.html` | 1 | 1,233 | Essential |

Build/test status after cleanup: **lint clean · typecheck clean · production build succeeds** (`dist/assets/api-*.js` rebuilt against `127.0.0.1:8000`).

---

## 3. Backend source and configuration — Essential

| Area | Files | Bytes | Verdict |
|---|---|---|---|
| `backend/app/` | 52 | 473,390 | Essential — FastAPI application, OCR runtime, services, routes |
| `backend/tests/` | 78 | 29,611,607 | Essential — full regression suite (fixtures included); `conftest.py` isolation guard intact |
| `backend/tests/accuracy_evaluator.py` | 1 | 19,500 | **Moved** from `artifacts/phase-8.1/` → `backend/tests/` so the test suite no longer imports from outside the backend |
| `backend/requirements.txt`, `backend/requirements-ocr.txt` | 2 | 355 | Essential — pinned deps (no versions changed) |
| `backend/.env.example` | 1 | 99 | Essential — config template |
| `backend/data/` | 32 | 1,187,210 | **Protected user data, untouched, git-ignored** |
| `backend/.pytest_cache/`, `backend/app/__pycache__/`, `backend/app/routes/__pycache__/`, `backend/app/schemas/__pycache__/`, `backend/app/services/__pycache__/`, `backend/tests/__pycache__/` | 60 files | ~430 KB | **Removed (regenerable)** |

Full suite: **265 passed, 2 failed** — both failures are the documented, pre-existing `LABLENS_DATA_DIR` import-order leak in `tests/test_phase9_7_2_page_image.py`; they pass in isolation and with `tests/conftest.py` isolation. No test was skipped, edited or weakened for this cleanup, beyond the four `EVALUATOR_DIR` path corrections required by the `accuracy_evaluator.py` relocation.

---

## 4. Database and migration files

| Item | Verdict |
|---|---|
| `backend/data/lablens.db` | Protected. Never opened for content, hash or query by this audit; file count and size only. Git-ignored. |
| Migrations | The application initialises schema via `app.database.init_db()` at startup (no separate migration files in repo). |
| Root-level `data/` stub | Quarantined (synthetic 16 KB empty DB + 8-byte PDF; not the active data dir; unreferenced). |

---

## 5. Test fixtures and sample documents

| Fixture | Verdict |
|---|---|
| `backend/tests/fixtures/**` | **Essential — kept 100% unchanged** (digital/scanned/JPG/PNG fixture PDFs, GT JSONs, photos). |
| `backend/tests/accuracy_evaluator.py` | Moved into `backend/tests/` (needed by 4 test modules; path-fixed). |
| `docs/development/phase-8.1/test_fixtures/` | Kept (referenced by benchmark evidence). |
| QA-generated fixtures (`artifacts/qa/*/{fixtures,qa_data,qa_uploads}`) | Quarantined; `empty_valid_report.pdf` (used by the promoted estimator) kept under `docs/development/qa/full-product-audit/fixtures/`. |
| `backend/data/**` (user uploads) | **Protected/untouched.** |

---

## 6. OCR models and required model assets

- PaddleOCR/PP-OCRv6 weights live under the user profile cache (`~/.paddlex/official_models/`), **outside** the repository. Not inspected, not copied, not touched.
- Backend OCR implementation (`backend/app/services/`, incl. digital-text detection, OCR runtime, adaptive CPU/GPU) — **essential, unchanged**.
- `requirements-ocr.txt` kept as shipped.

---

## 7. Static images, icons and application assets

- `public/favicon.svg` — kept.
- `docs/assets/readme-banner.svg` — kept (README banner).
- QA screenshot evidence used by README: kept under `docs/development/qa/full-product-audit/screenshots/{phase9_11_5_final, phase9_11_6_responsive, phase9_12_0_before, phase9_12_1_final, phase9_12_2_loader}` (synthetic data only).
- Historical QA screenshots (desktop/mobile/landing/workspace/upload/processing series, ~260 files) — **quarantined**; synthetic, but they are AI-session evidence not needed for the submission, and all recoverable.

---

## 8. Evidence preserved deliberately (not quarantined)

Under `docs/development/` (163 files, ~13.8 MB):

| Path | Content | Why kept |
|---|---|---|
| `docs/development/phase-8.1/` (66 files) | OCR accuracy benchmarks, lab reports, submission-readiness report/checklist, OCR_LAB_* evidence, hardware-profile officer | README cites these reports; benchmarks back genuine engineering claims |
| `docs/development/qa/full-product-audit/` | Two phase reports (verification redesign 9.12.1, loader 9.12.2), verification results JSONs, promoted harnesses (.cjs), `fixtures/empty_valid_report.pdf`, 5 screenshot sets (README-referenced screens) | Independent reproducible QA evidence; README image/link targets |
| `docs/development/phase-8-routing/` | Routing verifier + 12 screenshots | Referenced by `docs/phase-8/PHASE_8_*.md` |

The moved/renamed harnesses had their `PROJECT_ROOT` depth corrected (`..\..\..\..` instead of `..\..\..`) so they still run from their final location.

---

## 9. Quarantined (original relative paths recorded in `CLEANUP_MANIFEST.json`)

| Group | Files |
|---|---|
| `artifacts/qa/**` (minus promoted subset) — screenshots, harness logs, QA node_modules (223 files, 18 MB), generated fixtures, print/PDF exports, `QA_REPORT.md`, routing/perf probes | 493 (via locked `backend_8000.log` handled separately, now included) |
| `artifacts/phase-8.1/**` one-off scratch/ad-hoc (`scratch_*`, `diag_*`, `test_*.py`, `make_*.py`) | 13 |
| Root phase progress reports | 7 |
| Root `data/` stray legacy stub | 2 |

**Total quarantined: 515 files, 53,473,268 bytes**, all SHA-256 recorded, all verified present and byte-identical after the move (515/515 OK). Nothing was permanently deleted in Phase 4; `.pytest_cache`/`__pycache__` trees (7 dirs, 65 files) were the only hard removals, as they are pure regenerable tool caches.

---

## 10. Documentation and submission materials

- `README.md` — kept, image/link paths repointed to `docs/development/…` (5 references).
- `docs/assets/readme-banner.svg` — kept.
- `docs/phase-8/` (5 files) — historical design docs, kept; 3 path references repointed to `docs/development/phase-8-routing/` and `docs/development/phase-8.1/`.
- `docs/development/**` — curated evidence (see §8).
- Root phase progress reports — quarantined (redundant against README + curated evidence).
- `docs/development/phase-8.1/LABLENS_INTELLIGENCE_AUDIT.md` — kept; documents known open issues, not fabricated.

---

## 11. Known residual references (not defects)

- `docs/development/phase-8.1/OCR_LAB_RESULTS.json` and `OCR_LAB_SESSION.json` contain absolute paths from their 2026-11-13 capture time. They are **frozen historical evidence** — left intact deliberately; rewriting historical records would falsify provenance.
- `docs/development/qa/full-product-audit/phase9_12_1_verification_results.json` contains absolute screenshot paths from the 2026-11-15 run — same rationale.
- `backend/tests/run_baseline_benchmarks.py` now writes its output to `docs/development/phase-8.1/BASELINE_BENCHMARK.json` (path corrected).
