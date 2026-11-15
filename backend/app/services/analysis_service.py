import hashlib
import json
import re
import uuid
from datetime import datetime, timezone

from app.database import get_connection
from app.services.measurement_service import get_measurements

ENGINE_VERSION = "phase4-deterministic-1.0"
RULE_SET_VERSION = "phase4-rules-1.0"

ANALYSIS_FRESHNESS_CURRENT = "current"
ANALYSIS_FRESHNESS_STALE = "stale"
ANALYSIS_FRESHNESS_NOT_STARTED = "not_started"
MEASUREMENT_FINGERPRINT_KEY = "measurement_fingerprint"

CRITICAL_FLAG_TOKENS = {"critical", "crit", "critical value", "critical finding", "panic value"}

# Controlled unit canonicalisation (normalised key -> canonical key).
UNIT_CANONICAL = {
    "mg/dl": "mg/dl",
    "mg/l": "mg/l",
    "g/dl": "g/dl",
    "g/l": "g/l",
    "ng/ml": "ng/ml",
    "ug/ml": "ug/ml",
    "ug/l": "ug/l",
    "mmol/l": "mmol/l",
    "%": "%",
    "percent": "%",
    "cells/ul": "cells/ul",
    "/ul": "cells/ul",
    "x10^3/ul": "x10^3/ul",
    "10^3/ul": "x10^3/ul",
    "x10^6/ul": "x10^6/ul",
    "mil/ul": "mil/ul",
    "10^6/ul": "x10^6/ul",
    "u/l": "u/l",
    "iu/l": "iu/l",
    "fl": "fl",
    "pg": "pg",
    "ml/min": "ml/min",
    "ml/min/1.73m2": "ml/min",
    "ml/min/1.73m^2": "ml/min",
}

# Controlled, dimensionally appropriate unit conversion factors:
# (source_unit, target_unit) -> multiplier such that value_target = value_source * factor
UNIT_FACTORS: dict[tuple[str, str], float] = {
    ("mg/dl", "g/dl"): 0.01,
    ("g/dl", "mg/dl"): 100.0,
    ("g/dl", "g/l"): 10.0,
    ("g/l", "g/dl"): 0.1,
    ("mg/dl", "mg/l"): 10.0,
    ("mg/l", "mg/dl"): 0.1,
    ("g/l", "mg/l"): 1000.0,
    ("mg/l", "g/l"): 0.001,
    ("ng/ml", "ug/l"): 1.0,
    ("ug/l", "ng/ml"): 1.0,
    ("ug/ml", "mg/l"): 1.0,
    ("mg/l", "ug/ml"): 1.0,
    ("cells/ul", "x10^3/ul"): 0.001,
    ("x10^3/ul", "cells/ul"): 1000.0,
    ("cells/ul", "x10^6/ul"): 0.000001,
    ("x10^6/ul", "cells/ul"): 1000000.0,
    ("x10^3/ul", "x10^6/ul"): 0.001,
    ("x10^6/ul", "x10^3/ul"): 1000.0,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm_unit(unit: str | None) -> str | None:
    if not unit:
        return None
    s = str(unit).strip().lower().replace("µ", "u").replace("μ", "u")
    if re.match(r"^10\^", s):
        s = "x" + s
    s = re.sub(r"\s+", "", s)
    return UNIT_CANONICAL.get(s)


def _convert(value: float, from_unit: str, to_unit: str, test_name: str | None = None) -> float | None:
    fu = _norm_unit(from_unit)
    tu = _norm_unit(to_unit)
    if fu is None or tu is None:
        return None
    if fu == tu:
        return float(value)

    # Generic dimensionally validated metric conversion
    if (fu, tu) in UNIT_FACTORS:
        return float(value) * UNIT_FACTORS[(fu, tu)]

    # Compound-specific conversions (strictly for Glucose where molecular weight is 180.16 g/mol)
    if test_name == "Glucose":
        if fu == "mg/dl" and tu == "mmol/l":
            return float(value) / 18.0182
        if fu == "mmol/l" and tu == "mg/dl":
            return float(value) * 18.0182

    return None


def _resolve_comparison(measurement: dict) -> tuple[str, float | None, str | None]:
    """Return (status, comparable_value, problem). comparable_value is in range units when status allows numeric compare."""
    result = measurement.get("result_numeric")
    low = measurement.get("reference_low")
    high = measurement.get("reference_high")
    unit = measurement.get("unit_original")
    range_unit = measurement.get("reference_unit") or measurement.get("unit_original")
    test_name = measurement.get("test_name_normalized")

    if measurement.get("result_qualifier"):
        return "qualitative", None, "Qualitative result; not compared numerically."
    if result is None:
        return "unavailable", None, "No numeric result available."
    if low is None and high is None:
        return "unavailable", None, "No reference interval available; comparison not performed."
    if not unit or not range_unit:
        return "review_required", None, "Missing unit; comparison not performed."

    value = _convert(float(result), unit, range_unit, test_name=test_name)
    if value is None:
        return "incompatible_units", None, (
            f"Result unit '{unit}' and reference unit '{range_unit}' are not reliably comparable; no safe conversion exists."
        )

    if low is None and high is not None:
        status = "above_range" if value > float(high) else "within_range"
    elif high is None and low is not None:
        status = "below_range" if value < float(low) else "within_range"
    elif value < float(low):
        status = "below_range"
    elif value > float(high):
        status = "above_range"
    else:
        status = "within_range"
    return status, value, None


def _compare(measurement: dict) -> dict:
    status, value, problem = _resolve_comparison(measurement)
    limitations = problem or ""
    if status == "within_range" and not limitations:
        limitations = "Result within the laboratory reference interval."
    calculated_flag = status
    if status == "incompatible_units":
        # keep original lab flag separate from calculated comparison
        pass
    return {
        "comparison_status": status,
        "comparable_value": value,
        "limitations": limitations,
        "lab_flag": measurement.get("lab_flag"),
        "calculated_flag": calculated_flag,
    }


def _is_critical(lab_flag) -> bool:
    if not lab_flag:
        return False
    token = str(lab_flag).strip().lower()
    return token in CRITICAL_FLAG_TOKENS or "critical" in token


def _measurement_fingerprint(measurements: list[dict]) -> str:
    """Return a deterministic digest of every measurement field analysis consumes.

    The digest deliberately avoids timestamps so freshness does not depend on
    clock precision or ambiguous equality. Any change to an eligible result,
    verification state, unit, range, flag, or identity changes the digest.
    """
    canonical = []
    for m in sorted(measurements, key=lambda item: str(item.get("id") or "")):
        canonical.append({
            "id": m.get("id"),
            "test_name_normalized": m.get("test_name_normalized"),
            "test_code": m.get("test_code"),
            "result_original": m.get("result_original"),
            "result_numeric": m.get("result_numeric"),
            "result_qualifier": m.get("result_qualifier"),
            "unit_original": m.get("unit_original"),
            "reference_range_original": m.get("reference_range_original"),
            "reference_low": m.get("reference_low"),
            "reference_high": m.get("reference_high"),
            "reference_unit": m.get("reference_unit"),
            "lab_flag": m.get("lab_flag"),
            "page_number": m.get("page_number"),
            "verification_status": m.get("verification_status"),
        })
    payload = json.dumps(
        canonical,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# Pattern rules: deterministic, conservative, plain-language findings.
PATTERN_RULES = [
    # ---------- CBC ----------
    {
        "rule_id": "CBC_ANEMIA_PATTERN",
        "code": "CBC_ANEMIA_PATTERN",
        "required": ["Hemoglobin"],
        "required_statuses": {"Hemoglobin": ["below_range"]},
        "optional": ["Red Blood Cell Count", "Hematocrit", "Mean Corpuscular Volume", "White Blood Cell Count", "Platelet Count"],
        "description": "Hemoglobin is below the laboratory reference interval. These measurements may be worth considering together; additional clinical context (diet, blood loss, iron/B12 studies) is needed.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "WHO/CDC Anemia Assessment Guidance (Educational Reference)",
        "review_status": "reviewed",
        "patient_context_needed": ["Dietary history", "Recent blood loss", "Iron/B12 status"],
    },
    {
        "rule_id": "CBC_MICROCYTIC_PATTERN",
        "code": "CBC_MICROCYTIC_PATTERN",
        "required": ["Hemoglobin", "Mean Corpuscular Volume"],
        "required_statuses": {"Hemoglobin": ["below_range"], "Mean Corpuscular Volume": ["below_range"]},
        "optional": ["Red Blood Cell Count", "Hematocrit", "Red Cell Distribution Width"],
        "description": "Both hemoglobin and MCV are below reference ranges, reflecting a microcytic pattern. Discuss this finding with your healthcare professional to explore iron status or other factors.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "British Committee for Standards in Haematology / CDC Guidance",
        "review_status": "reviewed",
        "patient_context_needed": ["Ferritin / iron studies", "Dietary history", "Family history"],
    },
    {
        "rule_id": "CBC_MACROCYTIC_PATTERN",
        "code": "CBC_MACROCYTIC_PATTERN",
        "required": ["Hemoglobin", "Mean Corpuscular Volume"],
        "required_statuses": {"Hemoglobin": ["below_range"], "Mean Corpuscular Volume": ["above_range"]},
        "optional": ["Red Blood Cell Count", "Hematocrit", "Red Cell Distribution Width"],
        "description": "Hemoglobin is below range while MCV is elevated, suggesting a macrocytic pattern. Context such as vitamin B12, folate, or medication history is relevant.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "Hematology Clinical Reference Guidance",
        "review_status": "reviewed",
        "patient_context_needed": ["Vitamin B12", "Folate", "Medication history"],
    },
    {
        "rule_id": "CBC_HIGH_MCV",
        "code": "CBC_HIGH_MCV_PATTERN",
        "required": ["Mean Corpuscular Volume"],
        "required_statuses": {"Mean Corpuscular Volume": ["above_range"]},
        "optional": ["Hemoglobin", "Red Blood Cell Count", "Hematocrit", "Red Cell Distribution Width"],
        "description": "MCV is above the laboratory reference interval. Elevated red cell volume may warrant reviewing vitamin B12, folate, thyroid, or medication context.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "Hematology Reference Texts",
        "review_status": "reviewed",
        "patient_context_needed": ["Vitamin B12 / Folate", "Thyroid function", "Medication review"],
    },
    {
        "rule_id": "CBC_ELEVATED_HEMOGLOBIN",
        "code": "CBC_ELEVATED_HEMOGLOBIN_PATTERN",
        "required": ["Hemoglobin"],
        "required_statuses": {"Hemoglobin": ["above_range"]},
        "optional": ["Hematocrit", "Red Blood Cell Count"],
        "description": "Hemoglobin is above the laboratory reference interval. Hydration status, smoking history, or altitude may be relevant factors to discuss with a clinician.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "WHO / Clinical Hematology Guidance",
        "review_status": "reviewed",
        "patient_context_needed": ["Hydration state", "Altitude", "Smoking history"],
    },
    {
        "rule_id": "CBC_LEUKOCYTOSIS_PATTERN",
        "code": "CBC_LEUKOCYTOSIS_PATTERN",
        "required": ["White Blood Cell Count"],
        "required_statuses": {"White Blood Cell Count": ["above_range"]},
        "optional": ["Platelet Count", "Hemoglobin"],
        "description": "White blood cell count is above the laboratory reference interval. Clinical context (recent infection, physical stress, inflammation) is needed.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "Hematology Reference Standards",
        "review_status": "reviewed",
        "patient_context_needed": ["Recent infections", "Physical stress", "Current medications"],
    },
    {
        "rule_id": "CBC_LEUKOPENIA_PATTERN",
        "code": "CBC_LEUKOPENIA_PATTERN",
        "required": ["White Blood Cell Count"],
        "required_statuses": {"White Blood Cell Count": ["below_range"]},
        "optional": ["Platelet Count", "Hemoglobin"],
        "description": "White blood cell count is below the laboratory reference interval. Discuss this finding with your healthcare professional.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "Hematology Reference Standards",
        "review_status": "reviewed",
        "patient_context_needed": ["Viral illness history", "Medication exposures", "Immune history"],
    },
    {
        "rule_id": "CBC_THROMBOCYTOPENIA_PATTERN",
        "code": "CBC_THROMBOCYTOPENIA_PATTERN",
        "required": ["Platelet Count"],
        "required_statuses": {"Platelet Count": ["below_range"]},
        "optional": ["White Blood Cell Count", "Hemoglobin"],
        "description": "Platelet count is below the laboratory reference interval. Additional context and review of medications are needed.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "International Society on Thrombosis and Haemostasis Guidance",
        "review_status": "reviewed",
        "patient_context_needed": ["Bleeding or bruising history", "Medications", "Recent viral illness"],
    },
    {
        "rule_id": "CBC_THROMBOCYTOSIS_PATTERN",
        "code": "CBC_THROMBOCYTOSIS_PATTERN",
        "required": ["Platelet Count"],
        "required_statuses": {"Platelet Count": ["above_range"]},
        "optional": ["White Blood Cell Count", "Hemoglobin"],
        "description": "Platelet count is above the laboratory reference interval. Reactive causes (such as iron deficiency or recent inflammation) are often reviewed.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "International Society on Thrombosis and Haemostasis Guidance",
        "review_status": "reviewed",
        "patient_context_needed": ["Inflammation history", "Iron levels", "Recent surgery or trauma"],
    },

    # ---------- GLUCOSE ----------
    {
        "rule_id": "GLUCOSE_ELEVATED",
        "code": "GLUCOSE_ELEVATED",
        "required": ["Glucose"],
        "required_statuses": {"Glucose": ["above_range"]},
        "optional": ["HbA1c"],
        "description": "Glucose is above the printed reference interval. Fasting duration and timing of meals are critical context to discuss with your healthcare professional.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "American Diabetes Association (ADA) Standards of Care",
        "review_status": "reviewed",
        "patient_context_needed": ["Fasting status (hours)", "Timing of last meal", "Medications"],
    },
    {
        "rule_id": "HBA1C_ELEVATED",
        "code": "HBA1C_ELEVATED",
        "required": ["HbA1c"],
        "required_statuses": {"HbA1c": ["above_range"]},
        "optional": ["Glucose"],
        "description": "HbA1c is above the printed reference interval, reflecting longer-term glycation over 2-3 months. Discuss this finding with your clinician.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "American Diabetes Association (ADA) Standards of Care",
        "review_status": "reviewed",
        "patient_context_needed": ["Previous glucose checks", "Hemoglobin variants", "Family history"],
    },
    {
        "rule_id": "GLUCOSE_HBA1C_CONCORDANT_ELEVATION",
        "code": "GLUCOSE_HBA1C_CONCORDANT_ELEVATION",
        "required": ["Glucose", "HbA1c"],
        "required_statuses": {"Glucose": ["above_range"], "HbA1c": ["above_range"]},
        "optional": [],
        "description": "Both blood glucose and HbA1c are above their respective reference intervals. Concordant elevation represents important information for clinical discussion.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "American Diabetes Association (ADA) Standards of Care",
        "review_status": "reviewed",
        "patient_context_needed": ["Fasting duration", "Lifestyle factors", "Medical history"],
    },
    {
        "rule_id": "GLUCOSE_HYPOGLYCEMIA_PATTERN",
        "code": "GLUCOSE_HYPOGLYCEMIA_PATTERN",
        "required": ["Glucose"],
        "required_statuses": {"Glucose": ["below_range"]},
        "optional": ["HbA1c"],
        "description": "Glucose is below the laboratory reference interval. Symptoms, meal timing, and medications are essential context to review with a healthcare professional.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "Endocrine Society Clinical Practice Guidelines",
        "review_status": "reviewed",
        "patient_context_needed": ["Symptoms at time of blood draw", "Time since last meal", "Activity level"],
    },

    # ---------- LIPIDS ----------
    {
        "rule_id": "LIPID_ELEVATED_LDL",
        "code": "LIPID_ELEVATED_LDL",
        "required": ["LDL Cholesterol"],
        "required_statuses": {"LDL Cholesterol": ["above_range"]},
        "optional": ["Total Cholesterol", "HDL Cholesterol", "Triglycerides"],
        "description": "LDL cholesterol is above the printed reference range. Lifestyle factors, family history, and cardiovascular risk context should be discussed with a doctor.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "ACC/AHA Guideline on the Management of Blood Cholesterol",
        "review_status": "reviewed",
        "patient_context_needed": ["Family cardiovascular history", "Dietary patterns", "Smoking history"],
    },
    {
        "rule_id": "LIPID_LOW_HDL",
        "code": "LIPID_LOW_HDL",
        "required": ["HDL Cholesterol"],
        "required_statuses": {"HDL Cholesterol": ["below_range"]},
        "optional": ["Total Cholesterol", "LDL Cholesterol", "Triglycerides"],
        "description": "HDL cholesterol is below the printed reference interval. Physical activity, smoking status, and metabolic context may be relevant to discuss.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "ACC/AHA Guideline on the Management of Blood Cholesterol",
        "review_status": "reviewed",
        "patient_context_needed": ["Physical activity levels", "Metabolic history", "Smoking status"],
    },
    {
        "rule_id": "LIPID_ELEVATED_TRIGLYCERIDES",
        "code": "LIPID_ELEVATED_TRIGLYCERIDES",
        "required": ["Triglycerides"],
        "required_statuses": {"Triglycerides": ["above_range"]},
        "optional": ["Total Cholesterol", "LDL Cholesterol", "HDL Cholesterol"],
        "description": "Triglycerides are above the printed reference interval. Fasting duration, dietary intake, and metabolic context should be reviewed with a clinician.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "ACC/AHA Guideline on the Management of Blood Cholesterol",
        "review_status": "reviewed",
        "patient_context_needed": ["Fasting status", "Recent alcohol intake", "Dietary intake"],
    },
    {
        "rule_id": "LIPID_COMBINED_DYSLIPIDEMIA",
        "code": "LIPID_COMBINED_DYSLIPIDEMIA",
        "required": ["LDL Cholesterol", "Triglycerides"],
        "required_statuses": {"LDL Cholesterol": ["above_range"], "Triglycerides": ["above_range"]},
        "optional": ["HDL Cholesterol", "Total Cholesterol"],
        "description": "Both LDL cholesterol and triglycerides are above printed reference ranges. These measurements may be worth considering together with your healthcare professional.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "NLA / ACC / AHA Multi-society Cholesterol Guidelines",
        "review_status": "reviewed",
        "patient_context_needed": ["Fasting verification", "Family lipid history", "Metabolic history"],
    },
    {
        "rule_id": "LIPID_ELEVATED_TOTAL_CHOLESTEROL",
        "code": "LIPID_ELEVATED_TOTAL_CHOLESTEROL",
        "required": ["Total Cholesterol"],
        "required_statuses": {"Total Cholesterol": ["above_range"]},
        "optional": ["LDL Cholesterol", "HDL Cholesterol", "Triglycerides"],
        "description": "Total cholesterol is above the printed reference interval. Lipid fraction breakdown (LDL, HDL) provides essential context.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "ACC/AHA Guideline on the Management of Blood Cholesterol",
        "review_status": "reviewed",
        "patient_context_needed": ["Fasting state", "Lipid fraction breakdown", "Family history"],
    },

    # ---------- LIVER ----------
    {
        "rule_id": "LIVER_ENZYME_ELEVATION",
        "code": "LIVER_ENZYME_ELEVATION",
        "required": ["Alanine Aminotransferase"],
        "required_statuses": {"Alanine Aminotransferase": ["above_range"]},
        "optional": ["Aspartate Aminotransferase", "Alkaline Phosphatase", "Total Bilirubin", "Albumin"],
        "description": "ALT is above the printed reference interval. Recent strenuous exercise, medication exposure, alcohol intake, or viral history are common clinical considerations.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "ACG Clinical Guideline: Evaluation of Abnormal Liver Chemistries",
        "review_status": "reviewed",
        "patient_context_needed": ["Recent intense exercise", "Medication/supplement use", "Alcohol intake"],
    },
    {
        "rule_id": "LIVER_HEPATOCELLULAR_PATTERN",
        "code": "LIVER_HEPATOCELLULAR_PATTERN",
        "required": ["Alanine Aminotransferase", "Aspartate Aminotransferase"],
        "required_statuses": {"Alanine Aminotransferase": ["above_range"], "Aspartate Aminotransferase": ["above_range"]},
        "optional": ["Total Bilirubin", "Alkaline Phosphatase", "Albumin"],
        "description": "Both ALT and AST enzymes are above printed reference intervals. This combination warrants clinical review in light of medications, alcohol, and history.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "AASLD Practice Guidelines: Evaluation of Abnormal Liver Tests",
        "review_status": "reviewed",
        "patient_context_needed": ["Complete medication list", "Exercise timing", "Viral hepatitis history"],
    },
    {
        "rule_id": "LIVER_CHOLESTATIC_PATTERN",
        "code": "LIVER_CHOLESTATIC_PATTERN",
        "required": ["Alkaline Phosphatase"],
        "required_statuses": {"Alkaline Phosphatase": ["above_range"]},
        "optional": ["Total Bilirubin", "Alanine Aminotransferase", "Aspartate Aminotransferase"],
        "description": "Alkaline phosphatase (ALP) is above the printed reference interval. Bone turnover, biliary context, or vitamin D status may be relevant factors.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "ACG Clinical Guideline: Evaluation of Abnormal Liver Chemistries",
        "review_status": "reviewed",
        "patient_context_needed": ["Bone or joint symptoms", "Pregnancy or growth phase", "Biliary history"],
    },
    {
        "rule_id": "LIVER_HYPOALBUMINEMIA_PATTERN",
        "code": "LIVER_HYPOALBUMINEMIA_PATTERN",
        "required": ["Albumin"],
        "required_statuses": {"Albumin": ["below_range"]},
        "optional": ["Total Bilirubin", "Alanine Aminotransferase"],
        "description": "Albumin is below the printed reference interval. Nutritional intake, hydration, kidney excretion, and liver synthesis are relevant contexts to review.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "Clinical Biochemistry Reference Guidance",
        "review_status": "reviewed",
        "patient_context_needed": ["Nutritional status", "Hydration status", "Kidney function history"],
    },

    # ---------- KIDNEY ----------
    {
        "rule_id": "KIDNEY_FUNCTION_PATTERN",
        "code": "KIDNEY_FUNCTION_PATTERN",
        "required": ["Creatinine"],
        "required_statuses": {"Creatinine": ["above_range", "below_range"]},
        "optional": ["Blood Urea Nitrogen", "Estimated GFR", "Uric Acid"],
        "description": "Creatinine is outside the printed reference interval. Hydration, muscle mass, protein intake, and medications can influence serum levels.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "KDIGO Clinical Practice Guideline for the Evaluation of Kidney Disease",
        "review_status": "reviewed",
        "patient_context_needed": ["Hydration status", "High protein intake or creatine supplements", "Medications"],
    },
    {
        "rule_id": "KIDNEY_ELEVATED_BUN",
        "code": "KIDNEY_ELEVATED_BUN",
        "required": ["Blood Urea Nitrogen"],
        "required_statuses": {"Blood Urea Nitrogen": ["above_range"]},
        "optional": ["Creatinine", "Estimated GFR"],
        "description": "Blood urea nitrogen (BUN) is above the printed reference interval. Dietary protein, hydration, and gastrointestinal status are common clinical factors.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "KDIGO Clinical Practice Guideline for the Evaluation of Kidney Disease",
        "review_status": "reviewed",
        "patient_context_needed": ["Hydration state", "Dietary protein intake", "GI health history"],
    },
    {
        "rule_id": "KIDNEY_CONCORDANT_AZOTEMIA",
        "code": "KIDNEY_CONCORDANT_AZOTEMIA",
        "required": ["Creatinine", "Blood Urea Nitrogen"],
        "required_statuses": {"Creatinine": ["above_range"], "Blood Urea Nitrogen": ["above_range"]},
        "optional": ["Estimated GFR", "Uric Acid"],
        "description": "Both creatinine and blood urea nitrogen (BUN) are above reference ranges. Discuss this finding with your healthcare professional alongside hydration history.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "KDIGO Clinical Practice Guideline for the Evaluation of Kidney Disease",
        "review_status": "reviewed",
        "patient_context_needed": ["Hydration state", "Baseline renal function", "Medication exposures"],
    },
    {
        "rule_id": "KIDNEY_REDUCED_EGFR",
        "code": "KIDNEY_REDUCED_EGFR",
        "required": ["Estimated GFR"],
        "required_statuses": {"Estimated GFR": ["below_range"]},
        "optional": ["Creatinine", "Blood Urea Nitrogen"],
        "description": "Estimated GFR is below the printed reference range. Serial monitoring and clinical context (age, hydration, baseline values) are required.",
        "recommendation_language": "discuss_with_clinician",
        "reference": "KDIGO Clinical Practice Guideline for the Evaluation of Kidney Disease",
        "review_status": "reviewed",
        "patient_context_needed": ["Age and muscle mass context", "Hydration", "Prior baseline eGFR measurements"],
    },
]


def _by_name(measurements: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for m in measurements:
        out.setdefault(m["test_name_normalized"], []).append(m)
    return out


def _critical_flags(eligible: list[dict], assessments: list[dict]) -> list[dict]:
    flags = []
    for m, a in zip(eligible, assessments):
        if _is_critical(m.get("lab_flag")):
            flags.append({
                "measurement_id": m["id"],
                "test_name": m["test_name_normalized"],
                "value": m.get("result_original"),
                "unit": m.get("unit_original"),
                "lab_flag": m.get("lab_flag"),
                "source_page": m.get("page_number"),
                "comparison_status": a.get("comparison_status"),
            })
    return flags


def analyse_report(report_id: str) -> dict:
    measurements = get_measurements(report_id)
    measurement_fingerprint = _measurement_fingerprint(measurements)
    # Phase 4 eligibility: user-confirmed (verified) AND supported (test_code present) only.
    # Unresolved uncertainty (needs_review) and unsupported tests never silently enter analysis.
    eligible = [
        m for m in measurements
        if m.get("verification_status") == "verified" and m.get("test_code") is not None
    ]

    analysis_id = str(uuid.uuid4())
    now = _now()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO analysis_runs (id, report_id, engine_version, rule_set_version, status, started_at, completed_at, created_at, summary)
            VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?)""",
            (analysis_id, report_id, ENGINE_VERSION, RULE_SET_VERSION, now, now, now, json.dumps({})),
        )

    assessments = []
    for m in eligible:
        comp = _compare(m)
        aid = str(uuid.uuid4())
        meta = {
            "test_name": m["test_name_normalized"],
            "value": m.get("result_original"),
            "unit": m.get("unit_original"),
            "range": m.get("reference_range_original"),
            "lab_flag": m.get("lab_flag"),
            "calculated_comparison": comp["comparison_status"],
            "source_page": m.get("page_number"),
        }
        with get_connection() as conn:
            conn.execute(
                """INSERT INTO measurement_assessments (id, analysis_id, measurement_id, comparison_status, assessment_metadata, limitations, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (aid, analysis_id, m["id"], comp["comparison_status"], json.dumps(meta), comp.get("limitations") or "", _now()),
            )
        assessments.append({
            "measurement_id": m["id"],
            "test_name": m["test_name_normalized"],
            "value": m.get("result_original"),
            "unit": m.get("unit_original"),
            "range": m.get("reference_range_original"),
            "lab_flag": m.get("lab_flag"),
            "comparison_status": comp["comparison_status"],
            "limitations": comp.get("limitations") or "",
            "metadata": meta,
            "source_page": m.get("page_number"),
        })

    critical_flags = _critical_flags(eligible, assessments)

    by_name = _by_name(eligible)
    findings = []
    for rule in PATTERN_RULES:
        req = rule["required"]
        if not all(n in by_name for n in req):
            continue
        req_ms = [by_name[n][0] for n in req]
        comps = [_compare(m) for m in req_ms]

        # Ignore if any required measurement has an unresolvable or non-comparable status
        if any(c["comparison_status"] in ("incompatible_units", "review_required", "unavailable", "qualitative") for c in comps):
            continue

        req_statuses = rule.get("required_statuses", {})
        matches = True
        for m, comp in zip(req_ms, comps):
            test_n = m["test_name_normalized"]
            expected = req_statuses.get(test_n, ["below_range", "above_range"])
            if comp["comparison_status"] not in expected:
                matches = False
                break
        if not matches:
            continue

        fid = str(uuid.uuid4())
        evidence_ids = [m["id"] for m in req_ms]
        opt_ms = []
        missing_context = []
        for n in rule["optional"]:
            if n in by_name:
                opt_ms.append(by_name[n][0])
            else:
                missing_context.append(n)
        patient_context_needed = rule.get("patient_context_needed", [])
        finding_meta = {
            "description": rule["description"],
            "recommendation_language": rule["recommendation_language"],
            "reference": rule["reference"],
            "review_status": rule["review_status"],
            "rule_version": RULE_SET_VERSION,
            "engine_version": ENGINE_VERSION,
            "patient_context_required": bool(patient_context_needed),
            "patient_context_needed": patient_context_needed,
            "missing_context": missing_context,
            "limitations": [
                "Deterministic pattern rule; not a medical diagnosis.",
                "Additional clinical context is required before interpreting this combination.",
            ],
            "measurements": [
                {
                    "measurement_id": m["id"],
                    "test_name": m["test_name_normalized"],
                    "value": m.get("result_original"),
                    "unit": m.get("unit_original"),
                    "range": m.get("reference_range_original"),
                    "comparison_status": _compare(m)["comparison_status"],
                    "source_page": m.get("page_number"),
                }
                for m in req_ms
            ],
        }
        with get_connection() as conn:
            conn.execute(
                """INSERT INTO pattern_findings (id, analysis_id, rule_id, finding_code, evidence_measurement_ids, evidence_reference_ids, finding_metadata, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    fid, analysis_id, rule["rule_id"], rule["code"],
                    json.dumps(evidence_ids), json.dumps([f"page:{m.get('page_number')}" for m in req_ms]),
                    json.dumps(finding_meta), _now(),
                ),
            )
        findings.append({
            "id": fid,
            "rule_id": rule["rule_id"],
            "finding_code": rule["code"],
            "evidence_measurement_ids": evidence_ids,
            "metadata": finding_meta,
        })

    statuses = [a["comparison_status"] for a in assessments]
    summary = {
        "total_measurements": len(measurements),
        "eligible_measurements": len(eligible),
        "supported_measurements": sum(1 for m in measurements if m.get("test_code") is not None),
        "needs_review": sum(1 for m in measurements if m.get("verification_status") == "needs_review"),
        "unsupported": sum(1 for m in measurements if m.get("test_code") is None),
        "below_range": statuses.count("below_range"),
        "above_range": statuses.count("above_range"),
        "within_range": statuses.count("within_range"),
        "qualitative": statuses.count("qualitative"),
        "unavailable": statuses.count("unavailable"),
        "incompatible_units": statuses.count("incompatible_units"),
        "review_required": statuses.count("review_required"),
        "critical_flags": len(critical_flags),
        "findings_count": len(findings),
        MEASUREMENT_FINGERPRINT_KEY: measurement_fingerprint,
    }

    with get_connection() as conn:
        conn.execute(
            "UPDATE analysis_runs SET summary = ? WHERE id = ?",
            (json.dumps(summary), analysis_id),
        )

    return {
        "analysis_id": analysis_id,
        "report_id": report_id,
        "engine_version": ENGINE_VERSION,
        "rule_set_version": RULE_SET_VERSION,
        "status": "completed",
        "freshness": ANALYSIS_FRESHNESS_CURRENT,
        "freshness_reason": None,
        "started_at": now,
        "completed_at": now,
        "summary": summary,
        "assessments": assessments,
        "findings": findings,
        "critical_flags": critical_flags,
    }


def _parse_run_summary(run) -> dict | None:
    if not run["summary"]:
        return None
    try:
        summary = json.loads(run["summary"])
    except Exception:
        return None
    return summary if isinstance(summary, dict) else None


def _resolve_run_freshness(run, current_fingerprint: str) -> tuple[str, str | None]:
    if run["status"] != "completed":
        return (
            ANALYSIS_FRESHNESS_STALE,
            "This analysis did not complete successfully; re-run analysis.",
        )
    summary = _parse_run_summary(run)
    stored_fingerprint = (
        summary.get(MEASUREMENT_FINGERPRINT_KEY) if summary else None
    )
    if not stored_fingerprint:
        return (
            ANALYSIS_FRESHNESS_STALE,
            "This analysis was generated before freshness tracking was available; re-run analysis.",
        )
    if stored_fingerprint != current_fingerprint:
        return (
            ANALYSIS_FRESHNESS_STALE,
            "Measurements changed after this analysis was generated; re-run analysis.",
        )
    return ANALYSIS_FRESHNESS_CURRENT, None


def _serialize_analysis_run(
    run,
    report_id: str,
    current_fingerprint: str,
    *,
    force_stale_reason: str | None = None,
) -> dict:
    with get_connection() as conn:
        assessments = conn.execute(
            """SELECT ma.*, rm.test_name_normalized, rm.result_original, rm.unit_original,
                      rm.reference_range_original, rm.lab_flag, rm.page_number
            FROM measurement_assessments ma
            JOIN report_measurements rm ON rm.id = ma.measurement_id
            WHERE ma.analysis_id = ?""",
            (run["id"],),
        ).fetchall()
        findings = conn.execute(
            "SELECT * FROM pattern_findings WHERE analysis_id = ?",
            (run["id"],),
        ).fetchall()

    summary = _parse_run_summary(run)
    if force_stale_reason is not None:
        freshness = ANALYSIS_FRESHNESS_STALE
        freshness_reason = force_stale_reason
    else:
        freshness, freshness_reason = _resolve_run_freshness(run, current_fingerprint)

    assessment_rows = []
    for a in assessments:
        meta = {}
        if a["assessment_metadata"]:
            try:
                meta = json.loads(a["assessment_metadata"])
            except Exception:
                meta = {}
        if not isinstance(meta, dict):
            meta = {}
        # Prefer the snapshot captured when this run was generated. This keeps
        # historical analysis values intact after a measurement correction.
        assessment_rows.append({
            "measurement_id": a["measurement_id"],
            "test_name": meta.get("test_name", a["test_name_normalized"]),
            "value": meta["value"] if "value" in meta else a["result_original"],
            "unit": meta["unit"] if "unit" in meta else a["unit_original"],
            "range": meta["range"] if "range" in meta else a["reference_range_original"],
            "lab_flag": meta["lab_flag"] if "lab_flag" in meta else a["lab_flag"],
            "comparison_status": a["comparison_status"],
            "limitations": a["limitations"],
            "metadata": meta,
            "source_page": meta["source_page"] if "source_page" in meta else a["page_number"],
        })

    finding_rows = []
    for f in findings:
        meta = {}
        if f["finding_metadata"]:
            try:
                meta = json.loads(f["finding_metadata"])
            except Exception:
                meta = {}
        if not isinstance(meta, dict):
            meta = {}
        try:
            evidence_ids = json.loads(f["evidence_measurement_ids"])
        except Exception:
            evidence_ids = []
        try:
            evidence_refs = json.loads(f["evidence_reference_ids"]) if f["evidence_reference_ids"] else []
        except Exception:
            evidence_refs = []
        finding_rows.append({
            "id": f["id"],
            "rule_id": f["rule_id"],
            "finding_code": f["finding_code"],
            "evidence_measurement_ids": evidence_ids,
            "evidence_reference_ids": evidence_refs,
            "metadata": meta,
            "created_at": f["created_at"],
        })

    critical_flags = []
    for a in assessment_rows:
        if _is_critical(a.get("lab_flag")):
            critical_flags.append({
                "measurement_id": a["measurement_id"],
                "test_name": a["test_name"],
                "value": a.get("value"),
                "unit": a.get("unit"),
                "lab_flag": a.get("lab_flag"),
                "source_page": a.get("source_page"),
                "comparison_status": a.get("comparison_status"),
            })

    return {
        "analysis_id": run["id"],
        "report_id": report_id,
        "engine_version": run["engine_version"],
        "rule_set_version": run["rule_set_version"],
        "status": run["status"],
        "freshness": freshness,
        "freshness_reason": freshness_reason,
        "started_at": run["started_at"],
        "completed_at": run["completed_at"],
        "summary": summary,
        "assessments": assessment_rows,
        "findings": finding_rows,
        "critical_flags": critical_flags,
    }


def _latest_analysis_run(report_id: str):
    with get_connection() as conn:
        return conn.execute(
            """SELECT * FROM analysis_runs
               WHERE report_id = ?
               ORDER BY created_at DESC, rowid DESC LIMIT 1""",
            (report_id,),
        ).fetchone()


def get_analysis(report_id: str) -> dict:
    run = _latest_analysis_run(report_id)
    if not run:
        return {
            "report_id": report_id,
            "status": "not_started",
            "freshness": ANALYSIS_FRESHNESS_NOT_STARTED,
            "freshness_reason": None,
            "summary": None,
            "assessments": [],
            "findings": [],
            "critical_flags": [],
        }
    current_fingerprint = _measurement_fingerprint(get_measurements(report_id))
    return _serialize_analysis_run(run, report_id, current_fingerprint)


def get_analysis_freshness(report_id: str) -> str:
    """Return the freshness of the latest analysis without serialising it."""
    run = _latest_analysis_run(report_id)
    if not run:
        return ANALYSIS_FRESHNESS_NOT_STARTED
    current_fingerprint = _measurement_fingerprint(get_measurements(report_id))
    freshness, _ = _resolve_run_freshness(run, current_fingerprint)
    return freshness


def get_analysis_history(report_id: str) -> dict:
    """Return all stored analysis runs for a report, newest first.

    Only the latest run can be current. Older runs remain available as
    historical records and are explicitly marked stale.
    """
    with get_connection() as conn:
        runs = conn.execute(
            """SELECT * FROM analysis_runs
               WHERE report_id = ?
               ORDER BY created_at DESC, rowid DESC""",
            (report_id,),
        ).fetchall()
    if not runs:
        return {"report_id": report_id, "analyses": []}

    current_fingerprint = _measurement_fingerprint(get_measurements(report_id))
    analyses = []
    for index, run in enumerate(runs):
        if index == 0:
            analyses.append(
                _serialize_analysis_run(run, report_id, current_fingerprint)
            )
        else:
            analyses.append(
                _serialize_analysis_run(
                    run,
                    report_id,
                    current_fingerprint,
                    force_stale_reason="A newer analysis exists for this report.",
                )
            )
    return {"report_id": report_id, "analyses": analyses}


def compare_reports(report_ids: list[str]) -> dict:
    unique_ids = list(dict.fromkeys(report_ids))
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT id, created_at FROM reports WHERE id IN ({','.join('?' for _ in unique_ids)})",
            unique_ids,
        ).fetchall()
    found = {r["id"] for r in rows}
    missing = [rid for rid in unique_ids if rid not in found]
    if missing:
        raise ValueError(f"Report not found: {missing[0]}")

    reports = []
    for rid in unique_ids:
        ms = get_measurements(rid)
        created_at = None
        with get_connection() as conn:
            row = conn.execute("SELECT created_at FROM reports WHERE id = ?", (rid,)).fetchone()
            created_at = row["created_at"] if row else None
        reports.append({"report_id": rid, "created_at": created_at, "measurements": ms})
    reports.sort(key=lambda r: (r["created_at"] or "", r["report_id"]))

    comparisons = []
    all_names = sorted({m["test_name_normalized"] for r in reports for m in r["measurements"]})
    for name in all_names:
        series = []
        for r in reports:
            m = next((x for x in r["measurements"] if x["test_name_normalized"] == name), None)
            if m is None:
                continue
            series.append({"report_id": r["report_id"], "created_at": r["created_at"], "measurement": m})
        for prev, latest in zip(series, series[1:]):
            comparisons.append(_compare_pair(name, prev, latest))

    return {
        "report_ids": unique_ids,
        "comparisons": comparisons,
        "disclaimer": "Comparisons use genuinely stored measurements only; no trends are inferred from single data points.",
    }


def _compare_pair(name: str, prev: dict, latest: dict) -> dict:
    pm = prev["measurement"]
    lm = latest["measurement"]
    prev_val = pm.get("result_numeric")
    latest_val = lm.get("result_numeric")
    prev_unit = pm.get("unit_original")
    latest_unit = lm.get("unit_original")
    prev_range = pm.get("reference_range_original")
    latest_range = lm.get("reference_range_original")

    unit_compatible = True
    value = None
    status = "comparable"
    limitations = []
    if pm.get("result_qualifier") or lm.get("result_qualifier"):
        status = "qualitative"
        unit_compatible = True
        limitations.append("Qualitative result; difference not calculated.")
    elif prev_val is None or latest_val is None:
        status = "missing_data"
        unit_compatible = False
        limitations.append("A numeric value is missing; difference not calculated.")
    elif not prev_unit or not latest_unit:
        status = "missing_data"
        unit_compatible = False
        limitations.append("Missing unit; difference not calculated.")
    elif _norm_unit(prev_unit) != _norm_unit(latest_unit) and _convert(float(prev_val), prev_unit, latest_unit, test_name=name) is None:
        status = "incompatible_units"
        unit_compatible = False
        limitations.append(f"Unit mismatch between reports; values are not safely comparable ({prev_unit} vs {latest_unit}).")

    absolute_difference = None
    percentage_difference = None
    if status == "comparable":
        if _norm_unit(latest_unit) == _norm_unit(prev_unit):
            absolute_difference = round(abs(float(latest_val) - float(prev_val)), 4)
            if float(prev_val) != 0:
                percentage_difference = round((absolute_difference / abs(float(prev_val))) * 100.0, 4)
        else:
            converted_prev = _convert(float(prev_val), prev_unit, latest_unit, test_name=name)
            if converted_prev is not None:
                absolute_difference = round(abs(float(latest_val) - converted_prev), 4)
                if converted_prev != 0:
                    percentage_difference = round((absolute_difference / abs(converted_prev)) * 100.0, 4)
            else:
                status = "incompatible_units"
                unit_compatible = False
                limitations.append(f"Units cannot be safely converted between tests ({prev_unit} vs {latest_unit}).")

    return {
        "test_name": name,
        "previous": {
            "report_id": prev["report_id"],
            "value": pm.get("result_original"),
            "numeric": prev_val,
            "unit": prev_unit,
            "range": prev_range,
            "created_at": prev.get("created_at"),
        },
        "latest": {
            "report_id": latest["report_id"],
            "value": lm.get("result_original"),
            "numeric": latest_val,
            "unit": latest_unit,
            "range": latest_range,
            "created_at": latest.get("created_at"),
        },
        "status": status,
        "unit_compatible": unit_compatible,
        "absolute_difference": absolute_difference,
        "percentage_difference": percentage_difference,
        "limitations": limitations,
    }
