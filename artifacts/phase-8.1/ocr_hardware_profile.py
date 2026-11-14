"""Phase 9.10.2 - LabLens portable OCR hardware profiler and adaptive benchmark.

Default operation is **inventory-only**: no OCR, no model loading, no backend
imports. Expensive experiments run only in explicit benchmark mode and only when
the memory preflight passes.

Modes
-----
``--mode inventory`` (default)
    Cheap, CPU/GPU hardware and runtime inspection. Produces a sanitized
    profile JSON validated against ``ocr_hardware_profile.schema.v1.json``.

``--mode benchmark``
    Adaptive OCR experiment matrix for THIS machine. Pre-flight: at least
    1.5 GiB available RAM is required; otherwise no experiment is started and
    every experiment is recorded as skipped. Between experiments the available
    RAM is re-checked; below 750 MiB the run stops safely and the remaining
    experiments are recorded as skipped. Workers run strictly sequentially.

    CPU matrix (one variable at a time, baseline-referenced):
      Phase A  baseline (production defaults) + each adaptive thread candidate
               at the production-default recognition batch size.
      Phase B  supported recognition batch sizes {1, 2, 4} at the best
               accuracy-identical thread count (batch 6 is the Phase-A row
               at that thread count and is not re-run).
      Never every combination. Detection limit fixed at 1280px, Medium models,
      FP32, MKL-DNN off.

    ``--include-gpu`` additionally runs ONE GPU smoke workload (single PNG)
    after the Paddle runtime is confirmed CUDA-compatible; otherwise the GPU
    path is recorded as untested with the exact reason. GPU rows never mutate
    the production singleton.

    ``--categories tuning|full`` (default ``tuning``)
      tuning: PNG workload only. full: also the multipage scanned PDF, the
      photographed JPG and the temporary 200-DPI photo-scan PDF (built into
      isolated temp storage on demand).

Privacy
-------
Exported reports never contain hostnames, usernames, MAC addresses, serial
numbers or personal file paths. Paths are rewritten to ``~`` / ``<repo>``.

Examples
--------
    py -3.12 artifacts/phase-8.1/ocr_hardware_profile.py
    py -3.12 artifacts/phase-8.1/ocr_hardware_profile.py --mode benchmark --include-gpu
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

ROOT_DIR = Path(__file__).resolve().parents[2].resolve()
BACKEND_DIR = ROOT_DIR / "backend"
ARTIFACT_DIR = ROOT_DIR / "artifacts" / "phase-8.1"
SCHEMA_PATH = ARTIFACT_DIR / "ocr_hardware_profile.schema.v1.json"
WORKER_SCRIPT = ARTIFACT_DIR / "ocr_lab_worker.py"
DERIVED_BUILDER = ARTIFACT_DIR / "make_photo_scanned_pdf.py"
PRIOR_RESULTS_PATH = ARTIFACT_DIR / "OCR_LAB_RESULTS.json"
OCR_ENGINE_PATH = BACKEND_DIR / "app" / "services" / "ocr_engine.py"
REAL_DATA_DIR = (BACKEND_DIR / "data").resolve()
REAL_UPLOAD_DIR = REAL_DATA_DIR / "uploads"
DEFAULT_OUT = ARTIFACT_DIR / "OCR_HARDWARE_PROFILE_LOCAL.json"

PHASE = "9.10.2"
TOOL_NAME = "lablens-ocr-profiler"
TOOL_VERSION = "1.0.0"
SCHEMA_VERSION = "1.0.0"

MIN_AVAILABLE_REQUIRED_BYTES = 1536 * 1024 * 1024   # 1.5 GiB - benchmark preflight
STOP_RESERVE_BYTES = 750 * 1024 * 1024              # 750 MiB - abort floor
FIXTURES_81 = BACKEND_DIR / "tests" / "fixtures" / "phase8_1_accuracy"
FIXTURES_95 = BACKEND_DIR / "tests" / "fixtures" / "phase9_5"

DEFAULT_TEMP_ROOT = Path(
    os.environ.get(
        "LABLENS_LAB_TEMP_ROOT",
        str(Path(os.environ.get("TEMP", tempfile.gettempdir())) / "opencode" / "lablens-phase9102"),
    )
).resolve()

UTC = timezone.utc


# ----------------------------------------------------------------- helpers

def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def log(message: str) -> None:
    print(f"[profiler] {message}", flush=True)


def sanitize(value: str) -> str:
    """Rewrite absolute personal/repository paths to portable placeholders."""
    if not value:
        return value
    home = str(Path.home())
    text = value.replace(home, "~").replace(home.replace("\\", "/"), "~")
    text = text.replace(str(ROOT_DIR), "<repo>").replace(str(ROOT_DIR).replace("\\", "/"), "<repo>")
    return text


def sanitize_obj(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize(value)
    if isinstance(value, dict):
        return {key: sanitize_obj(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_obj(item) for item in value]
    return value


def run_command(command: list[str], timeout: int = 60) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        return {
            "returncode": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
    except FileNotFoundError as exc:
        return {"returncode": None, "error": f"FileNotFoundError: {exc}"}
    except subprocess.TimeoutExpired:
        return {"returncode": None, "error": "timeout"}
    except Exception as exc:  # pragma: no cover - defensive
        return {"returncode": None, "error": f"{type(exc).__name__}: {exc}"}


def sha256_file(path: Path) -> str:
    import hashlib

    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def real_db_snapshot() -> dict[str, Any]:
    """Read-only snapshot of the real application data directory."""
    snapshot: dict[str, Any] = {
        "db_sha256": None,
        "upload_file_count": 0,
        "report_rows": None,
    }
    db = REAL_DATA_DIR / "lablens.db"
    if db.is_file():
        snapshot["db_sha256"] = sha256_file(db)
        try:
            import sqlite3

            con = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
            try:
                snapshot["report_rows"] = con.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
            finally:
                con.close()
        except Exception:
            snapshot["report_rows"] = None
    files = sorted(p for p in REAL_UPLOAD_DIR.iterdir() if p.is_file()) if REAL_UPLOAD_DIR.is_dir() else []
    snapshot["upload_file_count"] = len(files)
    return snapshot


# ------------------------------------------------------------ hardware

def cpu_inventory() -> dict[str, Any]:
    import psutil

    try:
        import cpuinfo

        info = cpuinfo.get_cpu_info()
        brand = info.get("brand_raw") or platform.processor() or "unknown"
        arch = info.get("arch") or platform.machine() or "unknown"
        bits = int(info.get("bits") or (64 if "64" in arch else 0) or 64)
        capabilities = sorted({str(f).lower() for f in info.get("flags", [])})
        capabilities_source = "py-cpuinfo" if capabilities else None
    except Exception:
        brand = platform.processor() or "unknown"
        arch = platform.machine() or "unknown"
        bits = 64
        capabilities = []
        capabilities_source = None

    frequency = psutil.cpu_freq()
    return {
        "model": brand.strip(),
        "architecture": arch,
        "bits": bits,
        "physical_cores": psutil.cpu_count(logical=False) or 1,
        "logical_cores": psutil.cpu_count(logical=True) or 1,
        "frequency_mhz": round(frequency.current, 1) if frequency else None,
        "capabilities": capabilities,
        "capabilities_source": capabilities_source,
    }


def _powershell_json(command: str) -> Any:
    result = run_command(
        ["powershell", "-NoProfile", "-Command", command],
        timeout=45,
    )
    stdout = (result or {}).get("stdout") or ""
    if not stdout:
        return None
    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        return None


def nvidia_inventory() -> dict[str, Any]:
    """Detect NVIDIA hardware independently of Paddle runtime compatibility."""
    if shutil.which("nvidia-smi"):
        result = run_command(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,driver_version",
                "--format=csv,noheader,nounits",
            ],
            timeout=30,
        )
        devices = []
        for line in (result.get("stdout") or "").splitlines():
            parts = [part.strip() for part in line.split(",")]
            if len(parts) >= 3 and parts[0]:
                try:
                    vram_bytes = int(float(parts[1]) * 1024 * 1024)
                except ValueError:
                    vram_bytes = None
                devices.append(
                    {"name": parts[0], "driver_version": parts[2], "vram_bytes": vram_bytes}
                )
        if devices:
            first = devices[0]
            return {
                "present": True,
                "name": first["name"],
                "driver_version": first["driver_version"],
                "vram_bytes": first["vram_bytes"],
                "source": "nvidia-smi",
            }

    wmi = _powershell_json(
        'Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match "NVIDIA" } | '
        "Select-Object Name,DriverVersion,AdapterRAM | ConvertTo-Json -Compress"
    )
    entries = wmi if isinstance(wmi, list) else ([wmi] if isinstance(wmi, dict) else [])
    for entry in entries:
        name = entry.get("Name")
        if not name:
            continue
        adapter_ram = entry.get("AdapterRAM")
        # Windows reports AdapterRAM as a 32-bit value clamped at 4 GiB.
        vram = int(adapter_ram) if isinstance(adapter_ram, (int, float)) and adapter_ram and adapter_ram > 0 else None
        return {
            "present": True,
            "name": str(name),
            "driver_version": str(entry.get("DriverVersion") or "") or None,
            "vram_bytes": vram,
            "source": "wmi",
        }
    return {"present": False, "name": None, "driver_version": None, "vram_bytes": None, "source": None}


def other_accelerators() -> list[dict[str, Any]]:
    wmi = _powershell_json(
        'Get-CimInstance Win32_VideoController | '
        "Select-Object Name,DriverVersion | ConvertTo-Json -Compress"
    )
    entries = wmi if isinstance(wmi, list) else ([wmi] if isinstance(wmi, dict) else [])
    found = []
    for entry in entries:
        name = entry.get("Name") or ""
        driver = entry.get("DriverVersion") or None
        if not name:
            continue
        lowered = name.lower()
        if "nvidia" in lowered:
            kind = "discrete_gpu"
        elif lowered.startswith("intel") or "iris" in lowered or "uhd" in lowered:
            kind = "integrated_gpu"
        elif "amd" in lowered and ("radeon" in lowered or "rx" in lowered):
            kind = "discrete_gpu" if "rx" in lowered else "integrated_gpu"
        else:
            kind = "other"
        found.append({"kind": kind, "model": str(name), "driver_version": str(driver) if driver else None})
    return found


# ------------------------------------------------------------ runtime

PADDLE_PROBE_SCRIPT = r"""
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
except Exception as exc:
    out["set_device_gpu"] = "FAILED"
    out["gpu_error_type"] = type(exc).__name__
    out["gpu_error_message"] = str(exc)
finally:
    try:
        paddle.set_device("cpu")
    except Exception:
        pass
print(json.dumps(out))
"""


def paddle_probe() -> dict[str, Any]:
    result = run_command([sys.executable, "-c", PADDLE_PROBE_SCRIPT], timeout=180)
    parsed: dict[str, Any] = {}
    for line in (result.get("stdout") or "").splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                continue
    parsed["_command"] = result
    return parsed


def read_installed_file(package_root_module: str, *parts: str) -> Optional[str]:
    try:
        module = __import__(package_root_module)
        root = Path(module.__file__).resolve().parent
        target = root.joinpath(*parts)
        if target.is_file():
            return target.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        pass
    return None


def production_model_config() -> dict[str, Any]:
    defaults: dict[str, Any] = {
        "text_detection_model": None,
        "text_recognition_model": None,
        "detection_limit_side_len": None,
        "detection_limit_type": None,
        "precision": "fp32",
        "mkl_dnn_enabled": False,
        "cpu_threads_default": None,
        "recognition_batch_size_default": None,
        "production_config_source": "backend/app/services/ocr_engine.py + installed paddlex defaults",
    }

    try:
        source = OCR_ENGINE_PATH.read_text(encoding="utf-8")
        match = re.search(r"text_det_limit_side_len\s*=\s*(\d+)", source)
        if match:
            defaults["detection_limit_side_len"] = int(match.group(1))
        match = re.search(r'text_det_limit_type\s*=\s*"(max|min)"', source)
        if match:
            defaults["detection_limit_type"] = match.group(1)
        match = re.search(r"enable_mkldnn\s*=\s*(True|False)", source)
        if match:
            defaults["mkl_dnn_enabled"] = match.group(1) == "True"
    except Exception:
        defaults["production_config_source"] = "parser_unavailable"

    constants = read_installed_file("paddleocr", "_constants.py")
    if constants:
        match = re.search(r"DEFAULT_CPU_THREADS\s*=\s*(\d+)", constants)
        if match:
            defaults["cpu_threads_default"] = int(match.group(1))
        match = re.search(r'DEFAULT_PRECISION\s*=\s*"(\w+)"', constants)
        if match:
            defaults["precision"] = match.group(1)

    yaml_text = read_installed_file("paddlex", "configs", "pipelines", "OCR.yaml")
    if yaml_text:
        det = re.search(r"TextDetection:\s*\n(?:.*\n)*?\s*model_name:\s*(\S+)", yaml_text)
        rec = re.search(r"TextRecognition:\s*\n(?:.*\n)*?\s*model_name:\s*(\S+)", yaml_text)
        if det:
            defaults["text_detection_model"] = det.group(1).strip()
        if rec:
            defaults["text_recognition_model"] = rec.group(1).strip()
        block = re.search(r"TextRecognition:\s*\n(?:.*\n)*?\s*batch_size:\s*(\d+)", yaml_text)
        if block:
            defaults["recognition_batch_size_default"] = int(block.group(1))

    cache = Path.home() / ".paddlex" / "official_models"
    if cache.is_dir():
        defaults["cache_total_bytes"] = sum(
            p.stat().st_size for p in cache.rglob("*") if p.is_file()
        )
    else:
        defaults["cache_total_bytes"] = None
    defaults["cache_dir"] = "~/.paddlex/official_models"
    return defaults


def runtime_versions() -> dict[str, Any]:
    import importlib.metadata as metadata

    versions: dict[str, Any] = {}
    for package in ("paddlepaddle", "paddleocr", "paddlex"):
        try:
            versions[package] = metadata.version(package)
        except Exception:
            versions[package] = None
    return versions


def paddle_runtime_from_probe(probe: dict[str, Any]) -> dict[str, Any]:
    available = probe.get("available_devices")
    if not isinstance(available, list):
        available = []
    cuda = probe.get("cuda_version")
    cudnn = probe.get("cudnn_version")
    return {
        "version": str(probe.get("paddle_version") or "unknown"),
        "compiled_with_cuda": bool(probe.get("is_compiled_with_cuda")),
        "cuda_version": str(cuda) if cuda not in (None, "False") else None,
        "cudnn_version": str(cudnn) if cudnn not in (None, "False") else None,
        "devices": [str(d) for d in available],
        "set_device_gpu": probe.get("set_device_gpu"),
        "gpu_error_type": probe.get("gpu_error_type"),
        "gpu_error_message": probe.get("gpu_error_message"),
    }


# ------------------------------------------------------- adaptive matrix

def adaptive_thread_candidates(logical_cores: int, physical_cores: int) -> list[int]:
    candidates = {1}
    if logical_cores >= 2:
        candidates.add(2)
    if logical_cores >= 4:
        candidates.add(4)
    # double the physical core count, capped by available logical cores
    candidates.add(min(max(physical_cores * 2, 2), logical_cores))
    if logical_cores >= 8:
        candidates.add(min(8, logical_cores))
    if logical_cores >= 12:
        candidates.add(min(12, logical_cores))
    candidates.add(logical_cores)
    return sorted(c for c in candidates if c <= logical_cores)


def supported_batch_sizes() -> tuple[list[int], str]:
    ocr_py = read_installed_file("paddleocr", "_pipelines", "ocr.py") or ""
    yaml_text = read_installed_file("paddlex", "configs", "pipelines", "OCR.yaml") or ""
    supported: list[int] = []
    if "text_recognition_batch_size" in ocr_py and re.search(r"TextRecognition:.*\n(?:.*\n)*?.*batch_size:", yaml_text or ""):
        supported = [1, 2, 4, 6]
    note = (
        "installed PaddleOCR/PaddleX support text_recognition_batch_size={1,2,4,6}"
        if supported
        else "text_recognition_batch_size override not discoverable in installed API; batch experiments disabled"
    )
    return supported, note


# ---------------------------------------------------------- experiments

def prior_evidence() -> dict[str, Any]:
    out: dict[str, Any] = {
        "available": False,
        "phase": "9.10.1",
        "results_file": None,
        "measured_on": None,
        "note": "Phase 9.10.1 results not found; baseline evidence unavailable.",
    }
    try:
        payload = json.loads(PRIOR_RESULTS_PATH.read_text(encoding="utf-8"))
        best = payload.get("tuning", {}).get("best_config") or payload.get("full", {}).get("best_config")
        full = payload.get("full", {})
        comparisons = full.get("comparisons", [])
        accuracy_ok = bool(comparisons) and all(item.get("accuracy_identical") for item in comparisons)
        production = full.get("production_summary", {}).get("fixtures", [])
        best_summary = full.get("best_summary", {}).get("fixtures", [])
        wall_note = "timing summary unavailable"
        if production and best_summary:
            def totals(rows):
                return sum(row.get("total_seconds", 0.0) for row in rows)

            prod_total = totals(production)
            best_total = totals(best_summary)
            if prod_total > 0:
                wall_note = (
                    f"five-category wall clock {prod_total:.1f}s -> {best_total:.1f}s "
                    f"({(prod_total - best_total) / prod_total * 100:.1f}% reduction)"
                )
        out.update(
            {
                "available": True,
                "results_file": "artifacts/phase-8.1/OCR_LAB_RESULTS.json",
                "measured_on": "this machine, 2026-11-13 (Phase 9.10.1)",
                "note": (
                    f"reused Phase 9.10.1 measurements; preferred config cpu_threads="
                    f"{best.get('cpu_threads')}, batch={best.get('text_recognition_batch_size')}; "
                    f"accuracy identical across {len(comparisons)} categories; "
                    f"{wall_note}"
                ),
            }
        )
    except Exception as exc:
        out["note"] = f"Phase 9.10.1 results unreadable: {type(exc).__name__}: {exc}"
    return out


def build_skipped_matrix(candidates: list[int], supported_batches: list[int], reason: str) -> list[dict[str, Any]]:
    rows = [
        {
            "id": "baseline-production",
            "parameters": {"cpu_threads": None, "text_recognition_batch_size": None, "device": "cpu"},
            "status": "skipped",
            "skip_reason": reason,
            "fixture": "cbc_report.png",
            "init_seconds": None,
            "cold_inference_seconds": None,
            "warm_inference_seconds": None,
            "total_extraction_seconds": None,
            "ocr_call_count": None,
            "peak_rss_bytes": None,
            "accuracy": None,
            "page_attribution": None,
            "source_coordinates_valid": None,
        }
    ]
    for threads in candidates:
        rows.append(
            {
                "id": f"phase-a-threads-{threads}",
                "parameters": {"cpu_threads": threads, "text_recognition_batch_size": None, "device": "cpu"},
                "status": "skipped",
                "skip_reason": reason,
                "fixture": "cbc_report.png",
                "init_seconds": None,
                "cold_inference_seconds": None,
                "warm_inference_seconds": None,
                "total_extraction_seconds": None,
                "ocr_call_count": None,
                "peak_rss_bytes": None,
                "accuracy": None,
                "page_attribution": None,
                "source_coordinates_valid": None,
            }
        )
    for batch in (b for b in supported_batches if b != 6):
        rows.append(
            {
                "id": f"phase-b-batch-{batch}",
                "parameters": {"cpu_threads": None, "text_recognition_batch_size": batch, "device": "cpu"},
                "status": "skipped",
                "skip_reason": reason,
                "fixture": "cbc_report.png",
                "init_seconds": None,
                "cold_inference_seconds": None,
                "warm_inference_seconds": None,
                "total_extraction_seconds": None,
                "ocr_call_count": None,
                "peak_rss_bytes": None,
                "accuracy": None,
                "page_attribution": None,
                "source_coordinates_valid": None,
            }
        )
    return rows


def memory_floor_free(floor_bytes: int) -> tuple[bool, int]:
    import psutil

    available = psutil.virtual_memory().available
    return available >= floor_bytes, available


def measure_worker(
    session_id: str,
    label: str,
    cpu_threads: Optional[int],
    batch_size: Optional[int],
    device: str,
    fixtures: list[dict[str, Any]],
    temp_root: Path,
) -> dict[str, Any]:
    session_dir = ARTIFACT_DIR / "ocr_lab_runs" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    run_id = f"{session_id}__{label}"
    spec_path = session_dir / f"{label}.spec.json"
    out_path = session_dir / f"{label}.result.json"
    log_path = session_dir / f"{label}.log"
    spec = {
        "run_id": run_id,
        "label": label,
        "temp_root": str(temp_root),
        "cpu_threads": cpu_threads,
        "text_recognition_batch_size": batch_size,
        "device": device,
        "fixtures": fixtures,
        "min_available_bytes": STOP_RESERVE_BYTES,
        "created_at": utc_now(),
    }
    spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
    log(f"worker {label}: threads={cpu_threads or 'default'} batch={batch_size or 'default'} device={device}")
    started = time.perf_counter()
    with open(log_path, "w", encoding="utf-8") as log_file:
        completed = subprocess.run(
            [sys.executable, str(WORKER_SCRIPT), "--spec", str(spec_path), "--out", str(out_path)],
            stdout=log_file,
            stderr=subprocess.STDOUT,
            timeout=1800,
        )
    if not out_path.is_file():
        raise RuntimeError(f"worker {label} produced no result (exit {completed.returncode}); see {log_path}")
    result = json.loads(out_path.read_text(encoding="utf-8"))
    result["orchestrator_elapsed_seconds"] = round(time.perf_counter() - started, 2)
    result["log_path"] = sanitize(str(log_path))
    return result


def png_fixtures() -> list[dict[str, Any]]:
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


def full_fixtures(temp_root: Path) -> list[dict[str, Any]]:
    if str(ARTIFACT_DIR) not in sys.path:
        sys.path.insert(0, str(ARTIFACT_DIR))
    from make_photo_scanned_pdf import build as build_photo_pdf

    derived = build_photo_pdf(temp_root)
    return [
        {
            "key": "digital_pdf",
            "category": "digital_pdf",
            "path": str(FIXTURES_81 / "clean_digital_report.pdf"),
            "filename": "clean_digital_report.pdf",
            "ground_truth": str(FIXTURES_81 / "clean_digital_report.json"),
        },
        {
            "key": "cbc_png",
            "category": "image_png",
            "path": str(FIXTURES_81 / "cbc_report.png"),
            "filename": "cbc_report.png",
            "ground_truth": str(FIXTURES_81 / "cbc_report.json"),
        },
        {
            "key": "multipage_scanned_pdf",
            "category": "image_only_pdf",
            "path": str(FIXTURES_95 / "multipage_scanned_report.pdf"),
            "filename": "multipage_scanned_report.pdf",
            "ground_truth": str(FIXTURES_95 / "multipage_scanned_report.json"),
        },
        {
            "key": "photographed_jpg",
            "category": "photograph",
            "path": str(FIXTURES_95 / "photographed_report.jpg"),
            "filename": "photographed_report.jpg",
            "ground_truth": str(FIXTURES_95 / "photographed_report.json"),
        },
        {
            "key": "photo_scanned_pdf_200dpi",
            "category": "photo_scanned_pdf",
            "path": derived["derived_pdf"],
            "filename": "photo_scanned_report_200dpi.pdf",
            "ground_truth": str(FIXTURES_95 / "photographed_report.json"),
        },
    ]


def summarize_measurement(result: dict[str, Any], experiment_id: str) -> dict[str, Any]:
    warm_fixture = next((f for f in result.get("fixtures", []) if f["key"].endswith("warm")), None)
    if warm_fixture is None:
        warm_fixture = (result.get("fixtures") or [None])[0]
    accuracy = warm_fixture.get("accuracy") if warm_fixture else None
    page_attr = warm_fixture.get("page_attribution") if warm_fixture else None
    bboxes = warm_fixture.get("source_bboxes") if warm_fixture else []
    coordinates_valid = None
    if bboxes:
        coordinates_valid = all(
            item.get("valid_box") and (item.get("within_page") in (True, None)) for item in bboxes
        )
    return {
        "id": experiment_id,
        "parameters": {
            "cpu_threads": (result.get("model", {}).get("init_kwargs") or {}).get("cpu_threads"),
            "text_recognition_batch_size": (result.get("model", {}).get("init_kwargs") or {}).get(
                "text_recognition_batch_size"
            ),
            "device": (result.get("model", {}).get("init_kwargs") or {}).get("device") or "cpu",
        },
        "status": "measured",
        "skip_reason": None,
        "fixture": warm_fixture["key"] if warm_fixture else None,
        "init_seconds": result.get("model", {}).get("init_seconds"),
        "cold_inference_seconds": next(
            (
                f["ocr_seconds_total"]
                for f in result.get("fixtures", [])
                if f["key"].endswith("cold")
            ),
            None,
        ),
        "warm_inference_seconds": warm_fixture["ocr_seconds_total"] if warm_fixture else None,
        "total_extraction_seconds": warm_fixture["total_seconds"] if warm_fixture else None,
        "ocr_call_count": sum(f.get("ocr_call_count", 0) for f in result.get("fixtures", [])),
        "peak_rss_bytes": (result.get("memory") or {}).get("peak_process_rss_bytes"),
        "accuracy": (
            {
                "biomarker_recall": accuracy["biomarker_recall"],
                "biomarker_precision": accuracy["biomarker_precision"],
                "correctly_identified_tests": accuracy["correctly_identified_tests"],
                "extracted_count": accuracy["extracted_count"],
                "ground_truth_count": accuracy["ground_truth_count"],
                "mismatch_count": len(accuracy["mismatches"]),
            }
            if accuracy
            else None
        ),
        "page_attribution": (
            {"correct": page_attr["correct"], "scored": page_attr["scored"]} if page_attr else None
        ),
        "source_coordinates_valid": coordinates_valid,
    }


def accuracy_signature(result: dict[str, Any]) -> Optional[dict[str, Any]]:
    fixture = next((f for f in result.get("fixtures", []) if f["key"].endswith("warm")), None)
    if fixture is None:
        fixture = (result.get("fixtures") or [None])[0]
    if not fixture:
        return None
    accuracy = fixture["accuracy"]
    return {
        "field_totals": accuracy["field_totals"],
        "biomarker_recall": accuracy["biomarker_recall"],
        "biomarker_precision": accuracy["biomarker_precision"],
        "mismatch_count": len(accuracy["mismatches"]),
    }


def warm_ocr_seconds(result: dict[str, Any]) -> float:
    fixture = next((f for f in result.get("fixtures", []) if f["key"].endswith("warm")), None)
    if fixture is None:
        fixture = (result.get("fixtures") or [None])[0]
    return float(fixture["ocr_seconds_total"] or fixture["extraction_seconds"]) if fixture else float("inf")


# ------------------------------------------------------------- combine

def build_profile(
    *,
    mode: str,
    include_gpu: bool,
    categories: str,
    temp_root: Path,
) -> dict[str, Any]:
    db_before = real_db_snapshot()
    hardware_cpu = cpu_inventory()
    memory = None
    try:
        import psutil

        vm = psutil.virtual_memory()
        memory = {"total_bytes": int(vm.total), "available_bytes": int(vm.available)}
    except Exception:
        memory = {"total_bytes": 1, "available_bytes": 0}

    probe = paddle_probe()
    paddle_runtime = paddle_runtime_from_probe(probe)
    nvidia = nvidia_inventory()
    accelerators = other_accelerators()
    model_cfg = production_model_config()
    versions = runtime_versions()
    logical = hardware_cpu["logical_cores"]
    physical = hardware_cpu["physical_cores"]
    thread_candidates = adaptive_thread_candidates(logical, physical)
    batch_candidates, batch_note = supported_batch_sizes()
    evidence = prior_evidence()

    profile: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "phase": PHASE,
        "tool": {"name": TOOL_NAME, "version": TOOL_VERSION},
        "generated_at": utc_now(),
        "hardware": {
            "cpu": hardware_cpu,
            "nvidia": nvidia,
            "other_accelerators": accelerators,
        },
        "memory": memory,
        "runtime": {
            "os": {"system": platform.system(), "architecture": platform.machine()},
            "python": {"version": sys.version.split()[0]},
            "packages": {
                "paddlepaddle": {
                    "version": paddle_runtime["version"],
                    "compiled_with_cuda": paddle_runtime["compiled_with_cuda"],
                    "cuda_version": paddle_runtime["cuda_version"],
                    "cudnn_version": paddle_runtime["cudnn_version"],
                },
                "paddleocr": {"version": versions.get("paddleocr")},
                "paddlex": {"version": versions.get("paddlex")},
            },
            "paddle_devices": paddle_runtime["devices"],
        },
        "model": model_cfg,
        "gpu": {
            "hardware_present": bool(nvidia["present"]),
            "runtime_compatible": bool(
                paddle_runtime["compiled_with_cuda"]
                and paddle_runtime["devices"]
                and paddle_runtime.get("set_device_gpu") == "OK"
            ),
            "devices": paddle_runtime["devices"],
            "cuda_version": paddle_runtime["cuda_version"],
            "cudnn_version": paddle_runtime["cudnn_version"],
            "smoke_test": {
                "status": "not_run",
                "backend": None,
                "init_seconds": None,
                "inference_seconds": None,
                "error_type": None,
                "error_message": None,
                "workload": None,
            },
            "performance_status": "untested",
            "performance_reason": None,
            "fallback": None,
        },
        "adaptive_candidates": {
            "logical_cores": logical,
            "physical_cores": physical,
            "cpu_threads": thread_candidates,
            "recognition_batch_size": batch_candidates,
            "selection_method": (
                "one-variable-at-a-time against the production-equivalent baseline; "
                "accuracy signature must match the baseline exactly; fastest warm OCR wins"
            ),
            "fixed_constraints": (
                "PP-OCRv6 medium detection+recognition, 1280px max detector, fp32, "
                "MKL-DNN disabled, direct PDF text path untouched"
            ),
        },
        "prior_evidence": evidence,
        "experiments": [],
        "safety": {
            "min_available_required_bytes": MIN_AVAILABLE_REQUIRED_BYTES,
            "stop_reserve_bytes": STOP_RESERVE_BYTES,
            "preflight_available_bytes": memory["available_bytes"],
            "precondition_met": memory["available_bytes"] >= MIN_AVAILABLE_REQUIRED_BYTES,
            "memory_guard_triggered": False,
            "sequential_execution": True,
            "workers_launched": 0,
            "skipped_experiments": [],
        },
        "db_integrity": {
            "db_sha256_before": db_before["db_sha256"],
            "db_sha256_after": None,
            "upload_file_count_before": db_before["upload_file_count"],
            "upload_file_count_after": None,
            "report_rows": db_before["report_rows"],
            "unchanged": True,
        },
        "recommendations": [],
        "untested": [],
    }

    if not profile["gpu"]["runtime_compatible"]:
        reason = (
            "Paddle runtime not CUDA-compatible on this machine"
            if not paddle_runtime["compiled_with_cuda"]
            else (
                "Paddle reports no GPU devices"
                if not paddle_runtime["devices"]
                else f"paddle.set_device('gpu') failed: {paddle_runtime.get('gpu_error_message')}"
            )
        )
        profile["gpu"]["performance_reason"] = reason
        profile["gpu"]["smoke_test"] = {
            "status": "skipped_incompatible",
            "backend": None,
            "init_seconds": None,
            "inference_seconds": None,
            "error_type": paddle_runtime.get("gpu_error_type"),
            "error_message": paddle_runtime.get("gpu_error_message") or reason,
            "workload": None,
        }

    # -------------------------------------------------- benchmark phase
    if mode == "benchmark":
        run_benchmark_mode(
            profile,
            thread_candidates,
            batch_candidates,
            include_gpu=include_gpu,
            categories=categories,
            temp_root=temp_root,
        )

    # ---------------------------------- final integrity + recommendations
    db_after = real_db_snapshot()
    profile["db_integrity"]["db_sha256_after"] = db_after["db_sha256"]
    profile["db_integrity"]["upload_file_count_after"] = db_after["upload_file_count"]
    profile["db_integrity"]["unchanged"] = (
        profile["db_integrity"]["db_sha256_before"] == db_after["db_sha256"]
        and profile["db_integrity"]["upload_file_count_before"] == db_after["upload_file_count"]
    )

    _finalize_recommendations(profile, evidence)
    return profile


def run_benchmark_mode(
    profile: dict[str, Any],
    thread_candidates: list[int],
    batch_candidates: list[int],
    *,
    include_gpu: bool,
    categories: str,
    temp_root: Path,
) -> None:
    """Explicit, opt-in benchmark. Never call from inventory mode."""
    preflight_ok = profile["safety"]["precondition_met"]
    if not preflight_ok:
        reason = (
            f"precondition_failed: available {profile['safety']['preflight_available_bytes']} "
            f"< required {MIN_AVAILABLE_REQUIRED_BYTES}"
        )
        profile["experiments"] = build_skipped_matrix(
            thread_candidates, batch_candidates, reason
        )
        profile["safety"]["skipped_experiments"] = [
            {"id": exp["id"], "reason": reason} for exp in profile["experiments"]
        ]
        profile["untested"].extend(
            [
                "gpu_inference_performance",
                "ocr_experiment_matrix_on_this_machine (precondition_failed)",
            ]
        )
        log("benchmark refused: available RAM below 1.5 GiB preflight; no OCR launched")
        return

    fixtures = png_fixtures() if categories == "tuning" else full_fixtures(temp_root)
    session_id = datetime.now().strftime("%Y%m%dT%H%M%S")
    temp_root.mkdir(parents=True, exist_ok=True)

    def _guard(label: str) -> tuple[bool, Optional[str]]:
        ok, available = memory_floor_free(STOP_RESERVE_BYTES)
        if not ok:
            reason = f"memory_guard_triggered: available {available} < stop reserve {STOP_RESERVE_BYTES}"
            log(reason)
            profile["safety"]["memory_guard_triggered"] = True
            profile["safety"]["skipped_experiments"].append({"id": label, "reason": reason})
            return False, reason
        return True, None

    started_experiments: list[dict[str, Any]] = []

    def _skipped_entry(
        experiment_id: str,
        cpu_threads: Optional[int],
        batch_size: Optional[int],
        device: str,
        reason: Optional[str],
    ) -> dict[str, Any]:
        return {
            "id": experiment_id,
            "parameters": {
                "cpu_threads": cpu_threads,
                "text_recognition_batch_size": batch_size,
                "device": device,
            },
            "status": "skipped",
            "skip_reason": reason,
            "fixture": fixtures[0]["key"] if fixtures else None,
            "init_seconds": None,
            "cold_inference_seconds": None,
            "warm_inference_seconds": None,
            "total_extraction_seconds": None,
            "ocr_call_count": None,
            "peak_rss_bytes": None,
            "accuracy": None,
            "page_attribution": None,
            "source_coordinates_valid": None,
        }

    def _launch(
        experiment_id: str,
        cpu_threads: Optional[int],
        batch_size: Optional[int],
        device: str,
    ) -> Optional[dict[str, Any]]:
        ok, reason = _guard(experiment_id)
        if not ok:
            started_experiments.append(
                _skipped_entry(experiment_id, cpu_threads, batch_size, device, reason)
            )
            return None
        result = measure_worker(
            session_id,
            experiment_id,
            cpu_threads,
            batch_size,
            device,
            fixtures,
            temp_root,
        )
        profile["safety"]["workers_launched"] += 1
        summary = summarize_measurement(result, experiment_id)
        summary["status"] = "measured" if result.get("ok") else "failed"
        if summary["status"] == "failed":
            summary["skip_reason"] = result.get("error") or result.get("abort_reason")
        started_experiments.append(summary)
        return result

    # --- Phase A: baseline + thread candidates at production-default batch
    baseline_result = _launch("baseline-production", None, None, "cpu")
    thread_results: dict[int, dict[str, Any]] = {}
    for threads in thread_candidates:
        result = _launch(f"phase-a-threads-{threads}", threads, None, "cpu")
        if result is not None:
            thread_results[threads] = result

    # --- select best accuracy-identical thread count
    best_threads = None
    baseline_signature = accuracy_signature(baseline_result) if baseline_result else None
    eligible = [
        (threads, warm_ocr_seconds(result))
        for threads, result in thread_results.items()
        if baseline_signature is not None and accuracy_signature(result) == baseline_signature
    ]
    if baseline_result is not None and warm_ocr_seconds(baseline_result) != float("inf"):
        eligible.append((None, warm_ocr_seconds(baseline_result)))
    if eligible:
        metric, _ = sorted(((m, t) for t, m in eligible))[0]
        best_threads = next(t for t, m in eligible if m == metric)

    # --- Phase B: batch sizes at the best thread count (skip 6; already measured in Phase A)
    if best_threads is not None:
        for batch in (b for b in batch_candidates if b != 6):
            _launch(f"phase-b-batch-{batch}", best_threads, batch, "cpu")
    else:
        reason = "no accuracy-identical thread candidate measured"
        for batch in (b for b in batch_candidates if b != 6):
            profile["safety"]["skipped_experiments"].append({"id": f"phase-b-batch-{batch}", "reason": reason})
            started_experiments.append(_skipped_entry(f"phase-b-batch-{batch}", None, batch, "cpu", reason))

    # --- GPU smoke (single PNG, one workload), only when explicitly requested
    if include_gpu:
        gpu = profile["gpu"]
        if gpu["runtime_compatible"]:
            gpu_result = measure_worker(
                session_id,
                "gpu-smoke-png",
                None,
                None,
                "gpu",
                png_fixtures(),
                temp_root,
            )
            profile["safety"]["workers_launched"] += 1
            gpu_summary = summarize_measurement(gpu_result, "gpu-smoke-png")
            gpu_summary["status"] = "measured" if gpu_result.get("ok") else "failed"
            started_experiments.append(gpu_summary)
            gpu["smoke_test"] = {
                "status": "passed" if gpu_result.get("ok") else "failed",
                "backend": "cuda",
                "init_seconds": (gpu_result.get("model") or {}).get("init_seconds"),
                "inference_seconds": next(
                    (
                        f["ocr_seconds_total"]
                        for f in gpu_result.get("fixtures", [])
                        if f["key"].endswith("warm")
                    ),
                    None,
                ),
                "error_type": None,
                "error_message": gpu_result.get("error"),
                "workload": "cbc_report.png (cold+warm)",
            }
            base_sig = accuracy_signature(baseline_result) if baseline_result else None
            if gpu_result.get("ok") and base_sig is not None and accuracy_signature(gpu_result) == base_sig:
                gpu["performance_status"] = "measured"
                gpu["performance_reason"] = None
                gpu["fallback"] = None
            else:
                gpu["performance_status"] = "untested"
                gpu["performance_reason"] = (
                    "GPU smoke failed or accuracy diverged from baseline; CPU remains the default path"
                )
                gpu["fallback"] = "cpu"
        else:
            # Runtime incompatible: keep the skipped_incompatible smoke record
            # that build_profile() already populated. CPU stays the default path.
            pass

    profile["experiments"] = started_experiments
    if include_gpu:
        profile["untested"] = [item for item in profile["untested"] if not item.startswith("gpu_inference_performance")]


def _finalize_recommendations(profile: dict[str, Any], evidence: dict[str, Any]) -> None:
    recommendations: list[dict[str, Any]] = profile["recommendations"]
    cpu = profile["adaptive_candidates"]
    if evidence.get("available"):
        recommendations.append(
            {
                "id": "cpu-prior-best",
                "scope": "cpu",
                "text": (
                    f"Phase 9.10.1 measurements on this machine (reused evidence): "
                    f"cpu_threads=4 with recognition batch=1 beat production defaults "
                    f"(−12.0% five-category wall clock; PNG 1.11x, scanned PDF 1.19x) with "
                    f"bit-identical accuracy and source geometry. Adopt only after re-checking "
                    f"accuracy on your target fixtures."
                ),
                "evidence_class": "recommendation",
                "based_on": ["artifacts/phase-8.1/OCR_LAB_RESULTS.json"],
            }
        )
    recommendations.append(
        {
            "id": "cpu-adaptive-matrix",
            "scope": "cpu",
            "text": (
                f"This machine's adaptive thread candidates are {cpu['cpu_threads']} "
                f"(capped at {cpu['logical_cores']} logical cores) and recognition batches "
                f"{cpu['recognition_batch_size']}; detection stays at 1280px, Medium models, "
                f"FP32, MKL-DNN off. Do not transfer another laptop's constants without "
                f"re-measuring and re-verifying accuracy."
            ),
            "evidence_class": "recommendation",
            "based_on": ["this profile", "Phase 9.10.1 tuning tables"],
        }
    )
    if not profile["gpu"]["runtime_compatible"]:
        recommendations.append(
            {
                "id": "gpu-untested",
                "scope": "gpu",
                "text": (
                    "GPU acceleration is untested on this machine: the installed PaddlePaddle "
                    "build is not CUDA-compatible (or no NVIDIA GPU/driver is usable). Do not "
                    "select a GPU device until a machine passes the compile-flag + device + "
                    "smoke-test gate in --mode benchmark --include-gpu."
                ),
                "evidence_class": "recommendation",
                "based_on": ["this profile runtime probe", "Phase 9.10.1 GPU finding"],
            }
        )
    if not profile["safety"]["precondition_met"]:
        recommendations.append(
            {
                "id": "memory-benchmark-blocked",
                "scope": "memory",
                "text": (
                    f"Available RAM ({profile['safety']['preflight_available_bytes']} bytes) is below "
                    f"the {MIN_AVAILABLE_REQUIRED_BYTES}-byte benchmark preflight; benchmarks were "
                    "intentionally skipped. Close applications until >= 1.5 GiB is free, or run the "
                    "benchmark on a machine with more headroom. Inventory-only mode remains valid."
                ),
                "evidence_class": "recommendation",
                "based_on": ["this profile memory inventory"],
            }
        )
    recommendations.append(
        {
            "id": "overall-reuse",
            "scope": "overall",
            "text": (
                "On other computers, copy this repository's artifacts/phase-8.1/ and run "
                "`py -3.12 artifacts/phase-8.1/ocr_hardware_profile.py` for inventory, then "
                "`... --mode benchmark` (requires >= 1.5 GiB free RAM). Results are comparable "
                "because field names, units, schema (v1) and fixed model/detector constraints "
                "are identical across machines."
            ),
            "evidence_class": "recommendation",
            "based_on": ["ocr_hardware_profile.schema.v1.json"],
        }
    )

    untested = list(profile["untested"])
    if profile["gpu"]["performance_status"] == "untested" and not any(item.startswith("gpu_inference_performance") for item in untested):
        untested.append("gpu_inference_performance")
    if not any(item.startswith("smaller_") for item in untested):
        untested.append("smaller_ppocrv6_models (none cached; download forbidden in this phase)")
    profile["untested"] = untested


# ----------------------------------------------------------------- main

def validate_profile(profile: dict[str, Any]) -> None:
    try:
        from jsonschema import Draft202012Validator
    except Exception as exc:  # pragma: no cover - defensive
        raise RuntimeError(f"jsonschema unavailable for schema validation: {exc}")
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(profile), key=lambda error: error.path)
    if errors:
        details = "; ".join(f"{'/'.join(str(p) for p in e.path)}: {e.message}" for e in errors[:10])
        raise RuntimeError(f"profile does not validate against schema v1: {details}")


def main() -> int:
    parser = argparse.ArgumentParser(description="LabLens portable OCR hardware profiler")
    parser.add_argument("--mode", choices=("inventory", "benchmark"), default="inventory")
    parser.add_argument("--include-gpu", action="store_true", help="run one GPU smoke workload (benchmark mode only)")
    parser.add_argument(
        "--benchmark-categories",
        choices=("tuning", "full"),
        default="tuning",
        help="tuning: PNG only; full: digital PDF + PNG + scanned PDF + photo + photo-scan PDF",
    )
    parser.add_argument("--temp-root", default=str(DEFAULT_TEMP_ROOT))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--version", action="version", version=f"{TOOL_NAME} {TOOL_VERSION}")
    args = parser.parse_args()

    temp_root = Path(args.temp_root).resolve()
    out_path = Path(args.out).resolve()

    started = time.perf_counter()
    profile = build_profile(
        mode=args.mode,
        include_gpu=args.include_gpu,
        categories=args.benchmark_categories,
        temp_root=temp_root,
    )
    safe = sanitize_obj(profile)
    validate_profile(safe)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_out = out_path.with_suffix(out_path.suffix + ".tmp")
    tmp_out.write_text(json.dumps(safe, indent=2), encoding="utf-8")
    os.replace(tmp_out, out_path)
    elapsed = time.perf_counter() - started
    log(
        f"mode={args.mode} wrote {sanitize(str(out_path))} "
        f"(workers={safe['safety']['workers_launched']}, precondition_met={safe['safety']['precondition_met']}, {elapsed:.1f}s)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
