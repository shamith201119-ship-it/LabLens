import io
import json

import fitz
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def pdf_from_lines(lines: list[str]) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    y = 72
    for ln in lines:
        page.insert_text((72, y), ln, fontsize=11)
        y += 16
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def upload_and_extract_and_structure(lines):
    data = pdf_from_lines(lines)
    files = {"file": ("t.pdf", io.BytesIO(data), "application/pdf")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    client.post(f"/api/reports/{rid}/extract")
    client.post(f"/api/reports/{rid}/structure")
    ms = client.get(f"/api/reports/{rid}/measurements").json()["measurements"]
    return rid, ms


def cleanup(rid):
    client.delete(f"/api/reports/{rid}")


# ---------- Cases ----------

def test_case_cbc_multi():
    lines = [
        "Complete Blood Count",
        "Hemoglobin: 11.2 g/dL",
        "Reference range: 12.0 - 16.0",
        "RBC: 4.5 x10^6/uL",
        "Reference range: 4.0 - 5.5",
        "WBC: 7500 /uL",
        "Reference range: 4000 - 11000",
        "Platelet Count: 250000 /uL",
        "Reference range: 150000 - 400000",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    names = [m["test_name_normalized"] for m in ms]
    assert "Hemoglobin" in names
    hgb = [m for m in ms if m["test_name_normalized"] == "Hemoglobin"][0]
    assert hgb["result_original"] == "11.2"
    assert hgb["result_numeric"] == 11.2
    assert hgb["unit_original"] == "g/dL"
    assert hgb["reference_low"] == 12.0 and hgb["reference_high"] == 16.0
    assert hgb["derived_flag"] == "below_range"
    cleanup(rid)


def test_case_lipid():
    lines = [
        "Lipid Profile",
        "Total Cholesterol: 185 mg/dL",
        "Reference range: 0 - 200",
        "HDL Cholesterol: 55 mg/dL",
        "Reference range: 40 - 60",
        "LDL Cholesterol: 110 mg/dL",
        "Reference range: 0 - 100",
        "Triglycerides: 140 mg/dL",
        "Reference range: 0 - 150",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    names = [m["test_name_normalized"] for m in ms]
    assert "Total Cholesterol" in names
    assert "HDL Cholesterol" in names
    assert "LDL Cholesterol" in names
    assert "Triglycerides" in names
    tc = [m for m in ms if m["test_name_normalized"] == "Total Cholesterol"][0]
    assert tc["result_numeric"] == 185 and tc["derived_flag"] == "within_range"
    ldl = [m for m in ms if m["test_name_normalized"] == "LDL Cholesterol"][0]
    assert ldl["derived_flag"] == "above_range"
    cleanup(rid)


def test_case_glucose_hba1c():
    lines = [
        "Glucose: 95 mg/dL",
        "Reference range: 70 - 100",
        "HbA1c: 5.6 %",
        "Reference range: 4.0 - 5.6",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    names = [m["test_name_normalized"] for m in ms]
    assert "Glucose" in names
    assert "HbA1c" in names
    cleanup(rid)


def test_case_liver():
    lines = [
        "ALT: 25 U/L",
        "Reference range: 7 - 56",
        "AST: 22 U/L",
        "Reference range: 10 - 40",
        "Total Bilirubin: 0.8 mg/dL",
        "Reference range: 0.1 - 1.2",
        "Albumin: 4.2 g/dL",
        "Reference range: 3.5 - 5.0",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    names = [m["test_name_normalized"] for m in ms]
    assert "Alanine Aminotransferase" in names
    assert "Aspartate Aminotransferase" in names
    assert "Total Bilirubin" in names
    assert "Albumin" in names
    cleanup(rid)


def test_case_kidney():
    lines = [
        "Creatinine: 0.9 mg/dL",
        "Reference range: 0.6 - 1.2",
        "BUN: 14 mg/dL",
        "Reference range: 7 - 20",
        "Uric Acid: 5.2 mg/dL",
        "Reference range: 3.5 - 7.2",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    names = [m["test_name_normalized"] for m in ms]
    assert "Creatinine" in names
    assert "Blood Urea Nitrogen" in names
    assert "Uric Acid" in names
    cleanup(rid)


def test_case_decimal_precision():
    lines = [
        "Creatinine: 0.95 mg/dL",
        "Reference range: 0.60 - 1.20",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    m = ms[0]
    assert m["result_original"] == "0.95"
    assert m["result_numeric"] == 0.95
    cleanup(rid)


def test_case_qualitative():
    lines = [
        "HIV Antibody: Negative",
        "Reference range: Negative",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    # qualitative: no numeric; may be parsed as needs_review or skipped
    # At minimum, do not crash; if parsed, qualifier should be set
    cleanup(rid)


def test_case_one_sided_less():
    lines = [
        "CRP: <5 mg/L",
        "Reference range: <5",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    if ms:
        m = ms[0]
        assert m["result_qualifier"] == "less_than"
        assert m["result_numeric"] is None
    cleanup(rid)


def test_case_one_sided_greater():
    lines = [
        "RF: >100 IU/mL",
        "Reference range: <20",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    if ms:
        m = ms[0]
        assert m["result_qualifier"] == "greater_than"
    cleanup(rid)


def test_case_missing_unit():
    lines = [
        "Glucose: 95",
        "Reference range: 70 - 100",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    if ms:
        m = ms[0]
        assert m["unit_original"] is None
        assert m["verification_status"] == "needs_review"
    cleanup(rid)


def test_case_missing_range():
    lines = [
        "Glucose: 95 mg/dL",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    if ms:
        m = ms[0]
        assert m["reference_range_original"] is None
        assert m["derived_flag"] == "unknown"
    cleanup(rid)


def test_case_unsupported():
    lines = [
        "Frobnicator: 42 frobs",
        "Reference range: 0 - 10",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    if ms:
        m = ms[0]
        assert m["test_code"] is None
        assert m["verification_status"] == "needs_review"
    cleanup(rid)


def test_case_multi_page():
    doc = fitz.open()
    p1 = doc.new_page()
    p1.insert_text((72, 72), "Hemoglobin: 13.5 g/dL")
    p1.insert_text((72, 90), "Reference range: 12.0 - 16.0")
    p2 = doc.new_page()
    p2.insert_text((72, 72), "Glucose: 100 mg/dL")
    p2.insert_text((72, 90), "Reference range: 70 - 100")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    data = buf.getvalue()
    files = {"file": ("t.pdf", io.BytesIO(data), "application/pdf")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    rid = r.json()["id"]
    client.post(f"/api/reports/{rid}/extract")
    client.post(f"/api/reports/{rid}/structure")
    ms = client.get(f"/api/reports/{rid}/measurements").json()["measurements"]
    pages = {m["test_name_normalized"]: m["page_number"] for m in ms}
    assert pages.get("Hemoglobin") == 1
    assert pages.get("Glucose") == 2
    cleanup(rid)


def test_case_wrapped_range():
    lines = [
        "Hemoglobin: 13.5 g/dL",
        "Reference range: 12.0 -",
        "16.0",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    # range may not parse due to wrap; at least no crash
    cleanup(rid)


def test_case_multi_measurement_line():
    lines = [
        "Hemoglobin 13.5 g/dL 12.0 - 16.0",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    # best-effort; no crash
    cleanup(rid)
