"""
Phase 7 Test Suite — Personal Lab History & Longitudinal Trends
Tests timeline ordering, biomarker trend extraction, comparability safeguards,
eligibility filters, and history API endpoints.
"""
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
from app.services.history_service import (
    get_history_overview,
    get_biomarker_history,
    compare_history_reports,
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# Timeline and History Overview Tests
# ---------------------------------------------------------------------------

class TestHistoryOverview:
    def test_history_overview_structure(self):
        result = get_history_overview()
        assert "total_reports" in result
        assert "reports_with_measurements" in result
        assert "timeline" in result
        assert "available_biomarkers" in result
        assert "disclaimer" in result
        assert isinstance(result["timeline"], list)
        assert isinstance(result["available_biomarkers"], list)

    def test_timeline_date_provenance_handling(self):
        """Verify that timeline correctly distinguishes sample_date from upload_date fallback."""
        result = get_history_overview()
        for item in result["timeline"]:
            assert item["date_provenance"] in ("sample_date", "upload_date")
            if item["report_date"]:
                assert item["date_provenance"] == "sample_date"
            else:
                assert item["date_provenance"] == "upload_date"


# ---------------------------------------------------------------------------
# Biomarker Longitudinal Trends Tests
# ---------------------------------------------------------------------------

class TestBiomarkerHistory:
    def test_empty_biomarker_history(self):
        result = get_biomarker_history("NonExistentBiomarkerXYZ")
        assert result["test_name"] == "NonExistentBiomarkerXYZ"
        assert result["total_observations"] == 0
        assert result["observations"] == []
        assert result["summary"]["eligible_count"] == 0
        assert "disclaimer" in result

    def test_single_observation_does_not_plot_false_trend(self):
        """Single observation cannot compute difference or pretend a trend exists."""
        fake_obs = [
            {
                "id": "m1",
                "report_id": "r1",
                "original_filename": "rep1.pdf",
                "report_upload_date": "2026-01-01T00:00:00Z",
                "sample_date": "2026-01-01",
                "test_name_original": "Hb",
                "test_name_normalized": "Hemoglobin",
                "result_original": "13.2",
                "result_numeric": 13.2,
                "result_qualifier": None,
                "unit_original": "g/dL",
                "reference_range_original": "12.0 - 16.0",
                "reference_low": 12.0,
                "reference_high": 16.0,
                "lab_flag": None,
                "derived_flag": "within_range",
                "verification_status": "verified",
                "page_number": 1,
                "created_at": "2026-01-01T00:00:00Z",
            }
        ]
        with patch("app.services.history_service.get_connection") as mock_conn:
            mock_conn.return_value.__enter__.return_value.execute.return_value.fetchall.return_value = fake_obs
            result = get_biomarker_history("Hemoglobin")

        assert result["total_observations"] == 1
        assert result["summary"]["eligible_count"] == 1
        assert result["summary"]["recorded_difference"] is None
        assert "trend cannot be established" in result["summary"]["status_message"].lower()

    def test_two_compatible_observations_calculate_difference(self):
        """Two compatible observations compute arithmetic delta and direction neutrally."""
        fake_obs = [
            {
                "id": "m1", "report_id": "r1", "original_filename": "rep1.pdf",
                "report_upload_date": "2026-01-01T00:00:00Z", "sample_date": "2026-01-01",
                "test_name_original": "Hb", "test_name_normalized": "Hemoglobin",
                "result_original": "12.0", "result_numeric": 12.0, "result_qualifier": None,
                "unit_original": "g/dL", "reference_range_original": "12.0 - 16.0",
                "reference_low": 12.0, "reference_high": 16.0, "lab_flag": None,
                "derived_flag": "within_range", "verification_status": "verified",
                "page_number": 1, "created_at": "2026-01-01T00:00:00Z",
            },
            {
                "id": "m2", "report_id": "r2", "original_filename": "rep2.pdf",
                "report_upload_date": "2026-06-01T00:00:00Z", "sample_date": "2026-06-01",
                "test_name_original": "Hemoglobin", "test_name_normalized": "Hemoglobin",
                "result_original": "13.5", "result_numeric": 13.5, "result_qualifier": None,
                "unit_original": "g/dL", "reference_range_original": "12.0 - 16.0",
                "reference_low": 12.0, "reference_high": 16.0, "lab_flag": None,
                "derived_flag": "within_range", "verification_status": "verified",
                "page_number": 1, "created_at": "2026-06-01T00:00:00Z",
            },
        ]
        with patch("app.services.history_service.get_connection") as mock_conn:
            mock_conn.return_value.__enter__.return_value.execute.return_value.fetchall.return_value = fake_obs
            result = get_biomarker_history("Hemoglobin")

        diff = result["summary"]["recorded_difference"]
        assert diff is not None
        assert diff["absolute_change"] == 1.5
        assert diff["direction"] == "higher"
        assert diff["unit"] == "g/dL"

    def test_unverified_observations_excluded_from_numeric_trend(self):
        """Needs_review observations must be marked trend_eligible=False."""
        fake_obs = [
            {
                "id": "m1", "report_id": "r1", "original_filename": "rep1.pdf",
                "report_upload_date": "2026-01-01T00:00:00Z", "sample_date": "2026-01-01",
                "test_name_original": "Glucose", "test_name_normalized": "Glucose",
                "result_original": "99", "result_numeric": 99.0, "result_qualifier": None,
                "unit_original": "mg/dL", "reference_range_original": "70 - 99",
                "reference_low": 70.0, "reference_high": 99.0, "lab_flag": None,
                "derived_flag": "within_range", "verification_status": "needs_review",
                "page_number": 1, "created_at": "2026-01-01T00:00:00Z",
            }
        ]
        with patch("app.services.history_service.get_connection") as mock_conn:
            mock_conn.return_value.__enter__.return_value.execute.return_value.fetchall.return_value = fake_obs
            result = get_biomarker_history("Glucose")

        assert result["total_observations"] == 1
        assert result["summary"]["eligible_count"] == 0
        assert result["observations"][0]["trend_eligible"] is False
        assert "Unverified" in result["observations"][0]["exclusion_reason"]


# ---------------------------------------------------------------------------
# Cross-Report Comparison Tests
# ---------------------------------------------------------------------------

class TestHistoryComparison:
    def test_comparison_requires_at_least_two_reports(self):
        try:
            compare_history_reports(["only-one-id"])
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "At least two" in str(e)

    def test_comparison_rejects_identical_report_ids(self):
        try:
            compare_history_reports(["same-id", "same-id"])
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "Cannot compare a report with itself" in str(e)


# ---------------------------------------------------------------------------
# API Route Endpoint Integration Tests
# ---------------------------------------------------------------------------

class TestHistoryEndpoints:
    def test_get_history_overview_endpoint_200(self):
        resp = client.get("/api/history")
        assert resp.status_code == 200
        data = resp.json()
        assert "timeline" in data
        assert "available_biomarkers" in data

    def test_get_biomarker_history_endpoint_200(self):
        resp = client.get("/api/history/biomarkers/Hemoglobin")
        assert resp.status_code == 200
        data = resp.json()
        assert data["test_name"] == "Hemoglobin"
        assert "summary" in data

    def test_compare_endpoint_rejects_self_comparison(self):
        resp = client.post("/api/history/compare", json={"report_ids": ["r1", "r1"]})
        assert resp.status_code == 400
        assert "itself" in resp.json()["detail"]

    def test_compare_endpoint_rejects_single_id(self):
        resp = client.post("/api/history/compare", json={"report_ids": ["r1"]})
        assert resp.status_code == 400
