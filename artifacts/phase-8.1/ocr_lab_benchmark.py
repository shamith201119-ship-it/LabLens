"""Phase 9.10.1 OCR performance laboratory orchestrator (diagnostic only).

Runs controlled, one-variable-at-a-time CPU experiments through isolated worker
processes. Production code and configuration are not modified.

Stages:
  tune  - PNG workload: production threads (default) vs 1/2/4, then recognition
          batch 1/2/4 at the best thread count. Production batch (default 6)
          is the batch-sweep control.
  full  - Five document categories for the production baseline and the best
          safe CPU configuration.
  all   - tune then full.

Usage:
    py -3.12 artifacts/phase-8.1/ocr_lab_benchmark.py --plan all
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
ARTIFACT_DIR = ROOT_DIR / "artifacts" / "phase-8.1"
WORKER_SCRIPT = ARTIFACT_DIR / "ocr_lab_worker.py"
FIXTURES_81 = BACKEND_DIR / "tests" / "fixtures" / "phase8_1_accuracy"
FIXTURES_95 = BACKEND_DIR / "tests" / "fixtures" / "phase9_5"
REAL_DATA_DIR = (BACKEND_DIR / "data").resolve()
REAL_UPLOAD_DIR = REAL_DATA_DIR / "uploads"
DEFAULT_TEMP_ROOT = Path(
    os.environ.get(
        "LABLENS_LAB_TEMP_ROOT",
        str(Path(os.environ.get("TEMP", tempfile.gettempdir())) / "opencode" / "lablens-phase9101"),
    )
).resolve()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def real_state_snapshot() -> dict[str, Any]:
    state: dict[str, Any] = {
        "data_dir": str(REAL_DATA_DIR),
        "db_path": str(REAL_DATA_DIR / "lablens.db"),
        "db_exists": (REAL_DATA_DIR / "lablens.db").is_file(),
        "upload_dir": str(REAL_UPLOAD_DIR),
        "upload_file_count": 0,
        "upload_total_bytes": 0,
    }
    db = REAL_DATA_DIR / "lablens.db"
    if db.is_file():
        state["db_sha256"] = sha256_file(db)
        state["db_size_bytes"] = db.stat().st_size
    files = sorted(p for p in REAL_UPLOAD_DIR.iterdir() if p.is_file()) if REAL_UPLOAD_DIR.is_dir() else []
    state["upload_file_count"] = len(files)
    state["upload_total_bytes"] = sum(p.stat().st_size for p in files)
    return state


def run_command(command: list[str], timeout: int = 120) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        return {"returncode": completed.returncode, "stdout": completed.stdout.strip(), "stderr": completed.stderr.strip()}
    except Exception as exc:  # pragma: no cover - defensive
        return {"returncode": None, "error": f"{type(exc).__name__}: {exc}"}


def hardware_inventory() -> dict[str, Any]:
    import psutil

    memory = psutil.virtual_memory()
    inventory: dict[str, Any] = {
        "platform": platform.platform(),
        "machine": platform.machine(),
        "python": sys.version,
        "cpu_physical_cores": psutil.cpu_count(logical=False),
        "cpu_logical_cores": psutil.cpu_count(logical=True),
        "ram_total_bytes": memory.total,
        "ram_available_bytes": memory.available,
        "ram_total_gb": round(memory.total / 1024**3, 2),
        "cpu_frequency": psutil.cpu_freq()._asdict() if psutil.cpu_freq() else None,
    }
    cpu = run_command(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed,L3CacheSize | ConvertTo-Json -Compress",
        ]
    )
    inventory["wmi_cpu_raw"] = cpu
    gpu = run_command(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM,VideoProcessor | ConvertTo-Json -Compress",
        ]
    )
    inventory["wmi_gpu_raw"] = gpu
    nvidia = run_command(["nvidia-smi"])
    inventory["nvidia_smi"] = nvidia if nvidia.get("returncode") == 0 else {"available": False, **nvidia}
    return inventory


def package_versions() -> dict[str, Any]:
    import importlib.metadata as metadata

    versions = {}
    for package in (
        "paddlepaddle",
        "paddleocr",
        "paddlex",
        "pymupdf",
        "opencv-python",
        "opencv-contrib-python",
        "numpy",
        "psutil",
        "pillow",
    ):
        try:
            versions[package] = metadata.version(package)
        except Exception as exc:
            versions[package] = f"NOT_INSTALLED ({exc})"
    return versions


def gpu_probe() -> dict[str, Any]:
    """Run Paddle GPU capability checks in a short-lived subprocess."""
    script = r"""
import json
import paddle
out = {"paddle_version": paddle.__version__}
out["is_compiled_with_cuda"] = bool(paddle.device.is_compiled_with_cuda())
out["default_device"] = paddle.device.get_device()
try:
    out["available_devices"] = list(paddle.device.get_available_device())
except Exception as exc:
    out["available_devices_error"] = f"{type(exc).__name__}: {exc}"
out["cuda_version"] = str(paddle.version.cuda())
out["cudnn_version"] = str(paddle.version.cudnn())
try:
    paddle.set_device("gpu")
    out["set_device_gpu"] = "OK"
    out["device_after_set"] = paddle.device.get_device()
except Exception as exc:
    out["set_device_gpu"] = "FAILED"
    out["error_type"] = type(exc).__name__
    out["error_message"] = str(exc)
finally:
    paddle.set_device("cpu")
    out["device_restored"] = paddle.device.get_device()
print(json.dumps(out))
"""
    completed = run_command([sys.executable, "-c", script], timeout=180)
    parsed: dict[str, Any] = {}
    for line in (completed.get("stdout") or "").splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                continue
    parsed["command"] = completed
    parsed["gpu_inference_available"] = bool(parsed.get("is_compiled_with_cuda") and parsed.get("set_device_gpu") == "OK")
    return parsed


def model_cache_inventory() -> dict[str, Any]:
    cache = Path.home() / ".paddlex" / "official_models"
    models = []
    if cache.is_dir():
        for directory in sorted(cache.iterdir()):
            if not directory.is_dir():
                continue
            size = sum(p.stat().st_size for p in directory.rglob("*") if p.is_file())
            models.append({"name": directory.name, "size_bytes": size})
    names = [model["name"] for model in models]
    smaller = [
        name
        for name in names
        if re.search(r"(?:PP-OCRv[56]_(?:small|tiny|mobile)|mobile|small|tiny)", name, re.IGNORECASE)
        and "medium" not in name
    ]
    return {
        "cache_dir": str(cache),
        "models": models,
        "total_bytes": sum(model["size_bytes"] for model in models),
        "small_or_tiny_cached": smaller,
        "recommendation": (
            "No PP-OCRv6 small/tiny text detection or recognition model is cached locally; "
            "a smaller-model experiment would require a model download and is out of scope."
            if not smaller
            else "Cached small/tiny candidate(s) found; accuracy evaluation still required before any performance claim."
        ),
    }


def build_fixture_entries(include_derived: bool) -> dict[str, dict[str, Any]]:
    entries = {
        "digital_pdf": {
            "key": "digital_pdf",
            "category": "digital_pdf",
            "path": str(FIXTURES_81 / "clean_digital_report.pdf"),
            "filename": "clean_digital_report.pdf",
            "ground_truth": str(FIXTURES_81 / "clean_digital_report.json"),
            "notes": "Control: direct PDF text extraction; OCR must not run.",
        },
        "cbc_png": {
            "key": "cbc_png",
            "category": "image_png",
            "path": str(FIXTURES_81 / "cbc_report.png"),
            "filename": "cbc_report.png",
            "ground_truth": str(FIXTURES_81 / "cbc_report.json"),
            "notes": "Single-page image; representative OCR workload.",
        },
        "multipage_scanned_pdf": {
            "key": "multipage_scanned_pdf",
            "category": "image_only_pdf",
            "path": str(FIXTURES_95 / "multipage_scanned_report.pdf"),
            "filename": "multipage_scanned_report.pdf",
            "ground_truth": str(FIXTURES_95 / "multipage_scanned_report.json"),
            "notes": "Two image-only pages rendered at 200 DPI by the production pipeline.",
        },
        "photographed_jpg": {
            "key": "photographed_jpg",
            "category": "photograph",
            "path": str(FIXTURES_95 / "photographed_report.jpg"),
            "filename": "photographed_report.jpg",
            "ground_truth": str(FIXTURES_95 / "photographed_report.json"),
            "notes": "Camera-style photograph; single OCR call on the original JPEG.",
        },
    }
    if include_derived:
        from make_photo_scanned_pdf import build as build_photo_pdf

        derived = build_photo_pdf(DEFAULT_TEMP_ROOT)
        entries["photo_scanned_pdf_200dpi"] = {
            "key": "photo_scanned_pdf_200dpi",
            "category": "photo_scanned_pdf",
            "path": derived["derived_pdf"],
            "filename": "photo_scanned_report_200dpi.pdf",
            "ground_truth": str(FIXTURES_95 / "photographed_report.json"),
            "notes": "Temporary image-only PDF embedding the photograph; page size preserves 200-DPI pixel dimensions.",
            "derived_metadata": derived,
        }
    return entries


def tuning_fixtures() -> list[dict[str, Any]]:
    gt = str(FIXTURES_81 / "cbc_report.json")
    return [
        {
            "key": "cbc_png_cold",
            "category": "image_png",
            "path": str(FIXTURES_81 / "cbc_report.png"),
            "filename": "cbc_report.png",
            "ground_truth": gt,
        },
        {
            "key": "cbc_png_warm",
            "category": "image_png",
            "path": str(FIXTURES_81 / "cbc_report.png"),
            "filename": "cbc_report.png",
            "ground_truth": gt,
        },
    ]


def full_fixtures() -> list[dict[str, Any]]:
    return list(build_fixture_entries(include_derived=True).values())


def run_worker(
    session_dir: Path,
    label: str,
    cpu_threads: Optional[int],
    batch_size: Optional[int],
    fixtures: list[dict[str, Any]],
    min_available_bytes: int = 250 * 1024 * 1024,
) -> dict[str, Any]:
    run_id = f"{session_dir.name}__{label}"
    spec_path = session_dir / f"{label}.spec.json"
    out_path = session_dir / f"{label}.result.json"
    log_path = session_dir / f"{label}.log"
    spec = {
        "run_id": run_id,
        "label": label,
        "temp_root": str(DEFAULT_TEMP_ROOT),
        "cpu_threads": cpu_threads,
        "text_recognition_batch_size": batch_size,
        "fixtures": fixtures,
        "min_available_bytes": min_available_bytes,
        "created_at": utc_now(),
    }
    spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")

    print(f"[worker] {label}: threads={cpu_threads or 'default'} batch={batch_size or 'default'} ...", flush=True)
    started = time.perf_counter()
    with open(log_path, "w", encoding="utf-8") as log:
        completed = subprocess.run(
            [sys.executable, str(WORKER_SCRIPT), "--spec", str(spec_path), "--out", str(out_path)],
            stdout=log,
            stderr=subprocess.STDOUT,
            timeout=1800,
        )
    elapsed = time.perf_counter() - started

    if not out_path.is_file():
        raise RuntimeError(f"Worker {label} produced no result (exit {completed.returncode}); see {log_path}")
    result = json.loads(out_path.read_text(encoding="utf-8"))
    result["worker_exit_code"] = completed.returncode
    result["orchestrator_elapsed_seconds"] = round(elapsed, 2)
    result["log_path"] = str(log_path)
    print(
        f"[worker] {label}: ok={result.get('ok')} init={result.get('model', {}).get('init_seconds')}s "
        f"peak_rss={result.get('memory', {}).get('peak_process_rss_mb')}MB "
        f"elapsed={elapsed:.1f}s",
        flush=True,
    )
    if not result.get("ok"):
        print(f"[worker] {label} failed: {result.get('error') or result.get('abort_reason')}", flush=True)
    return result


def accuracy_signature(result: dict[str, Any]) -> Optional[dict[str, Any]]:
    fixture = next((item for item in result.get("fixtures", []) if item["key"].endswith("warm")), None)
    if fixture is None:
        fixture = (result.get("fixtures") or [None])[0]
    if not fixture:
        return None
    accuracy = fixture["accuracy"]
    return {
        "field_totals": accuracy["field_totals"],
        "biomarker_recall": accuracy["biomarker_recall"],
        "biomarker_precision": accuracy["biomarker_precision"],
        "extracted_count": accuracy["extracted_count"],
        "ground_truth_count": accuracy["ground_truth_count"],
        "mismatch_count": len(accuracy["mismatches"]),
    }


def warm_metric(result: dict[str, Any]) -> Optional[float]:
    fixture = next((item for item in result.get("fixtures", []) if item["key"].endswith("warm")), None)
    if fixture is None:
        fixture = (result.get("fixtures") or [None])[0]
    if not fixture:
        return None
    return float(fixture["ocr_seconds_total"] or fixture["extraction_seconds"])


def summarize_run(result: dict[str, Any]) -> dict[str, Any]:
    fixtures = []
    for fixture in result.get("fixtures", []):
        fixtures.append(
            {
                "key": fixture["key"],
                "category": fixture["category"],
                "upload_seconds": fixture["upload_seconds"],
                "extraction_seconds": fixture["extraction_seconds"],
                "structure_seconds": fixture["structure_seconds"],
                "total_seconds": fixture["total_seconds"],
                "ocr_call_count": fixture["ocr_call_count"],
                "ocr_seconds_total": fixture["ocr_seconds_total"],
                "ocr_calls": fixture["ocr_calls"],
                "page_methods": [page["extraction_method"] for page in fixture["pages"]],
                "raw_text_lengths": [page["raw_text_length"] for page in fixture["pages"]],
                "accuracy": fixture["accuracy"],
                "page_attribution": fixture["page_attribution"],
                "source_bboxes": fixture["source_bboxes"],
                "extracted_measurements": fixture["accuracy"].get("extracted_measurements"),
            }
        )
    return {
        "label": result.get("label"),
        "ok": result.get("ok"),
        "error": result.get("error"),
        "abort_reason": result.get("abort_reason"),
        "config": {
            "cpu_threads": (result.get("model", {}).get("init_kwargs") or {}).get("cpu_threads"),
            "text_recognition_batch_size": (result.get("model", {}).get("init_kwargs") or {}).get(
                "text_recognition_batch_size"
            ),
            "device": result.get("environment", {}).get("device"),
            "enable_mkldnn": (result.get("model", {}).get("init_kwargs") or {}).get("enable_mkldnn"),
            "text_det_limit_side_len": (result.get("model", {}).get("init_kwargs") or {}).get("text_det_limit_side_len"),
            "text_det_limit_type": (result.get("model", {}).get("init_kwargs") or {}).get("text_det_limit_type"),
        },
        "model_init_seconds": result.get("model", {}).get("init_seconds"),
        "effective_config": result.get("model", {}).get("effective_config"),
        "memory": result.get("memory"),
        "worker_exit_code": result.get("worker_exit_code"),
        "orchestrator_elapsed_seconds": result.get("orchestrator_elapsed_seconds"),
        "isolation": result.get("isolation"),
        "real_data_unchanged": result.get("real_data_unchanged"),
        "real_data_before": result.get("real_data_before"),
        "real_data_after": result.get("real_data_after"),
        "fixtures": fixtures,
    }


def choose_best(rows: list[dict[str, Any]], production_signature: dict[str, Any]) -> tuple[Optional[dict[str, Any]], list[dict[str, Any]]]:
    table = []
    for row in rows:
        metric = warm_metric(row["raw"])
        signature = accuracy_signature(row["raw"])
        eligible = signature == production_signature
        table.append(
            {
                "label": row["label"],
                "cpu_threads": row["cpu_threads"],
                "text_recognition_batch_size": row["batch_size"],
                "warm_metric_seconds": round(metric, 4) if metric is not None else None,
                "accuracy_signature": signature,
                "accuracy_matches_production": eligible,
                "eligible": eligible and row["raw"].get("ok"),
            }
        )
    eligible_rows = [item for item in table if item["eligible"]]
    if not eligible_rows:
        return None, table
    best = min(eligible_rows, key=lambda item: (item["warm_metric_seconds"], -(item["cpu_threads"] or 10**6)))
    return best, table


def tune_session(session_dir: Path) -> dict[str, Any]:
    fixtures = tuning_fixtures()
    thread_rows = []

    production = run_worker(session_dir, "prod_threads_default_batch_default", None, None, fixtures)
    production_signature = accuracy_signature(production)
    if production_signature is None:
        raise RuntimeError("Production tuning run produced no accuracy signature")
    thread_rows.append({"label": production["label"], "cpu_threads": None, "batch_size": None, "raw": production})

    for threads in (1, 2, 4):
        label = f"threads_{threads}_batch_default"
        row = run_worker(session_dir, label, threads, None, fixtures)
        thread_rows.append({"label": label, "cpu_threads": threads, "batch_size": None, "raw": row})

    best_thread_row, thread_table = choose_best(thread_rows, production_signature)
    if best_thread_row is None:
        raise RuntimeError("No thread configuration matched production accuracy")
    best_threads = best_thread_row["cpu_threads"] or 10
    print(f"[tune] best threads: {best_threads}", flush=True)

    batch_rows = []
    # Reuse the best-thread/default-batch result as the batch-6 control.
    control = next(
        (
            row
            for row in thread_rows
            if (row["cpu_threads"] or 10) == best_threads and row["batch_size"] is None
        ),
        None,
    )
    if control is None:
        control_row = run_worker(session_dir, f"threads_{best_threads}_batch_default", best_threads, None, fixtures)
        control = {"label": control_row["label"], "cpu_threads": best_threads, "batch_size": None, "raw": control_row}
    batch_rows.append(control)

    for batch in (1, 2, 4):
        label = f"threads_{best_threads}_batch_{batch}"
        row = run_worker(session_dir, label, best_threads, batch, fixtures)
        batch_rows.append({"label": label, "cpu_threads": best_threads, "batch_size": batch, "raw": row})

    best_batch_row, batch_table = choose_best(batch_rows, production_signature)
    if best_batch_row is None:
        raise RuntimeError("No batch configuration matched production accuracy")
    best_batch = best_batch_row["text_recognition_batch_size"] or 6
    print(f"[tune] best batch: {best_batch}", flush=True)

    return {
        "stage": "tune",
        "created_at": utc_now(),
        "workload": "cbc_report.png cold + warm (same file, two sequential reports)",
        "production_accuracy_signature": production_signature,
        "thread_sweep": {
            "table": thread_table,
            "selected_threads": best_threads,
            "selection_rule": "lowest warm PNG OCR time among runs whose accuracy signature equals production",
            "runs": [summarize_run(row["raw"]) for row in thread_rows],
        },
        "batch_sweep": {
            "table": batch_table,
            "selected_batch_size": best_batch,
            "selection_rule": "lowest warm PNG OCR time among runs whose accuracy signature equals production",
            "runs": [summarize_run(row["raw"]) for row in batch_rows],
        },
        "best_config": {
            "cpu_threads": best_threads,
            "text_recognition_batch_size": best_batch,
            "accuracy_equivalent_to_production_on_png": True,
        },
    }


def full_session(session_dir: Path, best_config: dict[str, Any]) -> dict[str, Any]:
    fixtures = full_fixtures()
    production = run_worker(session_dir, "full_production_baseline", None, None, fixtures)
    best = run_worker(
        session_dir,
        "full_best_safe_cpu",
        int(best_config["cpu_threads"]),
        int(best_config["text_recognition_batch_size"]),
        fixtures,
    )

    def fixture_map(result: dict[str, Any]) -> dict[str, Any]:
        return {fixture["key"]: fixture for fixture in result.get("fixtures", [])}

    production_map = fixture_map(production)
    best_map = fixture_map(best)
    comparisons = []
    for key in production_map:
        left = production_map[key]
        right = best_map.get(key)
        if right is None:
            comparisons.append({"key": key, "status": "missing_in_best_config"})
            continue

        def bbox_map(fixture: dict[str, Any]) -> dict[str, Any]:
            return {
                f"{item.get('test')}|{item.get('page')}": item.get("bbox") for item in fixture.get("source_bboxes", [])
            }

        left_boxes = bbox_map(left)
        right_boxes = bbox_map(right)
        box_deltas = []
        for identity, box in right_boxes.items():
            left_box = left_boxes.get(identity)
            if left_box is None or box is None:
                box_deltas.append({"identity": identity, "status": "missing"})
                continue
            delta = [round(float(b) - float(a), 3) for a, b in zip(left_box, box)]
            box_deltas.append(
                {
                    "identity": identity,
                    "delta": delta,
                    "identical": all(abs(value) < 1e-6 for value in delta),
                    "max_abs_delta": max(abs(value) for value in delta),
                }
            )

        comparisons.append(
            {
                "key": key,
                "category": left["category"],
                "production": {
                    "total_seconds": left["total_seconds"],
                    "extraction_seconds": left["extraction_seconds"],
                    "ocr_seconds_total": left["ocr_seconds_total"],
                    "ocr_call_count": left["ocr_call_count"],
                    "field_totals": left["accuracy"]["field_totals"],
                    "biomarker_recall": left["accuracy"]["biomarker_recall"],
                    "biomarker_precision": left["accuracy"]["biomarker_precision"],
                    "mismatch_count": len(left["accuracy"]["mismatches"]),
                    "page_attribution": left["page_attribution"],
                },
                "best_config": {
                    "total_seconds": right["total_seconds"],
                    "extraction_seconds": right["extraction_seconds"],
                    "ocr_seconds_total": right["ocr_seconds_total"],
                    "ocr_call_count": right["ocr_call_count"],
                    "field_totals": right["accuracy"]["field_totals"],
                    "biomarker_recall": right["accuracy"]["biomarker_recall"],
                    "biomarker_precision": right["accuracy"]["biomarker_precision"],
                    "mismatch_count": len(right["accuracy"]["mismatches"]),
                    "page_attribution": right["page_attribution"],
                },
                "speedup_total": round(left["total_seconds"] / right["total_seconds"], 3) if right["total_seconds"] else None,
                "speedup_ocr": round(left["ocr_seconds_total"] / right["ocr_seconds_total"], 3)
                if right["ocr_seconds_total"]
                else None,
                "accuracy_identical": left["accuracy"]["field_totals"] == right["accuracy"]["field_totals"]
                and left["accuracy"]["biomarker_recall"] == right["accuracy"]["biomarker_recall"]
                and left["accuracy"]["biomarker_precision"] == right["accuracy"]["biomarker_precision"]
                and len(left["accuracy"]["mismatches"]) == len(right["accuracy"]["mismatches"]),
                "source_bbox_comparison": box_deltas,
            }
        )

    return {
        "stage": "full",
        "created_at": utc_now(),
        "best_config": best_config,
        "production_summary": summarize_run(production),
        "best_summary": summarize_run(best),
        "comparisons": comparisons,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", choices=("tune", "full", "all"), default="all")
    parser.add_argument("--reuse-tuning", default=None, help="Path to a previous OCR_LAB_TUNING_RESULTS.json for --plan full")
    args = parser.parse_args()

    session_id = datetime.now().strftime("%Y%m%dT%H%M%S")
    session_dir = ARTIFACT_DIR / "ocr_lab_runs" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    DEFAULT_TEMP_ROOT.mkdir(parents=True, exist_ok=True)

    before = real_state_snapshot()
    session = {
        "phase": "9.10.1",
        "session_id": session_id,
        "started_at": utc_now(),
        "artifacts_dir": str(ARTIFACT_DIR),
        "session_dir": str(session_dir),
        "temp_root": str(DEFAULT_TEMP_ROOT),
        "real_data_before": before,
        "hardware": hardware_inventory(),
        "packages": package_versions(),
        "gpu": gpu_probe(),
        "model_cache": model_cache_inventory(),
        "derived_fixture": build_fixture_entries(include_derived=True)["photo_scanned_pdf_200dpi"][
            "derived_metadata"
        ],
    }
    (ARTIFACT_DIR / "OCR_LAB_SESSION.json").write_text(json.dumps(session, indent=2), encoding="utf-8")

    tuning: Optional[dict[str, Any]] = None
    full: Optional[dict[str, Any]] = None

    if args.plan in ("tune", "all"):
        tuning = tune_session(session_dir)
        (ARTIFACT_DIR / "OCR_LAB_TUNING_RESULTS.json").write_text(json.dumps(tuning, indent=2), encoding="utf-8")
    elif args.plan == "full":
        if args.reuse_tuning:
            tuning = json.loads(Path(args.reuse_tuning).read_text(encoding="utf-8"))
        else:
            tuning_path = ARTIFACT_DIR / "OCR_LAB_TUNING_RESULTS.json"
            if not tuning_path.is_file():
                raise FileNotFoundError("Run --plan tune first or pass --reuse-tuning")
            tuning = json.loads(tuning_path.read_text(encoding="utf-8"))

    if args.plan in ("full", "all"):
        if tuning is None:
            raise RuntimeError("Tuning results are required before the full stage")
        full = full_session(session_dir, tuning["best_config"])
        (ARTIFACT_DIR / "OCR_LAB_FULL_RESULTS.json").write_text(json.dumps(full, indent=2), encoding="utf-8")

    session["finished_at"] = utc_now()
    session["real_data_after"] = real_state_snapshot()
    session["real_data_unchanged"] = (
        session["real_data_after"].get("db_sha256") == before.get("db_sha256")
        and session["real_data_after"].get("upload_file_count") == before.get("upload_file_count")
    )
    (ARTIFACT_DIR / "OCR_LAB_SESSION.json").write_text(json.dumps(session, indent=2), encoding="utf-8")

    combined = {
        "session": session,
        "tuning": tuning,
        "full": full,
    }
    (ARTIFACT_DIR / "OCR_LAB_RESULTS.json").write_text(json.dumps(combined, indent=2), encoding="utf-8")

    print(json.dumps(
        {
            "session_dir": str(session_dir),
            "best_config": (tuning or {}).get("best_config"),
            "real_data_unchanged": session["real_data_unchanged"],
        },
        indent=2,
    ))
    return 0 if session["real_data_unchanged"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
