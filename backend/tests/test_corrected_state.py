"""Phase 9.11.2.1: has_corrections metadata and correction-state separation."""

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
EVALUATOR_DIR = BACKEND_DIR.parent / "artifacts" / "phase-8.1"
for path in (str(BACKEND_DIR), str(EVALUATOR_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

from app.database import get_connection
from app.main import app
from app.services.measurement_service import (
    correct_measurement,
    get_measurements,
    verify_measurement,
    verify_selected_measurements,
)

client = TestClient(app)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _insert_report(name: str = "corrected-state-test.pdf") -> str:
    report_id = str(uuid.uuid4())
    now = _now()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO reports
            (id, original_filename, file_extension, media_type, file_size_bytes,
             sha256_hash, storage_key, status, consent_timestamp, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (report_id, name, "pdf", "application/pdf", 1, "synthetic-hash",
             f"synthetic/{report_id}.pdf", "uploaded", now, now, now),
        )
    return report_id


def _insert_measurement(
    report_id: str,
    name: str,
    status: str = "extracted",
    test_code: str | None = "HGB",
    result_original: str = "14.2",
) -> str:
    measurement_id = str(uuid.uuid4())
    now = _now()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO report_measurements
            (id, report_id, test_name_original, test_name_normalized, test_code,
             result_original, result_numeric, unit_original, reference_range_original,
             reference_low, reference_high, derived_flag, page_number,
             extraction_method, verification_status, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (measurement_id, report_id, name, name, test_code,
             result_original, 14.2 if test_code else None, "g/dL",
             "12.0 - 16.0", 12.0, 16.0, "within_range", 1,
             "lab", status, now, now),
        )
    return measurement_id


def _get(report_id: str) -> list[dict]:
    return get_measurements(report_id)


def test_original_measurement_has_no_corrections():
    report_id = _insert_report()
    measurement_id = _insert_measurement(report_id, "Hemoglobin")

    measurements = _get(report_id)
    assert len(measurements) == 1
    assert measurements[0]["has_corrections"] is False


def test_correction_sets_has_corrections_true():
    report_id = _insert_report()
    measurement_id = _insert_measurement(report_id, "Hemoglobin")

    updated = correct_measurement(measurement_id, {"result_original": "13.8"})
    assert updated["has_corrections"] in (True, 1)

    measurements = _get(report_id)
    assert measurements[0]["has_corrections"] is True


def test_re_verification_preserves_has_corrections():
    report_id = _insert_report()
    measurement_id = _insert_measurement(report_id, "Hemoglobin", status="verified")

    updated = correct_measurement(measurement_id, {"unit_original": "mg/dL"})
    assert updated["verification_status"] == "needs_review"
    assert bool(updated["has_corrections"]) is True

    verified = verify_measurement(measurement_id)
    assert verified["verification_status"] == "verified"
    assert bool(verified["has_corrections"]) is True

    assert _get(report_id)[0]["has_corrections"] is True


def test_correction_audit_rows_are_preserved():
    report_id = _insert_report()
    measurement_id = _insert_measurement(report_id, "Hemoglobin")
    correct_measurement(measurement_id, {"result_original": "13.9"})

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, measurement_id, original_payload, corrected_payload "
            "FROM measurement_corrections WHERE measurement_id = ?",
            (measurement_id,),
        ).fetchall()
    assert len(rows) == 1
    payload = json.loads(rows[0]["original_payload"])
    assert payload["result_original"] == "14.2"


def test_verify_selected_returns_has_corrections_for_corrected_rows():
    report_id = _insert_report()
    corrected = _insert_measurement(report_id, "Hemoglobin")
    untouched = _insert_measurement(report_id, "WBC", status="verified")

    # Verify the correction first (needs_review is eligible), fine either way.
    correct_measurement(corrected, {"result_original": "13.5"})

    response = client.post(
        f"/api/reports/{report_id}/measurements/verify-selected",
        json={"measurement_ids": [corrected]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["verified"] == 1
    returned = next(m for m in payload["measurements"] if m["id"] == corrected)
    assert bool(returned["has_corrections"]) is True
    # untouched never corrected → stays false
    measurements = {m["id"]: m for m in _get(report_id)}
    assert measurements[untouched]["has_corrections"] is False
    assert measurements[corrected]["has_corrections"] is True


def test_corrected_filter_separation_confirmed_and_unconfirmed():
    report_id = _insert_report()
    corrected_one = _insert_measurement(report_id, "Hemoglobin")
    corrected_two = _insert_measurement(report_id, "WBC")
    plain = _insert_measurement(report_id, "Platelet Count")

    correct_measurement(corrected_one, {"result_original": "13.1"})
    correct_measurement(corrected_two, {"result_original": "7.0"})
    # re-verify one of them
    client.post(f"/api/reports/{report_id}/measurements/{corrected_two}/verify")

    measurements = {m["id"]: m for m in _get(report_id)}
    edited = [m for m in measurements.values() if m["has_corrections"]]
    assert {m["id"] for m in edited} == {corrected_one, corrected_two}
    # correction history is independent of verification status
    assert measurements[corrected_two]["verification_status"] == "verified"
    assert measurements[corrected_two]["has_corrections"] is True
    assert measurements[corrected_one]["verification_status"] == "needs_review"
    assert measurements[plain]["has_corrections"] is False


def test_uncorrected_measurement_never_has_corrections():
    report_id = _insert_report()
    _insert_measurement(report_id, "Hemoglobin")
    _insert_measurement(report_id, "Glucose", status="verified")

    # an unrelated report must not leak corrections in
    other = _insert_report("other.pdf")
    other_mid = _insert_measurement(other, "Hemoglobin")
    correct_measurement(other_mid, {"result_original": "1.0"})

    measurements = _get(report_id)
    assert all(m["has_corrections"] is False for m in measurements)


def test_verify_selected_batch_of_corrected_and_uncorrected():
    report_id = _insert_report()
    corrected = _insert_measurement(report_id, "Hemoglobin")
    plain = _insert_measurement(report_id, "WBC")
    correct_measurement(corrected, {"result_original": "13.3"})

    response = client.post(
        f"/api/reports/{report_id}/measurements/verify-selected",
        json={"measurement_ids": [corrected, plain]},
    )
    assert response.status_code == 200
    payload = response.json()
    returned = {m["id"]: m for m in payload["measurements"]}
    assert bool(returned[corrected]["has_corrections"]) is True
    assert bool(returned[plain]["has_corrections"]) is False
    assert payload["verified"] == 2
