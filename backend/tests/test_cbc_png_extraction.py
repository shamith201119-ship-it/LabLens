import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.database import get_connection, init_db
from app.services.ocr_engine import ocr_image
from app.services.image_processor import assemble_ocr_line_records, assemble_ocr_lines
from app.services.measurement_service import _parse_line, get_measurements, structure_report


FIXTURE = (
    Path(__file__).parent
    / "fixtures"
    / "phase8_1_accuracy"
    / "cbc_report.png"
)

EXPECTED = [
    {
        "name": "Hemoglobin",
        "value": 14.2,
        "unit": "g/dL",
        "low": 12.0,
        "high": 16.0,
    },
    {
        "name": "White Blood Cell Count",
        "value": 8.5,
        "unit": "x10^3/uL",
        "low": 4.0,
        "high": 11.0,
    },
    {
        "name": "PlateletCount",
        "value": 240.0,
        "unit": "x10^3/uL",
        "low": 150.0,
        "high": 450.0,
    },
    {
        "name": "Red Blood Cell Count",
        "value": 4.65,
        "unit": "mil/uL",
        "low": 4.20,
        "high": 5.40,
    },
    {
        "name": "Hematocrit",
        "value": 42.0,
        "unit": "%",
        "low": 37.0,
        "high": 48.0,
    },
]


@pytest.fixture(scope="module")
def cbc_ocr_data():
    assert FIXTURE.is_file(), f"CBC fixture missing: {FIXTURE}"

    ocr_items = ocr_image(str(FIXTURE))
    return {
        "items": ocr_items,
        "text": assemble_ocr_lines(ocr_items),
        "records": assemble_ocr_line_records(ocr_items),
    }


@pytest.fixture(scope="module")
def extracted_measurements(cbc_ocr_data):
    measurements = []

    for line in cbc_ocr_data["text"].splitlines():
        result = _parse_line(
            line,
            page_number=1,
            method="image",
            meta={},
        )

        if result:
            measurements.append(result)

    return measurements


@pytest.mark.parametrize("expected", EXPECTED)
def test_cbc_biomarker_extraction(extracted_measurements, expected):
    matches = [
        item for item in extracted_measurements
        if item.get("test_name_original") == expected["name"]
    ]

    assert matches, f"Missing biomarker: {expected['name']}"

    actual = matches[0]

    assert actual["result_numeric"] == pytest.approx(expected["value"])
    assert actual["unit_original"] == expected["unit"]
    assert actual["reference_low"] == pytest.approx(expected["low"])
    assert actual["reference_high"] == pytest.approx(expected["high"])
    assert actual["derived_flag"] == "within_range"


def test_cbc_measurements_retain_ocr_evidence(cbc_ocr_data):
    init_db()
    report_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    with get_connection() as conn:
        conn.execute(
            """INSERT INTO reports
            (id, original_filename, file_extension, media_type, file_size_bytes,
             sha256_hash, storage_key, status, consent_timestamp, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                report_id,
                "cbc_report.png",
                "png",
                "image/png",
                1,
                "cbc-fixture-hash",
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
                "ocr",
                cbc_ocr_data["text"],
                json.dumps({"ocr_items": cbc_ocr_data["items"]}),
                1000,
                800,
                json.dumps({"warnings": []}),
                now,
            ),
        )

    try:
        result = structure_report(report_id)
        assert result["measurements_saved"] == len(EXPECTED)
        measurements = get_measurements(report_id)
    finally:
        with get_connection() as conn:
            conn.execute("DELETE FROM reports WHERE id = ?", (report_id,))

    assert len(measurements) == len(EXPECTED)
    by_name = {m["test_name_original"]: m for m in measurements}

    for expected in EXPECTED:
        assert expected["name"] in by_name, f"Missing biomarker: {expected['name']}"
        measurement = by_name[expected["name"]]
        matching_records = [
            record for record in cbc_ocr_data["records"]
            if expected["name"] in record["text"]
            and measurement["result_original"] in record["text"]
        ]
        assert len(matching_records) == 1
        record = matching_records[0]

        assert measurement["page_number"] == 1
        assert measurement["extraction_method"] == "ocr"
        assert measurement["source_text"]
        assert measurement["source_bbox"] == record["bbox"]
        assert measurement["ocr_confidence"] == pytest.approx(record["confidence"])
        assert 0.0 <= measurement["ocr_confidence"] <= 1.0
