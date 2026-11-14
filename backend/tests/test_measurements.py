import io
import json

from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app

client = TestClient(app)


def make_pdf_bytes() -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Vitamin D (25-OH): 24 ng/mL")
    page.insert_text((72, 90), "Reference range: 30 - 100")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def upload(data, name, mime):
    files = {"file": (name, io.BytesIO(data), mime)}
    return client.post("/api/reports", data={"consent": "true"}, files=files)


def test_structure_and_verify():
    data = make_pdf_bytes()
    r = upload(data, "t.pdf", "application/pdf")
    assert r.status_code == 201
    rid = r.json()["id"]
    client.post(f"/api/reports/{rid}/extract")
    st = client.post(f"/api/reports/{rid}/structure")
    assert st.status_code == 200
    assert st.json()["measurements_saved"] >= 1
    ms = client.get(f"/api/reports/{rid}/measurements").json()["measurements"]
    assert len(ms) >= 1
    m = ms[0]
    assert m["test_name_normalized"] == "Vitamin D (25-OH)"
    assert m["result_original"] == "24"
    assert m["reference_range_original"] == "30 - 100"
    # verify
    vr = client.post(f"/api/reports/{rid}/measurements/{m['id']}/verify")
    assert vr.status_code == 200
    assert vr.json()["verification_status"] == "verified"
    # patch
    pr = client.patch(
        f"/api/reports/{rid}/measurements/{m['id']}",
        json={"result_original": "25", "reason": "typo"},
    )
    assert pr.status_code == 200
    client.delete(f"/api/reports/{rid}")


def make_hemoglobin_pdf_bytes() -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Hemoglobin: 14.2 g/dL")
    page.insert_text((72, 90), "Reference range: 12.0 - 16.0")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def create_hemoglobin_measurement():
    r = upload(make_hemoglobin_pdf_bytes(), "hemoglobin.pdf", "application/pdf")
    assert r.status_code == 201
    rid = r.json()["id"]
    assert client.post(f"/api/reports/{rid}/extract").status_code == 200
    assert client.post(f"/api/reports/{rid}/structure").status_code == 200
    measurements = client.get(f"/api/reports/{rid}/measurements").json()["measurements"]
    matches = [m for m in measurements if m["test_name_normalized"] == "Hemoglobin"]
    assert len(matches) == 1
    measurement = matches[0]
    assert measurement["result_numeric"] == 14.2
    assert measurement["reference_low"] == 12.0
    assert measurement["reference_high"] == 16.0
    assert measurement["derived_flag"] == "within_range"
    return rid, measurement


def test_correction_updates_numeric_result_and_flag():
    rid, measurement = create_hemoglobin_measurement()
    response = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"result_original": "11.0", "reason": "value correction"},
    )
    assert response.status_code == 200
    corrected = response.json()
    assert corrected["result_original"] == "11.0"
    assert corrected["result_numeric"] == 11.0
    assert corrected["result_qualifier"] is None
    assert corrected["reference_low"] == 12.0
    assert corrected["reference_high"] == 16.0
    assert corrected["reference_unit"] == "g/dL"
    assert corrected["derived_flag"] == "below_range"
    client.delete(f"/api/reports/{rid}")


def test_analysis_uses_corrected_numeric_result():
    rid, measurement = create_hemoglobin_measurement()
    verify = client.post(f"/api/reports/{rid}/measurements/{measurement['id']}/verify")
    assert verify.status_code == 200
    patch = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"result_original": "11.0"},
    )
    assert patch.status_code == 200
    assert patch.json()["verification_status"] == "needs_review"

    reverify = client.post(f"/api/reports/{rid}/measurements/{measurement['id']}/verify")
    assert reverify.status_code == 200
    assert reverify.json()["verification_status"] == "verified"

    analysis = client.post(f"/api/reports/{rid}/analyse")
    assert analysis.status_code == 200
    body = analysis.json()
    assert body["summary"]["below_range"] == 1
    hemoglobin = [a for a in body["assessments"] if a["test_name"] == "Hemoglobin"]
    assert len(hemoglobin) == 1
    assert hemoglobin[0]["value"] == "11.0"
    assert hemoglobin[0]["comparison_status"] == "below_range"
    client.delete(f"/api/reports/{rid}")


def test_correction_updates_reference_range_and_flag():
    rid, measurement = create_hemoglobin_measurement()
    first = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"result_original": "11.0"},
    )
    assert first.status_code == 200

    response = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"reference_range_original": "10.0 - 12.0", "reason": "range correction"},
    )
    assert response.status_code == 200
    corrected = response.json()
    assert corrected["result_numeric"] == 11.0
    assert corrected["reference_low"] == 10.0
    assert corrected["reference_high"] == 12.0
    assert corrected["reference_unit"] == "g/dL"
    assert corrected["derived_flag"] == "within_range"
    client.delete(f"/api/reports/{rid}")


def test_correction_handles_qualified_result():
    rid, measurement = create_hemoglobin_measurement()
    response = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"result_original": "<0.5", "reason": "qualitative correction"},
    )
    assert response.status_code == 200
    corrected = response.json()
    assert corrected["result_original"] == "<0.5"
    assert corrected["result_qualifier"] == "less_than"
    assert corrected["result_numeric"] is None
    assert corrected["derived_flag"] == "qualitative"
    client.delete(f"/api/reports/{rid}")


def test_correction_preserves_evidence_and_audits_effective_fields():
    rid, measurement = create_hemoglobin_measurement()
    extraction_before = client.get(f"/api/reports/{rid}/extraction").json()
    raw_text_before = extraction_before["pages"][0]["raw_text"]
    source_text_before = measurement["source_text"]
    assert "14.2" in raw_text_before
    assert "14.2" in source_text_before

    response = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"result_original": "11.0", "reason": "audit test"},
    )
    assert response.status_code == 200

    extraction_after = client.get(f"/api/reports/{rid}/extraction").json()
    assert extraction_after["pages"][0]["raw_text"] == raw_text_before
    measurements_after = client.get(f"/api/reports/{rid}/measurements").json()["measurements"]
    updated = [m for m in measurements_after if m["id"] == measurement["id"]][0]
    assert updated["source_text"] == source_text_before
    assert updated["result_original"] == "11.0"

    with get_connection() as conn:
        audit = conn.execute(
            """SELECT * FROM measurement_corrections
            WHERE measurement_id = ? ORDER BY correction_timestamp DESC LIMIT 1""",
            (measurement["id"],),
        ).fetchone()
    assert audit is not None
    original_payload = json.loads(audit["original_payload"])
    corrected_payload = json.loads(audit["corrected_payload"])
    assert original_payload["result_original"] == "14.2"
    assert original_payload["result_numeric"] == 14.2
    assert original_payload["derived_flag"] == "within_range"
    assert corrected_payload["result_original"] == "11.0"
    assert corrected_payload["result_numeric"] == 11.0
    assert corrected_payload["derived_flag"] == "below_range"
    assert audit["correction_reason"] == "audit test"
    client.delete(f"/api/reports/{rid}")


def test_correction_invalidates_verified_measurement():
    rid, measurement = create_hemoglobin_measurement()
    verify = client.post(f"/api/reports/{rid}/measurements/{measurement['id']}/verify")
    assert verify.status_code == 200
    assert verify.json()["verification_status"] == "verified"

    corrected = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"result_original": "11.0", "reason": "value correction"},
    )
    assert corrected.status_code == 200
    assert corrected.json()["verification_status"] == "needs_review"
    assert corrected.json()["derived_flag"] == "below_range"

    client.delete(f"/api/reports/{rid}")


def test_corrected_measurement_excluded_until_reverified():
    rid, measurement = create_hemoglobin_measurement()
    verify = client.post(f"/api/reports/{rid}/measurements/{measurement['id']}/verify")
    assert verify.status_code == 200

    client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"result_original": "11.0"},
    )
    analysis_before = client.post(f"/api/reports/{rid}/analyse").json()
    assert analysis_before["summary"]["below_range"] == 0
    assert not [a for a in analysis_before["assessments"] if a["test_name"] == "Hemoglobin"]

    reverify = client.post(f"/api/reports/{rid}/measurements/{measurement['id']}/verify")
    assert reverify.status_code == 200
    analysis_after = client.post(f"/api/reports/{rid}/analyse").json()
    assert analysis_after["summary"]["below_range"] == 1
    hemoglobin = [a for a in analysis_after["assessments"] if a["test_name"] == "Hemoglobin"]
    assert len(hemoglobin) == 1
    assert hemoglobin[0]["value"] == "11.0"
    client.delete(f"/api/reports/{rid}")


def test_direct_derived_field_patch_is_rejected():
    rid, measurement = create_hemoglobin_measurement()
    for field in ("result_numeric", "result_qualifier", "reference_low", "reference_high", "derived_flag", "reference_unit"):
        response = client.patch(
            f"/api/reports/{rid}/measurements/{measurement['id']}",
            json={field: 123},
        )
        assert response.status_code == 400, field
    client.delete(f"/api/reports/{rid}")


def test_biomarker_identity_patch_is_rejected():
    rid, measurement = create_hemoglobin_measurement()
    response = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"test_name_normalized": "Glucose"},
    )
    assert response.status_code == 400
    unchanged = client.get(f"/api/reports/{rid}/measurements").json()["measurements"][0]
    assert unchanged["test_name_normalized"] == "Hemoglobin"
    assert unchanged["test_code"] == "HGB"
    client.delete(f"/api/reports/{rid}")


def test_correction_recalculates_qualified_result():
    rid, measurement = create_hemoglobin_measurement()
    response = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"result_original": "<0.5", "reason": "qualitative correction"},
    )
    assert response.status_code == 200
    corrected = response.json()
    assert corrected["result_original"] == "<0.5"
    assert corrected["result_numeric"] is None
    assert corrected["result_qualifier"] == "less_than"
    assert corrected["derived_flag"] == "qualitative"
    client.delete(f"/api/reports/{rid}")


def test_unit_correction_updates_and_audits_reference_unit():
    rid, measurement = create_hemoglobin_measurement()
    response = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"unit_original": "g/L", "reason": "unit correction"},
    )
    assert response.status_code == 200
    corrected = response.json()
    assert corrected["unit_original"] == "g/L"
    assert corrected["reference_unit"] == "g/L"
    assert corrected["verification_status"] == "needs_review"

    with get_connection() as conn:
        audit = conn.execute(
            """SELECT * FROM measurement_corrections
            WHERE measurement_id = ? ORDER BY correction_timestamp DESC LIMIT 1""",
            (measurement["id"],),
        ).fetchone()
    original_payload = json.loads(audit["original_payload"])
    corrected_payload = json.loads(audit["corrected_payload"])
    assert original_payload["unit_original"] == "g/dL"
    assert corrected_payload["unit_original"] == "g/L"
    assert original_payload["reference_unit"] == "g/dL"
    assert corrected_payload["reference_unit"] == "g/L"
    client.delete(f"/api/reports/{rid}")


def test_malformed_correction_leaves_measurement_and_audit_unchanged():
    rid, measurement = create_hemoglobin_measurement()
    with get_connection() as conn:
        before_count = conn.execute(
            "SELECT COUNT(*) FROM measurement_corrections WHERE measurement_id = ?",
            (measurement["id"],),
        ).fetchone()[0]

    response = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"result_original": "not-a-number", "reason": "bad correction"},
    )
    assert response.status_code == 400

    measurements = client.get(f"/api/reports/{rid}/measurements").json()["measurements"]
    unchanged = [m for m in measurements if m["id"] == measurement["id"]][0]
    assert unchanged["result_original"] == "14.2"
    assert unchanged["result_numeric"] == 14.2
    assert unchanged["derived_flag"] == "within_range"

    with get_connection() as conn:
        after_count = conn.execute(
            "SELECT COUNT(*) FROM measurement_corrections WHERE measurement_id = ?",
            (measurement["id"],),
        ).fetchone()[0]
    assert after_count == before_count
    client.delete(f"/api/reports/{rid}")


def test_noop_correction_does_not_invalidate_or_audit():
    rid, measurement = create_hemoglobin_measurement()
    verify = client.post(f"/api/reports/{rid}/measurements/{measurement['id']}/verify")
    assert verify.status_code == 200

    with get_connection() as conn:
        before_count = conn.execute(
            "SELECT COUNT(*) FROM measurement_corrections WHERE measurement_id = ?",
            (measurement["id"],),
        ).fetchone()[0]

    response = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"result_original": "14.2", "reason": "no-op"},
    )
    assert response.status_code == 200
    assert response.json()["verification_status"] == "verified"

    with get_connection() as conn:
        after_count = conn.execute(
            "SELECT COUNT(*) FROM measurement_corrections WHERE measurement_id = ?",
            (measurement["id"],),
        ).fetchone()[0]
    assert after_count == before_count
    client.delete(f"/api/reports/{rid}")


def test_correction_preserves_source_provenance():
    rid, measurement = create_hemoglobin_measurement()
    original_source_text = measurement["source_text"]
    original_source_bbox = measurement["source_bbox"]
    original_method = measurement["extraction_method"]
    original_confidence = measurement["ocr_confidence"]

    response = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"result_original": "11.0", "reason": "provenance check"},
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["source_text"] == original_source_text
    assert updated["source_bbox"] == original_source_bbox
    assert updated["extraction_method"] == original_method
    assert updated["ocr_confidence"] == original_confidence
    client.delete(f"/api/reports/{rid}")


def test_correction_audit_contains_all_effectively_changed_fields():
    rid, measurement = create_hemoglobin_measurement()
    response = client.patch(
        f"/api/reports/{rid}/measurements/{measurement['id']}",
        json={"result_original": "11.0", "unit_original": "g/L", "reason": "audit completeness"},
    )
    assert response.status_code == 200

    with get_connection() as conn:
        audit = conn.execute(
            """SELECT * FROM measurement_corrections
            WHERE measurement_id = ? ORDER BY correction_timestamp DESC LIMIT 1""",
            (measurement["id"],),
        ).fetchone()
    original_payload = json.loads(audit["original_payload"])
    corrected_payload = json.loads(audit["corrected_payload"])
    for field in (
        "result_original",
        "result_numeric",
        "result_qualifier",
        "unit_original",
        "reference_unit",
        "derived_flag",
        "verification_status",
    ):
        assert field in original_payload
        assert field in corrected_payload
    assert original_payload["result_original"] == "14.2"
    assert corrected_payload["result_original"] == "11.0"
    assert original_payload["verification_status"] == "extracted"
    assert corrected_payload["verification_status"] == "needs_review"
    client.delete(f"/api/reports/{rid}")
