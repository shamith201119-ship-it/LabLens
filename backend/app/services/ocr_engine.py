"""Adaptive OCR runtime for the production pipeline (Phase 9.10.3).

Preserves the historical public surface (``get_ocr``, ``ocr_image``,
``_ocr_instance``) while adding:

* lazy, environment-driven device selection (``LABLENS_OCR_DEVICE``),
* a conservative adaptive CPU pipeline (threads/batch never oversubscribe),
* one-shot CPU retry of the same image when GPU inference fails,
* process-wide GPU disable after the first GPU failure,
* per-call execution metadata via ``app.services.ocr_runtime``.

Nothing about the detector resolution (1280px max), the PP-OCRv6 Medium
models, FP32 precision or the MKL-DNN=off setting changed. The direct
digital-PDF extraction path is untouched.
"""

import os
import threading
from typing import Any, Optional

# Disable oneDNN to avoid the ConvertPirAttribute2RuntimeAttribute crash on Windows CPU.
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_enable_pir_api", "0")

from app.services import ocr_runtime

_ocr_instance: Optional[Any] = None
_current_selection: Optional[dict[str, Any]] = None
# Re-entrant: get_selection() may call get_ocr() while holding the lock.
_engine_lock = threading.RLock()


def _common_init_kwargs() -> dict[str, Any]:
    return {
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": False,
        "lang": "en",
        "enable_mkldnn": False,
        "text_det_limit_side_len": ocr_runtime.DETECTION_LIMIT_SIDE_LEN,
        "text_det_limit_type": ocr_runtime.DETECTION_LIMIT_TYPE,
    }


def _create_ocr_instance(device: str, selection: dict[str, Any]):
    """Construct a real PaddleOCR pipeline for the selected device."""
    import sys
    from unittest.mock import MagicMock

    # Prevent paddlex from importing pypdfium2, which causes a Windows C-runtime
    # access violation collision with PyMuPDF (fitz). PaddleOCR uses PaddleX for
    # image inference only.
    if "pypdfium2" not in sys.modules:
        sys.modules["pypdfium2"] = MagicMock()

    from paddleocr import PaddleOCR

    kwargs = _common_init_kwargs()
    if device == "gpu":
        kwargs["device"] = "gpu"
        kwargs["text_recognition_batch_size"] = (
            selection.get("gpu_recognition_batch_size") or selection.get("text_recognition_batch_size") or 2
        )
    else:
        kwargs["cpu_threads"] = selection.get("cpu_threads") or ocr_runtime.adaptive_cpu_profile()["cpu_threads"]
        kwargs["text_recognition_batch_size"] = (
            selection.get("text_recognition_batch_size") or ocr_runtime.adaptive_cpu_profile()["text_recognition_batch_size"]
        )
    instance = PaddleOCR(**kwargs)
    # Diagnostic-only tag; not read by production logic.
    try:
        instance._lablens_device = device
    except Exception:  # pragma: no cover - defensive
        pass
    return instance


def _build_locked():
    """Caller must hold ``_engine_lock``. Constructs the selected pipeline."""
    selection = ocr_runtime.resolve_selection()
    if selection["device"] == "gpu":
        try:
            instance = _create_ocr_instance("gpu", selection)
        except Exception as exc:
            cpu_selection = ocr_runtime.mark_gpu_failed(exc, kind="init")
            instance = _create_ocr_instance("cpu", cpu_selection)
    else:
        instance = _create_ocr_instance("cpu", selection)
    selection = ocr_runtime.current_selection()
    return instance, selection


def get_ocr():
    global _ocr_instance, _current_selection
    with _engine_lock:
        if _ocr_instance is None:
            _ocr_instance, _current_selection = _build_locked()
        return _ocr_instance


def get_selection() -> dict[str, Any]:
    """Expose the resolved selection (used by tests and diagnostics)."""
    with _engine_lock:
        if _current_selection is None:
            if _ocr_instance is None:
                get_ocr()
            else:
                return ocr_runtime.current_selection()
        return dict(_current_selection) if _current_selection else ocr_runtime.current_selection()


def _switch_to_cpu_after_gpu_inference_failure(exc: Exception):
    """Replace the process pipeline with CPU after a GPU inference failure."""
    global _ocr_instance, _current_selection
    with _engine_lock:
        if ocr_runtime.gpu_disabled() and _current_selection and _current_selection.get("device") == "cpu":
            return _ocr_instance
        cpu_selection = ocr_runtime.mark_gpu_failed(exc, kind="inference")
        _ocr_instance = _create_ocr_instance("cpu", cpu_selection)
        _current_selection = ocr_runtime.current_selection()
        return _ocr_instance


def _parse_items(result: Any) -> list[dict]:
    """Parse PaddleOCR output into {text, confidence, bbox} dicts."""
    items = []
    if not result:
        return items
    for page in result:
        if not page:
            continue
        # PaddleOCR 3.x returns dict-like
        if isinstance(page, dict):
            texts = page.get("rec_texts", [])
            scores = page.get("rec_scores", [])
            boxes = page.get("rec_polys", []) or page.get("rec_boxes", [])
            for i, t in enumerate(texts):
                box = boxes[i]
                if hasattr(box, "tolist"):
                    box = box.tolist()
                items.append(
                    {
                        "text": str(t),
                        "confidence": float(scores[i]) if i < len(scores) else None,
                        "bbox": box,
                    }
                )
        else:
            # older list format
            for line in page:
                if not line:
                    continue
                bbox = line[0]
                if hasattr(bbox, "tolist"):
                    bbox = bbox.tolist()
                text, conf = line[1]
                items.append({"text": str(text), "confidence": float(conf), "bbox": bbox})
    return items


def ocr_image(image_path: str) -> list[dict]:
    """Run OCR on an image file. Returns list of {text, confidence, bbox}.

    GPU failures trigger exactly one CPU retry of the same image; afterwards
    GPU is disabled for the process and all later calls use CPU. CPU failures
    propagate unchanged to the caller.
    """
    engine = get_ocr()
    selection = ocr_runtime.current_selection()

    if selection.get("device") == "gpu" and not ocr_runtime.gpu_disabled():
        try:
            items = _parse_items(engine.ocr(image_path))
            ocr_runtime.record_execution(selection, fallback=False)
            return items
        except Exception as exc:
            cpu_engine = _switch_to_cpu_after_gpu_inference_failure(exc)
            # Exactly one retry of the same image on CPU.
            items = _parse_items(cpu_engine.ocr(image_path))
            ocr_runtime.record_execution(ocr_runtime.current_selection(), fallback=True)
            return items

    items = _parse_items(engine.ocr(image_path))
    ocr_runtime.record_execution(selection, fallback=False)
    return items
