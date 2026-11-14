"""
Phase 5 Test Suite — Explanation Engine
Tests catalogue integrity, explanation service logic, and the HTTP endpoint.
"""
import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Catalogue path
# ---------------------------------------------------------------------------
CATALOGUE_PATH = (
    Path(__file__).resolve().parents[1]
    / "app"
    / "catalogue"
    / "explanations.json"
)

# ---------------------------------------------------------------------------
# Catalogue validation tests
# ---------------------------------------------------------------------------

class TestCatalogueIntegrity:
    def test_catalogue_file_exists(self):
        assert CATALOGUE_PATH.is_file(), "explanations.json must exist"

    def test_catalogue_valid_json(self):
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        assert isinstance(data, dict)

    def test_catalogue_version_present(self):
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        assert "catalogue_version" in data
        assert data["catalogue_version"]  # not empty

    def test_entries_key_present(self):
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        assert "entries" in data
        assert isinstance(data["entries"], dict)

    def test_minimum_entry_count(self):
        """Catalogue must cover at least 10 supported biomarkers."""
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        assert len(data["entries"]) >= 10

    def test_all_entries_have_required_fields(self):
        required = {
            "what_it_measures",
            "why_doctors_look_at_it",
            "possible_influences",
            "cannot_establish",
            "context_factors",
            "questions",
            "sources",
        }
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        for name, entry in data["entries"].items():
            missing = required - entry.keys()
            assert not missing, f"Entry '{name}' missing fields: {missing}"

    def test_all_sources_have_required_fields(self):
        required_src = {"id", "title", "publisher", "url"}
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        for name, entry in data["entries"].items():
            for src in entry.get("sources", []):
                missing = required_src - src.keys()
                assert not missing, f"Source in '{name}' missing: {missing}"

    def test_sources_have_non_empty_urls(self):
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        for name, entry in data["entries"].items():
            for src in entry.get("sources", []):
                assert src.get("url"), f"Empty URL in source for '{name}'"

    def test_sources_use_https(self):
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        for name, entry in data["entries"].items():
            for src in entry.get("sources", []):
                url = src.get("url", "")
                assert url.startswith("https://"), (
                    f"Source URL not HTTPS in '{name}': {url}"
                )

    def test_possible_influences_is_list(self):
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        for name, entry in data["entries"].items():
            assert isinstance(entry.get("possible_influences"), list), (
                f"possible_influences must be a list in '{name}'"
            )

    def test_questions_is_list(self):
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        for name, entry in data["entries"].items():
            assert isinstance(entry.get("questions"), list), (
                f"questions must be a list in '{name}'"
            )

    def test_key_biomarkers_present(self):
        """Check that the main supported biomarkers are in the catalogue."""
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        expected = [
            "Hemoglobin", "Glucose", "HbA1c",
            "Total Cholesterol", "LDL Cholesterol", "HDL Cholesterol",
            "Triglycerides", "Alanine Aminotransferase",
            "Creatinine", "Estimated GFR",
        ]
        for name in expected:
            assert name in data["entries"], f"Missing entry for '{name}'"

    def test_pattern_explanations_key_present(self):
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        assert "pattern_explanations" in data
        assert isinstance(data["pattern_explanations"], dict)

    def test_pattern_entries_have_required_fields(self):
        required = {
            "plain_title", "plain_description", "why_grouped",
            "what_to_discuss", "limitations", "sources",
        }
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        for rule_id, entry in data.get("pattern_explanations", {}).items():
            missing = required - entry.keys()
            assert not missing, (
                f"Pattern entry '{rule_id}' missing fields: {missing}"
            )


# ---------------------------------------------------------------------------
# Safety validation tests
# ---------------------------------------------------------------------------

class TestCatalogueSafety:
    """Check that the catalogue does not contain forbidden language."""

    FORBIDDEN_PHRASES = [
        "you have diabetes",
        "you have cancer",
        "you have kidney disease",
        "you need medication",
        "you are perfectly healthy",
        "this is harmless",
        "proves diabetes",
        "confirms kidney failure",
        "you should take",
        "prescribe",
    ]

    def _all_text(self, data: dict) -> str:
        return json.dumps(data).lower()

    def test_no_diagnosis_language(self):
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        text = self._all_text(data)
        for phrase in self.FORBIDDEN_PHRASES:
            assert phrase not in text, (
                f"Forbidden phrase found in catalogue: '{phrase}'"
            )

    def test_cannot_establish_is_non_empty(self):
        with open(CATALOGUE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        for name, entry in data["entries"].items():
            value = entry.get("cannot_establish", "").strip()
            assert value, f"cannot_establish is empty for '{name}'"


# ---------------------------------------------------------------------------
# Explanation service unit tests
# ---------------------------------------------------------------------------

class TestExplanationService:
    """Unit tests using mocked Phase 4 analysis output."""

    def _make_analysis(self, assessments=None, findings=None, status="completed"):
        return {
            "status": status,
            "analysis_id": "test-analysis-id",
            "report_id": "test-report-id",
            "engine_version": "phase4-deterministic-1.0",
            "rule_set_version": "phase4-rules-1.0",
            "summary": {},
            "assessments": assessments or [],
            "findings": findings or [],
            "critical_flags": [],
        }

    def _make_measurement(self, mid, test_name, verification_status="verified"):
        return {
            "id": mid,
            "report_id": "test-report-id",
            "test_name_normalized": test_name,
            "result_original": "12.5",
            "result_numeric": 12.5,
            "unit_original": "g/dL",
            "reference_range_original": "12.0-16.0",
            "reference_low": 12.0,
            "reference_high": 16.0,
            "lab_flag": None,
            "derived_flag": "within_range",
            "verification_status": verification_status,
        }

    def test_not_started_returns_empty(self):
        from app.services.explanation_service import get_explanations
        with (
            patch("app.services.explanation_service.get_analysis") as mock_a,
            patch("app.services.explanation_service.get_measurements") as mock_m,
        ):
            mock_a.return_value = {"status": "not_started"}
            mock_m.return_value = []
            result = get_explanations("test-id")
        assert result.analysis_status == "not_started"
        assert result.measurements == []
        assert result.patterns == []
        assert result.catalogue_version  # not empty

    def test_hemoglobin_within_range_explanation(self):
        from app.services.explanation_service import get_explanations
        mid = "meas-hgb-1"
        assessment = {
            "measurement_id": mid,
            "test_name": "Hemoglobin",
            "value": "13.5",
            "unit": "g/dL",
            "range": "12.0-16.0",
            "lab_flag": None,
            "comparison_status": "within_range",
            "limitations": "Result within the laboratory reference interval.",
        }
        with (
            patch("app.services.explanation_service.get_analysis") as mock_a,
            patch("app.services.explanation_service.get_measurements") as mock_m,
        ):
            mock_a.return_value = self._make_analysis(assessments=[assessment])
            mock_m.return_value = [self._make_measurement(mid, "Hemoglobin")]
            result = get_explanations("test-id")
        assert len(result.measurements) == 1
        m = result.measurements[0]
        assert m.test_name == "Hemoglobin"
        assert m.comparison_status == "within_range"
        assert "within" in m.result_description.lower()
        assert m.what_it_measures  # not empty
        assert m.sources

    def test_glucose_above_range_explanation(self):
        from app.services.explanation_service import get_explanations
        mid = "meas-glu-1"
        assessment = {
            "measurement_id": mid,
            "test_name": "Glucose",
            "value": "140",
            "unit": "mg/dL",
            "range": "70-99",
            "lab_flag": None,
            "comparison_status": "above_range",
            "limitations": "",
        }
        with (
            patch("app.services.explanation_service.get_analysis") as mock_a,
            patch("app.services.explanation_service.get_measurements") as mock_m,
        ):
            mock_a.return_value = self._make_analysis(assessments=[assessment])
            mock_m.return_value = [self._make_measurement(mid, "Glucose")]
            result = get_explanations("test-id")
        m = result.measurements[0]
        assert m.comparison_status == "above_range"
        assert "above" in m.result_description.lower()
        assert m.what_it_measures  # has content

    def test_unverified_measurement_no_personal_interpretation(self):
        from app.services.explanation_service import get_explanations
        mid = "meas-hgb-unv"
        assessment = {
            "measurement_id": mid,
            "test_name": "Hemoglobin",
            "value": "9.0",
            "unit": "g/dL",
            "range": "12.0-16.0",
            "lab_flag": None,
            "comparison_status": "below_range",
            "limitations": "",
        }
        with (
            patch("app.services.explanation_service.get_analysis") as mock_a,
            patch("app.services.explanation_service.get_measurements") as mock_m,
        ):
            mock_a.return_value = self._make_analysis(assessments=[assessment])
            mock_m.return_value = [
                self._make_measurement(mid, "Hemoglobin", verification_status="needs_review")
            ]
            result = get_explanations("test-id")
        m = result.measurements[0]
        assert m.is_unverified is True
        # Personalised numerical interpretation should NOT appear — word "below" in
        # "general information below" is acceptable; check the key safety phrases.
        desc = m.result_description.lower()
        assert "not fully verified" in desc
        # Must NOT contain the range-comparison personalisation
        assert "above the reference" not in desc
        assert "below the reference" not in desc

    def test_critical_flag_preserved(self):
        from app.services.explanation_service import get_explanations
        mid = "meas-hgb-crit"
        assessment = {
            "measurement_id": mid,
            "test_name": "Hemoglobin",
            "value": "5.0",
            "unit": "g/dL",
            "range": "12.0-16.0",
            "lab_flag": "Critical",
            "comparison_status": "below_range",
            "limitations": "",
        }
        with (
            patch("app.services.explanation_service.get_analysis") as mock_a,
            patch("app.services.explanation_service.get_measurements") as mock_m,
        ):
            mock_a.return_value = self._make_analysis(assessments=[assessment])
            mock_m.return_value = [self._make_measurement(mid, "Hemoglobin")]
            result = get_explanations("test-id")
        m = result.measurements[0]
        assert m.is_critical is True
        assert m.lab_flag == "Critical"
        assert result.summary.critical_flags == 1

    def test_unrecognised_biomarker_skipped(self):
        """Measurements not in catalogue must be skipped, not invented."""
        from app.services.explanation_service import get_explanations
        mid = "meas-unk"
        assessment = {
            "measurement_id": mid,
            "test_name": "UnknownBiomarkerXYZ",
            "value": "50",
            "unit": "units",
            "range": "0-100",
            "lab_flag": None,
            "comparison_status": "within_range",
            "limitations": "",
        }
        with (
            patch("app.services.explanation_service.get_analysis") as mock_a,
            patch("app.services.explanation_service.get_measurements") as mock_m,
        ):
            mock_a.return_value = self._make_analysis(assessments=[assessment])
            mock_m.return_value = [self._make_measurement(mid, "UnknownBiomarkerXYZ")]
            result = get_explanations("test-id")
        assert len(result.measurements) == 0  # skipped safely

    def test_multiple_measurements(self):
        from app.services.explanation_service import get_explanations
        assessments = [
            {"measurement_id": "m1", "test_name": "Hemoglobin", "value": "13", "unit": "g/dL",
             "range": "12-16", "lab_flag": None, "comparison_status": "within_range", "limitations": ""},
            {"measurement_id": "m2", "test_name": "Glucose", "value": "105", "unit": "mg/dL",
             "range": "70-99", "lab_flag": None, "comparison_status": "above_range", "limitations": ""},
        ]
        measurements = [
            self._make_measurement("m1", "Hemoglobin"),
            self._make_measurement("m2", "Glucose"),
        ]
        with (
            patch("app.services.explanation_service.get_analysis") as mock_a,
            patch("app.services.explanation_service.get_measurements") as mock_m,
        ):
            mock_a.return_value = self._make_analysis(assessments=assessments)
            mock_m.return_value = measurements
            result = get_explanations("test-id")
        assert len(result.measurements) == 2
        assert result.summary.within_range == 1
        assert result.summary.above_range == 1

    def test_pattern_with_catalogue_entry(self):
        from app.services.explanation_service import get_explanations
        finding = {
            "id": "f1",
            "rule_id": "CBC_ANEMIA_PATTERN",
            "finding_code": "CBC_ANEMIA_PATTERN",
            "evidence_measurement_ids": ["m1"],
            "metadata": {
                "description": "Hemoglobin is below the laboratory reference interval.",
                "recommendation_language": "discuss_with_clinician",
                "reference": "WHO/CDC",
                "review_status": "reviewed",
                "patient_context_needed": ["Dietary history"],
                "missing_context": [],
                "limitations": ["Not a diagnosis."],
                "measurements": [],
            },
        }
        with (
            patch("app.services.explanation_service.get_analysis") as mock_a,
            patch("app.services.explanation_service.get_measurements") as mock_m,
        ):
            mock_a.return_value = self._make_analysis(findings=[finding])
            mock_m.return_value = []
            result = get_explanations("test-id")
        assert len(result.patterns) == 1
        p = result.patterns[0]
        assert p.rule_id == "CBC_ANEMIA_PATTERN"
        assert p.has_catalogue_entry is True
        assert p.plain_title  # not empty

    def test_pattern_without_catalogue_entry(self):
        """Finding without catalogue entry must still be preserved."""
        from app.services.explanation_service import get_explanations
        finding = {
            "id": "f-unk",
            "rule_id": "UNSUPPORTED_RULE",
            "finding_code": "UNSUPPORTED_RULE",
            "evidence_measurement_ids": [],
            "metadata": {
                "description": "Some undocumented pattern.",
                "recommendation_language": "discuss_with_clinician",
                "patient_context_needed": [],
                "missing_context": [],
                "limitations": [],
                "measurements": [],
            },
        }
        with (
            patch("app.services.explanation_service.get_analysis") as mock_a,
            patch("app.services.explanation_service.get_measurements") as mock_m,
        ):
            mock_a.return_value = self._make_analysis(findings=[finding])
            mock_m.return_value = []
            result = get_explanations("test-id")
        assert len(result.patterns) == 1
        p = result.patterns[0]
        assert p.has_catalogue_entry is False
        # Must still preserve the original description
        assert p.description  # not empty

    def test_response_includes_disclaimer(self):
        from app.services.explanation_service import get_explanations
        with (
            patch("app.services.explanation_service.get_analysis") as mock_a,
            patch("app.services.explanation_service.get_measurements") as mock_m,
        ):
            mock_a.return_value = self._make_analysis()
            mock_m.return_value = []
            result = get_explanations("test-id")
        assert result.disclaimer
        assert "not a medical diagnosis" in result.disclaimer.lower()

    def test_response_includes_catalogue_version(self):
        from app.services.explanation_service import get_explanations
        with (
            patch("app.services.explanation_service.get_analysis") as mock_a,
            patch("app.services.explanation_service.get_measurements") as mock_m,
        ):
            mock_a.return_value = self._make_analysis()
            mock_m.return_value = []
            result = get_explanations("test-id")
        assert result.catalogue_version  # not empty string


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------

class TestExplanationsEndpoint:
    """HTTP-level tests for GET /api/reports/{id}/explanations."""

    def test_nonexistent_report_returns_404(self):
        # Use a valid UUID format that doesn't correspond to any stored report
        resp = client.get("/api/reports/00000000-0000-0000-0000-000000000000/explanations")
        assert resp.status_code == 404

    def test_valid_report_no_analysis_returns_200(self):
        """Upload a report, then call explanations without running analysis."""
        import io
        import fitz
        doc = fitz.open()
        doc.new_page().insert_text((50, 72), "LabLens Test PDF")
        pdf_bytes = doc.tobytes()
        resp = client.post(
            "/api/reports",
            files={"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            data={"consent": "true"},
        )
        if resp.status_code != 201:
            pytest.skip("Upload unavailable in this environment")
        report_id = resp.json()["id"]

        exp_resp = client.get(f"/api/reports/{report_id}/explanations")
        assert exp_resp.status_code == 200
        data = exp_resp.json()
        assert data["analysis_status"] == "not_started"
        assert data["measurements"] == []
        assert data["patterns"] == []
        assert data["catalogue_version"]
        assert data["disclaimer"]

    def test_explanations_response_structure(self):
        """Mock the service and verify the response schema is correctly serialised."""
        import io
        import fitz
        from unittest.mock import patch
        from app.schemas.explanations import (
            ExplanationsResponse, ExplanationsSummary, MeasurementExplanation,
            PatternExplanation, SourceInfo,
        )
        doc = fitz.open()
        doc.new_page().insert_text((50, 72), "LabLens Schema Test PDF")
        pdf_bytes = doc.tobytes()
        resp = client.post(
            "/api/reports",
            files={"file": ("schema_test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            data={"consent": "true"},
        )
        if resp.status_code != 201:
            pytest.skip("Upload unavailable in this environment")
        report_id = resp.json()["id"]

        mock_response = ExplanationsResponse(
            catalogue_version="2.0",
            report_id=report_id,
            analysis_status="completed",
            summary=ExplanationsSummary(
                total_assessments=1,
                within_range=1,
                above_range=0,
                below_range=0,
                unverified_or_needs_review=0,
                supported_patterns=0,
                critical_flags=0,
            ),
            measurements=[
                MeasurementExplanation(
                    measurement_id="m1",
                    test_name="Hemoglobin",
                    value="13.5",
                    unit="g/dL",
                    reference_range="12.0-16.0",
                    comparison_status="within_range",
                    lab_flag=None,
                    is_critical=False,
                    is_unverified=False,
                    what_it_measures="Test what it measures.",
                    why_doctors_look_at_it="Test why.",
                    result_description="Within range.",
                    possible_influences=["Factor A"],
                    cannot_establish="Cannot establish X.",
                    context_factors=["Age"],
                    discussion_questions=["Question 1?"],
                    sources=[SourceInfo(id="s1", title="T1", publisher="P1", url="https://example.com")],
                )
            ],
            patterns=[],
            disclaimer="Disclaimer text.",
        )

        with patch("app.routes.reports.get_explanations", return_value=mock_response):
            exp_resp = client.get(f"/api/reports/{report_id}/explanations")

        assert exp_resp.status_code == 200
        data = exp_resp.json()
        assert data["catalogue_version"] == "2.0"
        assert data["analysis_status"] == "completed"
        assert len(data["measurements"]) == 1
        m = data["measurements"][0]
        assert m["test_name"] == "Hemoglobin"
        assert m["is_critical"] is False
        assert m["is_unverified"] is False
        assert m["sources"][0]["url"] == "https://example.com"


# ---------------------------------------------------------------------------
# Safety assertion tests
# ---------------------------------------------------------------------------

class TestSafetyAssertions:
    """Ensure the service never makes forbidden medical claims."""

    def _run_with_assessment(self, comparison_status, lab_flag=None, verification_status="verified"):
        from app.services.explanation_service import get_explanations
        mid = "safety-mid"
        assessment = {
            "measurement_id": mid,
            "test_name": "Hemoglobin",
            "value": "10.0",
            "unit": "g/dL",
            "range": "12.0-16.0",
            "lab_flag": lab_flag,
            "comparison_status": comparison_status,
            "limitations": "",
        }
        raw_meas = {
            "id": mid, "report_id": "r1",
            "test_name_normalized": "Hemoglobin",
            "result_original": "10.0", "result_numeric": 10.0,
            "unit_original": "g/dL", "reference_range_original": "12.0-16.0",
            "reference_low": 12.0, "reference_high": 16.0,
            "lab_flag": lab_flag, "derived_flag": "below_range",
            "verification_status": verification_status,
        }
        analysis = {
            "status": "completed",
            "analysis_id": "a1", "report_id": "r1",
            "engine_version": "phase4-deterministic-1.0",
            "rule_set_version": "phase4-rules-1.0",
            "summary": {},
            "assessments": [assessment],
            "findings": [],
            "critical_flags": [],
        }
        with (
            patch("app.services.explanation_service.get_analysis", return_value=analysis),
            patch("app.services.explanation_service.get_measurements", return_value=[raw_meas]),
        ):
            return get_explanations("r1")

    def test_no_diagnosis_text_in_result_description(self):
        result = self._run_with_assessment("below_range")
        for m in result.measurements:
            desc = m.result_description.lower()
            for bad in ["you have anemia", "diagnosed", "you are sick"]:
                assert bad not in desc

    def test_in_range_does_not_claim_good_health(self):
        result = self._run_with_assessment("within_range")
        for m in result.measurements:
            desc = m.result_description.lower()
            assert "perfectly healthy" not in desc
            assert "nothing to worry" not in desc

    def test_critical_flag_not_suppressed(self):
        result = self._run_with_assessment("below_range", lab_flag="Critical")
        assert any(m.is_critical for m in result.measurements)
        assert result.summary.critical_flags >= 1

    def test_unverified_no_personal_interpretation(self):
        result = self._run_with_assessment(
            "below_range", verification_status="needs_review"
        )
        for m in result.measurements:
            if m.is_unverified:
                desc = m.result_description.lower()
                assert "below" not in desc or "not fully verified" in desc
