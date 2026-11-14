import io

import fitz
import pytest
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


def upload_and_extract_and_structure(lines: list[str]):
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


def run_full_flow(lines: list[str]):
    """Upload -> extract -> structure -> verify first measurement -> analyse -> get."""
    rid, ms = upload_and_extract_and_structure(lines)
    if ms:
        vr = client.post(f"/api/reports/{rid}/measurements/{ms[0]['id']}/verify")
        assert vr.status_code == 200
    a = client.post(f"/api/reports/{rid}/analyse")
    assert a.status_code == 200, a.text
    g = client.get(f"/api/reports/{rid}/analysis")
    assert g.status_code == 200, g.text
    return rid, ms, a.json(), g.json()


# ---------- Phase 4: individual measurement analysis ----------

def test_phase4_within_range_no_finding():
    rid, ms, a, g = run_full_flow(["Glucose: 95 mg/dL", "Reference range: 70 - 100"])
    assert a["status"] == "completed"
    assert a["summary"]["within_range"] == 1
    assert a["summary"]["findings_count"] == 0
    assert a["summary"]["eligible_measurements"] == 1
    assert g["status"] == "completed"
    assert g["summary"]["within_range"] == 1
    assert g["critical_flags"] == []
    cleanup(rid)


def test_phase4_below_range_generates_cbc_finding():
    rid, ms, a, g = run_full_flow(["Hemoglobin: 11.2 g/dL", "Reference range: 12.0 - 16.0"])
    assert a["summary"]["below_range"] == 1
    assert a["summary"]["above_range"] == 0
    assert a["summary"]["within_range"] == 0
    assert a["summary"]["findings_count"] == 1
    assert [f["finding_code"] for f in a["findings"]] == ["CBC_ANEMIA_PATTERN"]
    f = a["findings"][0]
    assert f["metadata"]["measurements"][0]["value"] == "11.2"
    assert f["metadata"]["measurements"][0]["comparison_status"] == "below_range"
    assert f["metadata"]["rule_version"] == "phase4-rules-1.0"
    assert f["metadata"]["review_status"] == "reviewed"
    assert g["critical_flags"] == []
    cleanup(rid)


def test_phase4_above_range_generates_lipid_finding():
    rid, ms, a, g = run_full_flow(["LDL Cholesterol: 110 mg/dL", "Reference range: 0 - 100"])
    assert a["summary"]["above_range"] == 1
    assert a["summary"]["findings_count"] == 1
    assert [f["finding_code"] for f in a["findings"]] == ["LIPID_ELEVATED_LDL"]
    cleanup(rid)


def test_phase4_missing_range_unavailable_no_finding():
    rid, ms, a, g = run_full_flow(["Glucose: 95 mg/dL"])
    assert a["summary"]["unavailable"] == 1
    assert a["summary"]["findings_count"] == 0
    cleanup(rid)


def test_phase4_missing_unit_review_required_no_finding():
    rid, ms, a, g = run_full_flow(["Glucose: 95", "Reference range: 70 - 100"])
    assert a["summary"]["review_required"] == 1
    assert a["summary"]["findings_count"] == 0
    cleanup(rid)


def test_phase4_incompatible_units_no_comparison():
    rid, ms, a, g = run_full_flow(["Glucose: 95 mg/dL", "Reference range: 70 - 100"])
    pr = client.patch(
        f"/api/reports/{rid}/measurements/{ms[0]['id']}",
        json={"unit_original": "frobnicators"},
    )
    assert pr.status_code == 200
    client.post(f"/api/reports/{rid}/measurements/{ms[0]['id']}/verify")
    a2 = client.post(f"/api/reports/{rid}/analyse")
    data = a2.json()
    assert data["summary"]["incompatible_units"] == 1
    assert data["summary"]["findings_count"] == 0
    cleanup(rid)


def test_phase4_qualitative_not_compared_numerically():
    rid, ms, a, g = run_full_flow(["Glucose: <100 mg/dL", "Reference range: 70 - 100"])
    assert a["summary"]["qualitative"] == 1
    assert a["summary"]["findings_count"] == 0
    cleanup(rid)


def test_phase4_unsupported_not_analysed():
    rid, ms, a, g = run_full_flow(["Frobnicator: 42 frobs", "Reference range: 0 - 10"])
    assert a["summary"]["total_measurements"] == 1
    assert a["summary"]["eligible_measurements"] == 0
    assert a["summary"]["unsupported"] == 1
    assert a["summary"]["findings_count"] == 0
    cleanup(rid)


def test_phase4_no_measurements_report_completed():
    rid, ms, a, g = run_full_flow(["No laboratory values present"])
    assert a["status"] == "completed"
    assert a["summary"]["total_measurements"] == 0
    assert a["summary"]["findings_count"] == 0
    cleanup(rid)


def test_phase4_duplicate_analysis_creates_new_versioned_run():
    rid, ms, a, g = run_full_flow(["Glucose: 95 mg/dL", "Reference range: 70 - 100"])
    a2 = client.post(f"/api/reports/{rid}/analyse")
    assert a2.status_code == 200
    data2 = a2.json()
    assert data2["status"] == "completed"
    assert data2["analysis_id"] != a["analysis_id"]
    g2 = client.get(f"/api/reports/{rid}/analysis")
    assert g2.status_code == 200
    assert g2.json()["analysis_id"] == data2["analysis_id"]
    cleanup(rid)


def test_phase4_lab_flag_correction_is_rejected():
    rid, ms, a, g = run_full_flow(["Hemoglobin: 11.2 g/dL", "Reference range: 12.0 - 16.0"])
    response = client.patch(
        f"/api/reports/{rid}/measurements/{ms[0]['id']}",
        json={"lab_flag": "Critical"},
    )
    assert response.status_code == 400
    client.post(f"/api/reports/{rid}/measurements/{ms[0]['id']}/verify")
    a2 = client.post(f"/api/reports/{rid}/analyse").json()
    assert len(a2["critical_flags"]) == 0
    cleanup(rid)


# ---------- Phase 4: historical comparison ----------

def test_phase4_historical_comparison_with_difference():
    r1, _, _, _ = run_full_flow(["Hemoglobin: 13.5 g/dL", "Reference range: 12.0 - 16.0"])
    r2, _, _, _ = run_full_flow(["Hemoglobin: 11.2 g/dL", "Reference range: 12.0 - 16.0"])
    try:
        c = client.post(
            "/api/reports/compare",
            json={"report_ids": [r2, r1]},
        )
        assert c.status_code == 200, c.text
        comps = c.json()["comparisons"]
        assert len(comps) == 1
        comp = comps[0]
        assert comp["test_name"] == "Hemoglobin"
        assert comp["status"] == "comparable"
        assert comp["unit_compatible"] is True
        assert comp["absolute_difference"] == pytest.approx(2.3)
        assert comp["percentage_difference"] == pytest.approx(17.037, abs=0.01)
        assert comp["previous"]["value"] == "13.5"
        assert comp["latest"]["value"] == "11.2"
    finally:
        client.delete(f"/api/reports/{r1}")
        client.delete(f"/api/reports/{r2}")


def test_phase4_compare_rejects_invalid_reports():
    r, _, _, _ = run_full_flow(["Glucose: 95 mg/dL", "Reference range: 70 - 100"])
    try:
        bad = client.post("/api/reports/compare", json={"report_ids": ["missing-report-1", "missing-report-2"]})
        assert bad.status_code == 404
        one = client.post("/api/reports/compare", json={"report_ids": [r]})
        assert one.status_code == 400
    finally:
        client.delete(f"/api/reports/{r}")


def test_phase4_compare_requires_two_reports():
    r, _, _, _ = run_full_flow(["Glucose: 95 mg/dL", "Reference range: 70 - 100"])
    try:
        one = client.post("/api/reports/compare", json={"report_ids": [r]})
        assert one.status_code == 400
    finally:
        client.delete(f"/api/reports/{r}")


# ---------- Phase 4: Extended Synthetic Relationship & Accuracy Tests ----------

def run_full_flow_all_verified(lines: list[str]):
    """Upload -> extract -> structure -> verify ALL measurements -> analyse -> get."""
    rid, ms = upload_and_extract_and_structure(lines)
    for m in ms:
        vr = client.post(f"/api/reports/{rid}/measurements/{m['id']}/verify")
        assert vr.status_code == 200
    a = client.post(f"/api/reports/{rid}/analyse")
    assert a.status_code == 200, a.text
    g = client.get(f"/api/reports/{rid}/analysis")
    assert g.status_code == 200, g.text
    return rid, ms, a.json(), g.json()


def test_phase4_one_sided_ranges():
    # Upper bound only (Triglycerides < 150)
    r1, _, a1, _ = run_full_flow(["Triglycerides: 180 mg/dL", "Reference range: 0 - 150"])
    assert a1["summary"]["above_range"] == 1
    assert any(f["finding_code"] == "LIPID_ELEVATED_TRIGLYCERIDES" for f in a1["findings"])
    cleanup(r1)

    # Lower bound only (HDL Cholesterol > 40)
    r2, _, a2, _ = run_full_flow(["HDL Cholesterol: 32 mg/dL", "Reference range: 40 - 60"])
    assert a2["summary"]["below_range"] == 1
    assert any(f["finding_code"] == "LIPID_LOW_HDL" for f in a2["findings"])
    cleanup(r2)


def test_phase4_conflicting_lab_flag_preservation():
    rid, ms, a, g = run_full_flow(["Glucose: 165 mg/dL", "Reference range: 70 - 100"])
    response = client.patch(
        f"/api/reports/{rid}/measurements/{ms[0]['id']}",
        json={"lab_flag": "Normal"},
    )
    assert response.status_code == 400
    client.post(f"/api/reports/{rid}/measurements/{ms[0]['id']}/verify")
    a2 = client.post(f"/api/reports/{rid}/analyse").json()
    ass = a2["assessments"][0]
    # Ordinary corrections cannot change the extracted lab flag.
    assert ass["lab_flag"] is None
    assert ass["comparison_status"] == "above_range"
    cleanup(rid)


def test_phase4_cbc_microcytic_positive_and_negative():
    # Positive: low Hemoglobin AND low MCV
    pos_lines = [
        "Complete Blood Count",
        "Hemoglobin: 10.2 g/dL",
        "Reference range: 12.0 - 16.0",
        "MCV: 72 fl",
        "Reference range: 80 - 100",
    ]
    r_pos, _, a_pos, _ = run_full_flow_all_verified(pos_lines)
    codes_pos = [f["finding_code"] for f in a_pos["findings"]]
    assert "CBC_ANEMIA_PATTERN" in codes_pos
    assert "CBC_MICROCYTIC_PATTERN" in codes_pos
    cleanup(r_pos)

    # Negative: low Hemoglobin but NORMAL MCV (normocytic)
    neg_lines = [
        "Complete Blood Count",
        "Hemoglobin: 10.2 g/dL",
        "Reference range: 12.0 - 16.0",
        "MCV: 88 fl",
        "Reference range: 80 - 100",
    ]
    r_neg, _, a_neg, _ = run_full_flow_all_verified(neg_lines)
    codes_neg = [f["finding_code"] for f in a_neg["findings"]]
    assert "CBC_ANEMIA_PATTERN" in codes_neg
    assert "CBC_MICROCYTIC_PATTERN" not in codes_neg
    cleanup(r_neg)


def test_phase4_cbc_macrocytic_pattern():
    lines = [
        "Complete Blood Count",
        "Hemoglobin: 10.5 g/dL",
        "Reference range: 12.0 - 16.0",
        "MCV: 106 fl",
        "Reference range: 80 - 100",
    ]
    rid, _, a, _ = run_full_flow_all_verified(lines)
    codes = [f["finding_code"] for f in a["findings"]]
    assert "CBC_ANEMIA_PATTERN" in codes
    assert "CBC_MACROCYTIC_PATTERN" in codes
    cleanup(rid)


def test_phase4_cbc_wbc_and_platelets_patterns():
    # High WBC (leukocytosis) & Low Platelets (thrombocytopenia)
    lines = [
        "Complete Blood Count",
        "WBC: 16500 cells/uL",
        "Reference range: 4000 - 11000",
        "Platelet Count: 95000 cells/uL",
        "Reference range: 150000 - 450000",
    ]
    rid, _, a, _ = run_full_flow_all_verified(lines)
    codes = [f["finding_code"] for f in a["findings"]]
    assert "CBC_LEUKOCYTOSIS_PATTERN" in codes
    assert "CBC_THROMBOCYTOPENIA_PATTERN" in codes
    cleanup(rid)

    # Low WBC (leukopenia) & High Platelets (thrombocytosis)
    lines2 = [
        "Complete Blood Count",
        "WBC: 2800 cells/uL",
        "Reference range: 4000 - 11000",
        "Platelet Count: 520000 cells/uL",
        "Reference range: 150000 - 450000",
    ]
    rid2, _, a2, _ = run_full_flow_all_verified(lines2)
    codes2 = [f["finding_code"] for f in a2["findings"]]
    assert "CBC_LEUKOPENIA_PATTERN" in codes2
    assert "CBC_THROMBOCYTOSIS_PATTERN" in codes2
    cleanup(rid2)


def test_phase4_partial_cbc_missing_context_tracking():
    # Partial CBC: Only Hemoglobin provided
    lines = [
        "Complete Blood Count",
        "Hemoglobin: 11.0 g/dL",
        "Reference range: 12.0 - 16.0",
    ]
    rid, _, a, _ = run_full_flow_all_verified(lines)
    finding = next(f for f in a["findings"] if f["finding_code"] == "CBC_ANEMIA_PATTERN")
    meta = finding["metadata"]
    assert "Mean Corpuscular Volume" in meta["missing_context"]
    assert "Red Blood Cell Count" in meta["missing_context"]
    assert meta["patient_context_required"] is True
    assert "Dietary history" in meta["patient_context_needed"]
    cleanup(rid)


def test_phase4_glucose_concordance_positive_and_negative():
    # Positive: Both Glucose and HbA1c elevated
    pos_lines = [
        "Diabetes Panel",
        "Glucose: 155 mg/dL",
        "Reference range: 70 - 100",
        "HbA1c: 7.8 %",
        "Reference range: 4.0 - 5.6",
    ]
    r_pos, _, a_pos, _ = run_full_flow_all_verified(pos_lines)
    codes_pos = [f["finding_code"] for f in a_pos["findings"]]
    assert "GLUCOSE_ELEVATED" in codes_pos
    assert "HBA1C_ELEVATED" in codes_pos
    assert "GLUCOSE_HBA1C_CONCORDANT_ELEVATION" in codes_pos
    cleanup(r_pos)

    # Negative: Glucose elevated but HbA1c normal
    neg_lines = [
        "Diabetes Panel",
        "Glucose: 145 mg/dL",
        "Reference range: 70 - 100",
        "HbA1c: 5.2 %",
        "Reference range: 4.0 - 5.6",
    ]
    r_neg, _, a_neg, _ = run_full_flow_all_verified(neg_lines)
    codes_neg = [f["finding_code"] for f in a_neg["findings"]]
    assert "GLUCOSE_ELEVATED" in codes_neg
    assert "GLUCOSE_HBA1C_CONCORDANT_ELEVATION" not in codes_neg
    cleanup(r_neg)


def test_phase4_glucose_hypoglycemia():
    lines = [
        "Blood Test",
        "Glucose: 52 mg/dL",
        "Reference range: 70 - 100",
    ]
    rid, _, a, _ = run_full_flow_all_verified(lines)
    codes = [f["finding_code"] for f in a["findings"]]
    assert "GLUCOSE_HYPOGLYCEMIA_PATTERN" in codes
    cleanup(rid)


def test_phase4_lipid_combined_dyslipidemia_positive_and_negative():
    # Positive: Both LDL and Triglycerides elevated
    pos_lines = [
        "Lipid Panel",
        "LDL Cholesterol: 145 mg/dL",
        "Reference range: 0 - 100",
        "Triglycerides: 210 mg/dL",
        "Reference range: 0 - 150",
    ]
    r_pos, _, a_pos, _ = run_full_flow_all_verified(pos_lines)
    codes_pos = [f["finding_code"] for f in a_pos["findings"]]
    assert "LIPID_ELEVATED_LDL" in codes_pos
    assert "LIPID_ELEVATED_TRIGLYCERIDES" in codes_pos
    assert "LIPID_COMBINED_DYSLIPIDEMIA" in codes_pos
    cleanup(r_pos)

    # Negative: LDL elevated but Triglycerides normal
    neg_lines = [
        "Lipid Panel",
        "LDL Cholesterol: 145 mg/dL",
        "Reference range: 0 - 100",
        "Triglycerides: 110 mg/dL",
        "Reference range: 0 - 150",
    ]
    r_neg, _, a_neg, _ = run_full_flow_all_verified(neg_lines)
    codes_neg = [f["finding_code"] for f in a_neg["findings"]]
    assert "LIPID_ELEVATED_LDL" in codes_neg
    assert "LIPID_COMBINED_DYSLIPIDEMIA" not in codes_neg
    cleanup(r_neg)


def test_phase4_liver_relationships_positive_and_negative():
    # Positive: Both ALT and AST elevated (hepatocellular)
    pos_lines = [
        "Hepatic Panel",
        "ALT: 82 U/L",
        "Reference range: 7 - 56",
        "AST: 68 U/L",
        "Reference range: 10 - 40",
    ]
    r_pos, _, a_pos, _ = run_full_flow_all_verified(pos_lines)
    codes_pos = [f["finding_code"] for f in a_pos["findings"]]
    assert "LIVER_ENZYME_ELEVATION" in codes_pos
    assert "LIVER_HEPATOCELLULAR_PATTERN" in codes_pos
    cleanup(r_pos)

    # Negative: ALT elevated but AST normal
    neg_lines = [
        "Hepatic Panel",
        "ALT: 75 U/L",
        "Reference range: 7 - 56",
        "AST: 28 U/L",
        "Reference range: 10 - 40",
    ]
    r_neg, _, a_neg, _ = run_full_flow_all_verified(neg_lines)
    codes_neg = [f["finding_code"] for f in a_neg["findings"]]
    assert "LIVER_ENZYME_ELEVATION" in codes_neg
    assert "LIVER_HEPATOCELLULAR_PATTERN" not in codes_neg
    cleanup(r_neg)


def test_phase4_liver_cholestatic_and_hypoalbuminemia():
    lines = [
        "Liver Function",
        "Alkaline Phosphatase: 165 U/L",
        "Reference range: 30 - 120",
        "Albumin: 2.9 g/dL",
        "Reference range: 3.5 - 5.0",
    ]
    rid, _, a, _ = run_full_flow_all_verified(lines)
    codes = [f["finding_code"] for f in a["findings"]]
    assert "LIVER_CHOLESTATIC_PATTERN" in codes
    assert "LIVER_HYPOALBUMINEMIA_PATTERN" in codes
    cleanup(rid)


def test_phase4_kidney_relationships_positive_and_negative():
    # Positive: Both Creatinine and BUN elevated (concordant azotemia)
    pos_lines = [
        "Renal Function",
        "Creatinine: 1.8 mg/dL",
        "Reference range: 0.6 - 1.2",
        "BUN: 32 mg/dL",
        "Reference range: 7 - 20",
    ]
    r_pos, _, a_pos, _ = run_full_flow_all_verified(pos_lines)
    codes_pos = [f["finding_code"] for f in a_pos["findings"]]
    assert "KIDNEY_FUNCTION_PATTERN" in codes_pos
    assert "KIDNEY_ELEVATED_BUN" in codes_pos
    assert "KIDNEY_CONCORDANT_AZOTEMIA" in codes_pos
    cleanup(r_pos)

    # Negative: Creatinine elevated but BUN normal
    neg_lines = [
        "Renal Function",
        "Creatinine: 1.6 mg/dL",
        "Reference range: 0.6 - 1.2",
        "BUN: 14 mg/dL",
        "Reference range: 7 - 20",
    ]
    r_neg, _, a_neg, _ = run_full_flow_all_verified(neg_lines)
    codes_neg = [f["finding_code"] for f in a_neg["findings"]]
    assert "KIDNEY_FUNCTION_PATTERN" in codes_neg
    assert "KIDNEY_CONCORDANT_AZOTEMIA" not in codes_neg
    cleanup(r_neg)


def test_phase4_kidney_reduced_egfr():
    lines = [
        "Renal Panel",
        "Estimated GFR: 48 mL/min",
        "Reference range: 60 - 120",
    ]
    rid, _, a, _ = run_full_flow_all_verified(lines)
    codes = [f["finding_code"] for f in a["findings"]]
    assert "KIDNEY_REDUCED_EGFR" in codes
    cleanup(rid)


def test_phase4_unit_conversion_accuracy():
    # Hemoglobin 135 g/L with range 12.0 - 16.0 g/dL -> converted to 13.5 g/dL -> within_range
    r1, _, a1, _ = run_full_flow_all_verified([
        "CBC Test",
        "Hemoglobin: 135 g/L",
        "Reference range: 12.0 - 16.0 g/dL",
    ])
    assert a1["summary"]["within_range"] == 1
    assert a1["summary"]["incompatible_units"] == 0
    cleanup(r1)

    # Glucose 5.0 mmol/L with range 70 - 100 mg/dL -> 5.0 * 18.0182 = 90.09 mg/dL -> within_range
    r2, _, a2, _ = run_full_flow_all_verified([
        "Glucose Test",
        "Glucose: 5.0 mmol/L",
        "Reference range: 70 - 100 mg/dL",
    ])
    assert a2["summary"]["within_range"] == 1
    assert a2["summary"]["incompatible_units"] == 0
    cleanup(r2)


def test_phase4_historical_comparison_with_unit_conversion():
    # Report 1 in g/dL, Report 2 in g/L
    r1, _, _, _ = run_full_flow_all_verified(["Hemoglobin: 12.0 g/dL", "Reference range: 12.0 - 16.0"])
    r2, _, _, _ = run_full_flow_all_verified(["Hemoglobin: 135 g/L", "Reference range: 12.0 - 16.0"])
    try:
        c = client.post("/api/reports/compare", json={"report_ids": [r2, r1]})
        assert c.status_code == 200
        comp = c.json()["comparisons"][0]
        assert comp["test_name"] == "Hemoglobin"
        assert comp["unit_compatible"] is True
        assert comp["status"] == "comparable"
        # 12.0 g/dL converted to 120.0 g/L; abs(135 - 120) = 15.0 g/L (or in g/dL: 1.5 g/dL)
        assert comp["absolute_difference"] is not None
        assert comp["percentage_difference"] == pytest.approx(12.5, abs=0.5)
    finally:
        client.delete(f"/api/reports/{r1}")
        client.delete(f"/api/reports/{r2}")


def test_phase4_reproducibility():
    lines = [
        "Lab Panel",
        "Hemoglobin: 11.0 g/dL",
        "Reference range: 12.0 - 16.0",
        "Glucose: 140 mg/dL",
        "Reference range: 70 - 100",
    ]
    rid, ms = upload_and_extract_and_structure(lines)
    for m in ms:
        client.post(f"/api/reports/{rid}/measurements/{m['id']}/verify")

    run1 = client.post(f"/api/reports/{rid}/analyse").json()
    run2 = client.post(f"/api/reports/{rid}/analyse").json()

    # Reproducibility check: identical summary counts and identical finding codes
    assert run1["summary"] == run2["summary"]
    f1 = sorted(f["finding_code"] for f in run1["findings"])
    f2 = sorted(f["finding_code"] for f in run2["findings"])
    assert f1 == f2
    cleanup(rid)
