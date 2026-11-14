"""
Phase 7 — History Service
Handles longitudinal personal lab history, chronological report timelines,
cross-report comparisons, and biomarker trend exploration over time.
All data is aggregated on-demand from existing SQLite tables. No new tables are created.
"""
from typing import Any, Dict, List, Optional
from app.database import get_connection
from app.services.report_service import list_reports, get_report
from app.services.measurement_service import get_measurements
from app.services.analysis_service import (
    compare_reports,
    get_analysis,
    get_analysis_freshness,
)
from app.services.test_dictionary import TEST_ALIASES

# Curated categories for biomarker selector
BIOMARKER_CATEGORIES: Dict[str, str] = {
    "Hemoglobin": "Complete Blood Count",
    "Red Blood Cell Count": "Complete Blood Count",
    "Hematocrit": "Complete Blood Count",
    "Mean Corpuscular Volume": "Complete Blood Count",
    "Mean Corpuscular Hemoglobin": "Complete Blood Count",
    "Mean Corpuscular Hemoglobin Concentration": "Complete Blood Count",
    "Red Cell Distribution Width": "Complete Blood Count",
    "White Blood Cell Count": "Complete Blood Count",
    "Platelet Count": "Complete Blood Count",
    "Glucose": "Glucose & Metabolic",
    "HbA1c": "Glucose & Metabolic",
    "Total Cholesterol": "Lipid Profile",
    "LDL Cholesterol": "Lipid Profile",
    "HDL Cholesterol": "Lipid Profile",
    "Triglycerides": "Lipid Profile",
    "VLDL Cholesterol": "Lipid Profile",
    "Alanine Aminotransferase": "Liver Function",
    "Aspartate Aminotransferase": "Liver Function",
    "Alkaline Phosphatase": "Liver Function",
    "Total Bilirubin": "Liver Function",
    "Albumin": "Liver Function",
    "Creatinine": "Kidney Function",
    "Blood Urea Nitrogen": "Kidney Function",
    "Estimated GFR": "Kidney Function",
    "Urea": "Kidney Function",
    "Uric Acid": "Kidney Function",
    "Sodium": "Electrolytes",
    "Potassium": "Electrolytes",
    "Chloride": "Electrolytes",
}


def get_history_overview() -> Dict[str, Any]:
    """
    Returns a chronological overview of all uploaded reports,
    their extraction & analysis status, measurement counts, and available biomarkers.
    """
    reports = list_reports()

    # Query extraction jobs and analysis runs to enrich each report
    with get_connection() as conn:
        job_rows = conn.execute(
            "SELECT report_id, status FROM extraction_jobs"
        ).fetchall()
        jobs_map = {r["report_id"]: r["status"] for r in job_rows}

        analysis_rows = conn.execute(
            "SELECT report_id, status, created_at FROM analysis_runs ORDER BY created_at DESC"
        ).fetchall()
        analysis_map = {}
        for r in analysis_rows:
            if r["report_id"] not in analysis_map:
                analysis_map[r["report_id"]] = r["status"]

        # Sample dates from report_measurements if available
        sample_date_rows = conn.execute(
            """SELECT report_id, sample_date
               FROM report_measurements
               WHERE sample_date IS NOT NULL AND sample_date != ''
               GROUP BY report_id"""
        ).fetchall()
        sample_dates = {r["report_id"]: r["sample_date"] for r in sample_date_rows}

        # Measurement counts and critical flags per report
        meas_summary_rows = conn.execute(
            """SELECT report_id,
                      COUNT(*) as total_measurements,
                      SUM(CASE WHEN lab_flag LIKE '%crit%' OR lab_flag LIKE '%panic%' THEN 1 ELSE 0 END) as critical_count
               FROM report_measurements
               GROUP BY report_id"""
        ).fetchall()
        meas_summary = {
            r["report_id"]: {
                "total_measurements": r["total_measurements"],
                "critical_flags": r["critical_count"] or 0,
            }
            for r in meas_summary_rows
        }

    timeline: List[Dict[str, Any]] = []
    for r in reports:
        rid = r.id if hasattr(r, "id") else r["id"]
        filename = r.original_filename if hasattr(r, "original_filename") else r.get("original_filename")
        created_at = r.created_at if hasattr(r, "created_at") else r.get("created_at")
        if created_at is not None and not isinstance(created_at, str):
            created_at = str(created_at)

        msum = meas_summary.get(rid, {"total_measurements": 0, "critical_flags": 0})
        s_date = sample_dates.get(rid)

        # Date provenance logic
        date_provenance = "sample_date" if s_date else "upload_date"
        effective_date = s_date if s_date else created_at

        timeline.append({
            "report_id": rid,
            "filename": filename,
            "upload_date": created_at,
            "report_date": s_date,
            "effective_date": effective_date,
            "date_provenance": date_provenance,
            "extraction_status": jobs_map.get(rid, "none"),
            "analysis_status": analysis_map.get(rid, "not_started"),
            "analysis_freshness": get_analysis_freshness(rid),
            "measurement_count": msum["total_measurements"],
            "critical_flags_count": msum["critical_flags"],
        })

    # Sort newest first by effective_date
    timeline.sort(key=lambda x: (x["effective_date"] or x["upload_date"] or ""), reverse=True)

    # Distinct canonical biomarkers available in history
    with get_connection() as conn:
        bio_rows = conn.execute(
            """SELECT test_name_normalized, test_code, COUNT(*) as observation_count
               FROM report_measurements
               WHERE test_name_normalized IS NOT NULL
               GROUP BY test_name_normalized
               ORDER BY test_name_normalized"""
        ).fetchall()

    biomarkers = [
        {
            "test_name": r["test_name_normalized"],
            "test_code": r["test_code"],
            "category": BIOMARKER_CATEGORIES.get(r["test_name_normalized"], "General"),
            "observation_count": r["observation_count"],
        }
        for r in bio_rows
    ]

    return {
        "total_reports": len(reports),
        "reports_with_measurements": sum(1 for t in timeline if t["measurement_count"] > 0),
        "timeline": timeline,
        "available_biomarkers": biomarkers,
        "disclaimer": (
            "Lab history summarizes your previously uploaded reports chronologically. "
            "It does not represent a continuous medical monitoring stream or clinical diagnosis."
        ),
    }


def get_biomarker_history(biomarker_name: str) -> Dict[str, Any]:
    """
    Returns all historical observations for a specific canonical biomarker,
    ordered chronologically. Includes original values, units, reference ranges,
    review statuses, and source report references.
    """
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT rm.*, r.original_filename, r.created_at as report_upload_date
               FROM report_measurements rm
               JOIN reports r ON r.id = rm.report_id
               WHERE rm.test_name_normalized = ?
               ORDER BY COALESCE(rm.sample_date, r.created_at) ASC, rm.created_at ASC""",
            (biomarker_name,),
        ).fetchall()

    if not rows:
        return {
            "test_name": biomarker_name,
            "category": BIOMARKER_CATEGORIES.get(biomarker_name, "General"),
            "total_observations": 0,
            "observations": [],
            "summary": {
                "eligible_count": 0,
                "needs_review_count": 0,
                "status_message": "No observations found for this biomarker.",
            },
            "disclaimer": (
                "Longitudinal trends represent factual historical records. "
                "Reference intervals may differ between laboratories. "
                "Never infer disease improvement or progression without clinical evaluation."
            ),
        }

    observations = []
    eligible_numeric = []

    for r in rows:
        is_verified = r["verification_status"] == "verified"
        has_numeric = r["result_numeric"] is not None
        has_qualifier = r["result_qualifier"] is not None

        # Determine eligibility for numerical trends
        trend_eligible = is_verified and has_numeric and not has_qualifier
        exclusion_reason = None
        if not is_verified:
            exclusion_reason = "Unverified OCR extraction; user review required."
        elif has_qualifier:
            exclusion_reason = "Categorical or qualified result (< or >); numeric trend excluded."
        elif not has_numeric:
            exclusion_reason = "No numerical value recorded."

        s_date = r["sample_date"]
        date_used = s_date if s_date else r["report_upload_date"]
        provenance = "sample_date" if s_date else "upload_date"

        obs = {
            "measurement_id": r["id"],
            "report_id": r["report_id"],
            "filename": r["original_filename"],
            "date": date_used,
            "date_provenance": provenance,
            "test_name_original": r["test_name_original"],
            "value_original": r["result_original"],
            "value_numeric": r["result_numeric"],
            "unit": r["unit_original"],
            "reference_range": r["reference_range_original"],
            "reference_low": r["reference_low"],
            "reference_high": r["reference_high"],
            "lab_flag": r["lab_flag"],
            "derived_flag": r["derived_flag"],
            "verification_status": r["verification_status"],
            "trend_eligible": trend_eligible,
            "exclusion_reason": exclusion_reason,
            "page_number": r["page_number"],
        }
        observations.append(obs)
        if trend_eligible:
            eligible_numeric.append(obs)

    # Calculate factual difference if multiple eligible numeric points exist
    recorded_difference = None
    trend_summary = "Only one eligible observation available; trend cannot be established."
    if len(eligible_numeric) >= 2:
        first = eligible_numeric[0]
        latest = eligible_numeric[-1]
        # Check unit compatibility
        if first["unit"] == latest["unit"] and first["value_numeric"] is not None and latest["value_numeric"] is not None:
            diff = round(latest["value_numeric"] - first["value_numeric"], 4)
            pct = None
            if first["value_numeric"] != 0:
                pct = round((diff / abs(first["value_numeric"])) * 100.0, 2)
            recorded_difference = {
                "earlier_value": first["value_numeric"],
                "latest_value": latest["value_numeric"],
                "unit": first["unit"],
                "absolute_change": diff,
                "percentage_change": pct,
                "direction": "higher" if diff > 0 else ("lower" if diff < 0 else "unchanged"),
            }
            trend_summary = (
                f"Recorded result is {recorded_difference['direction']} by {abs(diff)} {first['unit']} "
                f"compared to the earliest observation."
            )
        else:
            trend_summary = "Observations have different units; direct arithmetic change not computed."
    elif len(eligible_numeric) == 0:
        trend_summary = "No verified numeric observations eligible for trend plotting."

    return {
        "test_name": biomarker_name,
        "category": BIOMARKER_CATEGORIES.get(biomarker_name, "General"),
        "total_observations": len(observations),
        "observations": observations,
        "summary": {
            "eligible_count": len(eligible_numeric),
            "needs_review_count": sum(1 for o in observations if not o["trend_eligible"]),
            "recorded_difference": recorded_difference,
            "status_message": trend_summary,
        },
        "disclaimer": (
            "Longitudinal trends represent factual historical records. "
            "Reference intervals may differ between laboratories. "
            "Never infer disease improvement or progression without clinical evaluation."
        ),
    }


def compare_history_reports(report_ids: List[str]) -> Dict[str, Any]:
    """
    Wraps existing Phase 4 compare_reports service,
    validating report IDs and returning side-by-side comparison.
    """
    if len(report_ids) < 2:
        raise ValueError("At least two report IDs are required for comparison.")
    if report_ids[0] == report_ids[1]:
        raise ValueError("Cannot compare a report with itself. Please select two distinct reports.")

    # Call existing Phase 4 comparison engine
    return compare_reports(report_ids)
