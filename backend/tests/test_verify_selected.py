"""Focused tests for Phase 9.11.1: explicit, selected-only bulk verification.

These tests exercise the service contract and the HTTP surface. GPU/OCR are
irrelevant here â€” all measurements are inserted directly.
"""

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
EVALUATOR_DIR = BACKEND_DIR / "tests"
for path in (str(BACKEND_DIR), str(EVALUATOR_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

from app.database import get_connection
from app.main import app
from app.services.analysis_service import analyse_report
from app.services.measurement_service import (
    correct_measurement,
    verify_selected_measurements,
    VerificationSelectionError,
)

client = TestClient(app)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _insert_report(name: str = "verify-selected-test.pdf") -> str:
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
                name,
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
            (
                measurement_id,
                report_id,
                name,
                name,
                test_code,
                result_original,
                14.2 if test_code else None,
                "g/dL",
                "12.0 - 16.0",
                12.0,
                16.0,
                "within_range",
                1,
                "lab",
                status,
                now,
                now,
            ),
        )
    return measurement_id


def _statuses(report_id: str) -> dict[str, str]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, verification_status FROM report_measurements WHERE report_id = ?",
            (report_id,),
        ).fetchall()
    return {row["id"]: row["verification_status"] for row in rows}


def _post_selected(report_id: str, ids) -> "object":
    return client.post(
        f"/api/reports/{report_id}/measurements/verify-selected",
        json={"measurement_ids": ids},
    )


def test_explicit_selection_verifies_selected_only():
    report_id = _insert_report()
    first = _insert_measurement(report_id, "Hemoglobin")
    second = _insert_measurement(report_id, "WBC")

    response = _post_selected(report_id, [first])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["verified"] == 1
    statuses = _statuses(report_id)
    assert statuses[first] == "verified"
    assert statuses[second] == "extracted"


def test_unselected_measurements_remain_unchanged():
    report_id = _insert_report()
    first = _insert_measurement(report_id, "Hemoglobin")
    second = _insert_measurement(report_id, "WBC", status="needs_review")

    response = _post_selected(report_id, [first])
    assert response.status_code == 200
    statuses = _statuses(report_id)
    assert statuses[first] == "verified"
    assert statuses[second] == "needs_review"  # untouched


def test_empty_selection_is_rejected():
    report_id = _insert_report()
    _insert_measurement(report_id, "Hemoglobin")

    for payload in ([], {}, None):
        response = _post_selected(report_id, payload)
        assert response.status_code == 400, payload

    assert set(_statuses(report_id).values()) == {"extracted"}


def test_cross_report_ids_are_rejected():
    report_a = _insert_report("a.pdf")
    report_b = _insert_report("b.pdf")
    other = _insert_measurement(report_b, "WBC")
    own = _insert_measurement(report_a, "Hemoglobin")

    response = _post_selected(report_a, [own, other])
    assert response.status_code == 400
    assert "not found in this report" in response.json()["detail"]
    assert set(_statuses(report_a).values()) == {"extracted"}
    assert set(_statuses(report_b).values()) == {"extracted"}


def test_invalid_ids_rejected_without_partial_updates():
    report_id = _insert_report()
    valid = _insert_measurement(report_id, "Hemoglobin")

    for payload in (["not-a-real-id"], [valid, "not-a-real-id"]):
        response = _post_selected(report_id, payload)
        assert response.status_code == 400

    # Valid measurement that was mixed into rejected batches must stay unverified.
    assert _statuses(report_id)[valid] == "extracted"


def test_ineligible_already_verified_measurement_rejected_atomically():
    report_id = _insert_report()
    first = _insert_measurement(report_id, "Hemoglobin", status="verified")
    second = _insert_measurement(report_id, "WBC")

    response = _post_selected(report_id, [first, second])
    assert response.status_code == 400
    assert "not awaiting confirmation" in response.json()["detail"]
    statuses = _statuses(report_id)
    assert statuses[first] == "verified"
    assert statuses[second] == "extracted"  # no partial verify


def test_duplicate_ids_are_handled_safely():
    report_id = _insert_report()
    first = _insert_measurement(report_id, "Hemoglobin")

    response = _post_selected(report_id, [first, first, first])
    assert response.status_code == 200
    body = response.json()
    assert body["verified"] == 1
    assert [m["id"] for m in body["measurements"]] == [first]
    assert _statuses(report_id)[first] == "verified"


def test_unselected_ids_not_in_report_and_not_string_rejected():
    report_id = _insert_report()
    _insert_measurement(report_id, "Hemoglobin")

    response = _post_selected(report_id, [""])
    assert response.status_code == 400
    response = _post_selected(report_id, [123])
    assert response.status_code == 400


def test_report_not_found_returns_404():
    response = _post_selected("00000000-0000-0000-0000-000000000000", ["x"])
    assert response.status_code == 404

def test_service_rejects_empty_and_bad_payloads():
    report_id = _insert_report()
    with pytest.raises(VerificationSelectionError):
        verify_selected_measurements(report_id, [])
    with pytest.raises(VerificationSelectionError):
        verify_selected_measurements(report_id, "not-a-list")


def test_individual_verification_still_works():
    report_id = _insert_report()
    measurement_id = _insert_measurement(report_id, "Hemoglobin", status="needs_review")

    response = client.post(f"/api/reports/{report_id}/measurements/{measurement_id}/verify")
    assert response.status_code == 200
    assert response.json()["verification_status"] == "verified"


def test_legacy_indiscriminate_endpoint_is_gone_and_harmless():
    report_id = _insert_report()
    first = _insert_measurement(report_id, "Hemoglobin")

    response = client.post(f"/api/reports/{report_id}/measurements/verify-all-reviewed")
    assert response.status_code in (404, 405)
    # The legacy operation must not have approved anything.
    assert _statuses(report_id)[first] == "extracted"


def test_corrected_measurements_need_explicit_reverification():
    report_id = _insert_report()
    measurement_id = _insert_measurement(report_id, "Hemoglobin", status="verified")

    # Correcting a value flips it back to needs_review (Phase 9.9.1 behavior).
    updated = correct_measurement(measurement_id, {"result_original": "13.9"})
    assert updated["verification_status"] == "needs_review"
    assert _statuses(report_id)[measurement_id] == "needs_review"

    # A corrected measurement cannot sneak into analysis without an explicit choice.
    response = _post_selected(report_id, [measurement_id])
    assert response.status_code == 200
    assert _statuses(report_id)[measurement_id] == "verified"


def test_analysis_excludes_unverified_measurements():
    report_id = _insert_report()
    unverified = _insert_measurement(report_id, "Hemoglobin")

    analysis = analyse_report(report_id)
    assert analysis["assessments"] == []

    # Verification must happen through an explicit selection before analysis sees it.
    response = _post_selected(report_id, [unverified])
    assert response.status_code == 200

    analysis = analyse_report(report_id)
    assert len(analysis["assessments"]) == 1


def test_analysis_excludes_unsupported_unverified_even_when_confirmed():
    report_id = _insert_report()
    supported = _insert_measurement(report_id, "Hemoglobin", test_code="HGB")
    unsupported = _insert_measurement(report_id, "Some Unsupported Test", test_code=None)

    response = _post_selected(report_id, [supported, unsupported])
    assert response.status_code == 200

    analysis = analyse_report(report_id)
    names = [a["test_name"] for a in analysis["assessments"]]
    assert "Hemoglobin" in names
    assert "Some Unsupported Test" not in names
