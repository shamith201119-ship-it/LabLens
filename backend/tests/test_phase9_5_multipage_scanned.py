import io
import json
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient

from app.database import init_db
from app.main import app
from app.services.test_dictionary import normalize_name

client = TestClient(app)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "phase9_5"
PDF_PATH = FIXTURE_DIR / "multipage_scanned_report.pdf"
GROUND_TRUTH_PATH = FIXTURE_DIR / "multipage_scanned_report.json"

EXPECTED = json.loads(GROUND_TRUTH_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module", autouse=True)
def _database():
    init_db()


@pytest.fixture(scope="module")
def multipage_pipeline():
    assert PDF_PATH.is_file(), f"Missing fixture: {PDF_PATH}"

    upload = client.post(
        "/api/reports",
        data={"consent": "true"},
        files={
            "file": (
                PDF_PATH.name,
                io.BytesIO(PDF_PATH.read_bytes()),
                "application/pdf",
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


def _canonical(name: str) -> str:
    return normalize_name(name)[0]


def test_pdf_pages_are_image_only():
    with fitz.open(str(PDF_PATH)) as document:
        assert document.page_count == 2
        for page in document:
            assert page.get_text() == ""
            assert page.get_images(full=True), "Each page must embed a scan image"


def test_multipage_scanned_report_pipeline(multipage_pipeline):
    extraction = multipage_pipeline["extraction"]
    pages = extraction["pages"]
    measurements = multipage_pipeline["measurements"]

    # Both pages were extracted as scans.
    assert extraction["total_pages"] == 2
    assert extraction["processed_pages"] == 2
    assert [page["page_number"] for page in pages] == [1, 2]
    assert [page["extraction_method"] for page in pages] == ["ocr", "ocr"]
    assert all(page["raw_text"].strip() for page in pages)
    assert all((page.get("metadata") or {}).get("ocr_items") for page in pages)

    # Every expected measurement appears exactly once.
    assert len(EXPECTED) == 5
    assert len(measurements) == len(EXPECTED)
    canonical_names = [
        _canonical(item["test_name_normalized"] or item["test_name_original"])
        for item in measurements
    ]
    assert len(canonical_names) == len(set(canonical_names))

    by_name = {
        _canonical(item["test_name_normalized"] or item["test_name_original"]): item
        for item in measurements
    }
    assert set(by_name) == {_canonical(item["test"]) for item in EXPECTED}

    pages_by_number = {page["page_number"]: page for page in pages}

    for expected in EXPECTED:
        actual = by_name[_canonical(expected["test"])]

        # Page attribution and measurement fields.
        assert actual["page_number"] == expected["page"]
        assert actual["result_original"] == expected["result"]
        assert actual["result_numeric"] == pytest.approx(expected["numeric_result"])
        assert actual["unit_original"] == expected["unit"]
        assert actual["reference_range_original"] == expected["range"]
        assert actual["reference_low"] == pytest.approx(expected["reference_low"])
        assert actual["reference_high"] == pytest.approx(expected["reference_high"])
        assert actual["derived_flag"] == expected["derived_flag"]

        # Original source provenance remains available.
        assert actual["extraction_method"] == "ocr"
        assert actual["source_text"]
        assert isinstance(actual["source_bbox"], list)
        assert len(actual["source_bbox"]) == 4
        assert actual["ocr_confidence"] is not None
        assert 0.0 <= actual["ocr_confidence"] <= 1.0

        source_page = pages_by_number[actual["page_number"]]
        assert actual["test_name_original"] in source_page["raw_text"]
        assert expected["result"] in source_page["raw_text"]

        quality = (source_page.get("metadata") or {}).get("quality") or {}
        x0, y0, x1, y1 = actual["source_bbox"]
        assert 0 <= x0 <= x1 <= quality["width"]
        assert 0 <= y0 <= y1 <= quality["height"]

    # The page 2 reference line belongs to Glucose, immediately after it.
    page_two_lines = pages_by_number[2]["raw_text"].splitlines()
    glucose_line = next(
        index for index, line in enumerate(page_two_lines) if line.startswith("Glucose")
    )
    reference_line = next(
        index
        for index, line in enumerate(page_two_lines)
        if "reference" in line.lower() and "range" in line.lower()
    )
    assert reference_line == glucose_line + 1

    glucose = by_name["Glucose"]
    assert glucose["page_number"] == 2
    assert glucose["reference_range_original"] == "70 - 99"
    assert glucose["reference_low"] == pytest.approx(70.0)
    assert glucose["reference_high"] == pytest.approx(99.0)
    assert glucose["derived_flag"] == "above_range"

    # The page 1 and page 2 ranges did not leak into each other.
    assert by_name["Creatinine"]["reference_low"] == pytest.approx(0.7)
    assert by_name["Creatinine"]["reference_high"] == pytest.approx(1.3)
    assert by_name["Hemoglobin"]["reference_high"] == pytest.approx(16.0)
