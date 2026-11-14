"""Phase 9.5.4 integration test for the photographed laboratory report.

This test runs the real application path:

    upload -> image quality assessment -> OCR -> OCR line assembly ->
    measurement structuring -> stored measurements

It compares the five synthetic measurements with independently authored
ground truth. It does not call OCR helpers or the line parser directly.
"""

import io
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
EVALUATOR_DIR = PROJECT_DIR / "artifacts" / "phase-8.1"
for path in (str(BACKEND_DIR), str(EVALUATOR_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

from accuracy_evaluator import evaluate_fixture, evaluate_page_attribution

from app.database import init_db
from app.main import app
from app.services.image_processor import assemble_ocr_line_records
from app.services.test_dictionary import normalize_name

client = TestClient(app)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "phase9_5"
JPG_PATH = FIXTURE_DIR / "photographed_report.jpg"
GROUND_TRUTH_PATH = FIXTURE_DIR / "photographed_report.json"
PHOTO_METADATA_PATH = FIXTURE_DIR / "photographed_report_photo.json"

EXPECTED = json.loads(GROUND_TRUTH_PATH.read_text(encoding="utf-8"))
PHOTO_METADATA = json.loads(PHOTO_METADATA_PATH.read_text(encoding="utf-8"))


def _canonical(name: str) -> str:
    return normalize_name(name)[0]


def _measurement_by_name(measurements):
    return {
        _canonical(item["test_name_normalized"] or item["test_name_original"]): item
        for item in measurements
    }


@pytest.fixture(scope="module", autouse=True)
def _database():
    init_db()


@pytest.fixture(scope="module")
def photographed_pipeline():
    assert JPG_PATH.is_file(), f"Missing fixture: {JPG_PATH}"
    assert GROUND_TRUTH_PATH.is_file(), f"Missing ground truth: {GROUND_TRUTH_PATH}"

    upload = client.post(
        "/api/reports",
        data={"consent": "true"},
        files={
            "file": (
                JPG_PATH.name,
                io.BytesIO(JPG_PATH.read_bytes()),
                "image/jpeg",
            )
        },
    )
    assert upload.status_code == 201, upload.text
    report_id = upload.json()["id"]

    try:
        extraction_response = client.post(f"/api/reports/{report_id}/extract")
        assert extraction_response.status_code == 200, extraction_response.text
        extraction = client.get(f"/api/reports/{report_id}/extraction").json()

        structure_response = client.post(f"/api/reports/{report_id}/structure")
        assert structure_response.status_code == 200, structure_response.text

        measurements = client.get(
            f"/api/reports/{report_id}/measurements"
        ).json()["measurements"]

        yield {
            "report_id": report_id,
            "extraction": extraction,
            "measurements": measurements,
        }
    finally:
        client.delete(f"/api/reports/{report_id}")


def test_fixture_has_recorded_photo_transformations():
    with Image.open(JPG_PATH) as image:
        assert image.format == "JPEG"
        assert image.size == (
            PHOTO_METADATA["final_image_pixels"]["width"],
            PHOTO_METADATA["final_image_pixels"]["height"],
        )

    transformations = " ".join(PHOTO_METADATA["transformations"]).lower()
    for required in (
        "perspective",
        "rotation",
        "illumination",
        "shadow",
        "blur",
        "jpeg",
    ):
        assert required in transformations

    assert PHOTO_METADATA["jpeg_quality"] == 87
    assert PHOTO_METADATA["gaussian_blur_sigma"] < 1.0


def test_pipeline_assesses_quality_without_preprocessing(photographed_pipeline):
    extraction = photographed_pipeline["extraction"]
    pages = extraction["pages"]

    assert extraction["status"] == "completed"
    assert extraction["total_pages"] == 1
    assert extraction["processed_pages"] == 1
    assert extraction["error_code"] is None
    assert extraction["pages"][0]["warnings"] == []

    assert len(pages) == 1
    page = pages[0]
    assert page["page_number"] == 1
    assert page["extraction_method"] == "ocr"

    quality = page["metadata"]["quality"]
    assert quality["width"] == PHOTO_METADATA["final_image_pixels"]["width"]
    assert quality["height"] == PHOTO_METADATA["final_image_pixels"]["height"]
    assert 120 < quality["brightness"] < 240
    assert quality["blur_variance"] > 50
    assert quality["low_resolution"] is False
    assert quality["possibly_blurry"] is False
    assert quality["low_contrast"] is False

    # The unmodified original is good enough, so no contrast fallback was used.
    assert page["metadata"]["variant"] == "original"
    assert page["metadata"]["variants_tried"] == ["original"]

    assert page["page_width"] == quality["width"]
    assert page["page_height"] == quality["height"]


def test_ocr_line_assembly_preserves_each_measurement_row(photographed_pipeline):
    page = photographed_pipeline["extraction"]["pages"][0]
    lines = page["raw_text"].splitlines()
    ocr_items = page["metadata"]["ocr_items"]

    assert ocr_items, "OCR items must be preserved in page metadata"

    for expected in EXPECTED:
        prefix = f"{expected['test']}:"
        matching_lines = [line for line in lines if line.startswith(prefix)]
        assert len(matching_lines) == 1, (
            f"Expected exactly one OCR line for {expected['test']}, "
            f"found {matching_lines}"
        )
        row = matching_lines[0]
        assert expected["result"] in row
        assert expected["unit"] in row
        assert expected["range"] in row
        assert row.lower().count("reference") == 1

        matching_records = [
            record for record in assemble_ocr_line_records(ocr_items)
            if record["text"] == row
        ]
        assert len(matching_records) == 1, (
            f"Expected exactly one assembled OCR line for {expected['test']}, "
            f"found {matching_records}"
        )

        covering_items = [
            item for item in ocr_items if item["text"] in row
        ]
        assert covering_items, (
            f"No OCR items cover the assembled line for {expected['test']}"
        )
        assert all(item["text"] in row for item in covering_items)
        assert any(item["text"].startswith(prefix) for item in ocr_items)


def test_all_measurements_match_independent_ground_truth(photographed_pipeline):
    measurements = photographed_pipeline["measurements"]

    assert len(EXPECTED) == 5
    assert len(measurements) == len(EXPECTED)

    canonical_names = [
        _canonical(item["test_name_normalized"] or item["test_name_original"])
        for item in measurements
    ]
    assert len(canonical_names) == len(set(canonical_names)), (
        "Duplicate measurements were extracted"
    )
    assert set(canonical_names) == {_canonical(item["test"]) for item in EXPECTED}

    by_name = _measurement_by_name(measurements)

    for expected in EXPECTED:
        actual = by_name[_canonical(expected["test"])]

        assert actual["page_number"] == expected["page"]
        assert actual["test_name_original"] == expected["test"]
        assert actual["result_original"] == expected["result"]
        assert actual["result_numeric"] == pytest.approx(expected["numeric_result"])
        assert actual["result_qualifier"] is None
        assert actual["unit_original"] == expected["unit"]
        assert actual["reference_range_original"] == expected["range"]
        assert actual["reference_low"] == pytest.approx(expected["reference_low"])
        assert actual["reference_high"] == pytest.approx(expected["reference_high"])
        assert actual["derived_flag"] == expected["derived_flag"]
        assert actual["extraction_method"] == "ocr"
        assert actual["verification_status"] == "extracted"
        assert expected["test"] in actual["source_text"]
        assert expected["result"] in actual["source_text"]


def test_bounding_boxes_and_confidence_are_preserved(photographed_pipeline):
    state = photographed_pipeline
    measurements = state["measurements"]
    page = state["extraction"]["pages"][0]
    quality = page["metadata"]["quality"]
    ocr_items = page["metadata"]["ocr_items"]
    by_name = _measurement_by_name(measurements)

    for expected in EXPECTED:
        actual = by_name[_canonical(expected["test"])]

        bbox = actual["source_bbox"]
        assert isinstance(bbox, list)
        assert len(bbox) == 4
        assert all(isinstance(value, (int, float)) for value in bbox)
        x0, y0, x1, y1 = bbox
        assert 0 <= x0 < x1 <= quality["width"]
        assert 0 <= y0 < y1 <= quality["height"]

        confidence = actual["ocr_confidence"]
        assert confidence is not None
        assert 0.0 <= confidence <= 1.0
        assert confidence >= 0.90

        source_record = next(
            record
            for record in assemble_ocr_line_records(ocr_items)
            if record["text"].startswith(f"{expected['test']}:")
        )
        rx0, ry0, rx1, ry1 = source_record["bbox"]
        assert x0 == pytest.approx(rx0)
        assert y0 == pytest.approx(ry0)
        assert x1 == pytest.approx(rx1)
        assert y1 == pytest.approx(ry1)
        assert confidence == pytest.approx(source_record["confidence"])


def test_evaluator_reports_full_field_accuracy(photographed_pipeline):
    measurements = photographed_pipeline["measurements"]

    result = evaluate_fixture(EXPECTED, measurements)

    assert result["ground_truth_count"] == 5
    assert result["extracted_count"] == 5
    assert result["correctly_identified_tests"] == 5
    assert result["biomarker_recall"] == 1.0
    assert result["biomarker_precision"] == 1.0
    assert result["unit_match_count"] == 5
    assert result["range_match_count"] == 5
    assert result["flag_match_count"] == 5

    assert result["field_totals"] == {
        "scored": 30,
        "correct": 30,
        "incorrect": 0,
        "not_scored": 5,
    }
    assert result["mismatches"] == []

    for field in (
        "name",
        "numeric_value",
        "unit",
        "reference_low",
        "reference_high",
        "flag",
    ):
        assert result["field_accuracy"][field] == {
            "scored": 5,
            "correct": 5,
            "incorrect": 0,
            "not_scored": 0,
        }

    assert result["field_accuracy"]["qualifier"] == {
        "scored": 0,
        "correct": 0,
        "incorrect": 0,
        "not_scored": 5,
    }

    page_result = evaluate_page_attribution(EXPECTED, measurements)
    assert page_result["scored"] == 5
    assert page_result["correct"] == 5
    assert page_result["incorrect"] == 0
    assert page_result["not_scored"] == 0
    assert all(detail["extracted_page"] == 1 for detail in page_result["details"])
