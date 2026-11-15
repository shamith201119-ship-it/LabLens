# LabLens Phase 9.10.2 â€” Portable Hardware Profiler and Adaptive OCR Benchmark
**Date:** 2026-11-13  
**Status:** inventory-only on this laptop (as instructed); benchmark mode not launched â€” profiling evidence reused from Phase 9.10.1. No production changes.

---

## 0. Executive summary

A portable profiler was built at `docs/development/phase-8.1/ocr_hardware_profile.py` (v1.0.0)
with a versioned, machine-independent JSON schema (`ocr_hardware_profile.schema.v1.json`).
It distinguishes measured results, hardware-detection results, reused prior measurements,
recommendations and untested configurations, and it sanitizes all personal/repository
paths out of exported reports (verified: zero occurrences of the username or repo path).

On this laptop, `--mode inventory` (the default) ran: no OCR was executed, no models were
loaded by the profiler (the Paddle probe runs as a short subprocess), and the Phase 9.10.1
OCR evidence is reused instead of re-rendering the matrix. Production OCR code and
configuration are unchanged. The real database is untouched (SHA-256 and upload count
identical before/after).

---

## 1. Hardware inventory (this machine)

| Property | Value |
|---|---|
| CPU | Intel(R) Core(TM) i3-1005G1 @ 1.20 GHz |
| Architecture | X86_64, 64-bit |
| Cores | 2 physical / 4 logical |
| Max clock | 1190 MHz |
| CPU flags (py-cpuinfo) | 86 flags incl. avx, avx2, avx512*, fma, aes, sha, ht â€” full list in `OCR_HARDWARE_PROFILE_LOCAL.json` |
| RAM total | 8 375 230 464 B (7.8 GiB) |
| RAM available at profile time | 1.85 Ã— 10â¹ B (psutil "available"; volatile, see Â§4) |
| NVIDIA GPU | none (`nvidia-smi` absent; WMI shows no NVIDIA device) |
| Other accelerator | Intel(R) UHD Graphics (integrated, driver 27.20.100.9664) |
| OS | Windows (system + architecture reported; no hostname/username included) |
| Python | 3.12.10 |
| PaddlePaddle | 3.3.1 â€” **CPU-only build**, `cuda()/cudnn() = False`, no available devices |
| PaddleOCR / PaddleX | 3.7.0 / 3.7.2 |
| Models (production, unchanged) | PP-OCRv6_medium_det + PP-OCRv6_medium_rec; 1280px max detector; fp32; MKL-DNN off; `cpu_threads=10`; recognition `batch_size=6`; cache 185 149 194 B |

Detection limit, models, precision, MKL-DNN=off are *fixed constraints* of every
experiment so results from different machines are comparable.

---

## 2. GPU hardware vs runtime compatibility

| Check | Result |
|---|---|
| NVIDIA device present (nvidia-smi / WMI) | **No** |
| `paddlepaddle` compiled with CUDA | **No** |
| Paddle available devices | `[]` |
| `paddle.set_device("gpu")` | `ValueError: The device should not be 'gpu', since PaddlePaddle is not compiled with CUDA` |
| Intel UHD Graphics | present (integrated; **no compute runtime usable by Paddle** â€” NPU/iGPU inference is out of scope, reported as `integrated_gpu`, not "supported") |

**Result: GPU performance is untested on this machine.** The profiler marks
`gpu.performance_status = "untested"`, `smoke_test.status = "skipped_incompatible"` and
records the exact `ValueError` message. GPU testing would only run on a machine with a
CUDA-enabled Paddle build and an available device, via
`... --mode benchmark --include-gpu`, and only after the tranche of CPU comparisons has
run (one PNG workload; accuracy must match the baseline or the GPU path is rejected and
CPU remains the default).

What an NVIDIA evaluator machine needs (documented in Phase 9.10.1, restated):
NVIDIA GPU with compute capability â‰¥ 7.5, `paddlepaddle-gpu` wheel matching its CUDA
(11.8/12.6/12.9/13.0 with cuDNN 8.6/9.x), Python 3.9â€“3.12 64-bit, working NVIDIA driver,
then `paddle.utils.run_check()` and one real `PaddleOCR(device="gpu")` inference as the
acceptance gate.

---

## 3. Adaptive CPU candidate generation

The profiler derives candidates from the **actual** core counts â€” the laptop's settings
are never universal:

```
candidates = {1}
candidates âˆª= {2}  if logical_cores >= 2
candidates âˆª= {4}  if logical_cores >= 4
candidates âˆª= {min(max(physical_cores * 2, 2), logical_cores)}
candidates âˆª= {min(8,  logical_cores)}  if logical_cores >= 8
candidates âˆª= {min(12, logical_cores)}  if logical_cores >= 12
candidates âˆª= {logical_cores}
```
Deduplicate and cap at available logical cores.

Batch candidates are the set supported by the installed PaddleOCR/PaddleX API
(verified by inspecting the installed sources, not assumed): **{1, 2, 4, 6}** here
(`text_recognition_batch_size` present in `paddleocr._pipelines.ocr` and a
`batch_size:` under `TextRecognition` in `paddlex/configs/pipelines/OCR.yaml`).

**This machine â†’ threads {1, 2, 4}, batches {1, 2, 4, 6}.** Experiments are
one-variable-at-a-time against the production-equivalent baseline (threads=default 10 /
batch=default 6): Phase A sweeps threads at the default batch; Phase B sweeps the
remaining batches at the best *accuracy-identical* thread count (fastest warm OCR wins;
tie â†’ more threads). Never all combinations. The 1280px / Medium / fp32 / MKL-DNN-off
constraints are held constant.

| Machine class | Example | Adaptive threads |
|---|---|---|
| Thin/low-end laptop (this one) | 2P/4L | {1, 2, 4} |
| Mid-range desktop | 4P/8L | {1, 2, 4, 8} |
| Modern workstation | 8P/16L | {1, 2, 4, 8, 12, 16} |
| Server | 16P/32L+ | {1, 2, 4, 8, 12, 16, 32} |

---

## 4. Available-memory safeguards

This laptop reached â‰ˆ 456 MB free during Phase 9.10.1 batch runs, so the safeguards are strict:

| Guard | Threshold | Behaviour |
|---|---|---|
| Benchmark preflight | â‰¥ 1.5 GiB available (1 610 612 736 B) | Benchmark refuses to start; **nothing is loaded and every matrix entry is recorded as `skipped` with reason `precondition_failed`** |
| Between-experiments recheck | `psutil.virtual_memory().available â‰¥ 750 MiB` (786 432 000 B) | Below the floor â‡’ stop safely; current and remaining experiments recorded as skipped (`memory_guard_triggered`), `memory_guard_triggered=true` |
| Worker ordering | strictly sequential | A benchmark never starts a second worker while one runs (`sequential_execution` is `true` in the schema) |
| Worker-internal guard | 750 MiB | Each worker also self-aborts before a fixture if free RAM drops below the stop reserve |
| Mode default | inventory-only | No OCR, no models, no backend imports unless `--mode benchmark` is explicitly passed |
| Peak monitoring | per-worker RSS sampled at 50 ms | Recorded per experiment (`peak_rss_bytes`) |

On this laptop the preflight reading fluctuated between ~0.75 GiB (WMI free) and
1.7â€“1.85 GiB (psutil "available") within a single session because the live dev backend
holds ~1.2 GB. The script uses `psutil.virtual_memory().available` (the same "Available"
semantic as the OS and Task Manager), which is the meaningful metric for whether work can
proceed; the 750 MiB floor catches mid-run pressure. **This phase ran inventory-only as
instructed; Phase 9.10.1 already provides this machine's OCR measurements, so rerunning
the matrix would only duplicate known results.**

To rerun on this laptop later: close the dev server (or free â‰¥ 1.5 GiB), then
`py -3.12 docs/development/phase-8.1/ocr_hardware_profile.py --mode benchmark`.

---

## 5. Portable benchmark invocation (other computers)

Prerequisite: Python 3.12 + the repository (fixtures and `accuracy_evaluator.py` included),
no package installs and no model downloads required.

```powershell
# 1) inventory only (seconds, safe everywhere)
py -3.12 docs/development/phase-8.1/ocr_hardware_profile.py
#    writes OCR_HARDWARE_PROFILE_LOCAL.json (override with --out)

# 2) optional: check Paddle GPU readiness + run one PNG smoke workload
py -3.12 docs/development/phase-8.1/ocr_hardware_profile.py --mode benchmark --include-gpu

# 3) adaptive CPU matrix (needs >= 1.5 GiB free; PNG workload: ~7 runs)
py -3.12 docs/development/phase-8.1/ocr_hardware_profile.py --mode benchmark

# 4) full five-category validation of the selected config (~6 min)
py -3.12 docs/development/phase-8.1/ocr_hardware_profile.py --mode benchmark --benchmark-categories full
```
Exit codes: `0` success Â· `1` internal error Â· benchmark refuses cleanly if RAM preflight fails (no OCR launched, matrix recorded as skipped, `safety.precondition_met=false`).

The `--temp-root` option relocates temp data (derived 200-DPI photo-scan PDF, isolated
`LABLENS_DATA_DIR` per worker) to any approved directory. Isolation rules are enforced in
every worker: fresh `LABLENS_DATA_DIR` set before backend import, all resolved DB/uploads
paths asserted inside it, real `backend/data` read only for hashing. The real DB
SHA-256 + upload count are recorded before and after every profiler run and must match
(`db_integrity.unchanged`).

---

## 6. Standardized JSON format (schema v1)

File: `docs/development/phase-8.1/ocr_hardware_profile.schema.v1.json` â€” JSON Schema draft
2020-12, `$id` `https://lablens.local/schemas/ocr_hardware_profile.v1.json`,
`schema_version: "1.0.0"`. Required top-level keys:

`schema_version Â· phase Â· tool Â· generated_at Â· hardware Â· memory Â· runtime Â· model Â· gpu Â·
adaptive_candidates Â· prior_evidence Â· experiments Â· safety Â· db_integrity Â·
recommendations Â· untested`

Conventions:

- Units in field names: `*_bytes`, `*_seconds`, `*_mhz`; percentages never implied.
- `evidence_class` on recommendations is always `"recommendation"`; **measured vs
  detected vs reused vs untested** are distinguishable only by the section they live in:
  `experiments[]` (measured here), `hardware/runtime/model` (detection),  `prior_evidence`
  (reused Phase 9.10.1), `untested[]` (everything explicitly not measured),
  `recommendations[]` (advisory only, never automatic).
- No hostnames, usernames, MAC addresses, serial numbers or personal paths â€” paths are
  rewritten to `~` / `<repo>` before validation (enforced by scanning output; verified).
- `db_integrity` is byte-for-byte comparable across machines; `unchanged` must be true.
- Validation is mandatory: the profiler validates with `jsonschema` (draft 2020-12) and
  refuses to write an invalid profile (`tool` exits non-zero).
- Field names identical across machines â‡’ results merge by machine role, not by machine.

Example skeleton (abbreviated):

```json
{
  "schema_version": "1.0.0",
  "hardware": { "cpu": { "logical_cores": 4, ... }, "nvidia": { "present": false, ... } },
  "runtime": { "packages": { "paddlepaddle": { "compiled_with_cuda": false, ... } } },
  "model":    { "detection_limit_side_len": 1280, "cpu_threads_default": 10, ... },
  "gpu":      { "performance_status": "untested", "smoke_test": { "status": "skipped_incompatible", ... } },
  "adaptive_candidates": { "cpu_threads": [1, 2, 4], "recognition_batch_size": [1, 2, 4, 6], ... },
  "prior_evidence": { "available": true, "measured_on": "this machine, 2026-11-13 (Phase 9.10.1)", ... },
  "experiments": [ { "id": "phase-a-threads-4", "status": "skipped", "skip_reason": "precondition_failed: ..." } ],
  "safety":   { "preflight_available_bytes": 1849487360, "precondition_met": true, ... },
  "db_integrity": { "db_sha256_before": "830674â€¦", "unchanged": true }
}
```

Schema validation output for this machine: **valid** (written only after passing;
`OCR_HARDWARE_PROFILE_LOCAL.json`).

---

## 7. Existing versus new experimental evidence

| Evidence | Phase | Machine/result | Status in profile |
|---|---|---|---|
| CPU thread sweep (default/1/2/4) + batch sweep (1/2/4) | 9.10.1 | this laptop; best = threads 4 / batch 1; âˆ’12.0% wall; bit-identical accuracy | **reused** as `prior_evidence` â€” not re-measured |
| Five-category full comparison (digital, PNG, scanned Ã—2 pages, photo, photo-scan) | 9.10.1 | this laptop; all fixtures accuracy-identical, bboxes identical | **reused** |
| GPU capability probe | 9.10.1 / 9.10.2 | CPU-only Paddle; no NVIDIA; `set_device("gpu")` ValueError | **re-detected** in inventory (fresh subprocess probe) |
| Derived 200-DPI photo-scan fixture | 9.10.1 / 9.10.2 | temp storage only; not re-created in inventory mode | reused measurements; builder available for `--benchmark` |
| Profiler inventory (CPU flags, memory, packages, model config, cache, DB hash) | **9.10.2 (new)** | `OCR_HARDWARE_PROFILE_LOCAL.json` | new, validated against schema v1 |
| Adaptive candidate generation | **9.10.2 (new)** | lap: threads {1,2,4}, batches {1,2,4,6} | new |
| Hardware/GPU runtime compatibility split | **9.10.2 (new)** | Â§2 above | new |

No new OCR measurement was produced in Phase 9.10.2 (by design); every timing in this
phase comes from Phase 9.10.1 and is labeled reused.

---

## 8. Exact files created (Phase 9.10.2)

- `docs/development/phase-8.1/ocr_hardware_profile.py` â€” profiler (inventory default; explicit benchmark mode).
- `docs/development/phase-8.1/ocr_hardware_profile.schema.v1.json` â€” versioned machine-independent JSON Schema v1.
- `docs/development/phase-8.1/OCR_HARDWARE_PROFILE_LOCAL.json` â€” sanitized local inventory profile (schema-validated).
- `docs/development/phase-8.1/OCR_ADAPTIVE_PROFILE_REPORT.md` â€” this report.
- (modified) `docs/development/phase-8.1/ocr_lab_worker.py` â€” additive `device` spec parameter only; Phase 9.10.1 behavior with no `device` key is unchanged.

**Untouched:** production OCR code/config, fixtures, ground truth, `accuracy_evaluator.py`,
canonical benchmark JSON files, installed packages, model cache, the live dev database.
Temporary derived fixtures remain in `%TEMP%\opencode\lablens-phase9102\`.

## 9. Confirmation: production configuration unchanged

`backend/app/services/ocr_engine.py`, `backend/app/services/extraction_service.py` and all
other production files were **not** modified for this phase. The profiler never imports
them in inventory mode. Experiments (benchmark mode) inject an experimental instance into
`ocr_engine._ocr_instance` in-process only; the production singleton and constructor are
never mutated.

## 10. Real database comparison

| Metric | Before | After | Match |
|---|---|---|---|
| `backend/data/lablens.db` SHA-256 | `830674a49e9658c452ac7417baaaae09a81c3d592fa9c26f1c6970f29399322a` | same (both profiler snapshots + independent re-check) | âœ… |
| Upload file count | 20 (320 157 B) | 20 (320 157 B) | âœ… |
| Report rows (read-only) | 3 | 3 | âœ… |

---

## 11. Bottom line

The profiler is ready to run on any evaluator machine: inventory is free and safe
everywhere; the adaptive matrix costs a few minutes and â‰¥ 1.5 GiB free RAM; GPU smoke is
an explicit opt-in and never substitutes for CPU accuracy evidence. On this laptop, the
Phase 9.10.1 evidence remains the operative result â€” CPU threads 4 / recognition batch 1,
accuracy identical to production â€” and production settings stay exactly as they are.
