# LabLens Phase 9.10.1 — OCR Performance Laboratory

**Date:** 2026-11-13  
**Phase:** 9.10.1 (controlled CPU experiments; no production changes)  
**Scope guard:** production OCR code, configuration, fixtures, ground truth, canonical
benchmark results and installed packages were **not** modified. All experiments injected an
experimental `PaddleOCR` instance into `ocr_engine._ocr_instance` inside isolated worker
processes only.

---

## 1. Hardware / runtime inventory

| Component | Value |
|---|---|
| CPU | Intel(R) Core(TM) i3-1005G1 @ 1.20 GHz, 2 physical / 4 logical cores, L3 4 MB |
| RAM | 8 375 230 464 bytes (7.8 GiB); ~0.7–1.4 GiB observed free during runs |
| GPU | Intel(R) UHD Graphics (Integrated, driver 27.20.100.9664); **no NVIDIA GPU** |
| `nvidia-smi` | not found (FileNotFoundError) |
| OS | Windows 11 (10.0.26300), x64 |
| Python | 3.12.10 |
| PaddlePaddle | 3.3.1 — `is_compiled_with_cuda() == false`, `cuda() == False`, `cudnn() == False` |
| PaddleOCR | 3.7.0 |
| PaddleX | 3.7.2 |
| OpenCV | 4.12.0.88 (+ contrib 4.10.0.84) |
| PyMuPDF | 2.1 |
| numpy / psutil / pillow | 2.2.6 / 7.2.2 / installed |
| CPU freq reported by psutil | 1190 MHz (current) |

**Cache (`C:\Users\sureshr\.paddlex\official_models`, 176.6 MiB):**

| Model | Size |
|---|---|
| PP-OCRv6_medium_det | 62 299 839 B |
| PP-OCRv6_medium_rec | 76 864 039 B |
| PP-LCNet_x1_0_doc_ori | 6 872 070 B |
| PP-LCNet_x1_0_textline_ori | 6 858 378 B |
| UVDoc | 32 254 868 B |

No PP-OCRv6 small/tiny text models are cached; see §9.

**Production OCR configuration (unchanged):** `use_doc_orientation_classify=False`,
`use_doc_unwarping=False`, `use_textline_orientation=False`, `lang="en"`,
`enable_mkldnn=False`, `text_det_limit_side_len=1280`, `text_det_limit_type="max"`,
`cpu_threads=10` (`DEFAULT_CPU_THREADS`), MKL-DNN off; recognition pipeline
`batch_size=6` (from `paddlex/configs/pipelines/OCR.yaml`); fp32 precision.
The production value of 10 threads exceeds the 4 logical cores.

---

## 2. CPU tuning experiments (one variable at a time)

Workload: `cbc_report.png` (11 OCR items) run twice sequentially per process
(`cbc_png_cold` = first OCR call after construction, `cbc_png_warm` = second).
Model: PP-OCRv6_medium_det + PP-OCRv6_medium_rec, 1280px detector limit, fp32.
Timings on this 4-logical-thread laptop with the dev backend holding ~1.2 GB RSS;
run-to-run variance of ±1–2 s was observed. Accuracy was asserted identical to
production before any config was declared eligible.

### 2A. CPU thread count (batch left at production default = 6)

| `cpu_threads` | Cold OCR (s) | Warm OCR (s) | Best config-eligible | Accuracy |
|---|---|---|---|---|
| default (10) | 17.30 | **16.13** | yes (control) | 22/22 correct, recall 1.0, precision 1.0 |
| 1 | 20.20 | 19.25 | yes | identical |
| 2 | 14.32 | 18.87 | yes | identical |
| **4** | **14.16** | **15.35** | yes | identical |

Peak RSS 605–618 MB for all thread variants. All accuracy signatures were
bit-identical to production (`field_totals` scored 22/correct 22, mismatch 0).

### 2B. Recognition batch size (threads fixed at 4)

| `text_recognition_batch_size` | Cold OCR (s) | Warm OCR (s) | Accuracy |
|---|---|---|---|
| default (6) | 14.16 | 15.35 | identical |
| 1 | **11.92** | **11.42** | identical |
| 2 | 12.59 | 12.80 | identical |
| 4 | 12.81 | 13.42 | identical |

Peak RSS 577–618 MB. Selection rule: lowest warm OCR time among accuracy-identical
candidates → **threads=4, batch=1**. Cold times show the same ordering.

### Full five-category validation (production vs best)

| Fixture | Prod total (s) | Best total (s) | Speedup | OCR calls | Acc identical | BBox identical |
|---|---|---|---|---|---|---|
| digital_pdf (control) | 0.475 | 0.620 | — (no OCR; noise) | 0 / 0 | yes | yes (5/5 identical) |
| cbc_png | 14.863 | 13.390 | 1.11× | 1 / 1 | yes | yes (5/5) |
| multipage_scanned_pdf | 67.929 | 57.312 | 1.19× | 2 / 2 | yes | yes (5/5) |
| photographed_jpg | 38.251 | 35.328 | 1.08× | 1 / 1 | yes | yes (5/5) |
| photo_scanned_pdf_200dpi | 40.450 | 35.831 | 1.13× | 1 / 1 | yes | yes (5/5) |
| **All five (wall clock)** | **161.968** | **142.481** | **1.14× overall (−12.0%)** | 5 / 5 | yes | yes |

**Best safe CPU configuration (not applied to production):**
`cpu_threads=4`, `text_recognition_batch_size=1`, keep `enable_mkldnn=False`,
`text_det_limit_side_len=1280`, `text_det_limit_type="max"`, PP-OCRv6 medium, fp32.
Accuracy, biomarker recall/precision, units, reference ranges, flags, page attribution
and source geometry are bit-identical to production across all five fixtures.

---

## 3. GPU capability — unavailable (documented, not simulated)

- Installed `paddlepaddle` 3.3.1 is the **CPU-only** build for this platform.
- `paddle.device.is_compiled_with_cuda()` → `False`
- `paddle.device.get_available_device()` → `[]`
- `paddle.device.get_device()` → `cpu`
- `paddle.set_device("gpu")` → **ValueError: "The device should not be 'gpu', since PaddlePaddle is not compiled with CUDA"**
- No `nvidia-smi`, no NVIDIA driver, no CUDA/cuDNN runtime. Only Intel UHD integrated graphics.
- GPU inference smoke test was therefore **not run**; no timing is reported and none is claimed.

**What an evaluator machine needs for GPU inference (not performed here):**

- An NVIDIA GPU with compute capability ≥ 7.5 (Turing or later); Windows 10/11 Pro/Enterprise x64, or Ubuntu 20.04/22.04/24.04.
- A `paddlepaddle-gpu` build matching its CUDA/cuDNN, e.g. CUDA 11.8+ cuDNN 8.6 / CUDA 12.6+ cuDNN 9.0 / CUDA 12.9+ cuDNN 9.9 / CUDA 13.0+ cuDNN 9.13 (official wheels on paddlepaddle.org.cn). Note Paddle declares cuDNN/CUDA bundled in these wheels; the NVIDIA driver must still be present and able to load.
- Python 3.9–3.12, 64-bit, pip ≥ 20.2.2, MKL-capable x64 CPU.
- Verification sequence: `python -c "import paddle; paddle.utils.run_check()"` → then construct `PaddleOCR(device="gpu")` and run one real inference before trusting any timing.
- After such a machine is verified, the experiment must be re-run on the GPU path (one PNG + one scanned PDF page) using the same `accuracy_evaluator.py` and fixtures.

**Do not** claim or document GPU performance based on spec sheets; the smoke test above is the gate.

---

## 4. Digital PDF vs image/scanned timing (why digital is fast)

| Fixture | Extraction method | Library call | OCR calls | Total (s) |
|---|---|---|---|---|
| clean_digital_report.pdf | `digital` | PyMuPDF `get_text` (words + bboxes in displayed space) | 0 | 0.475 |
| cbc_report.png | `ocr` | OpenCV read → Paddle inference | 1 | 14.86 |
| multipage_scanned_report.pdf | `ocr` ×2 pages | PyMuPDF render @200 DPI → inference | 2 | 67.93 |
| photographed_report.jpg | `ocr` | OpenCV read → inference | 1 | 38.25 |
| photo_scanned_report_200dpi.pdf | `ocr` ×1 page | embedded JPEG → page render @200 DPI → inference | 1 | 40.45 |

Digital pages skip the detector entirely: per-page text comes from the PDF text
layer, so the word bboxes come from MuPDF. Image-based pages pay for
detection + recognition on a 200-DPI raster (≈ 2034×2527 px for the photo), which
is the entire OCR cost. This is structural, not a bug.

---

## 5. Photo-scanned PDF (temporary derived fixture)

- Derived at build time by `make_photo_scanned_pdf.py` from the untouched
  `photographed_report.jpg` (SHA-256 85d1156c4c191ac9d48425ecba26862523c2ab0ac7258097583d74baf4f2b135).
  Note: PyMuPDF embeds a creation timestamp, so the derived PDF is not byte-stable
  across rebuilds; `OCR_LAB_SESSION.json` records the session-start hash `7711d5e49c0d4fb93ea453c8da2020964ae56eb7138639925e72bff337ec78ab`, the full session rebuilt it before the run (current file `c2906619cce4907ac09a7afd2f4f299ea2e002454c2890ea9c66b8a3338a6181`, 284 853 B).
  Content checks (1 page, image-only, zero text layer, 200-DPI render == 2034×2527 px)
  were re-verified on every build.
- Stored **only** in isolated temp storage:
  `C:\Users\sureshr\AppData\Local\Temp\opencode\lablens-phase9101\fixtures\photo_scanned_report_200dpi.pdf`
  (size 284 853 B, 1 page, image-only, embedded text length 0, page size
  732.24×909.72 pt so that 200-DPI render == 2034×2527 px — verified).
- Result: **40.45 s** production / **35.83 s** best, 1 OCR call, accuracy
  bit-identical to the direct-JPEG path (30/30 scored correct, recall/precision 1.0),
  5/5 page attribution, 15 OCR items in both cases.
- Source-bbox delta vs the direct-JPEG path: only Creatinine `y1` differs by 2 px
  (1229→1293 region-equivalent height change of the line box); all other boxes
  identical. This is expected: the JPEG is round-tripped through PDF embedding.

---

## 6. Accuracy / geometry comparison (unchanged evaluator, unmodified GT)

Evaluator: `artifacts/phase-8.1/accuracy_evaluator.py`; ground truth files untouched.

Field totals, production vs best config (identical in both):

| Field | Scored | Correct | Incorrect | Not scored |
|---|---|---|---|---|
| name | 25 | 25 | 0 | 0 |
| numeric_value | 25 | 25 | 0 | 0 |
| unit | 22 | 22 | 0 | 3 |
| reference_low | 25 | 25 | 0 | 0 |
| reference_high | 25 | 25 | 0 | 0 |
| flag | 20 | 20 | 0 | 5 |
| qualifier | 0 | 0 | 0 | 25 (no fixture uses qualifiers) |

- Mismatched measurements: **0** everywhere; biomarker recall **1.0**, precision **1.0**.
- Numeric values match exactly (evaluator tolerance 1e-9), units canonicalise identically,
  reference bounds identical, abnormal flags identical.
- Page attribution: multipage scanned **5/5**, photographed **5/5**, photo-scan **5/5**
  in both configs (digital/png are single-page, 0 scored).
- Source bounding boxes: all reported boxes valid, finite, inside page bounds, and
  overlapping the OCR line they came from; production vs best config boxes are
  **bit-identical for every measurement** in every fixture (max_abs_delta = 0.0).
- The digital control never invoked OCR (`ocr_call_count = 0`, method `digital`).

**Accuracy gate conclusion:** the candidate CPU config is equal, not merely compatible,
on this fixture suite. It must still be re-validated on the GPU path and on the full
product audit before becoming a default.

---

## 7. Peak RAM

| Run | Peak child RSS | Min system available during run |
|---|---|---|
| Thread sweep (any config) | 605–618 MB | 552–883 MB |
| Batch sweep (any config) | 577–618 MB | 456–883 MB |
| Full run — production | 712.6 MB | 897 MB |
| Full run — best (threads=4/batch=1) | 703.7 MB | 585 MB |

The memory guard (abort if free RAM < 250 MB) never triggered. Available-RAM figures are
noisy because the dev server holds ~1.2 GB; do not interpret the two full runs' low-free
values as the configs differing by 300 MB — they differ by < 10 MB.

---

## 8. Recommended CPU inference configuration for production (proposal, NOT applied)

For this class of low-core x64 evaluator machines (2 cores/4 threads, ~8 GB):

- `cpu_threads = logical_core_count` when ≤ 4 (here: 4), never above physical+HT;
  production's `10` is oversubscription.
- `text_recognition_batch_size = 1` when line counts are small (< ~20/page) or CPU is
  weak; `2` is the fallback if a machine shows batch=1 no faster.
- Keep `enable_mkldnn = False` (Windows MKL-DNN CreatePirAttribute2RuntimeAttribute crash
  documented in `ocr_engine.py`); keep 1280px / `max`; keep PP-OCRv6 medium.
- Expected saving on this machine: ≈ 12% wall-clock across mixed documents, ~1.1–1.2×
  per image document. On higher-core CPUs the gain will shrink or vanish; re-measure.

---

## 9. Smaller / faster model assessment

**No smaller PP-OCRv6 det/rec model is cached locally**; nothing was downloaded.
A smaller model must never be recommended on speed grounds alone. Since medical
correctness is the deciding factor and any candidate here would require (a) a model
download, (b) re-validation on the full accuracy suite and (c) geometry checks,
it is out of scope for this phase and **not recommended as a default**. If a future
phase caches `PP-OCRv6_small_det/rec`, it could be evaluated with this exact harness.

Note: the cached `PP-LCNet_x1_0_*_ori` and `UVDoc` models are **not used** by the
production pipeline (all three disabled) and have zero inference impact.

---

## 10. Recommended production architecture (CPU/GPU selection) — not implemented

Proposed design for a later phase; none of this is in production yet.

1. **Device resolution at startup, not per call.** One `OCRDeviceResolver` yields `cpu`
   or `gpu` from an explicit `LABLENS_OCR_DEVICE` env (`auto` | `cpu` | `gpu`), default
   `auto`. The result is cached for the process and logged once.
2. **`auto` probe order (fail-fast, no network):** `paddle.device.is_compiled_with_cuda()`
   → `paddle.device.get_available_device()` non-empty → `paddle.set_device("gpu")`
   succeeds → one synthetic inference on a tiny in-memory numpy image (~1 s) must
   return without exception → select GPU. Any failure ⇒ CPU with the reason logged.
3. **Fallback:** GPU probe failure or any inference exception on the GPU path ⇒
   recreate the pipeline on CPU and mark the job `extraction_metadata.device="cpu"`,
   `device_fallback=<reason>`. The app must never ship an unverified GPU path.
4. **Per-device tunables** (via config, not code edits):
   - CPU: `cpu_threads=min(logical_cores, 4)` (or `logical_cores//2` on >4 cores, to be
     benchmarked), `text_recognition_batch_size=1`, `enable_mkldnn=False`.
   - GPU: `device="gpu"`, default batch (6), default threads (Paddle manages), fp32 first;
     fp16 only after accuracy equivalence is demonstrated.
5. **Observability:** record `device`, `cpu_threads`, `batch_size`, model names,
   and per-page OCR ms in `extraction_metadata`; expose them in the processing report
   so evaluator machines reveal their actual path.
6. **CI:** CPU path is the blocking test; GPU path is an opt-in job gated on
   `is_compiled_with_cuda()` so forks without GPUs stay green.
7. **Evaluator packaging:** ship the CPU wheel by default; GPU wheel only for machines
   passing the probe; document the exact wheel for CUDA 12.6/12.9 as in §3.

---

## 11. Exact files created (Phase 9.10.1)

Diagnostic scripts and results only under `artifacts/phase-8.1/`:

- `artifacts/phase-8.1/ocr_lab_worker.py` — isolated worker (sets `LABLENS_DATA_DIR`
  before importing backend; asserts resolved paths stay inside it; aborts on the real
  data dir; records DB SHA-256 + upload count before/after; peak-RSS/min-free sampling;
  memory guard at 250 MB free; monkey-patches `paddleocr` device without touching
  `ocr_engine.py`).
- `artifacts/phase-8.1/ocr_lab_benchmark.py` — orchestrator (hardware/GPU/cache/GPU-probe
  capture, thread sweep, batch sweep, full five-category comparison, JSON + logs).
- `artifacts/phase-8.1/make_photo_scanned_pdf.py` — derived 200-DPI photo-scan PDF builder.
- `artifacts/phase-8.1/OCR_LAB_SESSION.json` — hardware/GPU/cache/derived-fixture snapshot
  (session 20261113T184357).
- `artifacts/phase-8.1/OCR_LAB_TUNING_RESULTS.json` — thread/batch tables + selected config.
- `artifacts/phase-8.1/OCR_LAB_FULL_RESULTS.json` — five-category prod-vs-best comparison.
- `artifacts/phase-8.1/OCR_LAB_RESULTS.json` — combined session/tuning/full snapshot.
- `artifacts/phase-8.1/ocr_lab_runs/20261113T183601/` — tuning session: 8 runs ×
  (`*.spec.json`, `*.result.json`, `*.log`).
- `artifacts/phase-8.1/ocr_lab_runs/20261113T184357/` — full session: 2 runs × 3 files.
- `artifacts/phase-8.1/OCR_LAB_REPORT.md` — this report.

Temporary (isolated temp storage; **not** in artifacts or fixtures):

- `C:\Users\sureshr\AppData\Local\Temp\opencode\lablens-phase9101\fixtures\
  photo_scanned_report_200dpi.pdf` and `.json` (metadata above).
- `...\lablens-phase9101\workers\<run_id>\data\` — one throwaway SQLite DB, uploads and
  tmp per worker run (35 files, ~2.9 MB total).

**Untouched:** production code/config, fixtures, ground truth, `accuracy_evaluator.py`
tolerances, canonical results (`ACCURACY_RESULTS.json`, `PERFORMANCE_RESULTS.json`,
`OCR_RESIZE_1280_RESULTS.json`, `SMALL_TEXT_*`), installed packages, model cache,
and the full backend test suite (not run). Only `artifacts/phase-8.1/__pycache__` and the
empty failed session `ocr_lab_runs/20261113T183534` were removed.

---

## 12. Real database integrity (mandatory checks)

| Metric | Before (all sessions) | After (all sessions) | Match |
|---|---|---|---|
| `backend/data/lablens.db` SHA-256 | `830674a49e9658c452ac7417baaaae09a81c3d592fa9c26f1c6970f29399322a` | same | ✅ |
| DB size | 176 128 B | 176 128 B | ✅ |
| Upload file count | 20 (320 157 B) | 20 (320 157 B) | ✅ |
| Report rows (read-only) | 3 | 3 | ✅ |
| Measurement rows / page extractions | 26 / 3 | unchanged | ✅ |

Each isolated worker re-asserted this before/after its own run
(`real_data_unchanged: true` in every worker result and in the session files).

**Test isolation:** standalone scripts set a fresh `LABLENS_DATA_DIR` under the approved
temp root *before* backend import and verified `data_dir`/`db_path`/`uploads_dir` resolve
inside it; the real `backend/data` directory was only ever read (hash checks), never
written or migrated. The Phase 9.8.0 pytest guard was not needed (no integration tests
were executed); no backend suite was run.

---

### Bottom line

CPU-only OCR on this machine costs ≈ 14–17 s (PNG), ≈ 33–34 s/page (scanned PDF),
≈ 36–38 s (photo/photo-PDF); digital PDFs cost ≈ 0.5 s (no OCR). A safe,
accuracy-identical CPU change — `cpu_threads=4`, `text_recognition_batch_size=1` —
cuts image-document wall time ≈ 12% (up to 1.19× on the scanned PDF). GPU acceleration
is **not available** on this machine (CPU-only Paddle build) and must remain behind a
verified probe + smoke test on evaluator hardware. Production settings were not changed.
