import json
import uuid
from datetime import datetime, timezone

import pytest

from app.database import get_connection, init_db
from app.services.image_processor import assemble_ocr_line_records, assemble_ocr_lines
from app.services.measurement_service import get_measurements, structure_report


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _box(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


@pytest.fixture(scope="module", autouse=True)
def _database():
    init_db()


def _structured_measurements(raw_text, metadata, method="ocr"):
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
                "synthetic.png",
                "png",
                "image/png",
                1,
                "synthetic-hash",
                f"synthetic/{report_id}.png",
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
                1000,
                800,
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


def test_ocr_items_assemble_into_line_records():
    items = [
        {"text": "Hemoglobin", "bbox": _box(10, 10, 70, 20), "confidence": 0.95},
        {"text": "14.2", "bbox": _box(80, 10, 100, 20), "confidence": 0.90},
        {"text": "g/dL", "bbox": _box(110, 10, 130, 20), "confidence": 0.85},
    ]

    records = assemble_ocr_line_records(items)

    assert records == [{
        "text": "Hemoglobin 14.2 g/dL",
        "bbox": [10.0, 10.0, 130.0, 20.0],
        "confidence": 0.85,
    }]
    assert assemble_ocr_lines(items) == "Hemoglobin 14.2 g/dL"


def test_line_confidence_uses_minimum_available_score():
    items = [
        {"text": "Hemoglobin", "bbox": _box(0, 0, 50, 10), "confidence": 0.91},
        {"text": "14.2", "bbox": _box(60, 0, 80, 10), "confidence": 0.72},
        {"text": "g/dL", "bbox": _box(90, 0, 110, 10), "confidence": None},
        {"text": "12.0", "bbox": _box(120, 0, 140, 10)},
    ]

    record = assemble_ocr_line_records(items)[0]

    assert record["confidence"] == 0.72


def test_missing_confidence_stays_none():
    items = [
        {"text": "Hemoglobin", "bbox": _box(0, 0, 50, 10), "confidence": None},
        {"text": "14.2", "bbox": _box(60, 0, 80, 10)},
        {"text": "g/dL", "bbox": _box(90, 0, 110, 10), "confidence": None},
    ]

    record = assemble_ocr_line_records(items)[0]

    assert record["confidence"] is None

    measurements = _structured_measurements(
        assemble_ocr_lines(items),
        {"ocr_items": items},
    )
    assert len(measurements) == 1
    assert measurements[0]["source_bbox"] == [0.0, 0.0, 110.0, 10.0]
    assert measurements[0]["ocr_confidence"] is None


def test_malformed_bbox_does_not_invent_coordinates():
    items = [
        {"text": "Hemoglobin", "bbox": None, "confidence": 0.9},
        {"text": "14.2", "bbox": [1, 2], "confidence": 0.8},
    ]

    record = assemble_ocr_line_records(items)[0]

    assert record["text"] == "Hemoglobin 14.2"
    assert record["bbox"] is None
    assert record["confidence"] == 0.8


def test_reference_range_line_extends_measurement_bbox():
    items = [
        {"text": "Hemoglobin", "bbox": _box(10, 10, 70, 20), "confidence": 0.95},
        {"text": "14.2", "bbox": _box(80, 10, 100, 20), "confidence": 0.90},
        {"text": "g/dL", "bbox": _box(110, 10, 130, 20), "confidence": 0.85},
        {"text": "Reference", "bbox": _box(10, 30, 60, 40), "confidence": 0.80},
        {"text": "range:", "bbox": _box(65, 30, 95, 40), "confidence": 0.88},
        {"text": "12.0", "bbox": _box(100, 30, 120, 40), "confidence": 0.92},
        {"text": "-", "bbox": _box(125, 30, 130, 40), "confidence": 0.86},
        {"text": "16.0", "bbox": _box(135, 30, 155, 40), "confidence": 0.90},
        {"text": "g/dL", "bbox": _box(160, 30, 180, 40), "confidence": 0.84},
    ]
    raw_text = assemble_ocr_lines(items)
    assert raw_text.splitlines() == [
        "Hemoglobin 14.2 g/dL",
        "Reference range: 12.0 - 16.0 g/dL",
    ]

    measurements = _structured_measurements(raw_text, {"ocr_items": items})

    assert len(measurements) == 1
    measurement = measurements[0]
    assert measurement["source_bbox"] == [10.0, 10.0, 180.0, 40.0]
    assert measurement["ocr_confidence"] == 0.80
    assert measurement["reference_low"] == 12.0
    assert measurement["reference_high"] == 16.0
    assert measurement["derived_flag"] == "within_range"


def test_misaligned_text_does_not_attach_evidence():
    items = [
        {"text": "Hemoglobin", "bbox": _box(10, 10, 70, 20), "confidence": 0.95},
        {"text": "14.2", "bbox": _box(80, 10, 100, 20), "confidence": 0.90},
        {"text": "g/dL", "bbox": _box(110, 10, 130, 20), "confidence": 0.85},
    ]

    measurements = _structured_measurements(
        "Glucose 99 mg/dL",
        {"ocr_items": items},
    )

    assert len(measurements) == 1
    assert measurements[0]["test_name_original"] == "Glucose"
    assert measurements[0]["source_bbox"] is None
    assert measurements[0]["ocr_confidence"] is None


def test_digital_measurement_keeps_working_without_ocr_confidence():
    measurements = _structured_measurements(
        "Hemoglobin: 14.2 g/dL\nReference range: 12.0 - 16.0",
        {"words": [{"text": "Hemoglobin", "bbox": [1, 2, 3, 4]}], "width": 612, "height": 792},
        method="digital",
    )

    assert len(measurements) == 1
    measurement = measurements[0]
    assert measurement["page_number"] == 1
    assert measurement["source_text"]
    assert measurement["extraction_method"] == "digital"
    assert measurement["source_bbox"] is None
    assert measurement["ocr_confidence"] is None
    assert measurement["reference_low"] == 12.0
    assert measurement["reference_high"] == 16.0


def test_legacy_metadata_without_ocr_items_structures():
    measurements = _structured_measurements(
        "Hemoglobin: 14.2 g/dL\nReference range: 12.0 - 16.0",
        {"quality": {"width": 1000, "height": 800}},
        method="ocr",
    )

    assert len(measurements) == 1
    measurement = measurements[0]
    assert measurement["page_number"] == 1
    assert measurement["source_text"]
    assert measurement["extraction_method"] == "ocr"
    assert measurement["source_bbox"] is None
    assert measurement["ocr_confidence"] is None
