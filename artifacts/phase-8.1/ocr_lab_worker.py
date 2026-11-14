"""Phase 9.10.1 isolated OCR benchmark worker (diagnostic only).

Runs one OCR configuration through the real extraction -> OCR -> structuring
pipeline for a set of fixtures. The production OCR singleton is left untouched:
an experimental PaddleOCR instance is constructed and injected into
``ocr_engine._ocr_instance`` in this process only.

Isolation rules:
  * ``LABLENS_DATA_DIR`` is set to a fresh directory under the approved temp
    root *before* any backend module is imported.
  * every resolved application path is asserted to stay inside that directory.
  * the worker aborts if it would touch the real ``backend/data`` directory.
  * the real database SHA-256 and upload-file count are recorded before and
    after the run and must be unchanged.

Usage (normally invoked by ocr_lab_benchmark.py):
    py -3.12 artifacts/phase-8.1/ocr_lab_worker.py --spec spec.json --out result.json
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import threading
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
ARTIFACT_DIR = ROOT_DIR / "artifacts" / "phase-8.1"
REAL_DATA_DIR = (BACKEND_DIR / "data").resolve()
REAL_UPLOAD_DIR = REAL_DATA_DIR / "uploads"
DEFAULT_TEMP_ROOT = Path(
    os.environ.get(
        "LABLENS_LAB_TEMP_ROOT",
        str(Path(os.environ.get("TEMP", r"C:\Users\sureshr\AppData\Local\Temp")) / "opencode" / "lablens-phase9101"),
    )
).resolve()


class IsolationError(RuntimeError):
    pass


class MemoryGuardError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def real_state_snapshot() -> dict[str, Any]:
    """Read-only snapshot of the real application data directory."""
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


def assert_inside(path: Path, parent: Path, label: str) -> None:
    resolved = path.resolve()
    if not resolved.is_relative_to(parent):
        raise IsolationError(f"{label} resolved outside isolated root: {resolved} (root {parent})")


def assert_not_real_data(path: Path, label: str) -> None:
    resolved = path.resolve()
    if resolved == REAL_DATA_DIR or resolved.is_relative_to(REAL_DATA_DIR):
        raise IsolationError(f"{label} resolves into the real application data directory: {resolved}")


def resolve_spec_paths(spec: dict[str, Any], temp_root: Path) -> None:
    derived_root = (temp_root / "fixtures").resolve()
    for fixture in spec["fixtures"]:
        source = Path(fixture["path"]).resolve()
        fixture["path"] = str(source)
        assert_not_real_data(source, f"fixture {fixture['key']}")
        if source.is_relative_to(temp_root):
            assert_inside(source, derived_root, f"derived fixture {fixture['key']}")
        if not source.is_file():
            raise FileNotFoundError(f"Fixture not found: {source}")
        gt = Path(fixture["ground_truth"]).resolve()
        fixture["ground_truth"] = str(gt)
        assert_not_real_data(gt, f"ground truth {fixture['key']}")
        if not gt.is_file():
            raise FileNotFoundError(f"Ground truth not found: {gt}")


class MemorySampler(threading.Thread):
    def __init__(self, interval: float = 0.05) -> None:
        super().__init__(daemon=True)
        self.interval = interval
        self.stop_event = threading.Event()
        self.peak_rss = 0
        self.min_available = 1 << 62
        self.samples = 0
        self.error: Optional[str] = None

    def run(self) -> None:  # pragma: no cover - timing thread
        import psutil

        process = psutil.Process()
        while not self.stop_event.is_set():
            try:
                self.peak_rss = max(self.peak_rss, process.memory_info().rss)
                self.min_available = min(self.min_available, psutil.virtual_memory().available)
                self.samples += 1
            except Exception as exc:  # pragma: no cover - defensive
                self.error = str(exc)
                return
            time.sleep(self.interval)

    def stop(self) -> None:
        self.stop_event.set()
        self.join(timeout=2)


def box_bounds(box: Any) -> Optional[list[float]]:
    """Normalise a 4-point polygon or 4-value box to [x0, y0, x1, y1]."""
    if box is None:
        return None
    if hasattr(box, "tolist"):
        box = box.tolist()
    if not isinstance(box, (list, tuple)) or not box:
        return None
    try:
        if isinstance(box[0], (list, tuple)):
            xs = [float(point[0]) for point in box if isinstance(point, (list, tuple)) and len(point) >= 2]
            ys = [float(point[1]) for point in box if isinstance(point, (list, tuple)) and len(point) >= 2]
        elif len(box) == 4:
            xs = [float(box[0]), float(box[2])]
            ys = [float(box[1]), float(box[3])]
        else:
            return None
    except (TypeError, ValueError):
        return None
    if not xs or not ys:
        return None
    return [min(xs), min(ys), max(xs), max(ys)]


def overlaps(left: list[float], right: list[float]) -> float:
    width = min(left[2], right[2]) - max(left[0], right[0])
    height = min(left[3], right[3]) - max(left[1], right[1])
    if width <= 0 or height <= 0:
        return 0.0
    return width * height


def evaluate_source_bboxes(
    measurements: list[dict[str, Any]], pages: list[dict[str, Any]], ocr_items_by_page: dict[int, list[dict]]
) -> list[dict[str, Any]]:
    results = []
    for measurement in measurements:
        bbox = box_bounds(measurement.get("source_bbox"))
        page_number = measurement.get("page_number")
        page = next((p for p in pages if p["page_number"] == page_number), None)
        record: dict[str, Any] = {
            "test": measurement.get("test_name_normalized"),
            "page": page_number,
            "bbox": bbox,
            "source_text": measurement.get("source_text"),
        }
        if bbox is None:
            record.update({"valid_box": False, "within_page": False, "overlaps_ocr_line": False})
            results.append(record)
            continue
        finite = all(isinstance(v, float) and v == v and abs(v) != float("inf") for v in bbox)
        record["valid_box"] = bool(finite and bbox[2] > bbox[0] and bbox[3] > bbox[1])
        if page is not None and page.get("effective_width") is not None and page.get("effective_height") is not None:
            width = float(page["effective_width"])
            height = float(page["effective_height"])
            tolerance = 2.0
            record["within_page"] = bool(
                bbox[0] >= -tolerance
                and bbox[1] >= -tolerance
                and bbox[2] <= width + tolerance
                and bbox[3] <= height + tolerance
            )
        else:
            record["within_page"] = None
        items = ocr_items_by_page.get(int(page_number or 0), [])
        item_bounds = [bounds for bounds in (box_bounds(item.get("bbox")) for item in items) if bounds]
        record["ocr_line_count"] = len(item_bounds)
        record["overlaps_ocr_line"] = any(overlaps(bbox, bounds) > 0 for bounds in item_bounds) if item_bounds else None
        if item_bounds:
            record["max_overlap_ratio"] = round(
                max(overlaps(bbox, bounds) for bounds in item_bounds) / max(1e-9, (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])),
                4,
            )
        results.append(record)
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    spec_path = Path(args.spec).resolve()
    out_path = Path(args.out).resolve()
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    temp_root = Path(spec.get("temp_root", DEFAULT_TEMP_ROOT)).resolve()
    run_root = (temp_root / "workers" / spec["run_id"]).resolve()
    data_dir = (run_root / "data").resolve()

    result: dict[str, Any] = {
        "ok": False,
        "label": spec.get("label"),
        "run_id": spec.get("run_id"),
        "started_at": utc_now(),
        "spec": spec,
    }

    try:
        assert_inside(run_root, temp_root, "worker run root")
        assert_not_real_data(run_root, "worker run root")
        for directory in (data_dir, data_dir / "uploads", data_dir / "tmp"):
            directory.mkdir(parents=True, exist_ok=True)

        # Isolation must be configured before app.config is imported.
        os.environ["LABLENS_DATA_DIR"] = str(data_dir)
        sys.path.insert(0, str(ARTIFACT_DIR))
        sys.path.insert(0, str(BACKEND_DIR))

        import psutil

        before = real_state_snapshot()
        result["real_data_before"] = before

        from app.config import settings

        resolved_data_dir = settings.data_dir.resolve()
        resolved_db = settings.db_path.resolve()
        resolved_uploads = settings.uploads_dir.resolve()
        assert_inside(resolved_data_dir, run_root, "settings.data_dir")
        assert_inside(resolved_db, data_dir, "settings.db_path")
        assert_inside(resolved_uploads, data_dir, "settings.uploads_dir")
        assert_not_real_data(resolved_data_dir, "settings.data_dir")
        if resolved_data_dir != data_dir:
            raise IsolationError(f"unexpected isolated data dir: {resolved_data_dir}")

        result["isolation"] = {
            "temp_root": str(temp_root),
            "run_root": str(run_root),
            "data_dir": str(resolved_data_dir),
            "db_path": str(resolved_db),
            "uploads_dir": str(resolved_uploads),
            "real_data_dir": str(REAL_DATA_DIR),
            "real_data_bypassed": True,
        }

        resolve_spec_paths(spec, temp_root)

        from app.database import get_connection, init_db

        init_db()

        # Import OCR runtime pieces exactly like production does.
        from unittest.mock import MagicMock

        if "pypdfium2" not in sys.modules:
            sys.modules["pypdfium2"] = MagicMock()

        import paddle
        import paddleocr

        from app.services import extraction_service, ocr_engine
        from app.services.measurement_service import get_measurements, structure_report
        from app.services.report_service import create_report
        from fastapi import UploadFile
        from accuracy_evaluator import evaluate_fixture, evaluate_page_attribution

        sampler = MemorySampler()
        baseline_available = psutil.virtual_memory().available
        sampler.start()

        init_kwargs: dict[str, Any] = {
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
            "lang": "en",
            "enable_mkldnn": False,
            "text_det_limit_side_len": 1280,
            "text_det_limit_type": "max",
        }
        if spec.get("cpu_threads") is not None:
            init_kwargs["cpu_threads"] = int(spec["cpu_threads"])
        if spec.get("text_recognition_batch_size") is not None:
            init_kwargs["text_recognition_batch_size"] = int(spec["text_recognition_batch_size"])
        if spec.get("device") is not None:
            init_kwargs["device"] = str(spec["device"])

        from paddleocr import PaddleOCR

        init_started = time.perf_counter()
        instance = PaddleOCR(**init_kwargs)
        init_seconds = time.perf_counter() - init_started
        # In-process experiment only; the production singleton was never used.
        ocr_engine._ocr_instance = instance

        common_args = getattr(instance, "_common_args", {}) or {}
        merged = getattr(instance, "_merged_paddlex_config", None)
        if hasattr(merged, "to_dict"):
            merged = merged.to_dict()

        def walk_config(obj: Any, prefix: str = "") -> dict[str, Any]:
            found: dict[str, Any] = {}
            if isinstance(obj, dict):
                for key, value in obj.items():
                    path = f"{prefix}.{key}" if prefix else str(key)
                    if any(
                        token in str(key).lower()
                        for token in ("batch_size", "limit_side_len", "limit_type", "model_name", "cpu_threads", "enable_mkldnn")
                    ) and not isinstance(value, (dict, list)):
                        found[path] = value
                    found.update(walk_config(value, path))
            elif isinstance(obj, list):
                for index, value in enumerate(obj[:3]):
                    found.update(walk_config(value, f"{prefix}[{index}]"))
            return found

        effective_config = walk_config(merged) if merged is not None else {}

        result["environment"] = {
            "python": sys.version,
            "paddle_version": paddle.__version__,
            "paddleocr_version": getattr(paddleocr, "__version__", None),
            "is_compiled_with_cuda": bool(paddle.device.is_compiled_with_cuda()),
            "device": paddle.device.get_device(),
            "cpu_count_logical": psutil.cpu_count(logical=True),
            "cpu_count_physical": psutil.cpu_count(logical=False),
            "system_ram_total_bytes": psutil.virtual_memory().total,
            "available_bytes_at_start": baseline_available,
        }
        result["model"] = {
            "init_seconds": round(init_seconds, 4),
            "init_kwargs": init_kwargs,
            "common_args": common_args,
            "effective_config": effective_config,
            "model_cache_dir": str(Path.home() / ".paddlex" / "official_models"),
        }

        # Instrument OCR calls while keeping the production function untouched.
        original_ocr_image = ocr_engine.ocr_image
        ocr_calls: list[dict[str, Any]] = []

        def instrumented_ocr_image(image_path: str) -> list[dict[str, Any]]:
            started = time.perf_counter()
            items = original_ocr_image(image_path)
            duration = time.perf_counter() - started
            name = Path(str(image_path)).name
            page_number = None
            if name.startswith("page_") and name.endswith(".png"):
                try:
                    page_number = int(name[len("page_") : -len(".png")]) + 1
                except ValueError:
                    page_number = None
            ocr_calls.append(
                {
                    "image_name": name,
                    "inferred_page": page_number,
                    "seconds": round(duration, 4),
                    "item_count": len(items),
                    "items": items,
                }
            )
            return items

        extraction_service.ocr_image = instrumented_ocr_image

        fixtures_out: list[dict[str, Any]] = []
        abort_reason = None
        min_available = int(spec.get("min_available_bytes", 250 * 1024 * 1024))

        for fixture in spec["fixtures"]:
            available = psutil.virtual_memory().available
            if available < min_available:
                abort_reason = (
                    f"aborted before {fixture['key']}: available RAM {available / 1048576:.1f} MB "
                    f"below guard {min_available / 1048576:.1f} MB"
                )
                break

            path = Path(fixture["path"])
            raw = path.read_bytes()
            upload = UploadFile(file=io.BytesIO(raw), filename=fixture.get("filename") or path.name)
            calls_before = len(ocr_calls)

            upload_started = time.perf_counter()
            report = create_report(upload, consent=True, consent_timestamp=None)
            upload_seconds = time.perf_counter() - upload_started

            report_id = report.id
            extraction_started = time.perf_counter()
            extraction = extraction_service.extract_report(report_id)
            extraction_seconds = time.perf_counter() - extraction_started

            structure_started = time.perf_counter()
            structure_report(report_id)
            structure_seconds = time.perf_counter() - structure_started

            measurements = get_measurements(report_id)
            with get_connection() as conn:
                page_rows = conn.execute(
                    "SELECT page_number, extraction_method, raw_text, extraction_metadata, "
                    "page_width, page_height, text_detection_metadata FROM page_extractions "
                    "WHERE report_id = ? ORDER BY page_number",
                    (report_id,),
                ).fetchall()

            pages: list[dict[str, Any]] = []
            ocr_items_by_page: dict[int, list[dict[str, Any]]] = {}
            for row in page_rows:
                metadata = json.loads(row["extraction_metadata"]) if row["extraction_metadata"] else {}
                warnings = json.loads(row["text_detection_metadata"]).get("warnings", []) if row["text_detection_metadata"] else []
                items = metadata.get("ocr_items") or []
                ocr_items_by_page[int(row["page_number"])] = items
                quality = metadata.get("quality") or {}
                pages.append(
                    {
                        "page_number": int(row["page_number"]),
                        "extraction_method": row["extraction_method"],
                        "raw_text": row["raw_text"],
                        "raw_text_length": len(row["raw_text"] or ""),
                        "page_width": row["page_width"],
                        "page_height": row["page_height"],
                        "effective_width": row["page_width"] or quality.get("width"),
                        "effective_height": row["page_height"] or quality.get("height"),
                        "ocr_item_count": len(items),
                        "quality": metadata.get("quality"),
                        "variant": metadata.get("variant"),
                        "warnings": warnings,
                    }
                )

            ground_truth = json.loads(Path(fixture["ground_truth"]).read_text(encoding="utf-8"))
            accuracy = evaluate_fixture(ground_truth, measurements)
            attribution = evaluate_page_attribution(ground_truth, measurements)
            bbox_checks = evaluate_source_bboxes(measurements, pages, ocr_items_by_page)

            fixture_calls = ocr_calls[calls_before:]
            fixtures_out.append(
                {
                    "key": fixture["key"],
                    "category": fixture.get("category"),
                    "filename": upload.filename,
                    "path": str(path),
                    "file_size_bytes": len(raw),
                    "file_sha256": hashlib.sha256(raw).hexdigest(),
                    "report_id": report_id,
                    "upload_seconds": round(upload_seconds, 4),
                    "extraction_seconds": round(extraction_seconds, 4),
                    "structure_seconds": round(structure_seconds, 4),
                    "total_seconds": round(upload_seconds + extraction_seconds + structure_seconds, 4),
                    "extraction_status": extraction.get("status"),
                    "warnings": extraction.get("warnings", []),
                    "pages": pages,
                    "ocr_call_count": len(fixture_calls),
                    "ocr_seconds_total": round(sum(call["seconds"] for call in fixture_calls), 4),
                    "ocr_calls": [
                        {
                            "image_name": call["image_name"],
                            "inferred_page": call["inferred_page"],
                            "seconds": call["seconds"],
                            "item_count": call["item_count"],
                        }
                        for call in fixture_calls
                    ],
                    "measurements": measurements,
                    "accuracy": accuracy,
                    "page_attribution": attribution,
                    "source_bboxes": bbox_checks,
                }
            )

        sampler.stop()
        result["fixtures"] = fixtures_out
        result["abort_reason"] = abort_reason
        result["memory"] = {
            "peak_process_rss_bytes": sampler.peak_rss,
            "peak_process_rss_mb": round(sampler.peak_rss / 1048576, 1),
            "min_system_available_bytes": sampler.min_available if sampler.samples else None,
            "min_system_available_mb": round(sampler.min_available / 1048576, 1) if sampler.samples else None,
            "samples": sampler.samples,
            "sampler_error": sampler.error,
        }
        result["finished_at"] = utc_now()
        result["real_data_after"] = real_state_snapshot()
        result["real_data_unchanged"] = (
            result["real_data_after"].get("db_sha256") == before.get("db_sha256")
            and result["real_data_after"].get("upload_file_count") == before.get("upload_file_count")
        )
        result["ok"] = abort_reason is None
        if not result["real_data_unchanged"]:
            raise IsolationError("real application data changed during the isolated benchmark run")

    except Exception as exc:  # pragma: no cover - defensive
        result["error"] = f"{type(exc).__name__}: {exc}"
        result["traceback"] = traceback.format_exc()
        result["finished_at"] = utc_now()
        try:
            result["real_data_after"] = real_state_snapshot()
        except Exception:
            pass

    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_out = out_path.with_suffix(out_path.suffix + ".tmp")
    tmp_out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    os.replace(tmp_out, out_path)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
