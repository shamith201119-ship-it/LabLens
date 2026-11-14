"""Phase 9.7 backend tests for digital PDF source geometry."""

import io
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient

from app.database import get_connection, init_db
from app.main import app
from app.services.measurement_service import (
    _aligned_digital_line_records,
    _group_digital_words,
    get_measurements,
    structure_report,
)
from app.services.test_dictionary import normalize_name

client = TestClient(app)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "phase9_5"
DIGITAL_EDGE_PDF = FIXTURE_DIR / "digital_edge_cases.pdf"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _box(x0, y0, x1, y1):
    return [x0, y0, x1, y1]


def _structured_measurements(raw_text, metadata, method="digital", page_width=612, page_height=792):
    report_id = str(uuid.uuid4())
    now = _now()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO reports
            (id, original_filename, file_extension, media_type, file_size_bytes,
             sha256_hash, storage_key, status, consent_timestamp, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                report_id,
                "synthetic.pdf",
                "pdf",
                "application/pdf",
                1,
                "synthetic-hash",
                f"synthetic/{report_id}.pdf",
                "uploaded",
                now,
                now,
                now,
            ),
        )
        conn.execute(
            """INSERT INTO page_extractions
            (id, report_id, page_number, extraction_method, raw_text,
             extraction_metadata, page_width, page_height, text_detection_metadata, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                str(uuid.uuid4()),
                report_id,
                1,
                method,
                raw_text,
                json.dumps(metadata),
                page_width,
                page_height,
                json.dumps({"warnings": []}),
                now,
            ),
        )
    try:
        structure_report(report_id)
        return get_measurements(report_id)
    finally:
        with get_connection() as conn:
            conn.execute("DELETE FROM reports WHERE id = ?", (report_id,))


def _run_pipeline(pdf_bytes: bytes, filename: str) -> list[dict]:
    upload = client.post(
        "/api/reports",
        data={"consent": "true"},
        files={"file": (filename, io.BytesIO(pdf_bytes), "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    report_id = upload.json()["id"]

    try:
        extraction = client.post(f"/api/reports/{report_id}/extract")
        assert extraction.status_code == 200, extraction.text
        structure = client.post(f"/api/reports/{report_id}/structure")
        assert structure.status_code == 200, structure.text
        return client.get(f"/api/reports/{report_id}/measurements").json()["measurements"]
    finally:
        client.delete(f"/api/reports/{report_id}")


@pytest.fixture(scope="module", autouse=True)
def _database():
    init_db()


def test_digital_words_group_by_block_and_line():
    words = [
        {"text": "Hemoglobin", "bbox": _box(10, 10, 70, 20), "block": 1, "line": 1, "word": 0},
        {"text": "14.2", "bbox": _box(80, 10, 100, 20), "block": 1, "line": 1, "word": 1},
        {"text": "g/dL", "bbox": _box(110, 10, 130, 20), "block": 1, "line": 1, "word": 2},
    ]

    records = _group_digital_words(words)

    assert len(records) == 1
    assert records[0]["text"] == "Hemoglobin 14.2 g/dL"
    assert records[0]["bbox"] == [10.0, 10.0, 130.0, 20.0]
    assert records[0]["confidence"] is None


def test_digital_union_bbox_for_multi_word_line():
    words = [
        {"text": "Glucose", "bbox": _box(5, 5, 45, 15), "block_no": 2, "line_no": 3, "word_no": 0},
        {"text": "98", "bbox": _box(50, 4, 70, 16), "block_no": 2, "line_no": 3, "word_no": 1},
        {"text": "mg/dL", "bbox": _box(75, 5, 105, 15), "block_no": 2, "line_no": 3, "word_no": 2},
    ]

    raw_text = "Glucose 98 mg/dL"
    records = _aligned_digital_line_records(raw_text, {"words": words})

    assert records is not None
    assert len(records) == 1
    assert records[0]["text"] == raw_text
    assert records[0]["bbox"] == [5.0, 4.0, 105.0, 16.0]


def test_digital_measurement_receives_source_box():
    raw_text = "Hemoglobin: 14.2 g/dL\nReference range: 12.0 - 16.0"
    words = [
        {"text": "Hemoglobin:", "bbox": _box(10, 10, 90, 20), "block": 1, "line": 1, "word": 0},
        {"text": "14.2", "bbox": _box(100, 10, 125, 20), "block": 1, "line": 1, "word": 1},
        {"text": "g/dL", "bbox": _box(130, 10, 160, 20), "block": 1, "line": 1, "word": 2},
        {"text": "Reference", "bbox": _box(10, 30, 75, 40), "block": 1, "line": 2, "word": 0},
        {"text": "range:", "bbox": _box(80, 30, 115, 40), "block": 1, "line": 2, "word": 1},
        {"text": "12.0", "bbox": _box(120, 30, 145, 40), "block": 1, "line": 2, "word": 2},
        {"text": "-", "bbox": _box(150, 30, 155, 40), "block": 1, "line": 2, "word": 3},
        {"text": "16.0", "bbox": _box(160, 30, 185, 40), "block": 1, "line": 2, "word": 4},
    ]

    measurements = _structured_measurements(
        raw_text,
        {"words": words, "width": 612, "height": 792},
        method="digital",
    )

    assert len(measurements) == 1
    measurement = measurements[0]
    assert measurement["source_bbox"] == [10.0, 10.0, 185.0, 40.0]
    assert measurement["ocr_confidence"] is None
    assert measurement["reference_low"] == 12.0
    assert measurement["reference_high"] == 16.0


def test_ambiguous_alignment_leaves_source_box_none():
    measurements = _structured_measurements(
        "Glucose 99 mg/dL",
        {
            "words": [
                {"text": "Hemoglobin", "bbox": _box(10, 10, 70, 20), "block": 1, "line": 1, "word": 0},
                {"text": "14.2", "bbox": _box(80, 10, 100, 20), "block": 1, "line": 1, "word": 1},
            ],
            "width": 612,
            "height": 792,
        },
        method="digital",
    )

    assert len(measurements) == 1
    assert measurements[0]["source_bbox"] is None
    assert measurements[0]["ocr_confidence"] is None


def test_digital_box_stays_within_page_dimensions():
    raw_text = "Hemoglobin: 14.2 g/dL"
    words = [
        {"text": "Hemoglobin:", "bbox": _box(10, 10, 90, 20), "block": 1, "line": 1, "word": 0},
        {"text": "14.2", "bbox": _box(100, 10, 125, 20), "block": 1, "line": 1, "word": 1},
        {"text": "g/dL", "bbox": _box(130, 10, 160, 20), "block": 1, "line": 1, "word": 2},
    ]

    measurements = _structured_measurements(
        raw_text,
        {"words": words, "width": 200, "height": 100},
        method="digital",
        page_width=200,
        page_height=100,
    )

    assert len(measurements) == 1
    bbox = measurements[0]["source_bbox"]
    assert bbox is not None
    x0, y0, x1, y1 = bbox
    assert 0 <= x0 < x1 <= 200
    assert 0 <= y0 < y1 <= 100


def _pdf_bytes_with_page(page_setup) -> bytes:
    document = fitz.open()
    try:
        page = document.new_page(width=300, height=400)
        page_setup(page)
        return document.tobytes()
    finally:
        document.close()


def test_rotated_digital_page_keeps_box_in_page_space():
    def setup(page):
        page.insert_text((50, 100), "Hemoglobin: 14.2 g/dL")
        page.insert_text((50, 120), "Reference range: 12.0 - 16.0")
        page.set_rotation(90)

    measurements = _run_pipeline(_pdf_bytes_with_page(setup), "rotated_digital.pdf")

    assert len(measurements) == 1
    measurement = measurements[0]
    assert measurement["source_bbox"] is not None
    x0, y0, x1, y1 = measurement["source_bbox"]
    assert 0 <= x0 < x1 <= 400
    assert 0 <= y0 < y1 <= 300


def test_cropped_digital_page_keeps_box_in_crop_space():
    def setup(page):
        page.set_cropbox(fitz.Rect(20, 20, 200, 200))
        page.insert_text((30, 60), "Hemoglobin: 14.2 g/dL")
        page.insert_text((30, 80), "Reference range: 12.0 - 16.0")

    measurements = _run_pipeline(_pdf_bytes_with_page(setup), "cropped_digital.pdf")

    assert len(measurements) == 1
    measurement = measurements[0]
    assert measurement["source_bbox"] is not None
    x0, y0, x1, y1 = measurement["source_bbox"]
    assert 0 <= x0 < x1 <= 180
    assert 0 <= y0 < y1 <= 180
