"""Phase 9.6.2 small-text OCR stress validation.

Runs the two new small-text fixtures once in either the baseline or the
experimental detector configuration. Invoke twice:

    py -3.12 docs/development/phase-8.1/small_text_stress_experiment.py --mode baseline --results docs/development/phase-8.1/SMALL_TEXT_STRESS_BASELINE_RESULTS.json
    py -3.12 docs/development/phase-8.1/small_text_stress_experiment.py --mode experimental --results docs/development/phase-8.1/SMALL_TEXT_STRESS_1280_RESULTS.json
"""

from __future__ import annotations

import argparse
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
FIXTURE_DIR = BACKEND_DIR / "tests" / "fixtures" / "phase9_6"

arg_parser = argparse.ArgumentParser()
arg_parser.add_argument(
    "--mode", choices=("baseline", "experimental", "production"), required=True
)
arg_parser.add_argument("--data-dir", required=True)
arg_parser.add_argument("--results", required=True)
args = arg_parser.parse_args()

DATA_DIR = Path(args.data_dir)
RESULTS_PATH = Path(args.results)
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

from accuracy_evaluator import evaluate_fixture, evaluate_page_attribution
from app.database import init_db
from app.main import app
import app.services.extraction_service as extraction_service
import app.services.ocr_engine as ocr_engine

client = TestClient(app)
init_db()

EXPERIMENTAL_LIMIT = 1280
EXPERIMENTAL_TYPE = "max"
MAX_SIDE_LIMIT = 4000

FIXTURES = (
    {
        "filename": "dense_small_text_report.pdf",
        "path": FIXTURE_DIR / "dense_small_text_report.pdf",
        "ground_truth": FIXTURE_DIR / "dense_small_text_report.json",
        "media_type": "application/pdf",
        "expected_pages": 2,
    },
    {
        "filename": "small_text_photographed_report.jpg",
        "path": FIXTURE_DIR / "small_text_photographed_report.jpg",
        "ground_truth": FIXTURE_DIR / "small_text_photographed_report.json",
        "media_type": "image/jpeg",
        "expected_pages": 1,
    },
)

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


def _wrap(module, attribute: str, stage: str) -> None:
    original = getattr(module, attribute)

    def wrapper(*args, **kwargs):
        started = time.perf_counter()
        result = original(*args, **kwargs)
        _record(stage, time.perf_counter() - started)
        return result

    setattr(module, attribute, wrapper)


# ---------------------------------------------------------------------------
# OCR pipeline
# ---------------------------------------------------------------------------
model_init_started = time.perf_counter()
if args.mode == "experimental":
    ocr_instance = PaddleOCR(
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        lang="en",
        enable_mkldnn=False,
        text_det_limit_side_len=EXPERIMENTAL_LIMIT,
        text_det_limit_type=EXPERIMENTAL_TYPE,
    )
elif args.mode == "production":
    ocr_instance = ocr_engine.get_ocr()
else:
    ocr_instance = PaddleOCR(
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        lang="en",
        enable_mkldnn=False,
    )
model_init_seconds = time.perf_counter() - model_init_started

pipeline = ocr_instance.paddlex_pipeline
resize_op = pipeline.text_det_model.pre_tfs["Resize"]
experimental_config = {
    "mode": args.mode,
    "params": {
        "text_det_limit_side_len": ocr_instance._params["text_det_limit_side_len"],
        "text_det_limit_type": ocr_instance._params["text_det_limit_type"],
    },
    "pipeline": {
        "limit_side_len": pipeline.text_det_limit_side_len,
        "limit_type": pipeline.text_det_limit_type,
        "max_side_limit": pipeline.text_det_max_side_limit,
    },
    "live_resize": {
        "limit_side_len": getattr(resize_op, "limit_side_len", None),
        "limit_type": getattr(resize_op, "limit_type", None),
        "max_side_limit": getattr(resize_op, "max_side_limit", None),
    },
}

ocr_engine._ocr_instance = ocr_instance
if ocr_engine.get_ocr() is not ocr_instance:
    raise RuntimeError("OCR instance was not installed")

_original_detector_resize = pipeline.text_det_model.pre_tfs["Resize"]


def _timed_detector_resize(imgs, limit_side_len=None, limit_type=None, max_side_limit=None):
    input_shapes = [list(img.shape[:2]) for img in imgs if img is not None]
    started = time.perf_counter()
    resized_imgs, shapes = _original_detector_resize(
        imgs,
        limit_side_len=limit_side_len,
        limit_type=limit_type,
        max_side_limit=max_side_limit,
    )
    elapsed = time.perf_counter() - started
    output_shapes = [list(img.shape[:2]) for img in resized_imgs if img is not None]
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


pipeline.text_det_model.pre_tfs["Resize"] = _timed_detector_resize

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
        shape=None if image is None else list(image.shape),
    )
    return image


cv2.imread = _timed_imread

_original_fitz_open = fitz.open


def _timed_fitz_open(*args, **kwargs):
    started = time.perf_counter()
    document = _original_fitz_open(*args, **kwargs)
    elapsed = time.perf_counter() - started
    _record(
        "pdf_open",
        elapsed,
        pages=getattr(document, "page_count", None),
    )
    return document


fitz.open = _timed_fitz_open


def _canonical(name: str) -> str:
    from app.services.test_dictionary import normalize_name

    return normalize_name(name)[0]


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

    ground_truth = json.loads(
        fixture["ground_truth"].read_text(encoding="utf-8")
    )
    evaluation = evaluate_fixture(ground_truth, measurements)
    page_attribution = evaluate_page_attribution(ground_truth, measurements)

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

    # Bounding-box verification.
    page_map = {page["page_number"]: page for page in extraction["pages"]}
    bbox_checks = []
    for measurement in measurements:
        page = page_map[measurement["page_number"]]
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
        if valid:
            x0, y0, x1, y1 = [float(value) for value in bbox]
            inside = (
                width is not None
                and height is not None
                and 0 <= x0 < x1 <= width
                and 0 <= y0 < y1 <= height
            )
        bbox_checks.append(
            {
                "test": measurement["test_name_original"],
                "bbox": bbox,
                "page_width": width,
                "page_height": height,
                "valid_list": valid,
                "inside_original_dimensions": inside,
            }
        )

    ocr_events = [event for event in events if event["stage"] == "ocr_image"]
    detector_events = [
        event for event in events if event["stage"] == "detector_resize"
    ]

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
        "measurement_count": len(measurements),
        "pages": pages,
        "ocr_call_count": count("ocr_image"),
        "detector_resize_count": len(detector_events),
        "repeated_ocr_calls": max(
            0, count("ocr_image") - fixture["expected_pages"]
        ),
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
        "bbox_checks": bbox_checks,
        "events": events,
    }


def main() -> None:
    generated_at = datetime.now(timezone.utc)
    fixtures = {}
    for fixture in FIXTURES:
        fixtures[fixture["filename"]] = _run_fixture(fixture)

    results = {
        "generated_at": generated_at.isoformat(),
        "mode": args.mode,
        "description": (
            "Phase 9.6.2 small-text stress validation. One real pipeline run per "
            "fixture in the requested OCR detector configuration."
        ),
        "isolated_data_dir": str(DATA_DIR),
        "environment": {
            "paddleocr": metadata.version("paddleocr"),
            "paddlepaddle": metadata.version("paddlepaddle"),
            "paddlex": metadata.version("paddlex"),
            "opencv_python": metadata.version("opencv-python"),
            "numpy": metadata.version("numpy"),
            "pillow": metadata.version("pillow"),
        },
        "ocr_configuration": experimental_config,
        "model_init_seconds": round(model_init_seconds, 6),
        "fixtures": fixtures,
        "summary": {
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
            "total_scored_fields": sum(
                fixture["accuracy"]["field_totals"]["scored"]
                for fixture in fixtures.values()
            ),
            "total_correct_fields": sum(
                fixture["accuracy"]["field_totals"]["correct"]
                for fixture in fixtures.values()
            ),
            "total_incorrect_fields": sum(
                fixture["accuracy"]["field_totals"]["incorrect"]
                for fixture in fixtures.values()
            ),
            "total_not_scored_fields": sum(
                fixture["accuracy"]["field_totals"]["not_scored"]
                for fixture in fixtures.values()
            ),
        },
    }

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text(
        json.dumps(results, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Wrote {RESULTS_PATH}")
    print(f"Mode: {args.mode}")
    print(f"OCR config: {json.dumps(experimental_config, sort_keys=True)}")
    print(f"Model init: {model_init_seconds:.4f}s")
    for filename, result in fixtures.items():
        accuracy = result["accuracy"]
        print()
        print(filename)
        print(
            f"  extraction={result['extraction_seconds']:.4f}s "
            f"ocr_total={result['stage_totals']['ocr_total_seconds']:.4f}s "
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
                f"inside={check['inside_original_dimensions']}"
            )
    print()
    print("SUMMARY", json.dumps(results["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
