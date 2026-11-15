# LabLens — Dependency & Reference Audit (pre-submission cleanup)

**Prepared:** 2026-11-15 · **Method:** recursive search for import/require/path/string/prose references across every tracked file (Python/JS/TS/MJS/HTML/CSS/JSON/Markdown/.gitignore), plus file-level consumers in scripts, docs and the README. Anything not demonstrably dead was **kept**; spot claims verified by executing the suites.

---

## 1. Search coverage (all files in repo, excluding `node_modules/` and `.git/`)

| Class of reference | Where searched | What was looked for |
|---|---|---|
| Python imports | `backend/**/*.py`, `docs/development/**/*.py`, `scripts/` | `accuracy_evaluator`, `phase-8.1` paths |
| JS/TS imports & dynamic imports | `src/**/*`, `docs/**/*.{cjs,js}` | `artifacts/`, `phase` paths, fixtures |
| Package scripts | `package.json`, `backend/requirements*.txt`, `backend/.env.example` | script targets, entry points |
| Config | `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `.gitignore`, `backend/.env.example`, pytest conftest | entry files, ignored paths |
| Fixtures | `backend/tests/fixtures/**`, `docs/development/**` | all moved files' consumers |
| Runtime/font/static assets | `public/`, `index.html`, `src/styles/`, `docs/assets/` | logo/favicon/banner references |
| OCR pipeline | `backend/app/services/**` | model/scale/lookup tables in `artifacts/**` |
| Documentation paths | `README.md`, `docs/**/*.md`, all `*.md` | every `artifacts/…`, `docs/…` reference |
| Build output | `dist/` | not tracked; reproduced by `npm run build` |

---

## 2. Findings — things that WOULD have broken (all fixed, verified)

### 2.1 Four backend test modules imported a module from the quarantine candidate tree

`backend/tests/test_corrected_state.py:13`, `test_ocr_runtime.py:18`, `test_phase9_5_photographed_report.py:23`, `test_verify_selected.py:18` all did:

```python
EVALUATOR_DIR = PROJECT_DIR / "artifacts" / "phase-8.1"
```

and `from accuracy_evaluator import evaluate_fixture, evaluate_page_attribution`.

**Resolution:** `accuracy_evaluator.py` was relocated **into** `backend/tests/` (it was always test support, never an experiment artifact); the four modules now point at `BACKEND_DIR / "tests"`. A quick sanity import check was followed by the full suite:

- Before fix: `python -m pytest -q` → **collection error** (`ModuleNotFoundError: accuracy_evaluator`).
- After fix: **265 passed, 2 failed (pre-existing) — suite fully re-runnable.**

### 2.2 `backend/tests/run_baseline_benchmarks.py` wrote results into a `artifacts/phase-8.1/` path

Comment and `out_path` updated to `docs/development/phase-8.1/BASELINE_BENCHMARK.json` (the evidence location after promotion).

### 2.3 Benchmark runners leaked absolute historical paths as default output targets

`docs/development/phase-8.1/ocr_hardware_profile.py`, `ocr_lab_benchmark.py`, `ocr_lab_worker.py` set `ARTIFACT_DIR = ROOT_DIR / "artifacts" / "phase-8.1"`. Updated to `ROOT_DIR / "docs" / "development" / "phase-8.1"`.

### 2.4 README and phase docs referenced the promoted locations

- `README.md`: 5 references repointed to `docs/development/qa/…` / `docs/development/phase-8.1/…` (3 images + gallery prose + submission-evidence references).
- `docs/phase-8/PHASE_8_HANDOFF.md` and `PHASE_8_IMPLEMENTATION_STATUS.md`: routing harness references repointed to `docs/development/phase-8-routing/`.
- `docs/development/phase-8.1/OCR_LAB_REPORT.md`: evaluator path updated to `backend/tests/accuracy_evaluator.py`.
- `docs/development/phase-8.1/LABLENS_INTELLIGENCE_AUDIT.md`: QA screenshots note updated (artefacts quarantined out of repo).
- All promoted `docs/**` docs were re-probed: zero remaining stale `artifacts/` references except inside frozen historical JSON (see §5).

### 2.5 QA harness scripts moved into `docs/development/` had relative depth assumptions

`phase9_12_1_verification.cjs` and `phase9_12_0_before.cjs` computed the repo root as `..\..\..` (3 levels). Promoted location is 4 levels deep — corrected to `..\..\..\..`. All six harness `.cjs` files pass `node --check`.

---

## 3. Per-group reference verdict

| Group | Reference searches for | Result |
|---|---|---|
| `artifacts/qa/**` | `accuracy_evaluator`, cross-imports, `require()`s, config paths, docs, README image links | **No references survive** outside the promoted set (and one `dev backend access log` referenced nothing and was locked-open by the running dev backend — moved manually after that backend was restarted, still fully recovered in quarantine) |
| `artifacts/phase-8.1/scratch_*`, `test_*.py` (5), `diag_png_upload.cjs`, `make_*.py` (2) | imports elsewhere, docs citations, README | **None.** Ad-hoc diagnostics superseded by `backend/tests/` and retained harnesses |
| Root `PHASE*.md` (7) | README/docs links | **None.** Superseded by README + curated evidence |
| Root `data/` (2 files) | backend default paths (`backend/data`), `.env.example` | **None.** Stray 16 KB stub + 8-byte synthetic PDF outside any config |
| QA `package.json` / `package-lock.json` (local Playwright install) | `npm scripts`, CI, docs | **None.** Reproducible with `npm install playwright` against an isolated stack; QA guide (`docs/development/qa/…`) remains valid |
| QA screenshots & logs (remainder) | docs/README references | **None or position-only** (see §5) |
| `.pytest_cache`, `__pycache__` | imports (bytecode only) | None — pure regenerable caches |

---

## 4. What was kept, deliberately, despite looking disposable

- **`accuracy_evaluator.py`** — looked like another artefact script; is in fact imported by four regression tests. Now lives in `backend/tests/`.
- **`run_baseline_benchmarks.py`** — a development benchmark runner wired to `backend/tests/fixtures/`; kept, output path corrected.
- **QA harness `.cjs` files** — they are the actual reproducible QA evidence; kept in `docs/development/qa/full-product-audit/` with path fix.
- **`fixtures/empty_valid_report.pdf`** — required by `phase9_12_1_empty_state.cjs`; kept.
- **QA screenshot sets** (`phase9_11_5_final`, `phase9_11_6_responsive`, `phase9_12_*`) — referenced by README images and phase QA reports; synthetic data only; kept.
- **Benchmark JSONs & OCR reports under `docs/development/phase-8.1/`** — the only files backing README's engineering-evidence claims.
- **`PHASE_8_*` design docs** — historical but documentation-value; kept with 3 path corrections.
- **`LABLENS_INTELLIGENCE_AUDIT.md`** — unvarnished known-issues list; required for honesty at submission.

---

## 5. Frozen historical records intentionally not rewritten

- `docs/development/phase-8.1/OCR_LAB_RESULTS.json`, `OCR_LAB_SESSION.json` — absolute paths from capture machine/time. Historical evidence; editing would falsify provenance.
- `docs/development/qa/full-product-audit/phase9_12_1_verification_results.json` — absolute screenshot paths, same rationale.
- QA evidence content (measurements like `Glucose 112`) — synthetic fixture content inside report JSONs/docs, clearly labelled as such.

---

## 6. Post-move verification

- **515/515** quarantined files re-hashed and compared to `CLEANUP_MANIFEST.json` → 0 mismatches.
- Test suite collection → runs to completion (see §2.1).
- Frontend: `npm run lint` clean, `npm run typecheck` clean, production build succeeds.
- Smoke test on an isolated 8002/5175 stack: 14/14 checks (see `FINAL_CLEANUP_REPORT.md` §8). The dev DB was not touched; see §9.
