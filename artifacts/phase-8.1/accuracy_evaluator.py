"""Field-level evaluator for the synthetic Phase 8.1 accuracy fixtures.

Benchmark-only module. It does not alter OCR, parsing, or measurement storage.
Numeric comparisons are exact within a tiny representation tolerance; no unit
conversion is performed.
"""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path
from typing import Any, Optional

_BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.services.test_dictionary import normalize_name

FIELD_ORDER = (
    "name",
    "numeric_value",
    "unit",
    "reference_low",
    "reference_high",
    "flag",
    "qualifier",
)
NUMERIC_TOLERANCE = 1e-9
_SUPERSCRIPT_TRANSLATION = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
_UNIT_TRANSLATION = str.maketrans({"µ": "u", "μ": "u", "×": "x"})
_FLAG_MAP = {
    "h": "high",
    "high": "high",
    "above": "high",
    "above range": "high",
    "above_range": "high",
    "l": "low",
    "low": "low",
    "below": "low",
    "below range": "low",
    "below_range": "low",
    "n": "normal",
    "normal": "normal",
    "within range": "normal",
    "within_range": "normal",
    "abnormal": "abnormal",
    "*": "abnormal",
}


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
        return number if math.isfinite(number) else None
    text = str(value).strip().replace(" ", "")
    if not text:
        return None
    if "," in text and "." in text:
        text = text.replace(",", "")
    elif "," in text and "." not in text:
        text = text.replace(",", ".")
    try:
        number = float(text)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def _close(left: Optional[float], right: Optional[float]) -> bool:
    if left is None or right is None:
        return False
    return math.isclose(left, right, rel_tol=NUMERIC_TOLERANCE, abs_tol=NUMERIC_TOLERANCE)


def parse_result(value: Any) -> tuple[Optional[float], Optional[str], Optional[float]]:
    """Return (numeric result, qualifier, qualifier threshold)."""
    text = "" if value is None else str(value).strip()
    match = re.match(r"^([<>]=?)\s*([\d.,]+)\s*$", text)
    if match:
        qualifier = "less_than" if "<" in match.group(1) else "greater_than"
        return None, qualifier, _to_float(match.group(2))
    number = _to_float(text)
    return number, None, None


def parse_reference_range(value: Any) -> tuple[Optional[float], Optional[float], bool]:
    """Return (low, high, parsed). Missing boundaries stay None."""
    text = "" if value is None else str(value).strip()
    if not text:
        return None, None, False
    match = re.search(r"([\d.,]+)\s*(?:-|–|—|to)\s*([\d.,]+)", text, re.I)
    if match:
        return _to_float(match.group(1)), _to_float(match.group(2)), True
    match = re.search(r"([<>]=?)\s*([\d.,]+)", text)
    if match:
        bound = _to_float(match.group(2))
        return (None, bound, True) if "<" in match.group(1) else (bound, None, True)
    return None, None, False


def normalize_unit(value: Any) -> Optional[str]:
    """Normalize harmless notation only; never convert between units."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None

    def expand_power(match: re.Match[str]) -> str:
        return "10^" + match.group(1).translate(_SUPERSCRIPT_TRANSLATION)

    text = re.sub(r"10([⁰¹²³⁴⁵⁶⁷⁸⁹]+)", expand_power, text)
    text = text.translate(_SUPERSCRIPT_TRANSLATION).translate(_UNIT_TRANSLATION)
    text = re.sub(r"\s+", "", text).lower()
    return re.sub(r"^x(?=10\^)", "", text)


def canonical_name(value: Any) -> str:
    raw = "" if value is None else str(value).strip()
    if not raw:
        return ""
    name, _code, _confidence = normalize_name(raw)
    return (name or raw).strip().lower()


def normalize_flag(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value).strip().lower().replace("_", " ").replace("-", " "))
    if not text:
        return None
    return _FLAG_MAP.get(text, text)


def _actual_flag(actual: dict[str, Any]) -> tuple[Optional[str], Any]:
    for key in ("lab_flag", "derived_flag"):
        normalized = normalize_flag(actual.get(key))
        if normalized is not None:
            return normalized, actual.get(key)
    return None, None


def _field(
    field: str,
    status: str,
    expected: Any,
    extracted: Any,
    *,
    test: Optional[str] = None,
    reason: Optional[str] = None,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "test": test,
        "field": field,
        "status": status,
        "expected": expected,
        "extracted": extracted,
    }
    if reason:
        item["reason"] = reason
    return item


def evaluate_measurement(
    expected: dict[str, Any], actual: Optional[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Compare one expected measurement with its extracted counterpart."""
    test_name = expected.get("test")
    expected_name = canonical_name(test_name)
    actual_name = None
    if actual is not None:
        actual_name = canonical_name(
            actual.get("test_name_normalized") or actual.get("test_name_original")
        )

    fields: list[dict[str, Any]] = [
        _field(
            "name",
            "correct" if actual is not None and expected_name == actual_name else "incorrect",
            expected_name,
            actual_name,
            test=test_name,
        )
    ]

    expected_numeric, expected_qualifier, expected_threshold = parse_result(
        expected.get("result")
    )
    explicit_numeric = _to_float(expected.get("numeric_result"))
    if explicit_numeric is not None:
        expected_numeric = explicit_numeric
    if expected_qualifier:
        fields.append(
            _field(
                "numeric_value",
                "not_scored",
                expected_numeric,
                None if actual is None else actual.get("result_numeric"),
                test=test_name,
                reason="ground truth is a qualified result",
            )
        )
    elif expected_numeric is None:
        fields.append(
            _field(
                "numeric_value",
                "not_scored",
                None,
                None if actual is None else actual.get("result_numeric"),
                test=test_name,
                reason="ground-truth result is non-numeric",
            )
        )
    else:
        actual_numeric = None if actual is None else _to_float(actual.get("result_numeric"))
        fields.append(
            _field(
                "numeric_value",
                "correct" if _close(expected_numeric, actual_numeric) else "incorrect",
                expected_numeric,
                actual_numeric,
                test=test_name,
            )
        )

    expected_unit = normalize_unit(expected.get("unit"))
    actual_unit = None if actual is None else normalize_unit(actual.get("unit_original"))
    if expected_unit is None:
        fields.append(
            _field(
                "unit",
                "not_scored",
                None,
                actual_unit,
                test=test_name,
                reason="no ground-truth unit",
            )
        )
    else:
        fields.append(
            _field(
                "unit",
                "correct" if actual_unit == expected_unit else "incorrect",
                expected_unit,
                actual_unit,
                test=test_name,
            )
        )

    expected_low, expected_high, range_parsed = parse_reference_range(expected.get("range"))
    range_text = expected.get("range")
    if not range_parsed:
        reason = (
            "no ground-truth reference range"
            if range_text in (None, "")
            else "unsupported ground-truth reference range"
        )
        for field in ("reference_low", "reference_high"):
            fields.append(
                _field(
                    field,
                    "not_scored",
                    None,
                    None if actual is None else actual.get(field),
                    test=test_name,
                    reason=reason,
                )
            )
    else:
        actual_low = None if actual is None else _to_float(actual.get("reference_low"))
        actual_high = None if actual is None else _to_float(actual.get("reference_high"))
        if expected_low is None:
            lower_correct = actual is not None and actual_low is None
        else:
            lower_correct = _close(expected_low, actual_low)
        if expected_high is None:
            upper_correct = actual is not None and actual_high is None
        else:
            upper_correct = _close(expected_high, actual_high)
        fields.append(
            _field(
                "reference_low",
                "correct" if lower_correct else "incorrect",
                expected_low,
                actual_low,
                test=test_name,
            )
        )
        fields.append(
            _field(
                "reference_high",
                "correct" if upper_correct else "incorrect",
                expected_high,
                actual_high,
                test=test_name,
            )
        )

    expected_flag_raw = expected.get("flag") or expected.get("derived_flag")
    if expected_flag_raw in (None, ""):
        fields.append(
            _field(
                "flag",
                "not_scored",
                None,
                None if actual is None else _actual_flag(actual)[1],
                test=test_name,
                reason="no ground-truth flag",
            )
        )
    else:
        expected_flag = normalize_flag(expected_flag_raw)
        actual_flag = None if actual is None else _actual_flag(actual)[0]
        fields.append(
            _field(
                "flag",
                "correct" if actual is not None and actual_flag == expected_flag else "incorrect",
                expected_flag,
                actual_flag,
                test=test_name,
            )
        )

    if expected_qualifier:
        if actual is None:
            actual_qualifier = None
            actual_threshold = None
        else:
            actual_qualifier = actual.get("result_qualifier")
            _numeric, parsed_qualifier, actual_threshold = parse_result(
                actual.get("result_original")
            )
            actual_qualifier = actual_qualifier or parsed_qualifier
        threshold_matches = (
            (expected_threshold is None and actual_threshold is None)
            or _close(expected_threshold, actual_threshold)
        )
        fields.append(
            _field(
                "qualifier",
                "correct"
                if actual_qualifier == expected_qualifier and threshold_matches
                else "incorrect",
                {"qualifier": expected_qualifier, "threshold": expected_threshold},
                {"qualifier": actual_qualifier, "threshold": actual_threshold},
                test=test_name,
            )
        )
    else:
        fields.append(
            _field(
                "qualifier",
                "not_scored",
                None,
                None if actual is None else actual.get("result_qualifier"),
                test=test_name,
                reason="ground-truth result has no qualifier",
            )
        )

    return fields


def summarize_fields(comparisons: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    summary = {
        field: {"scored": 0, "correct": 0, "incorrect": 0, "not_scored": 0}
        for field in FIELD_ORDER
    }
    for item in comparisons:
        bucket = summary.setdefault(
            item["field"], {"scored": 0, "correct": 0, "incorrect": 0, "not_scored": 0}
        )
        if item["status"] == "not_scored":
            bucket["not_scored"] += 1
        else:
            bucket["scored"] += 1
            bucket["correct" if item["status"] == "correct" else "incorrect"] += 1
    return summary


def _field_totals(summary: dict[str, dict[str, int]]) -> dict[str, int]:
    return {
        key: sum(field[key] for field in summary.values())
        for key in ("scored", "correct", "incorrect", "not_scored")
    }


def evaluate_fixture(
    ground_truth: list[dict[str, Any]], measurements: list[dict[str, Any]]
) -> dict[str, Any]:
    comparisons: list[dict[str, Any]] = []
    used: set[int] = set()
    matched = 0
    range_match_count = 0

    for expected in ground_truth:
        expected_name = canonical_name(expected.get("test"))
        match_index = None
        for index, actual in enumerate(measurements):
            if index in used:
                continue
            actual_name = canonical_name(
                actual.get("test_name_normalized") or actual.get("test_name_original")
            )
            if actual_name == expected_name:
                match_index = index
                break

        if match_index is None:
            pair_fields = evaluate_measurement(expected, None)
        else:
            used.add(match_index)
            matched += 1
            pair_fields = evaluate_measurement(expected, measurements[match_index])
            bounds = {item["field"]: item for item in pair_fields if item["field"].startswith("reference_")}
            if bounds and any(item["status"] != "not_scored" for item in bounds.values()) and all(
                item["status"] == "correct" for item in bounds.values()
            ):
                range_match_count += 1
        comparisons.extend(pair_fields)

    for index, actual in enumerate(measurements):
        if index in used:
            continue
        actual_name = canonical_name(
            actual.get("test_name_normalized") or actual.get("test_name_original")
        )
        comparisons.append(
            _field(
                "name",
                "incorrect",
                None,
                actual_name,
                test=actual.get("test_name_original") or actual_name,
                reason="unexpected extracted measurement",
            )
        )

    summary = summarize_fields(comparisons)
    totals = _field_totals(summary)
    mismatches = [item for item in comparisons if item["status"] == "incorrect"]

    return {
        "ground_truth_count": len(ground_truth),
        "extracted_count": len(measurements),
        "correctly_identified_tests": matched,
        "biomarker_recall": round(matched / len(ground_truth), 4) if ground_truth else 1.0,
        "biomarker_precision": round(matched / len(measurements), 4) if measurements else 0.0,
        "unit_match_count": summary["unit"]["correct"],
        "range_match_count": range_match_count,
        "flag_match_count": summary["flag"]["correct"],
        "field_accuracy": summary,
        "field_totals": totals,
        "mismatches": mismatches,
        "extracted_measurements": [
            {
                "test": measurement.get("test_name_normalized"),
                "value": measurement.get("result_original"),
                "numeric": measurement.get("result_numeric"),
                "qualifier": measurement.get("result_qualifier"),
                "unit": measurement.get("unit_original"),
                "range": measurement.get("reference_range_original"),
                "range_low": measurement.get("reference_low"),
                "range_high": measurement.get("reference_high"),
                "flag": measurement.get("derived_flag"),
                "lab_flag": measurement.get("lab_flag"),
                "page": measurement.get("page_number"),
            }
            for measurement in measurements
        ],
    }


def evaluate_page_attribution(
    ground_truth: list[dict[str, Any]], measurements: list[dict[str, Any]]
) -> dict[str, Any]:
    """Compare each expected measurement's page with the extracted page.

    Kept separate from field-level scoring because page assignment is a
    document-location property, not a measurement field.
    """
    used: set[int] = set()
    details: list[dict[str, Any]] = []
    correct = incorrect = not_scored = 0

    for expected in ground_truth:
        expected_name = canonical_name(expected.get("test"))
        expected_page = expected.get("page")
        match_index = None
        for index, actual in enumerate(measurements):
            if index in used:
                continue
            actual_name = canonical_name(
                actual.get("test_name_normalized") or actual.get("test_name_original")
            )
            if actual_name == expected_name:
                match_index = index
                break

        extracted_page = (
            None if match_index is None else measurements[match_index].get("page_number")
        )
        if expected_page in (None, ""):
            status = "not_scored"
            not_scored += 1
            reason = "no ground-truth page"
        elif match_index is None:
            status = "incorrect"
            incorrect += 1
            reason = "measurement not found"
        elif _same_page(expected_page, extracted_page):
            used.add(match_index)
            status = "correct"
            correct += 1
            reason = None
        else:
            used.add(match_index)
            status = "incorrect"
            incorrect += 1
            reason = "wrong page"

        detail: dict[str, Any] = {
            "test": expected.get("test"),
            "status": status,
            "expected_page": expected_page,
            "extracted_page": extracted_page,
        }
        if reason:
            detail["reason"] = reason
        details.append(detail)

    return {
        "scored": correct + incorrect,
        "correct": correct,
        "incorrect": incorrect,
        "not_scored": not_scored,
        "details": details,
    }


def _same_page(expected: Any, actual: Any) -> bool:
    if expected is None or actual is None:
        return False
    try:
        return int(expected) == int(actual)
    except (TypeError, ValueError):
        return str(expected).strip() == str(actual).strip()


def aggregate_fixtures(fixtures: dict[str, dict[str, Any]]) -> dict[str, Any]:
    summary = {
        field: {"scored": 0, "correct": 0, "incorrect": 0, "not_scored": 0}
        for field in FIELD_ORDER
    }
    for fixture in fixtures.values():
        for field, counts in fixture["field_accuracy"].items():
            bucket = summary.setdefault(
                field, {"scored": 0, "correct": 0, "incorrect": 0, "not_scored": 0}
            )
            for key in bucket:
                bucket[key] += counts[key]

    totals = _field_totals(summary)
    return {
        "fixtures": len(fixtures),
        "ground_truth_measurements": sum(
            fixture["ground_truth_count"] for fixture in fixtures.values()
        ),
        "extracted_measurements": sum(
            fixture["extracted_count"] for fixture in fixtures.values()
        ),
        "field_accuracy": summary,
        "field_totals": totals,
        "mismatch_count": sum(len(fixture["mismatches"]) for fixture in fixtures.values()),
    }
