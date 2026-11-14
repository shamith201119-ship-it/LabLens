"""Adaptive OCR runtime configuration (Phase 9.10.3).

Resolves which execution device and pipeline configuration LabLens should use,
then records what actually produced the result. This module is deliberately
free of web-framework and database dependencies so it can be imported from any
service and exercised in unit tests without touching the app.

Environment variables
---------------------
``LABLENS_OCR_DEVICE``
    ``auto`` (default) | ``cpu`` | ``gpu``.
    ``auto``: use GPU only if PaddlePaddle is CUDA-enabled, reports at least
        one GPU device and a PaddleOCR GPU pipeline initializes successfully;
        otherwise fall back to CPU with a recorded reason.
    ``cpu``: never initialize a GPU pipeline.
    ``gpu``: attempt GPU, keep CPU fallback so the app stays usable.

``LABLENS_OCR_CPU_THREADS``
    Optional diagnostic override for the adaptive CPU thread count.

``LABLENS_OCR_RECOGNITION_BATCH_SIZE``
    Optional diagnostic override for the adaptive CPU recognition batch size.

``LABLENS_OCR_GPU_RECOGNITION_BATCH_SIZE``
    Optional diagnostic override for the GPU recognition batch size.

Design notes
------------
* An NVIDIA graphics card alone never qualifies as a usable OCR GPU; the
  gate is the Paddle runtime + a real pipeline construction.
* Everything is lazy and cached per process (singleton behaviour preserved).
* CPU thread count never exceeds available logical cores.
* The adaptive CPU heuristic is a documented floor, NOT a claim of being
  optimal on untested hardware; Phase 9.10.1 evidence applies to this machine
  (2P/4L Intel i3-1005G1, 8 GiB): threads=4, recognition batch=1.
* No machine identifiers, usernames or paths are recorded in metadata.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import threading
from typing import Any, Optional

MODE_AUTO = "auto"
MODE_CPU = "cpu"
MODE_GPU = "gpu"
_VALID_MODES = (MODE_AUTO, MODE_CPU, MODE_GPU)

DETECTION_LIMIT_SIDE_LEN = 1280
DETECTION_LIMIT_TYPE = "max"
PRECISION = "fp32"
MKL_DNN_ENABLED = False
DETECTION_MODEL = "PP-OCRv6_medium_det"
RECOGNITION_MODEL = "PP-OCRv6_medium_rec"

_SELECTION_LOCK = threading.Lock()
_SELECTION: Optional[dict[str, Any]] = None
_GPU_DISABLED = False
_GPU_DISABLED_REASON: Optional[str] = None
_LAST_EXECUTION: Optional[dict[str, Any]] = None


# ---------------------------------------------------------------- helpers

def _sanitize_reason(value: Any) -> str:
    """Return a single-line, path-free reason safe for metadata/logs."""
    if value is None:
        return "unknown error"
    text = str(value).strip().splitlines()[0] if str(value).strip() else "unknown error"
    # Collapse absolute paths (Windows or POSIX) into a generic placeholder.
    text = re.sub(r"[A-Za-z]:\\[^\s'\"<>]+", "<path>", text)
    text = re.sub(r"(?:/[^/\s'\"<>]+){2,}", "<path>", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:160]


def _logical_cores() -> int:
    try:
        import psutil

        return int(psutil.cpu_count(logical=True) or 1)
    except Exception:
        return 1


def _physical_cores() -> Optional[int]:
    try:
        import psutil

        count = psutil.cpu_count(logical=False)
        return int(count) if count else None
    except Exception:
        return None


def _total_memory_bytes() -> Optional[int]:
    try:
        import psutil

        return int(psutil.virtual_memory().total)
    except Exception:
        return None


def _nvidia_vram_bytes() -> Optional[int]:
    """Best-effort VRAM discovery; never raises. None = unknown."""
    try:
        if not shutil.which("nvidia-smi"):
            return None
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        for line in (result.stdout or "").splitlines():
            parts = [p.strip() for p in line.split(",") if p.strip()]
            if parts:
                mib = float(parts[0])
                if mib > 0:
                    return int(mib * 1024 * 1024)
    except Exception:
        pass
    return None


def _probe_paddle() -> dict[str, Any]:
    """Cheap runtime probe; never raises. Separates hardware from runtime."""
    probe: dict[str, Any] = {
        "compiled_with_cuda": False,
        "devices": [],
        "gpu_error": None,
        "probe_error": None,
        "vram_bytes": None,
    }
    try:
        import paddle

        probe["compiled_with_cuda"] = bool(paddle.device.is_compiled_with_cuda())
        if probe["compiled_with_cuda"]:
            try:
                probe["devices"] = [str(d) for d in (paddle.device.get_available_device() or [])]
            except Exception as exc:  # pragma: no cover - defensive
                probe["devices"] = []
                probe["probe_error"] = _sanitize_reason(exc)
            try:
                paddle.set_device("gpu")
                paddle.set_device("cpu")
            except Exception as exc:
                probe["gpu_error"] = _sanitize_reason(exc)
            if probe["devices"]:
                probe["vram_bytes"] = _nvidia_vram_bytes()
    except Exception as exc:  # paddle import itself failed
        probe["probe_error"] = _sanitize_reason(exc)
    return probe


def _requested_mode() -> str:
    mode = (os.environ.get("LABLENS_OCR_DEVICE") or MODE_AUTO).strip().lower()
    return mode if mode in _VALID_MODES else MODE_AUTO


def _int_env(name: str) -> Optional[int]:
    raw = os.environ.get(name)
    if raw is None:
        return None
    try:
        value = int(raw.strip())
    except (ValueError, TypeError):
        return None
    return value if value >= 1 else None


def _gpu_batch(vram_bytes: Optional[int]) -> int:
    """Conservative starting batch for GPU; real tuning needs benchmarking."""
    override = _int_env("LABLENS_OCR_GPU_RECOGNITION_BATCH_SIZE")
    if override is not None:
        return override
    gib = 1024**3
    if vram_bytes is None:
        return 2
    if vram_bytes >= 8 * gib:
        return 6
    if vram_bytes >= 4 * gib:
        return 4
    return 2


def _adaptive_cpu_profile(logical: int, physical: Optional[int], total_memory: Optional[int]) -> tuple[int, int]:
    """Conservative floor; never exceeds logical cores; memory-conscious batch.

    Phase 9.10.1 (2P/4L, 8 GiB) measured threads=4 / batch=1 with bit-identical
    accuracy. That result is machine-specific evidence, not a portable constant.
    """
    if logical <= 1:
        threads = 1
    elif logical <= 4:
        threads = logical
    else:
        threads = 4
    # Low-total-memory machines get extra conservatism.
    if total_memory is not None and total_memory < 3 * 1024**3:
        threads = min(threads, 2)
    threads = max(1, min(threads, logical))  # hard cap: never oversubscribe

    if logical <= 4 or (total_memory is not None and total_memory < 8 * 1024**3):
        batch = 1
    else:
        batch = 2  # untested heuristic above 8 logical cores / 8 GiB
    return threads, min(batch, 6)


def adaptive_cpu_profile() -> dict[str, Any]:
    """Exposed for tests and diagnostics; reflects this machine, not defaults."""
    logical = _logical_cores()
    physical = _physical_cores()
    total_memory = _total_memory_bytes()
    threads, batch = _adaptive_cpu_profile(logical, physical, total_memory)

    overrides: list[str] = []
    thread_override = _int_env("LABLENS_OCR_CPU_THREADS")
    if thread_override is not None:
        threads = max(1, min(thread_override, logical))  # override may not oversubscribe either
        overrides.append(f"LABLENS_OCR_CPU_THREADS={threads}")
    batch_override = _int_env("LABLENS_OCR_RECOGNITION_BATCH_SIZE")
    if batch_override is not None:
        batch = max(1, min(batch_override, 6))
        overrides.append(f"LABLENS_OCR_RECOGNITION_BATCH_SIZE={batch}")

    return {
        "cpu_threads": threads,
        "text_recognition_batch_size": batch,
        "logical_cores": logical,
        "physical_cores": physical,
        "total_memory_bytes": total_memory,
        "overrides": overrides,
    }


# ------------------------------------------------------------ probe/selection

def probe_paddle() -> dict[str, Any]:
    """Public seam for tests; wrap of _probe_paddle with VRAM discovery."""
    return _probe_paddle()


def _probe_selection() -> dict[str, Any]:
    mode = _requested_mode()
    cpu_profile = adaptive_cpu_profile()

    selection: dict[str, Any] = {
        "mode": mode,
        "requested": mode,
        "device": MODE_CPU,
        "selected_reason": "explicit_cpu" if mode == MODE_CPU else None,
        "cpu_threads": cpu_profile["cpu_threads"],
        "text_recognition_batch_size": cpu_profile["text_recognition_batch_size"],
        "gpu_recognition_batch_size": None,
        "vram_bytes": None,
        "models": {"detection": DETECTION_MODEL, "recognition": RECOGNITION_MODEL},
        "detection_limit_side_len": DETECTION_LIMIT_SIDE_LEN,
        "detection_limit_type": DETECTION_LIMIT_TYPE,
        "precision": PRECISION,
        "mkl_dnn_enabled": MKL_DNN_ENABLED,
        "fallback_occurred": False,
        "fallback_reason": None,
        "overrides": cpu_profile["overrides"],
        "hardware": {
            "logical_cores": cpu_profile["logical_cores"],
            "physical_cores": cpu_profile["physical_cores"],
            "total_memory_bytes": cpu_profile["total_memory_bytes"],
        },
    }

    if mode == MODE_CPU:
        return selection

    probe = probe_paddle()
    selection["vram_bytes"] = probe.get("vram_bytes")
    gpu_batch = _gpu_batch(selection["vram_bytes"])
    selection["gpu_recognition_batch_size"] = gpu_batch

    if not probe["compiled_with_cuda"]:
        selection["selected_reason"] = "paddle_not_compiled_with_cuda"
        return selection
    if probe.get("probe_error"):
        selection["selected_reason"] = f"paddle_gpu_probe_failed: {probe['probe_error']}"
        return selection
    if not probe["devices"]:
        selection["selected_reason"] = "no_paddle_gpu_devices"
        return selection
    if probe.get("gpu_error"):
        selection["selected_reason"] = f"paddle_gpu_set_device_failed: {probe['gpu_error']}"
        return selection

    selection["device"] = MODE_GPU
    selection["selected_reason"] = "gpu_ready" if mode == MODE_AUTO else "explicit_gpu"
    selection["cpu_threads"] = None  # Paddle manages GPU compute threading
    selection["text_recognition_batch_size"] = gpu_batch
    return selection


def resolve_selection() -> dict[str, Any]:
    """Cached per process; computes the device selection lazily."""
    global _SELECTION
    with _SELECTION_LOCK:
        if _SELECTION is None:
            _SELECTION = _probe_selection()
        return dict(_SELECTION)


def current_selection() -> dict[str, Any]:
    """Copy of the cached selection (resolves on first call)."""
    return resolve_selection()


def gpu_disabled() -> bool:
    return _GPU_DISABLED


def mark_gpu_failed(exc: Any, kind: str = "init") -> dict[str, Any]:
    """Disable GPU for this process and return the CPU-fallback selection.

    Called exactly once per failure burst; the global flag ensures subsequent
    OCR calls go straight to CPU without re-attempting GPU.
    """
    global _GPU_DISABLED, _GPU_DISABLED_REASON, _SELECTION
    reason = _sanitize_reason(exc)
    with _SELECTION_LOCK:
        if not _GPU_DISABLED:
            _GPU_DISABLED = True
            _GPU_DISABLED_REASON = reason
        if _SELECTION is not None:
            _SELECTION = dict(_SELECTION)
            _SELECTION["device"] = MODE_CPU
            _SELECTION["selected_reason"] = (
                "gpu_init_failed" if kind == "init" else "gpu_inference_failed"
            )
            _SELECTION["fallback_occurred"] = True
            _SELECTION["fallback_reason"] = f"{type(exc).__name__}: {reason}" if reason else type(exc).__name__
            cpu_profile = adaptive_cpu_profile()
            _SELECTION["cpu_threads"] = cpu_profile["cpu_threads"]
            _SELECTION["text_recognition_batch_size"] = cpu_profile["text_recognition_batch_size"]
        return dict(_SELECTION) if _SELECTION is not None else {}


def record_execution(selection: dict[str, Any], *, fallback: bool = False) -> None:
    """Record what actually produced the most recent OCR result."""
    global _LAST_EXECUTION
    effective_device = "cpu" if fallback or selection.get("device") == MODE_CPU else MODE_GPU
    _LAST_EXECUTION = {
        "requested": selection.get("requested"),
        "device": effective_device,
        "selection_reason": selection.get("selected_reason"),
        "cpu_threads": selection.get("cpu_threads") if effective_device == MODE_CPU else None,
        "text_recognition_batch_size": selection.get("text_recognition_batch_size"),
        "models": selection.get("models"),
        "detection_limit_side_len": selection.get("detection_limit_side_len"),
        "detection_limit_type": selection.get("detection_limit_type"),
        "precision": selection.get("precision"),
        "mkl_dnn_enabled": selection.get("mkl_dnn_enabled"),
        "fallback_occurred": bool(fallback) or bool(selection.get("fallback_occurred")),
        "fallback_reason": selection.get("fallback_reason"),
        "vram_bytes": selection.get("vram_bytes"),
    }


def get_last_execution() -> Optional[dict[str, Any]]:
    """Metadata for the most recent OCR call; None before any OCR runs."""
    return dict(_LAST_EXECUTION) if _LAST_EXECUTION else None


def digital_execution_metadata() -> dict[str, Any]:
    """Metadata marker for pages that bypassed OCR entirely."""
    return {
        "requested": _requested_mode(),
        "device": None,
        "actual": "digital_direct_extraction",
        "selection_reason": None,
        "cpu_threads": None,
        "text_recognition_batch_size": None,
        "models": None,
        "detection_limit_side_len": None,
        "detection_limit_type": None,
        "precision": None,
        "mkl_dnn_enabled": None,
        "fallback_occurred": False,
        "fallback_reason": None,
    }


def reset_runtime() -> None:
    """Test/diagnostic hook: clear the process cache entirely."""
    global _SELECTION, _GPU_DISABLED, _GPU_DISABLED_REASON, _LAST_EXECUTION
    with _SELECTION_LOCK:
        _SELECTION = None
        _GPU_DISABLED = False
        _GPU_DISABLED_REASON = None
        _LAST_EXECUTION = None
