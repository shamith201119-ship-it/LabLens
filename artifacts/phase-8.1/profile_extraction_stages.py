"""Phase 9.6.0 diagnostic profiler for scanned-document extraction.

Runs the real upload -> extract -> structure API path once per fixture while
temporarily wrapping existing service functions to record stage timings.

This script does not modify production files. It uses an isolated
LABLENS_DATA_DIR and saves its measurements to EXTRACTION_PROFILE_RESULTS.json.

Run from the repository root:
    py -3.12 artifacts/phase-8.1/profile_extraction_stages.py
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
    r"C:\Users\sureshr\AppData\Local\Temp\opencode\lablens-phase960-profile"
)
RESULTS_PATH = SCRIPT_DIR / "EXTRACTION_PROFILE_RESULTS.json"

if DATA_DIR.exists():
    shutil.rmtree(DATA_DIR)
DATA_DIR.mkdir(parents=True, exist_ok=True)
os.environ["LABLENS_DATA_DIR"] = str(DATA_DIR)

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import cv2
import fitz
from fastapi.testclient import TestClient

from app.database import init_db
from app.main import app
import app.services.extraction_service as extraction_service
import app.services.ocr_engine as ocr_engine

client = TestClient(app)
init_db()

FIXTURES = (
    {
        "filename": "cbc_report.png",
        "path": FIXTURE_DIR_81 / "cbc_report.png",
        "media_type": "image/png",
        "expected_pages": 1,
    },
    {
        "filename": "multipage_scanned_report.pdf",
        "path": FIXTURE_DIR_95 / "multipage_scanned_report.pdf",
        "media_type": "application/pdf",
        "expected_pages": 2,
    },
    {
        "filename": "photographed_report.jpg",
        "path": FIXTURE_DIR_95 / "photographed_report.jpg",
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


# OCR model access and OCR calls.
_original_get_ocr = ocr_engine.get_ocr


def _timed_get_ocr():
    constructed = ocr_engine._ocr_instance is None
    started = time.perf_counter()
    instance = _original_get_ocr()
    elapsed = time.perf_counter() - started
    _record(
        "ocr_model_get",
        elapsed,
        constructed=constructed,
        instance_id=id(instance),
        ocr_call=state["current_ocr_call"],
    )
    return instance


ocr_engine.get_ocr = _timed_get_ocr

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

# Application-level stages inside extraction_service.
_wrap(extraction_service, "assess_quality", "quality_assessment")
_wrap(extraction_service, "assemble_ocr_lines", "ocr_line_assembly")
_wrap(extraction_service, "classify_page", "page_classification")
_wrap(extraction_service, "extract_digital_page", "digital_text_extraction")
_wrap(extraction_service, "render_page_to_image", "pdf_page_render")
_wrap(extraction_service, "preprocess_for_ocr", "preprocessing")

# Image loading. Reads nested inside OCR are tagged separately so they are not
# counted twice when building the top-level stage breakdown.
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
    assert upload.status_code == 201, upload.text
    report_id = upload.json()["id"]

    try:
        extract_started = time.perf_counter()
        extraction_response = client.post(f"/api/reports/{report_id}/extract")
        extract_seconds = time.perf_counter() - extract_started
        assert extraction_response.status_code == 200, extraction_response.text

        extraction = client.get(f"/api/reports/{report_id}/extraction").json()

        structure_started = time.perf_counter()
        structure_response = client.post(f"/api/reports/{report_id}/structure")
        structure_seconds = time.perf_counter() - structure_started
        assert structure_response.status_code == 200, structure_response.text

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
    init_events = [
        event
        for event in events
        if event["stage"] == "ocr_model_get" and event["constructed"]
    ]
    init_by_call = {event["ocr_call"]: event["seconds"] for event in init_events}
    init_seconds = sum(event["seconds"] for event in init_events)

    ocr_calls = []
    for event in ocr_events:
        call_id = event["call_id"]
        init_for_call = init_by_call.get(call_id, 0.0)
        ocr_calls.append(
            {
                "call_id": call_id,
                "path": event["path"],
                "item_count": event["item_count"],
                "ocr_image_seconds": event["seconds"],
                "model_init_seconds": round(init_for_call, 6),
                "ocr_execution_excluding_init_seconds": round(
                    event["seconds"] - init_for_call, 6
                ),
            }
        )

    page_details = []
    for page in extraction["pages"]:
        metadata = page.get("metadata") or {}
        page_details.append(
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
        "preprocessing_seconds": round(total("preprocessing"), 6),
        "ocr_model_init_seconds": round(init_seconds, 6),
        "ocr_total_seconds": round(total("ocr_image"), 6),
        "ocr_execution_excluding_init_seconds": round(
            total("ocr_image") - init_seconds, 6
        ),
        "ocr_line_assembly_seconds": round(total("ocr_line_assembly"), 6),
        "digital_text_extraction_seconds": round(
            total("digital_text_extraction"), 6
        ),
        "ocr_internal_imread_seconds": round(total("ocr_internal_imread"), 6),
    }
    top_level_instrumented = sum(
        stage_totals[key]
        for key in (
            "pdf_open_seconds",
            "page_classification_seconds",
            "pdf_page_render_seconds",
            "image_load_seconds",
            "quality_assessment_seconds",
            "preprocessing_seconds",
            "ocr_total_seconds",
            "ocr_line_assembly_seconds",
            "digital_text_extraction_seconds",
        )
    )
    stage_totals["instrumented_seconds"] = round(top_level_instrumented, 6)
    stage_totals["remaining_extraction_overhead_seconds"] = round(
        extract_seconds - top_level_instrumented, 6
    )

    return {
        "filename": filename,
        "expected_pages": fixture["expected_pages"],
        "media_type": fixture["media_type"],
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
        "pages": page_details,
        "ocr_call_count": count("ocr_image"),
        "ocr_calls": ocr_calls,
        "get_ocr_call_count": count("ocr_model_get"),
        "model_init_count": len(init_events),
        "preprocessing_call_count": count("preprocessing"),
        "repeated_ocr_calls": max(0, count("ocr_image") - fixture["expected_pages"]),
        "stage_totals": stage_totals,
        "events": events,
    }


def main() -> None:
    started_at = datetime.now(timezone.utc)
    fixture_results = {}

    for fixture in FIXTURES:
        result = _run_fixture(fixture)
        fixture_results[fixture["filename"]] = result

    get_ocr_events = [
        event for event in state["events"] if event["stage"] == "ocr_model_get"
    ]
    init_events = [event for event in get_ocr_events if event["constructed"]]

    results = {
        "generated_at": started_at.isoformat(),
        "description": (
            "Phase 9.6.0 diagnostic extraction profile. One real pipeline run "
            "per fixture; timings are single-run wall-clock measurements."
        ),
        "isolated_data_dir": str(DATA_DIR),
        "fixture_order": [fixture["filename"] for fixture in FIXTURES],
        "environment": {
            "paddleocr": metadata.version("paddleocr"),
            "paddlepaddle": metadata.version("paddlepaddle"),
            "paddlex": metadata.version("paddlex"),
            "opencv_python": metadata.version("opencv-python"),
            "opencv_contrib_python": metadata.version("opencv-contrib-python"),
            "numpy": metadata.version("numpy"),
            "pillow": metadata.version("pillow"),
        },
        "model": {
            "get_ocr_call_count": len(get_ocr_events),
            "construction_count": len(init_events),
            "instance_ids": sorted(
                {event["instance_id"] for event in get_ocr_events}
            ),
            "construction_events": init_events,
        },
        "fixtures": fixture_results,
    }

    RESULTS_PATH.write_text(
        json.dumps(results, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Wrote {RESULTS_PATH}")
    print(f"Isolated data dir: {DATA_DIR}")
    print(
        "Model construction count: "
        f"{len(init_events)}; get_ocr calls: {len(get_ocr_events)}"
    )
    for filename, result in fixture_results.items():
        stages = result["stage_totals"]
        print()
        print(f"{filename}")
        print(
            f"  upload={result['upload_seconds']:.4f}s "
            f"extract={result['extraction_seconds']:.4f}s "
            f"structure={result['structuring_seconds']:.4f}s "
            f"total={result['total_pipeline_seconds']:.4f}s"
        )
        print(
            f"  pages={result['page_count']} ocr_calls={result['ocr_call_count']} "
            f"repeated_ocr={result['repeated_ocr_calls']} "
            f"preprocess_calls={result['preprocessing_call_count']}"
        )
        print(
            "  stages: "
            f"pdf_open={stages['pdf_open_seconds']:.4f}s "
            f"render={stages['pdf_page_render_seconds']:.4f}s "
            f"image_load={stages['image_load_seconds']:.4f}s "
            f"quality={stages['quality_assessment_seconds']:.4f}s "
            f"init={stages['ocr_model_init_seconds']:.4f}s "
            f"ocr_total={stages['ocr_total_seconds']:.4f}s "
            f"ocr_excl_init={stages['ocr_execution_excluding_init_seconds']:.4f}s "
            f"assembly={stages['ocr_line_assembly_seconds']:.4f}s "
            f"overhead={stages['remaining_extraction_overhead_seconds']:.4f}s"
        )
        for call in result["ocr_calls"]:
            print(
                f"    OCR call {call['call_id']} {call['path']}: "
                f"total={call['ocr_image_seconds']:.4f}s "
                f"init={call['model_init_seconds']:.4f}s "
                f"execution={call['ocr_execution_excluding_init_seconds']:.4f}s "
                f"items={call['item_count']}"
            )


if __name__ == "__main__":
    main()
