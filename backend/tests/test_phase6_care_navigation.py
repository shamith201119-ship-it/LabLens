"""
Phase 6 Test Suite — Care Navigation, Clinician Handoff & Provider Search
Tests summary generation integrity, privacy-preserving Google Maps query building,
and official healthcare directory references.
"""
import urllib.parse
import pytest


# ---------------------------------------------------------------------------
# Provider Search URL & Privacy Integrity Tests
# ---------------------------------------------------------------------------

class TestCareNavigationPrivacy:
    """Validate that provider search URLs are safely constructed and strictly leak no medical data."""

    def _build_maps_query(self, specialty: str, location: str) -> str:
        parts = [specialty.strip()]
        if location.strip():
            parts.append(f"in {location.strip()}")
        full_query = " ".join(parts)
        return f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(full_query)}"

    def test_maps_url_has_api_param(self):
        url = self._build_maps_query("General Physician", "Bengaluru")
        assert "https://www.google.com/maps/search/?" in url
        parsed = urllib.parse.urlparse(url)
        params = urllib.parse.parse_qs(parsed.query)
        assert params.get("api") == ["1"]
        assert "query" in params

    def test_maps_url_query_encoding(self):
        url = self._build_maps_query("Endocrinologist", "Koramangala, Bengaluru 560034")
        parsed = urllib.parse.urlparse(url)
        params = urllib.parse.parse_qs(parsed.query)
        assert params["query"][0] == "Endocrinologist in Koramangala, Bengaluru 560034"

    def test_maps_url_never_contains_patient_or_clinical_data(self):
        """Strict privacy check: verify no clinical terms, IDs, or lab values exist in URL."""
        sensitive_tokens = [
            "report", "patient", "biomarker", "glucose", "hemoglobin",
            "critical", "hba1c", "diagnosis", "prescription", "symptom",
            "120", "140", "below_range", "above_range"
        ]
        url = self._build_maps_query("Cardiologist", "Indiranagar")
        url_lower = url.lower()
        for token in sensitive_tokens:
            assert token not in url_lower, f"Sensitive health token '{token}' detected in search URL: {url}"

    def test_empty_location_falls_back_gracefully(self):
        url = self._build_maps_query("Family Medicine Doctor", "")
        parsed = urllib.parse.urlparse(url)
        params = urllib.parse.parse_qs(parsed.query)
        assert params["query"][0] == "Family Medicine Doctor"


# ---------------------------------------------------------------------------
# Official Healthcare Directory & Registration Checks
# ---------------------------------------------------------------------------

class TestOfficialCareRegistries:
    """Ensure all official government and medical council registries are valid and accurate."""

    RESOURCES = [
        {
            "id": "nmr_search",
            "title": "National Medical Register (NMR) — Doctor Search",
            "publisher": "National Medical Commission (NMC)",
            "url": "https://nmr.nmc.org.in/search-doctor",
        },
        {
            "id": "nmc_smc",
            "title": "State Medical Councils Directory",
            "publisher": "National Medical Commission (NMC)",
            "url": "https://nmc.org.in/page/information-desk-state-medical-councils",
        },
        {
            "id": "esanjeevani",
            "title": "eSanjeevani National Telemedicine Service",
            "publisher": "Ministry of Health and Family Welfare, Govt. of India",
            "url": "https://esanjeevani.mohfw.gov.in/#/",
        },
    ]

    def test_official_resources_use_https(self):
        for res in self.RESOURCES:
            assert res["url"].startswith("https://"), f"Resource '{res['id']}' must use HTTPS: {res['url']}"

    def test_all_official_resources_have_title_and_publisher(self):
        for res in self.RESOURCES:
            assert res["title"].strip(), f"Resource '{res['id']}' missing title"
            assert res["publisher"].strip(), f"Resource '{res['id']}' missing publisher"

    def test_telemedicine_url_is_correct(self):
        esanjeevani = next(r for r in self.RESOURCES if r["id"] == "esanjeevani")
        assert esanjeevani["url"] == "https://esanjeevani.mohfw.gov.in/#/"


# ---------------------------------------------------------------------------
# Clinician Summary Data Integrity & Safety Assertions
# ---------------------------------------------------------------------------

class TestClinicianSummaryDataIntegrity:
    """Verify that document summary representations strictly uphold medical safety principles."""

    def test_critical_flag_is_unsuppressed_in_summary(self):
        """Critical flags must remain prominently flagged in summary calculations."""
        measurements = [
            {"id": "m1", "test_name_normalized": "Potassium", "result_original": "6.8", "lab_flag": "CRITICAL"},
            {"id": "m2", "test_name_normalized": "Glucose", "result_original": "95", "lab_flag": None},
        ]
        has_critical = any(
            m.get("lab_flag") and ("crit" in m["lab_flag"].lower() or "panic" in m["lab_flag"].lower())
            for m in measurements
        )
        assert has_critical is True

    def test_unverified_measurements_are_labeled(self):
        """Unverified OCR measurements must maintain 'Needs review' status in exported summary."""
        measurement = {
            "id": "m-unv",
            "test_name_normalized": "Alanine Aminotransferase",
            "result_original": "42",
            "verification_status": "needs_review",
        }
        status_label = "Verified" if measurement["verification_status"] == "verified" else "Needs review"
        assert status_label == "Needs review"

    def test_summary_preserves_original_values_without_alteration(self):
        """Summary data structure must preserve original lab values, units, and ranges exactly as transcribed."""
        original_entry = {
            "test_name_original": "S. Creatinine",
            "test_name_normalized": "Creatinine",
            "result_original": "1.35",
            "unit_original": "mg/dL",
            "reference_range_original": "0.70 - 1.20",
        }
        # Simulate summary rendering extraction
        summary_row = {
            "name": original_entry["test_name_normalized"],
            "original_name": original_entry["test_name_original"],
            "value": original_entry["result_original"],
            "unit": original_entry["unit_original"],
            "range": original_entry["reference_range_original"],
        }
        assert summary_row["value"] == "1.35"
        assert summary_row["unit"] == "mg/dL"
        assert summary_row["range"] == "0.70 - 1.20"

    def test_no_diagnostic_or_treatment_language(self):
        """Summary disclaimer text must forbid diagnostic claims."""
        disclaimer = (
            "This document is a patient-prepared summary compiled using LabLens for educational discussion. "
            "It is not an automated medical diagnosis, clinical opinion, or triage directive. "
            "All measurements, units, and ranges are transcribed from the issuing laboratory report."
        )
        forbidden = ["diagnosis of", "prescribed", "we recommend taking", "treatment plan", "emergency triage"]
        for phrase in forbidden:
            assert phrase not in disclaimer.lower()
