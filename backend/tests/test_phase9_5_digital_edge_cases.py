import io
import json
import re
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient

from app.database import init_db
from app.main import app
from app.services.measurement_service import _parse_line, _parse_number, _parse_range
from app.services.test_dictionary import normalize_name

client = TestClient(app)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "phase9_5"
PDF_PATH = FIXTURE_DIR / "digital_edge_cases.pdf"
GROUND_TRUTH_PATH = FIXTURE_DIR / "digital_edge_cases.json"

EXPECTED = json.loads(GROUND_TRUTH_PATH.read_text(encoding="utf-8"))


def _canonical(name: str) -> str:
    return normalize_name(name)[0]


EXPECTED_BY_NAME = {_canonical(item["test"]): item for item in EXPECTED}


def _threshold(result_text: str) -> float:
    match = re.fullmatch(r"([<>])\s*(\d+(?:\.\d+)?)", result_text)
    assert match, f"Not a qualified result: {result_text!r}"
    return float(match.group(2))


def _pdf_bytes(*lines: str) -> bytes:
    document = fitz.open()
    try:
        page = document.new_page()
        y = 72
        for line in lines:
            page.insert_text((72, y), line)
            y += 18
        return document.tobytes()
    finally:
        document.close()


def _run_pipeline(lines: tuple[str, ...], filename: str) -> list[dict]:
    upload = client.post(
        "/api/reports",
        data={"consent": "true"},
        files={
            "file": (
                filename,
                io.BytesIO(_pdf_bytes(*lines)),
                "application/pdf",
            )
        },
    )
    assert upload.status_code == 201, upload.text
    report_id = upload.json()["id"]

    try:
        extraction = client.post(f"/api/reports/{report_id}/extract")
        assert extraction.status_code == 200, extraction.text
        structure = client.post(f"/api/reports/{report_id}/structure")
        assert structure.status_code == 200, structure.text
        return client.get(
            f"/api/reports/{report_id}/measurements"
        ).json()["measurements"]
    finally:
        client.delete(f"/api/reports/{report_id}")


@pytest.fixture(scope="module", autouse=True)
def _database():
    init_db()


@pytest.fixture(scope="module")
def digital_pipeline():
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


def test_pdf_has_selectable_text_on_both_pages(digital_pipeline):
    with fitz.open(str(PDF_PATH)) as document:
        assert document.page_count == 2
        for page in document:
            assert page.get_text().strip()
            assert page.get_text("words")

        assert len(document[0].search_for("TSH")) == 1
        assert len(document[0].search_for("Vitamin B12")) == 1
        assert len(document[1].search_for("Triglycerides")) == 1
        assert len(document[1].search_for("1,234")) == 1

    pages = digital_pipeline["extraction"]["pages"]
    assert [page["page_number"] for page in pages] == [1, 2]
    assert [page["extraction_method"] for page in pages] == ["digital", "digital"]


def test_both_inequality_directions_and_thresholds(digital_pipeline):
    by_name = {
        _canonical(item["test_name_normalized"] or item["test_name_original"]): item
        for item in digital_pipeline["measurements"]
    }

    tsh = by_name["Thyroid Stimulating Hormone"]
    assert tsh["result_original"] == "<0.5"
    assert tsh["result_numeric"] is None
    assert tsh["result_qualifier"] == "less_than"
    assert _threshold(tsh["result_original"]) == pytest.approx(0.5)

    b12 = by_name["Vitamin B12"]
    assert b12["result_original"] == ">100"
    assert b12["result_numeric"] is None
    assert b12["result_qualifier"] == "greater_than"
    assert _threshold(b12["result_original"]) == pytest.approx(100.0)


def test_missing_reference_range_stays_null(digital_pipeline):
    glucose = next(
        item
        for item in digital_pipeline["measurements"]
        if _canonical(item["test_name_normalized"]) == "Glucose"
    )

    assert glucose["result_original"] == "98"
    assert glucose["reference_range_original"] is None
    assert glucose["reference_low"] is None
    assert glucose["reference_high"] is None
    assert glucose["derived_flag"] == "unknown"


def test_missing_unit_stays_null(digital_pipeline):
    hemoglobin = next(
        item
        for item in digital_pipeline["measurements"]
        if _canonical(item["test_name_normalized"]) == "Hemoglobin"
    )

    assert hemoglobin["result_original"] == "14.2"
    assert hemoglobin["unit_original"] is None
    assert hemoglobin["reference_low"] == pytest.approx(12.0)
    assert hemoglobin["reference_high"] == pytest.approx(16.0)
    assert hemoglobin["derived_flag"] == "within_range"


def test_no_duplicate_measurements(digital_pipeline):
    measurements = digital_pipeline["measurements"]
    names = [
        _canonical(item["test_name_normalized"] or item["test_name_original"])
        for item in measurements
    ]

    assert len(names) == len(set(names))
    assert set(names) == set(EXPECTED_BY_NAME)
    assert len(measurements) == len(EXPECTED)


def test_page_attribution_for_extracted_measurements(digital_pipeline):
    for measurement in digital_pipeline["measurements"]:
        canonical = _canonical(
            measurement["test_name_normalized"] or measurement["test_name_original"]
        )
        expected = EXPECTED_BY_NAME[canonical]
        assert measurement["page_number"] == expected["page"]


def test_thousands_separator_is_parsed_correctly(digital_pipeline):
    by_name = {
        _canonical(item["test_name_normalized"] or item["test_name_original"]): item
        for item in digital_pipeline["measurements"]
    }

    triglycerides = by_name.get("Triglycerides")
    assert triglycerides is not None, (
        "Parser dropped the Triglycerides measurement whose result is 1,234"
    )
    assert triglycerides["page_number"] == 2
    assert triglycerides["result_original"] == "1,234"
    assert triglycerides["result_numeric"] == pytest.approx(1234.0)
    assert triglycerides["unit_original"] == "mg/dL"
    assert triglycerides["reference_range_original"] == "<150"
    assert triglycerides["reference_low"] is None
    assert triglycerides["reference_high"] == pytest.approx(150.0)
    assert triglycerides["derived_flag"] == "above_range"


@pytest.mark.parametrize(
    ("text", "expected"),
    (
        ("1,234", 1234.0),
        ("12,345", 12345.0),
        ("123,456", 123456.0),
        ("1,234.56", 1234.56),
    ),
)
def test_valid_grouped_numbers_parse_and_preserve_text(text, expected):
    assert _parse_number(text) == pytest.approx(expected)

    parsed = _parse_line(f"Triglycerides: {text} mg/dL", 2, "digital", {})
    assert parsed is not None
    assert parsed["result_original"] == text
    assert parsed["result_numeric"] == pytest.approx(expected)
    assert parsed["unit_original"] == "mg/dL"


def test_invalid_comma_grouping_is_not_treated_as_thousands():
    # A single comma without valid three-digit groups keeps the existing
    # decimal-comma fallback and is not expanded to 123.
    assert _parse_number("1,23") == pytest.approx(1.23)
    assert _parse_number("1,23") != 123.0
    assert _parse_number("1,23.45") is None
    assert _parse_number("1,2345") != 12345.0

    # Invalid grouping must not produce a measurement candidate.
    assert _parse_line("Triglycerides: 1,23 mg/dL", 2, "digital", {}) is None
    assert _parse_line("Triglycerides: 1,2345 mg/dL", 2, "digital", {}) is None


@pytest.mark.parametrize(
    "range_text",
    ("1,000 - 2,000", "1,000–2,000", "1,000 to 2,000"),
)
def test_same_line_grouped_reference_range(range_text):
    parsed = _parse_line(
        f"Glucose 1,234 mg/dL {range_text}", 1, "digital", {}
    )

    assert parsed is not None
    assert parsed["result_original"] == "1,234"
    assert parsed["result_numeric"] == pytest.approx(1234.0)
    assert parsed["unit_original"] == "mg/dL"
    assert parsed["reference_range_original"] == range_text
    assert parsed["reference_low"] == pytest.approx(1000.0)
    assert parsed["reference_high"] == pytest.approx(2000.0)
    assert parsed["derived_flag"] == "within_range"


def test_separate_grouped_reference_line_is_attached():
    measurements = _run_pipeline(
        ("Glucose 1,234 mg/dL", "Reference range: 1,000 - 2,000"),
        "grouped_reference_line.pdf",
    )

    assert len(measurements) == 1
    glucose = measurements[0]
    assert _canonical(glucose["test_name_normalized"]) == "Glucose"
    assert glucose["result_original"] == "1,234"
    assert glucose["result_numeric"] == pytest.approx(1234.0)
    assert glucose["unit_original"] == "mg/dL"
    assert glucose["reference_range_original"] == "1,000 - 2,000"
    assert glucose["reference_low"] == pytest.approx(1000.0)
    assert glucose["reference_high"] == pytest.approx(2000.0)
    assert glucose["derived_flag"] == "within_range"
    assert glucose["page_number"] == 1
    assert glucose["source_text"] == "Glucose 1,234 mg/dL"


@pytest.mark.parametrize(
    ("line", "low", "high", "flag"),
    (
        ("Hemoglobin: 14.2 g/dL Reference: 12.0 - 16.0", 12.0, 16.0, "within_range"),
        ("Creatinine: 0.95 mg/dL Reference: 0.60–1.20", 0.6, 1.2, "within_range"),
        ("Glucose: 98 mg/dL Reference: 70 - 99", 70.0, 99.0, "within_range"),
        ("Glucose: 98 mg/dL Reference: <150", None, 150.0, "within_range"),
        ("Triglycerides: 180 mg/dL Reference: <150", None, 150.0, "above_range"),
        ("Glucose: 98 mg/dL Reference: >60", 60.0, None, "within_range"),
    ),
)
def test_existing_ranges_still_parse(line, low, high, flag):
    parsed = _parse_line(line, 1, "digital", {})

    assert parsed is not None
    if low is None:
        assert parsed["reference_low"] is None
    else:
        assert parsed["reference_low"] == pytest.approx(low)
    if high is None:
        assert parsed["reference_high"] is None
    else:
        assert parsed["reference_high"] == pytest.approx(high)
    assert parsed["derived_flag"] == flag


def test_parse_range_existing_forms_still_parse():
    assert _parse_range("70 - 99")[:2] == (70.0, 99.0)
    assert _parse_range("0.60–1.20")[:2] == (0.6, 1.2)
    assert _parse_range("< 200")[:2] == (None, 200.0)
    assert _parse_range(">= 60")[:2] == (60.0, None)


def test_malformed_grouping_does_not_create_reference_range():
    parsed = _parse_line(
        "Glucose 1,234 mg/dL 1,00 - 2,000", 1, "digital", {}
    )

    assert parsed is not None
    assert parsed["result_numeric"] == pytest.approx(1234.0)
    assert parsed["reference_range_original"] is None
    assert parsed["reference_low"] is None
    assert parsed["reference_high"] is None
    assert parsed["derived_flag"] == "unknown"

    assert _parse_range("1,00 - 2,000")[:2] == (None, None)
    assert _parse_range("1,000 - 2,00")[:2] == (None, None)
    assert _parse_range("1,23.45 - 2,000")[:2] == (None, None)

    measurements = _run_pipeline(
        ("Glucose 1,234 mg/dL", "Reference range: 1,00 - 2,000"),
        "invalid_grouped_reference_line.pdf",
    )

    assert len(measurements) == 1
    assert measurements[0]["reference_range_original"] is None
    assert measurements[0]["reference_low"] is None
    assert measurements[0]["reference_high"] is None
