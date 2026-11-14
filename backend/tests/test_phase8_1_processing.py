import os
import pytest
from app.services.image_processor import assemble_ocr_lines
from app.services.measurement_service import _parse_line, _parse_range, _parse_number

def test_spatial_line_assembly():
    items = [
        {"text": "COMPLETE BLOOD COUNT (CBC)", "bbox": [[37, 29], [194, 29], [194, 42], [37, 42]]},
        {"text": "Hemoglobin", "bbox": [[37, 69], [99, 69], [99, 83], [37, 83]]},
        {"text": "14.2 g/dL 12.0 - 16.0", "bbox": [[139, 69], [244, 69], [244, 83], [139, 83]]},
        {"text": "PlateletCount", "bbox": [[37, 148], [108, 148], [108, 163], [37, 163]]},
        {"text": "240 x10^3/uL 150 - 450", "bbox": [[137, 147], [255, 147], [255, 161], [137, 161]]},
    ]
    raw = assemble_ocr_lines(items)
    lines = raw.splitlines()
    assert len(lines) == 3
    assert "COMPLETE BLOOD COUNT" in lines[0]
    assert "Hemoglobin 14.2 g/dL 12.0 - 16.0" in lines[1]
    assert "PlateletCount 240 x10^3/uL 150 - 450" in lines[2]

def test_header_rejection():
    # Patient headers, doctor lines, and report metadata must be rejected
    assert _parse_line("Patient: Synthetic Jane Doe Date: 2026-11-10", 1, "digital", {}) is None
    assert _parse_line("Doctor: Dr. Smith Page 1 of 2", 1, "digital", {}) is None
    assert _parse_line("Test Name   Result   Units   Reference Interval   Flag", 1, "digital", {}) is None
    assert _parse_line("Accession: 987654321 Date of Birth: 1980-01-01", 1, "digital", {}) is None

def test_hba1c_parsing_not_splitting_on_1():
    # The '1' in 'A1c' must NOT be mistaken for the numeric measurement value
    res = _parse_line("Hemoglobin A1c 6.2 % 4.0 - 5.6 High", 1, "digital", {})
    assert res is not None
    assert res["test_name_original"] == "Hemoglobin A1c"
    assert res["result_original"] == "6.2"
    assert res["result_numeric"] == 6.2
    assert res["unit_original"] == "%"
    assert res["reference_low"] == 4.0
    assert res["reference_high"] == 5.6
    assert res["lab_flag"] == "High"
    assert res["derived_flag"] == "above_range"

def test_inequality_reference_range():
    # Ranges like '< 200' and '< 150' must be recognized and evaluated
    res1 = _parse_line("Total Cholesterol 220 mg/dL < 200 High", 1, "digital", {})
    assert res1 is not None
    assert res1["test_name_original"] == "Total Cholesterol"
    assert res1["result_numeric"] == 220.0
    assert res1["unit_original"] == "mg/dL"
    assert res1["reference_range_original"] == "< 200"
    assert res1["reference_high"] == 200.0
    assert res1["derived_flag"] == "above_range"

    res2 = _parse_line("Triglycerides 120 mg/dL < 150 Normal", 1, "digital", {})
    assert res2 is not None
    assert res2["result_numeric"] == 120.0
    assert res2["reference_high"] == 150.0
    assert res2["derived_flag"] == "within_range"

def test_parse_range_bounds():
    low, high, s = _parse_range("70 - 99")
    assert low == 70.0 and high == 99.0
    low, high, s = _parse_range("< 200")
    assert low is None and high == 200.0
    low, high, s = _parse_range(">= 60")
    assert low == 60.0 and high is None
