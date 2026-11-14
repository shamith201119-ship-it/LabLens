"""
Phase 5 — Explanation Service

Generates patient-friendly explanations for a report by combining:
  1. The curated medical explanation catalogue (explanations.json)
  2. The existing Phase 4 analysis (get_analysis)
  3. The report's structured measurements (get_measurements)

No new database tables are required. All explanations are generated
on-demand from stored Phase 4 results plus the versioned catalogue.
"""
import json
from pathlib import Path
from typing import List, Optional

from app.services.analysis_service import get_analysis
from app.services.measurement_service import get_measurements
from app.schemas.explanations import (
    ExplanationsResponse,
    ExplanationsSummary,
    MeasurementExplanation,
    PatternExplanation,
    SourceInfo,
)

# ---------------------------------------------------------------------------
# Catalogue loading (singleton at import time)
# ---------------------------------------------------------------------------
_CATALOGUE_PATH = (
    Path(__file__).resolve().parents[1] / "catalogue" / "explanations.json"
)

_CATALOGUE: dict = {}

def _load_catalogue() -> dict:
    if not _CATALOGUE_PATH.is_file():
        raise FileNotFoundError(
            f"Explanation catalogue not found at {_CATALOGUE_PATH}"
        )
    with open(_CATALOGUE_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


_CATALOGUE = _load_catalogue()
_CATALOGUE_VERSION: str = _CATALOGUE.get("catalogue_version", "unknown")
_ENTRIES: dict = _CATALOGUE.get("entries", {})
_PATTERN_ENTRIES: dict = _CATALOGUE.get("pattern_explanations", {})

# ---------------------------------------------------------------------------
# Critical flag detection (mirrors Phase 4 logic)
# ---------------------------------------------------------------------------
_CRITICAL_TOKENS = {
    "critical", "crit", "critical value", "critical finding", "panic value"
}

def _is_critical(lab_flag: Optional[str]) -> bool:
    if not lab_flag:
        return False
    token = str(lab_flag).strip().lower()
    return token in _CRITICAL_TOKENS or "critical" in token


# ---------------------------------------------------------------------------
# Result description helpers
# ---------------------------------------------------------------------------
def _result_description(comparison_status: str) -> str:
    """Plain-language sentence about the comparison outcome."""
    table = {
        "within_range": (
            "Your result is within the reference interval printed by this laboratory. "
            "Being within range does not by itself guarantee good health; your clinician "
            "can interpret this in the context of your overall picture."
        ),
        "above_range": (
            "Your result is above the reference interval printed by this laboratory. "
            "Several factors may influence this reading. Discuss it with a healthcare professional."
        ),
        "below_range": (
            "Your result is below the reference interval printed by this laboratory. "
            "Several factors may influence this reading. Discuss it with a healthcare professional."
        ),
        "incompatible_units": (
            "The result unit and reference unit could not be reliably compared. "
            "No personal numerical interpretation can be provided from this information alone."
        ),
        "unavailable": (
            "A reference interval was not available for this measurement, so a "
            "comparison against a range cannot be provided."
        ),
        "qualitative": (
            "This result was recorded as a qualitative value rather than a number, "
            "so a numerical comparison is not applicable."
        ),
        "review_required": (
            "The comparison for this measurement requires additional information. "
            "Please discuss it with the laboratory or your clinician."
        ),
    }
    return table.get(
        comparison_status,
        f"Result status: {comparison_status.replace('_', ' ')}.",
    )


# ---------------------------------------------------------------------------
# Source builder
# ---------------------------------------------------------------------------
def _build_sources(raw_sources: list) -> List[SourceInfo]:
    out = []
    for s in raw_sources:
        out.append(
            SourceInfo(
                id=s.get("id", ""),
                title=s.get("title", ""),
                publisher=s.get("publisher", ""),
                url=s.get("url", ""),
            )
        )
    return out


# ---------------------------------------------------------------------------
# Main service function
# ---------------------------------------------------------------------------
DISCLAIMER = (
    "This information is intended to help you understand your laboratory results "
    "and prepare questions for a healthcare professional. It is not a medical diagnosis, "
    "treatment recommendation, or clinical opinion. Laboratory results must be interpreted "
    "alongside symptoms, medical history, examination findings, and clinical judgment."
)


def get_explanations(report_id: str) -> ExplanationsResponse:
    """
    Generate Phase 5 explanations for a report.

    Returns a fully typed ExplanationsResponse. If Phase 4 analysis has not
    yet been run, returns a predictable 'not_started' response with empty lists.
    """
    analysis = get_analysis(report_id)
    analysis_status = analysis.get("status", "not_started")
    analysis_freshness = analysis.get("freshness")
    if analysis_freshness is None:
        analysis_freshness = (
            "current" if analysis_status == "completed" else "not_started"
        )

    empty_summary = ExplanationsSummary(
        total_assessments=0,
        within_range=0,
        above_range=0,
        below_range=0,
        unverified_or_needs_review=0,
        supported_patterns=0,
        critical_flags=0,
    )

    if analysis_status != "completed" or analysis_freshness == "stale":
        return ExplanationsResponse(
            catalogue_version=_CATALOGUE_VERSION,
            report_id=report_id,
            analysis_status=(
                "stale" if analysis_freshness == "stale" else analysis_status
            ),
            analysis_freshness=analysis_freshness,
            summary=empty_summary,
            measurements=[],
            patterns=[],
            disclaimer=DISCLAIMER,
        )

    # ------------------------------------------------------------------
    # Build a measurement lookup for review-status context
    # ------------------------------------------------------------------
    all_measurements = get_measurements(report_id)
    measurement_lookup: dict[str, dict] = {
        m["id"]: m for m in all_measurements
    }

    # Counts for unverified / needs_review measurements
    unverified_count = sum(
        1
        for m in all_measurements
        if m.get("verification_status") in ("needs_review", "extracted")
    )

    # ------------------------------------------------------------------
    # Measurement explanations
    # ------------------------------------------------------------------
    assessments: list[dict] = analysis.get("assessments", [])
    measurement_explanations: List[MeasurementExplanation] = []

    for a in assessments:
        test_name = a.get("test_name", "")
        entry = _ENTRIES.get(test_name)

        if not entry:
            # No catalogue entry — skip: we do not invent explanations.
            continue

        mid = a.get("measurement_id", "")
        raw_meas = measurement_lookup.get(mid, {})
        verification = raw_meas.get("verification_status", "verified")
        is_unverified = verification in ("needs_review", "extracted")

        lab_flag = a.get("lab_flag")
        critical = _is_critical(lab_flag)
        comparison_status = a.get("comparison_status", "unavailable")

        meas_exp = MeasurementExplanation(
            measurement_id=mid,
            test_name=test_name,
            value=a.get("value"),
            unit=a.get("unit"),
            reference_range=a.get("range"),
            comparison_status=comparison_status,
            lab_flag=lab_flag,
            is_critical=critical,
            is_unverified=is_unverified,
            what_it_measures=entry.get("what_it_measures", ""),
            why_doctors_look_at_it=entry.get("why_doctors_look_at_it", ""),
            # Personalised result description respects review and verification state
            result_description=(
                "This measurement was not fully verified before analysis. "
                "No personalised interpretation is provided; the general information below "
                "describes what this test measures."
                if is_unverified
                else _result_description(comparison_status)
            ),
            possible_influences=entry.get("possible_influences", []),
            cannot_establish=entry.get("cannot_establish", ""),
            context_factors=entry.get("context_factors", []),
            discussion_questions=entry.get("questions", []),
            sources=_build_sources(entry.get("sources", [])),
        )
        measurement_explanations.append(meas_exp)

    # ------------------------------------------------------------------
    # Summary counts
    # ------------------------------------------------------------------
    statuses = [m.comparison_status for m in measurement_explanations]
    critical_count = sum(1 for m in measurement_explanations if m.is_critical)
    summary = ExplanationsSummary(
        total_assessments=len(assessment_rows := assessments),
        within_range=statuses.count("within_range"),
        above_range=statuses.count("above_range"),
        below_range=statuses.count("below_range"),
        unverified_or_needs_review=unverified_count,
        supported_patterns=0,  # filled below
        critical_flags=critical_count,
    )
    # keep assessment_rows reference for summary total fix
    summary = ExplanationsSummary(
        total_assessments=len(assessments),
        within_range=statuses.count("within_range"),
        above_range=statuses.count("above_range"),
        below_range=statuses.count("below_range"),
        unverified_or_needs_review=unverified_count,
        supported_patterns=0,
        critical_flags=critical_count,
    )

    # ------------------------------------------------------------------
    # Pattern explanations
    # ------------------------------------------------------------------
    findings: list[dict] = analysis.get("findings", [])
    pattern_explanations: List[PatternExplanation] = []

    for f in findings:
        rule_id = f.get("rule_id", "")
        finding_code = f.get("finding_code", rule_id)
        meta = f.get("metadata", {}) or {}

        catalogue_entry = _PATTERN_ENTRIES.get(rule_id) or _PATTERN_ENTRIES.get(finding_code)
        has_catalogue_entry = catalogue_entry is not None

        if has_catalogue_entry:
            plain_title = catalogue_entry.get("plain_title", finding_code)
            plain_description = catalogue_entry.get("plain_description", meta.get("description", ""))
            why_grouped = catalogue_entry.get("why_grouped", "")
            what_to_discuss = catalogue_entry.get("what_to_discuss", "")
            limitations = catalogue_entry.get("limitations", meta.get("limitations", []))
            sources = _build_sources(catalogue_entry.get("sources", []))
        else:
            # Preserve finding without inventing explanation
            plain_title = finding_code
            plain_description = meta.get("description", "No educational explanation is currently available for this finding.")
            why_grouped = "This measurement pattern was identified by the LabLens analysis engine."
            what_to_discuss = "Discuss this finding with your healthcare professional."
            limitations = meta.get("limitations", ["This is a deterministic pattern finding, not a medical diagnosis."])
            sources = []

        pat_exp = PatternExplanation(
            finding_id=f.get("id", ""),
            rule_id=rule_id,
            finding_code=finding_code,
            plain_title=plain_title,
            description=meta.get("description", plain_description),
            plain_description=plain_description,
            why_grouped=why_grouped,
            what_to_discuss=what_to_discuss,
            recommendation_language=meta.get("recommendation_language", "discuss_with_clinician"),
            patient_context_needed=meta.get("patient_context_needed", []),
            missing_context=meta.get("missing_context", []),
            limitations=limitations if isinstance(limitations, list) else [str(limitations)],
            measurements=meta.get("measurements", []),
            sources=sources,
            has_catalogue_entry=has_catalogue_entry,
        )
        pattern_explanations.append(pat_exp)

    # Update summary with final pattern count
    summary = ExplanationsSummary(
        total_assessments=len(assessments),
        within_range=statuses.count("within_range"),
        above_range=statuses.count("above_range"),
        below_range=statuses.count("below_range"),
        unverified_or_needs_review=unverified_count,
        supported_patterns=len(pattern_explanations),
        critical_flags=critical_count,
    )

    return ExplanationsResponse(
        catalogue_version=_CATALOGUE_VERSION,
        report_id=report_id,
        analysis_status=analysis_status,
        analysis_freshness=analysis_freshness,
        summary=summary,
        measurements=measurement_explanations,
        patterns=pattern_explanations,
        disclaimer=DISCLAIMER,
    )
