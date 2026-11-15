"""Phase 9.6.1 controlled OCR detector-resize experiment.

Compares the production detector limits (64 / min / 4000) against a temporary
in-process pipeline using 1280 / max / 4000. Runs the real extraction path once
per fixture and keeps all measurements in an isolated data directory.

Run from the repository root:
    py -3.12 docs/development/phase-8.1/ocr_resize_1280_experiment.py
"""

from __future__ import annotations

import importlib.metadata as metadata
import json
import os
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
SCRIPT_DIR = Path(__file__).resolve().parent
FIXTURE_DIR_81 = BACKEND_DIR / "tests" / "fixtures" / "phase8_1_accuracy"
FIXTURE_DIR_95 = BACKEND_DIR / "tests" / "fixtures" / "phase9_5"
DATA_DIR = Path(
    r"C:\Users\sureshr\AppData\Local\Temp\opencode\lablens-phase961-resize1280"
)
RESULTS_PATH = SCRIPT_DIR / "OCR_RESIZE_1280_RESULTS.json"
BASELINE_PATH = SCRIPT_DIR / "EXTRACTION_PROFILE_RESULTS.json"

if DATA_DIR.exists():
    shutil.rmtree(DATA_DIR)
DATA_DIR.mkdir(parents=True, exist_ok=True)
os.environ["LABLENS_DATA_DIR"] = str(DATA_DIR)

for path in (str(BACKEND_DIR), str(SCRIPT_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

import cv2
import fitz
from fastapi.testclient import TestClient
from paddleocr import PaddleOCR
from paddlex.inference import load_pipeline_config

from accuracy_evaluator import evaluate_fixture, evaluate_page_attribution
from app.database import init_db
from app.main import app
import app.services.extraction_service as extraction_service
import app.services.ocr_engine as ocr_engine

client = TestClient(app)
init_db()

EXPERIMENTAL_LIMIT_SIDE_LEN = 1280
EXPERIMENTAL_LIMIT_TYPE = "max"
MAX_SIDE_LIMIT = 4000

FIXTURES = (
    {
        "filename": "cbc_report.png",
        "path": FIXTURE_DIR_81 / "cbc_report.png",
        "ground_truth": FIXTURE_DIR_81 / "cbc_report.json",
        "media_type": "image/png",
        "expected_pages": 1,
    },
    {
        "filename": "multipage_scanned_report.pdf",
        "path": FIXTURE_DIR_95 / "multipage_scanned_report.pdf",
        "ground_truth": FIXTURE_DIR_95 / "multipage_scanned_report.json",
        "media_type": "application/pdf",
        "expected_pages": 2,
    },
    {
        "filename": "photographed_report.jpg",
        "path": FIXTURE_DIR_95 / "photographed_report.jpg",
        "ground_truth": FIXTURE_DIR_95 / "photographed_report.json",
        "media_type": "image/jpeg",
        "expected_pages": 1,
    },
)

# Baseline measurement boxes recorded for the photographed fixture in Phase 9.5.4.
PHOTO_BASELINE_BBOXES = {
    "Hemoglobin": [289.0, 632.0, 1162.0, 696.0],
    "WBC": [286.0, 779.0, 1079.0, 840.0],
    "Platelet Count": [282.0, 929.0, 1249.0, 994.0],
    "Glucose": [276.0, 1078.0, 1021.0, 1142.0],
    "Creatinine": [272.0, 1228.0, 1091.0, 1295.0],
}

state: dict = {
    "fixture": None,
    "ocr_depth": 0,
    "ocr_call_seq": 0,
    "current_ocr_call": None,
    "events": [],
}


def _record(stage: str, seconds: float, **detail) -> None:
    state["events"].append(
        {
            "fixture": state["fixture"],
            "stage": stage,
            "seconds": round(float(seconds), 6),
            **detail,
        }
    )


def _wrap(module, attribute: str, stage: str, detail=None) -> None:
    original = getattr(module, attribute)

    def wrapper(*args, **kwargs):
        started = time.perf_counter()
        result = original(*args, **kwargs)
        elapsed = time.perf_counter() - started
        extra = detail(args, kwargs, result) if detail else {}
        _record(stage, elapsed, **extra)
        return result

    setattr(module, attribute, wrapper)


def _shape_of(image) -> list[int] | None:
    if image is None or not hasattr(image, "shape"):
        return None
    return [int(image.shape[1]), int(image.shape[0])]  # width, height


# ---------------------------------------------------------------------------
# Installed baseline configuration
# ---------------------------------------------------------------------------
_installed_config = load_pipeline_config("OCR")
_baseline_detector_config = {
    key: _installed_config["SubModules"]["TextDetection"].get(key)
    for key in ("limit_side_len", "limit_type", "max_side_limit")
}

# ---------------------------------------------------------------------------
# Temporary experimental OCR pipeline
# ---------------------------------------------------------------------------
model_init_started = time.perf_counter()
experimental_ocr = PaddleOCR(
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    lang="en",
    enable_mkldnn=False,
    text_det_limit_side_len=EXPERIMENTAL_LIMIT_SIDE_LEN,
    text_det_limit_type=EXPERIMENTAL_LIMIT_TYPE,
)
model_init_seconds = time.perf_counter() - model_init_started

_experimental_pipeline = experimental_ocr.paddlex_pipeline
_experimental_resize = _experimental_pipeline.text_det_model.pre_tfs["Resize"]
_experimental_config = {
    "params": {
        "text_det_limit_side_len": experimental_ocr._params[
            "text_det_limit_side_len"
        ],
        "text_det_limit_type": experimental_ocr._params["text_det_limit_type"],
    },
    "pipeline": {
        "limit_side_len": _experimental_pipeline.text_det_limit_side_len,
        "limit_type": _experimental_pipeline.text_det_limit_type,
        "max_side_limit": _experimental_pipeline.text_det_max_side_limit,
    },
    "live_resize": {
        "class": type(_experimental_resize).__name__,
        "resize_type": getattr(_experimental_resize, "resize_type", None),
        "limit_side_len": getattr(_experimental_resize, "limit_side_len", None),
        "limit_type": getattr(_experimental_resize, "limit_type", None),
        "max_side_limit": getattr(_experimental_resize, "max_side_limit", None),
        "resize_long": getattr(_experimental_resize, "resize_long", None),
    },
}

if _experimental_config["live_resize"]["limit_side_len"] != 1280:
    raise RuntimeError(
        "Experimental detector did not receive limit_side_len=1280: "
        f"{_experimental_config['live_resize']}"
    )
if _experimental_config["live_resize"]["limit_type"] != "max":
    raise RuntimeError(
        "Experimental detector did not receive limit_type=max: "
        f"{_experimental_config['live_resize']}"
    )
if _experimental_config["live_resize"]["max_side_limit"] != 4000:
    raise RuntimeError(
        "Experimental detector max_side_limit changed unexpectedly: "
        f"{_experimental_config['live_resize']}"
    )

# Install the experimental instance only for this process.
ocr_engine._ocr_instance = experimental_ocr
if ocr_engine.get_ocr() is not experimental_ocr:
    raise RuntimeError("Experimental OCR instance was not installed")

# ---------------------------------------------------------------------------
# Detector resize instrumentation
# ---------------------------------------------------------------------------
_original_detector_resize = _experimental_pipeline.text_det_model.pre_tfs["Resize"]


def _timed_detector_resize(
    imgs,
    limit_side_len=None,
    limit_type=None,
    max_side_limit=None,
):
    input_shapes = [_shape_of(image) for image in imgs if image is not None]
    started = time.perf_counter()
    resized_imgs, shapes = _original_detector_resize(
        imgs,
        limit_side_len=limit_side_len,
        limit_type=limit_type,
        max_side_limit=max_side_limit,
    )
    elapsed = time.perf_counter() - started
    output_shapes = [
        _shape_of(image) for image in resized_imgs if image is not None
    ]
    _record(
        "detector_resize",
        elapsed,
        ocr_call=state["current_ocr_call"],
        input_shapes=input_shapes,
        output_shapes=output_shapes,
        limit_side_len=limit_side_len,
        limit_type=limit_type,
        max_side_limit=max_side_limit,
    )
    return resized_imgs, shapes


_experimental_pipeline.text_det_model.pre_tfs["Resize"] = _timed_detector_resize

# ---------------------------------------------------------------------------
# Extraction instrumentation
# ---------------------------------------------------------------------------
_original_ocr_image = extraction_service.ocr_image


def _timed_ocr_image(path: str):
    state["ocr_call_seq"] += 1
    call_id = state["ocr_call_seq"]
    state["current_ocr_call"] = call_id
    state["ocr_depth"] += 1
    started = time.perf_counter()
    try:
        items = _original_ocr_image(path)
    finally:
        state["ocr_depth"] -= 1
        state["current_ocr_call"] = None
    elapsed = time.perf_counter() - started
    _record(
        "ocr_image",
        elapsed,
        call_id=call_id,
        path=Path(path).name,
        item_count=len(items),
    )
    return items


extraction_service.ocr_image = _timed_ocr_image

_wrap(extraction_service, "assess_quality", "quality_assessment")
_wrap(extraction_service, "assemble_ocr_lines", "ocr_line_assembly")
_wrap(extraction_service, "classify_page", "page_classification")
_wrap(extraction_service, "extract_digital_page", "digital_text_extraction")
_wrap(extraction_service, "render_page_to_image", "pdf_page_render")

_original_imread = cv2.imread


def _timed_imread(path, flags=cv2.IMREAD_COLOR):
    inside_ocr = state["ocr_depth"] > 0
    started = time.perf_counter()
    image = _original_imread(path, flags)
    elapsed = time.perf_counter() - started
    _record(
        "ocr_internal_imread" if inside_ocr else "image_load",
        elapsed,
        path=Path(str(path)).name,
        shape=_shape_of(image),
    )
    return image


cv2.imread = _timed_imread

_original_fitz_open = fitz.open


def _timed_fitz_open(*args, **kwargs):
    inside_ocr = state["ocr_depth"] > 0
    started = time.perf_counter()
    document = _original_fitz_open(*args, **kwargs)
    elapsed = time.perf_counter() - started
    _record(
        "ocr_internal_pdf_open" if inside_ocr else "pdf_open",
        elapsed,
        pages=getattr(document, "page_count", None),
    )
    return document


fitz.open = _timed_fitz_open


def _canonical(name: str) -> str:
    from app.services.test_dictionary import normalize_name

    return normalize_name(name)[0]


def _bbox_from_ocr_item(item: dict) -> list[float] | None:
    points = item.get("bbox")
    if not points:
        return None
    xs = [float(point[0]) for point in points]
    ys = [float(point[1]) for point in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def _verify_boxes(measurements: list[dict], extraction: dict) -> list[dict]:
    pages = {page["page_number"]: page for page in extraction["pages"]}
    checks = []
    for measurement in measurements:
        page = pages[measurement["page_number"]]
        quality = (page.get("metadata") or {}).get("quality") or {}
        width = quality.get("width") or page.get("page_width")
        height = quality.get("height") or page.get("page_height")
        bbox = measurement.get("source_bbox")
        valid = (
            isinstance(bbox, list)
            and len(bbox) == 4
            and all(isinstance(value, (int, float)) for value in bbox)
        )
        inside = False
        x0 = y0 = x1 = y1 = None
        if valid:
            x0, y0, x1, y1 = [float(value) for value in bbox]
            inside = (
                width is not None
                and height is not None
                and 0 <= x0 < x1 <= width
                and 0 <= y0 < y1 <= height
            )

        item = next(
            (
                candidate
                for candidate in (page.get("metadata") or {}).get("ocr_items", [])
                if candidate["text"].startswith(
                    f"{measurement['test_name_original']}:"
                )
            ),
            None,
        )
        item_bbox = _bbox_from_ocr_item(item) if item else None
        matches_item = False
        if valid and item_bbox is not None:
            matches_item = all(
                abs(left - right) <= 0.01
                for left, right in zip([x0, y0, x1, y1], item_bbox)
            )

        max_item_coordinate = None
        item_boxes = [
            _bbox_from_ocr_item(candidate)
            for candidate in (page.get("metadata") or {}).get("ocr_items", [])
        ]
        item_boxes = [box for box in item_boxes if box is not None]
        if item_boxes:
            max_item_coordinate = max(
                max(box[0], box[1], box[2], box[3]) for box in item_boxes
            )

        baseline_delta = None
        if measurement["test_name_original"] in PHOTO_BASELINE_BBOXES and measurement.get(
            "source_bbox"
        ):
            baseline = PHOTO_BASELINE_BBOXES[measurement["test_name_original"]]
            baseline_delta = [
                round(actual - reference, 2)
                for actual, reference in zip(
                    [x0, y0, x1, y1], baseline
                )
            ]

        checks.append(
            {
                "test": measurement["test_name_original"],
                "page_number": measurement["page_number"],
                "bbox": bbox,
                "page_width": width,
                "page_height": height,
                "valid_list": valid,
                "inside_original_dimensions": inside,
                "matches_source_ocr_item": matches_item,
                "source_ocr_item_bbox": item_bbox,
                "max_ocr_item_coordinate_on_page": max_item_coordinate,
                "baseline_bbox": PHOTO_BASELINE_BBOXES.get(
                    measurement["test_name_original"]
                ),
                "delta_from_baseline_bbox": baseline_delta,
            }
        )
    return checks


def _run_fixture(fixture: dict) -> dict:
    filename = fixture["filename"]
    filepath = fixture["path"]
    state["fixture"] = filename
    fixture_event_start = len(state["events"])

    with filepath.open("rb") as handle:
        upload_started = time.perf_counter()
        upload = client.post(
            "/api/reports",
            data={"consent": "true"},
            files={"file": (filename, handle, fixture["media_type"])},
        )
        upload_seconds = time.perf_counter() - upload_started
    if upload.status_code != 201:
        raise RuntimeError(f"Upload failed for {filename}: {upload.text}")
    report_id = upload.json()["id"]

    try:
        extract_started = time.perf_counter()
        extraction_response = client.post(f"/api/reports/{report_id}/extract")
        extract_seconds = time.perf_counter() - extract_started
        if extraction_response.status_code != 200:
            raise RuntimeError(
                f"Extraction failed for {filename}: {extraction_response.text}"
            )

        extraction = client.get(f"/api/reports/{report_id}/extraction").json()

        structure_started = time.perf_counter()
        structure_response = client.post(f"/api/reports/{report_id}/structure")
        structure_seconds = time.perf_counter() - structure_started
        if structure_response.status_code != 200:
            raise RuntimeError(
                f"Structuring failed for {filename}: {structure_response.text}"
            )

        measurements = client.get(
            f"/api/reports/{report_id}/measurements"
        ).json()["measurements"]
    finally:
        client.delete(f"/api/reports/{report_id}")

    events = state["events"][fixture_event_start:]

    def total(stage: str) -> float:
        return sum(event["seconds"] for event in events if event["stage"] == stage)

    def count(stage: str) -> int:
        return sum(1 for event in events if event["stage"] == stage)

    ocr_events = [event for event in events if event["stage"] == "ocr_image"]
    detector_events = [
        event for event in events if event["stage"] == "detector_resize"
    ]

    ground_truth = json.loads(fixture["ground_truth"].read_text(encoding="utf-8"))
    evaluation = evaluate_fixture(ground_truth, measurements)
    page_attribution = evaluate_page_attribution(ground_truth, measurements)
    box_checks = _verify_boxes(measurements, extraction)

    pages = []
    for page in extraction["pages"]:
        metadata = page.get("metadata") or {}
        pages.append(
            {
                "page_number": page["page_number"],
                "extraction_method": page["extraction_method"],
                "width": metadata.get("quality", {}).get("width"),
                "height": metadata.get("quality", {}).get("height"),
                "quality": metadata.get("quality"),
                "variant": metadata.get("variant"),
                "variants_tried": metadata.get("variants_tried"),
                "ocr_item_count": len(metadata.get("ocr_items") or []),
                "raw_text_lines": len((page.get("raw_text") or "").splitlines()),
                "warnings": page.get("warnings"),
            }
        )

    stage_totals = {
        "pdf_open_seconds": round(total("pdf_open"), 6),
        "page_classification_seconds": round(total("page_classification"), 6),
        "pdf_page_render_seconds": round(total("pdf_page_render"), 6),
        "image_load_seconds": round(total("image_load"), 6),
        "quality_assessment_seconds": round(total("quality_assessment"), 6),
        "ocr_total_seconds": round(total("ocr_image"), 6),
        "detector_resize_seconds": round(total("detector_resize"), 6),
        "ocr_line_assembly_seconds": round(total("ocr_line_assembly"), 6),
        "digital_text_extraction_seconds": round(
            total("digital_text_extraction"), 6
        ),
        "ocr_internal_imread_seconds": round(total("ocr_internal_imread"), 6),
        "remaining_extraction_overhead_seconds": round(
            extract_seconds
            - (
                total("pdf_open")
                + total("page_classification")
                + total("pdf_page_render")
                + total("image_load")
                + total("quality_assessment")
                + total("ocr_image")
                + total("ocr_line_assembly")
                + total("digital_text_extraction")
            ),
            6,
        ),
    }

    return {
        "filename": filename,
        "media_type": fixture["media_type"],
        "expected_pages": fixture["expected_pages"],
        "upload_seconds": round(upload_seconds, 6),
        "extraction_seconds": round(extract_seconds, 6),
        "structuring_seconds": round(structure_seconds, 6),
        "total_pipeline_seconds": round(
            upload_seconds + extract_seconds + structure_seconds, 6
        ),
        "page_count": extraction["total_pages"],
        "processed_pages": extraction["processed_pages"],
        "status": extraction["status"],
        "pages": pages,
        "measurement_count": len(measurements),
        "ocr_call_count": count("ocr_image"),
        "detector_resize_count": len(detector_events),
        "repeated_ocr_calls": max(0, count("ocr_image") - fixture["expected_pages"]),
        "ocr_calls": [
            {
                "call_id": event["call_id"],
                "path": event["path"],
                "item_count": event["item_count"],
                "seconds": event["seconds"],
                "detector_input_shapes": [
                    detector["input_shapes"]
                    for detector in detector_events
                    if detector.get("ocr_call") == event["call_id"]
                ],
                "detector_output_shapes": [
                    detector["output_shapes"]
                    for detector in detector_events
                    if detector.get("ocr_call") == event["call_id"]
                ],
            }
            for event in ocr_events
        ],
        "detector_resize_events": detector_events,
        "stage_totals": stage_totals,
        "accuracy": {
            "field_totals": evaluation["field_totals"],
            "field_accuracy": evaluation["field_accuracy"],
            "mismatches": evaluation["mismatches"],
            "ground_truth_count": evaluation["ground_truth_count"],
            "extracted_count": evaluation["extracted_count"],
            "correctly_identified_tests": evaluation[
                "correctly_identified_tests"
            ],
            "biomarker_recall": evaluation["biomarker_recall"],
            "biomarker_precision": evaluation["biomarker_precision"],
            "unit_match_count": evaluation["unit_match_count"],
            "range_match_count": evaluation["range_match_count"],
            "flag_match_count": evaluation["flag_match_count"],
            "page_attribution": page_attribution,
        },
        "measurements": [
            {
                "test_name_original": item["test_name_original"],
                "test_name_normalized": item["test_name_normalized"],
                "result_original": item["result_original"],
                "result_numeric": item["result_numeric"],
                "unit_original": item["unit_original"],
                "reference_range_original": item["reference_range_original"],
                "reference_low": item["reference_low"],
                "reference_high": item["reference_high"],
                "derived_flag": item["derived_flag"],
                "page_number": item["page_number"],
                "source_bbox": item["source_bbox"],
                "ocr_confidence": item["ocr_confidence"],
            }
            for item in measurements
        ],
        "bbox_checks": box_checks,
        "events": events,
    }


def main() -> None:
    generated_at = datetime.now(timezone.utc)
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))

    fixtures = {}
    for fixture in FIXTURES:
        fixtures[fixture["filename"]] = _run_fixture(fixture)

    baseline_fixtures = baseline["fixtures"]

    baseline_ocr_execution = sum(
        baseline_fixtures[fixture["filename"]]["stage_totals"][
            "ocr_execution_excluding_init_seconds"
        ]
        for fixture in FIXTURES
    )
    experimental_ocr_execution = sum(
        fixtures[fixture["filename"]]["stage_totals"]["ocr_total_seconds"]
        for fixture in FIXTURES
    )
    baseline_extraction = sum(
        baseline_fixtures[fixture["filename"]]["extraction_seconds"]
        for fixture in FIXTURES
    )
    experimental_extraction = sum(
        fixtures[fixture["filename"]]["extraction_seconds"]
        for fixture in FIXTURES
    )

    results = {
        "generated_at": generated_at.isoformat(),
        "description": (
            "Phase 9.6.1 controlled OCR detector-resize experiment. One real "
            "pipeline run per fixture with an in-process PaddleOCR instance "
            "configured with text_det_limit_side_len=1280 and "
            "text_det_limit_type=max."
        ),
        "isolated_data_dir": str(DATA_DIR),
        "environment": {
            "paddleocr": metadata.version("paddleocr"),
            "paddlepaddle": metadata.version("paddlepaddle"),
            "paddlex": metadata.version("paddlex"),
            "opencv_python": metadata.version("opencv-python"),
            "opencv_contrib_python": metadata.version("opencv-contrib-python"),
            "numpy": metadata.version("numpy"),
            "pillow": metadata.version("pillow"),
        },
        "baseline_configuration": {
            "installed_yaml_text_detection": _baseline_detector_config,
            "production_constructor_args": {
                "text_det_limit_side_len": None,
                "text_det_limit_type": None,
            },
            "live_baseline_verified_separately": {
                "pipeline_limit_side_len": 64,
                "pipeline_limit_type": "min",
                "pipeline_max_side_limit": 4000,
                "live_resize_limit_side_len": 64,
                "live_resize_limit_type": "min",
                "live_resize_max_side_limit": 4000,
            },
        },
        "experimental_configuration": _experimental_config,
        "experimental_model_init_seconds": round(model_init_seconds, 6),
        "fixtures": fixtures,
        "summary": {
            "baseline_ocr_execution_seconds": round(
                baseline_ocr_execution, 6
            ),
            "experimental_ocr_execution_seconds": round(
                experimental_ocr_execution, 6
            ),
            "ocr_execution_speedup": round(
                baseline_ocr_execution / experimental_ocr_execution, 4
            ),
            "baseline_extraction_seconds": round(baseline_extraction, 6),
            "experimental_extraction_seconds": round(
                experimental_extraction, 6
            ),
            "experimental_total_including_model_init_seconds": round(
                model_init_seconds + experimental_extraction, 6
            ),
            "total_ocr_calls": sum(
                fixture["ocr_call_count"] for fixture in fixtures.values()
            ),
            "total_detector_resize_calls": sum(
                fixture["detector_resize_count"] for fixture in fixtures.values()
            ),
            "total_page_attribution_scored": sum(
                fixture["accuracy"]["page_attribution"]["scored"]
                for fixture in fixtures.values()
            ),
            "total_page_attribution_correct": sum(
                fixture["accuracy"]["page_attribution"]["correct"]
                for fixture in fixtures.values()
            ),
        },
        "baseline_reference": {
            filename: {
                "ocr_execution_seconds": baseline_fixtures[filename][
                    "stage_totals"
                ]["ocr_execution_excluding_init_seconds"],
                "ocr_calls": baseline_fixtures[filename]["ocr_calls"],
                "extraction_seconds": baseline_fixtures[filename][
                    "extraction_seconds"
                ],
            }
            for filename in fixtures
        },
    }

    RESULTS_PATH.write_text(
        json.dumps(results, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Wrote {RESULTS_PATH}")
    print(f"Isolated data dir: {DATA_DIR}")
    print(
        "Experimental config: "
        f"{json.dumps(_experimental_config, sort_keys=True)}"
    )
    print(f"Experimental model init: {model_init_seconds:.4f}s")
    for filename, result in fixtures.items():
        stages = result["stage_totals"]
        accuracy = result["accuracy"]
        print()
        print(filename)
        print(
            f"  extraction={result['extraction_seconds']:.4f}s "
            f"ocr_total={stages['ocr_total_seconds']:.4f}s "
            f"detector_resize={stages['detector_resize_seconds']:.4f}s"
        )
        print(
            f"  ocr_calls={result['ocr_call_count']} "
            f"resize_calls={result['detector_resize_count']} "
            f"fields={accuracy['field_totals']} "
            f"mismatches={len(accuracy['mismatches'])} "
            f"pages={accuracy['page_attribution']['correct']}/"
            f"{accuracy['page_attribution']['scored']}"
        )
        for call in result["ocr_calls"]:
            print(
                f"    OCR call {call['call_id']} {call['path']}: "
                f"{call['seconds']:.4f}s items={call['item_count']} "
                f"input={call['detector_input_shapes']} "
                f"resized={call['detector_output_shapes']}"
            )
        for check in result["bbox_checks"]:
            print(
                f"    bbox {check['test']}: {check['bbox']} "
                f"inside={check['inside_original_dimensions']} "
                f"matches_item={check['matches_source_ocr_item']} "
                f"max_item_coord={check['max_ocr_item_coordinate_on_page']} "
                f"delta={check['delta_from_baseline_bbox']}"
            )

    print()
    print("SUMMARY", json.dumps(results["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
