import re
from typing import Optional

def parse_row(line: str):
    line = line.strip()
    if not line:
        return None
    
    # 1. Skip headers / metadata
    low = line.lower()
    if re.search(r"^(patient|doctor|physician|dr\.|mrn|dob|date of birth|accession|account|page\s+\d+|specimen|collected|reported|lab\s+name|laboratory)\b", low):
        return None
    if re.search(r"\b(page\s+\d+\s+of\s+\d+)\b", low):
        return None
    if re.search(r"^(test\s+name|analyte|component|investigation)\s+(result|value)", low):
        return None
    if "reference" in low and "range" in low:
        return None

    # Handle colon format: "Glucose: 112 mg/dL (70-99)"
    if ":" in line:
        parts = line.split(":", 1)
        # Verify part 0 doesn't look like a long sentence
        if len(parts[0].strip().split()) <= 6:
            name_candidate = parts[0].strip()
            rest = parts[1].strip()
        else:
            name_candidate = None
            rest = line
    else:
        name_candidate = None
        rest = line

    # Flag search
    lab_flag = None
    # We match flags at the end of the line or surrounded by whitespace
    flag_match = re.search(r"\b(High|Low|H|L|Normal|Abnormal|\*)\b\s*$", rest, re.I)
    if flag_match:
        lab_flag = flag_match.group(1).capitalize()
        if lab_flag in ("H", "High"): lab_flag = "High"
        elif lab_flag in ("L", "Low"): lab_flag = "Low"
        rest = rest[:flag_match.start()].strip()

    # Reference range search:
    # 1. Standard range: "70 - 99", "70.0 - 99.0", "70-99", "12.0 - 16.0"
    # 2. Bound range: "< 200", "<= 150", "> 60", ">= 90"
    ref_low = None
    ref_high = None
    ref_str = None
    ref_match = re.search(r"(\b\d+(?:\.\d+)?\s*[-–to]+\s*\d+(?:\.\d+)?\b)", rest, re.I)
    if ref_match:
        ref_str = ref_match.group(1).strip()
        # Parse low and high
        m_bounds = re.search(r"(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)", ref_str, re.I)
        if m_bounds:
            ref_low = float(m_bounds.group(1))
            ref_high = float(m_bounds.group(2))
        rest = rest[:ref_match.start()] + " " + rest[ref_match.end():]
    else:
        ref_bound_match = re.search(r"([<>]=?)\s*(\d+(?:\.\d+)?)", rest)
        if ref_bound_match:
            ref_str = ref_bound_match.group(0).strip()
            op = ref_bound_match.group(1)
            bval = float(ref_bound_match.group(2))
            if "<" in op:
                ref_high = bval
            else:
                ref_low = bval
            rest = rest[:ref_bound_match.start()] + " " + rest[ref_bound_match.end():]

    rest = rest.strip()

    # Now in rest: Test name + Value + Unit
    # The value is a standalone number or exponential or inequality:
    # Notice: must be preceded by start or space, NOT by an alphabetic char (to preserve A1c, B12, T3)
    val_match = re.search(r"(?:^|(?<=\s))([<>]=?\s*\d+(?:\.\d+)?(?:\s*[xX]\s*10\^?\d+)?)(?=\s|$)", rest)
    if not val_match:
        return None

    val_str = val_match.group(1).strip()
    idx_start = val_match.start()
    idx_end = val_match.end()

    if name_candidate:
        test_name = name_candidate
        unit_part = rest[idx_end:].strip()
    else:
        test_name = rest[:idx_start].strip(" .:-\t")
        unit_part = rest[idx_end:].strip()

    if not test_name:
        return None

    # Parse numeric value & qualifier
    qualifier = None
    result_numeric = None
    if val_str.startswith("<"):
        qualifier = "less_than"
        val_clean = re.sub(r"^[<>=]+\s*", "", val_str)
        try: result_numeric = float(val_clean)
        except: pass
    elif val_str.startswith(">"):
        qualifier = "greater_than"
        val_clean = re.sub(r"^[<>=]+\s*", "", val_str)
        try: result_numeric = float(val_clean)
        except: pass
    elif "x" in val_str.lower():
        # Exponential like 8.5 x10^3
        m_exp = re.match(r"([\d.]+)\s*[xX]\s*10\^?(\d+)", val_str)
        if m_exp:
            try:
                result_numeric = float(m_exp.group(1)) * (10 ** int(m_exp.group(2)))
            except:
                pass
    else:
        try:
            result_numeric = float(val_str)
        except:
            pass

    # Unit cleanup:
    unit = None
    if unit_part:
        # unit could be "mg/dL", "%", "uL", "x10^3/uL", "ng/mL", "uIU/mL", "mil/uL", "g/dL"
        u_match = re.search(r"^([a-zA-Z/%µμ^0-9]+(?:/[a-zA-Z0-9]+)?)", unit_part)
        if u_match:
            unit = u_match.group(1).strip()
            if unit.lower() in ("high", "low", "normal", "abnormal", "h", "l"):
                unit = None

    # Compute derived flag
    derived = "unknown"
    if qualifier:
        derived = "qualitative"
    elif result_numeric is not None and ref_low is not None and ref_high is not None:
        if result_numeric < ref_low:
            derived = "below_range"
        elif result_numeric > ref_high:
            derived = "above_range"
        else:
            derived = "within_range"
    elif result_numeric is not None and ref_high is not None and ref_low is None:
        if result_numeric > ref_high:
            derived = "above_range"
        else:
            derived = "within_range"
    elif result_numeric is not None and ref_low is not None and ref_high is None:
        if result_numeric < ref_low:
            derived = "below_range"
        else:
            derived = "within_range"

    return {
        "test": test_name,
        "val_str": val_str,
        "numeric": result_numeric,
        "qualifier": qualifier,
        "unit": unit,
        "ref_str": ref_str,
        "ref_low": ref_low,
        "ref_high": ref_high,
        "lab_flag": lab_flag,
        "derived": derived
    }

test_lines = [
    "Patient: Synthetic Jane Doe Date: 2026-11-10",
    "Hemoglobin A1c 6.2 % 4.0 - 5.6 High",
    "Glucose 112 mg/dL 70 - 99 High",
    "Creatinine 0.95 mg/dL 0.50 - 1.20 Normal",
    "Total Cholesterol 220 mg/dL < 200 High",
    "Triglycerides 165 mg/dL < 150 High",
    "White Blood Cell Count 8.5 x10^3/uL 4.0 - 11.0",
    "PlateletCount 240 x10^3/uL 150 - 450",
    "Red Blood Cell Count 4.65 mil/uL 4.20 - 5.40",
    "Hematocrit 42.0 % 37.0 - 48.0",
    "Vitamin D (25-OH) 24.5 ng/mL 30.0 - 100.0 Low",
    "TSH 2.45 uIU/mL 0.45 - 4.50 Normal",
    "Doctor: Dr. Smith Page 1 of 2",
]

for l in test_lines:
    res = parse_row(l)
    print(f"LINE: {l}")
    print(f"  -> {res}")
