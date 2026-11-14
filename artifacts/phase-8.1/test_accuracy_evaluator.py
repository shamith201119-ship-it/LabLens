"""Focused unit tests for the benchmark-only field-level evaluator."""

from accuracy_evaluator import (
    evaluate_fixture,
    evaluate_measurement,
    evaluate_page_attribution,
    normalize_unit,
    summarize_fields,
)


def expected_measurement(**overrides):
    record = {
        "test": "Hemoglobin",
        "result": "14.2",
        "unit": "g/dL",
        "range": "12.0 - 16.0",
    }
    record.update(overrides)
    return record


def actual_measurement(**overrides):
    record = {
        "test_name_original": "Hemoglobin",
        "test_name_normalized": "Hemoglobin",
        "result_original": "14.2",
        "result_numeric": 14.2,
        "result_qualifier": None,
        "unit_original": "g/dL",
        "reference_range_original": "12.0 - 16.0",
        "reference_low": 12.0,
        "reference_high": 16.0,
        "lab_flag": None,
        "derived_flag": "within_range",
    }
    record.update(overrides)
    return record


def field_result(fields, name):
    return next(item for item in fields if item["field"] == name)


def test_correct_numeric_value():
    result = field_result(evaluate_measurement(expected_measurement(), actual_measurement()), "numeric_value")
    assert result["status"] == "correct"
    assert result["expected"] == 14.2
    assert result["extracted"] == 14.2


def test_incorrect_numeric_value():
    result = field_result(
        evaluate_measurement(
            expected_measurement(), actual_measurement(result_numeric=15.1)
        ),
        "numeric_value",
    )
    assert result["status"] == "incorrect"
    assert result["expected"] == 14.2
    assert result["extracted"] == 15.1


def test_missing_numeric_value_is_not_a_match():
    result = field_result(
        evaluate_measurement(
            expected_measurement(), actual_measurement(result_numeric=None)
        ),
        "numeric_value",
    )
    assert result["status"] == "incorrect"
    assert result["extracted"] is None


def test_equivalent_unit_notation():
    expected = expected_measurement(
        test="White Blood Cell Count",
        result="8.5",
        unit="x10³/µL",
        range="4.0 - 11.0",
    )
    actual = actual_measurement(
        test_name_original="White Blood Cell Count",
        test_name_normalized="White Blood Cell Count",
        result_original="8.5",
        result_numeric=8.5,
        unit_original="x10^3/uL",
        reference_range_original="4.0 - 11.0",
        reference_low=4.0,
        reference_high=11.0,
    )

    result = field_result(evaluate_measurement(expected, actual), "unit")
    assert normalize_unit("x10³/µL") == normalize_unit("x10^3/uL")
    assert result["status"] == "correct"


def test_incorrect_unit_is_not_converted():
    result = field_result(
        evaluate_measurement(
            expected_measurement(),
            actual_measurement(unit_original="mg/dL"),
        ),
        "unit",
    )
    assert result["status"] == "incorrect"
    assert result["expected"] == "g/dl"
    assert result["extracted"] == "mg/dl"


def test_numerically_equal_reference_ranges_with_different_formatting():
    expected = expected_measurement(
        test="Glucose",
        result="95",
        unit="mg/dL",
        range="70.0 - 99.0",
    )
    actual = actual_measurement(
        test_name_original="Glucose",
        test_name_normalized="Glucose",
        result_original="95",
        result_numeric=95.0,
        unit_original="mg/dL",
        reference_range_original="70 - 99",
        reference_low=70.0,
        reference_high=99.0,
    )

    fields = evaluate_measurement(expected, actual)
    assert field_result(fields, "reference_low")["status"] == "correct"
    assert field_result(fields, "reference_high")["status"] == "correct"


def test_incorrect_reference_boundary():
    expected = expected_measurement(
        test="Glucose",
        result="95",
        unit="mg/dL",
        range="70 - 99",
    )
    actual = actual_measurement(
        test_name_original="Glucose",
        test_name_normalized="Glucose",
        result_original="95",
        result_numeric=95.0,
        unit_original="mg/dL",
        reference_range_original="71 - 99",
        reference_low=71.0,
        reference_high=99.0,
    )

    fields = evaluate_measurement(expected, actual)
    assert field_result(fields, "reference_low")["status"] == "incorrect"
    assert field_result(fields, "reference_low")["expected"] == 70.0
    assert field_result(fields, "reference_low")["extracted"] == 71.0
    assert field_result(fields, "reference_high")["status"] == "correct"


def test_missing_ground_truth_flag_is_not_scored():
    fields = evaluate_measurement(
        expected_measurement(),
        actual_measurement(lab_flag="High", derived_flag="above_range"),
    )
    flag = field_result(fields, "flag")
    assert flag["status"] == "not_scored"
    assert flag["reason"] == "no ground-truth flag"

    summary = summarize_fields(fields)
    assert summary["flag"]["scored"] == 0
    assert summary["flag"]["not_scored"] == 1


def test_correct_qualifier_and_threshold():
    expected = expected_measurement(
        test="CRP",
        result="<0.5",
        unit="mg/L",
        range="<5",
    )
    actual = actual_measurement(
        test_name_original="CRP",
        test_name_normalized="CRP",
        result_original="<0.5",
        result_numeric=None,
        result_qualifier="less_than",
        unit_original="mg/L",
        reference_range_original="<5",
        reference_low=None,
        reference_high=5.0,
        derived_flag="qualitative",
    )

    qualifier = field_result(evaluate_measurement(expected, actual), "qualifier")
    assert qualifier["status"] == "correct"
    assert qualifier["expected"] == {"qualifier": "less_than", "threshold": 0.5}
    assert qualifier["extracted"] == {"qualifier": "less_than", "threshold": 0.5}


def test_incorrect_qualifier_threshold():
    expected = expected_measurement(
        test="CRP",
        result="<0.5",
        unit="mg/L",
        range="<5",
    )
    actual = actual_measurement(
        test_name_original="CRP",
        test_name_normalized="CRP",
        result_original="<1.0",
        result_numeric=None,
        result_qualifier="less_than",
        unit_original="mg/L",
        reference_range_original="<5",
        reference_low=None,
        reference_high=5.0,
        derived_flag="qualitative",
    )

    qualifier = field_result(evaluate_measurement(expected, actual), "qualifier")
    assert qualifier["status"] == "incorrect"
    assert qualifier["expected"]["threshold"] == 0.5
    assert qualifier["extracted"]["threshold"] == 1.0


def test_incorrect_qualifier_direction():
    expected = expected_measurement(
        test="CRP",
        result="<0.5",
        unit="mg/L",
        range="<5",
    )
    actual = actual_measurement(
        test_name_original="CRP",
        test_name_normalized="CRP",
        result_original=">0.5",
        result_numeric=None,
        result_qualifier="greater_than",
        unit_original="mg/L",
        reference_range_original="<5",
        reference_low=None,
        reference_high=5.0,
        derived_flag="qualitative",
    )

    qualifier = field_result(evaluate_measurement(expected, actual), "qualifier")
    assert qualifier["status"] == "incorrect"


def test_known_alias_matches_canonical_name():
    ground_truth = [
        expected_measurement(
            test="TSH",
            result="2.45",
            unit="uIU/mL",
            range="0.40 - 4.50",
        )
    ]
    measurements = [
        actual_measurement(
            test_name_original="TSH",
            test_name_normalized="Thyroid Stimulating Hormone",
            result_original="2.45",
            result_numeric=2.45,
            unit_original="uIU/mL",
            reference_range_original="0.40 - 4.50",
            reference_low=0.4,
            reference_high=4.5,
        )
    ]

    result = evaluate_fixture(ground_truth, measurements)
    assert result["field_accuracy"]["name"]["correct"] == 1
    assert result["field_accuracy"]["name"]["incorrect"] == 0
    assert result["correctly_identified_tests"] == 1
    assert result["biomarker_recall"] == 1.0


def test_derived_flag_ground_truth_is_scored():
    expected = expected_measurement(result="17.0", derived_flag="above_range")
    actual = actual_measurement(
        result_original="17.0",
        result_numeric=17.0,
        derived_flag="above_range",
    )

    flag = field_result(evaluate_measurement(expected, actual), "flag")
    assert flag["status"] == "correct"
    assert flag["expected"] == "high"
    assert flag["extracted"] == "high"


def test_page_attribution_detects_wrong_page():
    ground_truth = [expected_measurement(page=1)]
    measurements = [actual_measurement(page_number=2)]

    result = evaluate_page_attribution(ground_truth, measurements)

    assert result["scored"] == 1
    assert result["correct"] == 0
    assert result["incorrect"] == 1
    assert result["details"][0]["expected_page"] == 1
    assert result["details"][0]["extracted_page"] == 2
    assert result["details"][0]["reason"] == "wrong page"


def test_explicit_numeric_result_overrides_thousands_separator_text():
    expected = expected_measurement(
        test="Triglycerides",
        result="1,234",
        numeric_result=1234.0,
        unit="mg/dL",
        range="<150",
    )
    actual = actual_measurement(
        test_name_original="Triglycerides",
        test_name_normalized="Triglycerides",
        result_original="1,234",
        result_numeric=1234.0,
        unit_original="mg/dL",
        reference_range_original="<150",
        reference_low=None,
        reference_high=150.0,
        derived_flag="above_range",
    )

    numeric = field_result(evaluate_measurement(expected, actual), "numeric_value")
    assert numeric["status"] == "correct"
    assert numeric["expected"] == 1234.0
    assert numeric["extracted"] == 1234.0
