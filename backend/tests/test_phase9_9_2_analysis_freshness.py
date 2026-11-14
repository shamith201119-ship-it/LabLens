"""Phase 9.9.2 — analysis freshness, stale protection, and history preservation."""

import io
import os
from pathlib import Path

import fitz
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def _pdf_from_lines(lines: list[str]) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    y = 72
    for line in lines:
        page.insert_text((72, y), line, fontsize=11)
        y += 16
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def _create_measured_report(lines: list[str]):
    response = client.post(
        "/api/reports",
        data={"consent": "true"},
        files={"file": ("freshness.pdf", io.BytesIO(_pdf_from_lines(lines)), "application/pdf")},
    )
    assert response.status_code == 201, response.text
    report_id = response.json()["id"]
    assert client.post(f"/api/reports/{report_id}/extract").status_code == 200
    assert client.post(f"/api/reports/{report_id}/structure").status_code == 200
    measurements = client.get(f"/api/reports/{report_id}/measurements").json()["measurements"]
    assert measurements
    return report_id, measurements


def _verify(report_id: str, measurement_id: str):
    response = client.post(
        f"/api/reports/{report_id}/measurements/{measurement_id}/verify"
    )
    assert response.status_code == 200, response.text
    return response.json()


def _analyse(report_id: str):
    response = client.post(f"/api/reports/{report_id}/analyse")
    assert response.status_code == 200, response.text
    return response.json()


def _get_analysis(report_id: str):
    response = client.get(f"/api/reports/{report_id}/analysis")
    assert response.status_code == 200, response.text
    return response.json()


def _cleanup(report_id: str):
    client.delete(f"/api/reports/{report_id}")


def test_freshness_tests_use_isolated_database():
    isolated_root = Path(os.environ["LABLENS_DATA_DIR"]).resolve()
    assert settings.db_path.resolve().is_relative_to(isolated_root)
    real_data_dir = (Path(__file__).resolve().parents[1] / "data").resolve()
    assert not settings.db_path.resolve().is_relative_to(real_data_dir)
    real_database = real_data_dir / "lablens.db"
    assert settings.db_path.resolve() != real_database.resolve()


def test_no_analysis_state_is_explicit():
    report_id, _ = _create_measured_report(
        ["Hemoglobin: 14.2 g/dL", "Reference range: 12.0 - 16.0"]
    )
    try:
        analysis = _get_analysis(report_id)
        assert analysis["status"] == "not_started"
        assert analysis["freshness"] == "not_started"

        explanations = client.get(f"/api/reports/{report_id}/explanations")
        assert explanations.status_code == 200
        body = explanations.json()
        assert body["analysis_status"] == "not_started"
        assert body["analysis_freshness"] == "not_started"
        assert body["measurements"] == []
        assert body["patterns"] == []

        history = client.get(f"/api/reports/{report_id}/analysis/history")
        assert history.status_code == 200
        assert history.json()["analyses"] == []
    finally:
        _cleanup(report_id)


def test_current_analysis_and_correction_lifecycle():
    report_id, measurements = _create_measured_report(
        ["Hemoglobin: 14.2 g/dL", "Reference range: 12.0 - 16.0"]
    )
    measurement_id = measurements[0]["id"]

    try:
        _verify(report_id, measurement_id)
        first_run = _analyse(report_id)
        assert first_run["freshness"] == "current"
        assert first_run["summary"]["eligible_measurements"] == 1

        current = _get_analysis(report_id)
        assert current["analysis_id"] == first_run["analysis_id"]
        assert current["freshness"] == "current"
        assert current["freshness_reason"] is None

        # A substantive correction invalidates verification and freshness.
        corrected = client.patch(
            f"/api/reports/{report_id}/measurements/{measurement_id}",
            json={"result_original": "11.0", "reason": "corrected value"},
        )
        assert corrected.status_code == 200, corrected.text
        assert corrected.json()["verification_status"] == "needs_review"

        stale = _get_analysis(report_id)
        assert stale["analysis_id"] == first_run["analysis_id"]
        assert stale["freshness"] == "stale"
        assert "changed" in stale["freshness_reason"].lower()
        # Historical snapshot values must not be replaced by the current measurement.
        assert stale["assessments"][0]["value"] == "14.2"
        assert stale["assessments"][0]["comparison_status"] == "within_range"

        # Stale explanations are withheld from the guidance surface.
        explanations = client.get(f"/api/reports/{report_id}/explanations").json()
        assert explanations["analysis_status"] == "stale"
        assert explanations["analysis_freshness"] == "stale"
        assert explanations["measurements"] == []
        assert explanations["patterns"] == []
        assert explanations["summary"]["total_assessments"] == 0

        # History overview exposes the stale state instead of calling it current.
        overview = client.get("/api/history").json()
        timeline_entry = next(
            item for item in overview["timeline"] if item["report_id"] == report_id
        )
        assert timeline_entry["analysis_status"] == "completed"
        assert timeline_entry["analysis_freshness"] == "stale"

        # Re-verification restores eligibility but must not revive the old analysis.
        _verify(report_id, measurement_id)
        still_stale = _get_analysis(report_id)
        assert still_stale["analysis_id"] == first_run["analysis_id"]
        assert still_stale["freshness"] == "stale"

        second_run = _analyse(report_id)
        assert second_run["freshness"] == "current"
        assert second_run["analysis_id"] != first_run["analysis_id"]
        assert second_run["summary"]["eligible_measurements"] == 1
        assert second_run["summary"]["below_range"] == 1

        refreshed = _get_analysis(report_id)
        assert refreshed["analysis_id"] == second_run["analysis_id"]
        assert refreshed["freshness"] == "current"
        assert refreshed["assessments"][0]["value"] == "11.0"

        refreshed_overview = client.get("/api/history").json()
        refreshed_entry = next(
            item for item in refreshed_overview["timeline"] if item["report_id"] == report_id
        )
        assert refreshed_entry["analysis_freshness"] == "current"

        # The older run remains available, marked stale, with its original snapshot.
        history = client.get(f"/api/reports/{report_id}/analysis/history")
        assert history.status_code == 200
        analyses = history.json()["analyses"]
        assert len(analyses) >= 2
        old = next(a for a in analyses if a["analysis_id"] == first_run["analysis_id"])
        new = next(a for a in analyses if a["analysis_id"] == second_run["analysis_id"])
        assert old["freshness"] == "stale"
        assert old["freshness_reason"] == "A newer analysis exists for this report."
        assert old["assessments"][0]["value"] == "14.2"
        assert new["freshness"] == "current"
        assert new["assessments"][0]["value"] == "11.0"
    finally:
        _cleanup(report_id)


def test_corrected_measurement_is_excluded_until_reverified():
    report_id, measurements = _create_measured_report(
        ["Hemoglobin: 14.2 g/dL", "Reference range: 12.0 - 16.0"]
    )
    measurement_id = measurements[0]["id"]

    try:
        _verify(report_id, measurement_id)
        _analyse(report_id)

        response = client.patch(
            f"/api/reports/{report_id}/measurements/{measurement_id}",
            json={"result_original": "11.0"},
        )
        assert response.status_code == 200
        assert response.json()["verification_status"] == "needs_review"

        analysis_without_review = _analyse(report_id)
        assert analysis_without_review["summary"]["eligible_measurements"] == 0
        assert analysis_without_review["assessments"] == []
        assert analysis_without_review["freshness"] == "current"

        _verify(report_id, measurement_id)
        analysis_after_review = _analyse(report_id)
        assert analysis_after_review["summary"]["eligible_measurements"] == 1
        assert analysis_after_review["summary"]["below_range"] == 1
        assert analysis_after_review["assessments"][0]["value"] == "11.0"
    finally:
        _cleanup(report_id)


def test_noop_correction_keeps_analysis_current():
    report_id, measurements = _create_measured_report(
        ["Hemoglobin: 14.2 g/dL", "Reference range: 12.0 - 16.0"]
    )
    measurement_id = measurements[0]["id"]

    try:
        _verify(report_id, measurement_id)
        first_run = _analyse(report_id)
        assert first_run["freshness"] == "current"

        response = client.patch(
            f"/api/reports/{report_id}/measurements/{measurement_id}",
            json={"result_original": "14.2", "reason": "no-op check"},
        )
        assert response.status_code == 200
        assert response.json()["verification_status"] == "verified"

        current = _get_analysis(report_id)
        assert current["analysis_id"] == first_run["analysis_id"]
        assert current["freshness"] == "current"

        history = client.get(f"/api/reports/{report_id}/analysis/history").json()
        assert len(history["analyses"]) == 1
    finally:
        _cleanup(report_id)
