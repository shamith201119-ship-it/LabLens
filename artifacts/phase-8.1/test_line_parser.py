import re

def parse_line(line: str):
    line = line.strip()
    if not line:
        return None
    
    # 1. Skip header and metadata lines
    low = line.lower()
    header_keywords = [
        "patient", "doctor", "physician", "dr.", "mrn", "dob", "date of birth",
        "accession", "account", "specimen", "collected", "reported", "laboratory",
        "lab name", "test name", "analyte", "component"
    ]
    for kw in header_keywords:
        if re.match(r"^" + re.escape(kw) + r"[\s:]", low):
            return None
    if "reference range" in low or "ref range" in low:
        return None
    if re.search(r"\bpage\s+\d+\s+of\s+\d+\b", low):
        return None

    # 2. Extract lab flag at end of line (e.g. High, Low, Normal, Abnormal, H, L, *)
    flag = None
    m_flag = re.search(r"[\s\t]+(High|Low|H|L|Normal|Abnormal|\*)\s*$", line, re.I)
    if m_flag:
        flag = m_flag.group(1).capitalize()
        if flag in ("H", "High"): flag = "High"
        elif flag in ("L", "Low"): flag = "Low"
        line = line[:m_flag.start()].strip()

    # 3. Extract reference range
    # Can be interval: "70 - 99", "70-99", "12.0 - 16.0", "0.50 - 1.20"
    # or inequality: "< 200", "<= 150", "> 60", ">= 90"
    ref_low = None
    ref_high = None
    ref_str = None

    # Check interval first
    m_range = re.search(r"(\b\d+(?:\.\d+)?\s*[-–to]+\s*\d+(?:\.\d+)?\b)", line, re.I)
    if m_range:
        ref_str = m_range.group(1).strip()
        m_bounds = re.search(r"(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)", ref_str, re.I)
        if m_bounds:
            ref_low = float(m_bounds.group(1))
            ref_high = float(m_bounds.group(2))
        line = line[:m_range.start()] + " " + line[m_range.end():]
    else:
        # Check inequality reference range (e.g. "< 200", "< 150")
        m_bound = re.search(r"([<>]=?)\s*(\d+(?:\.\d+)?)(?:\s*(?:mg/dL|g/dL|%|uL|/uL))?\s*$", line, re.I)
        if m_bound:
            ref_str = m_bound.group(0).strip()
            op = m_bound.group(1)
            bval = float(m_bound.group(2))
            if "<" in op:
                ref_high = bval
            else:
                ref_low = bval
            line = line[:m_bound.start()].strip()

    line = line.strip()

    # 4. In remaining string, locate the measurement value.
    # The value must NOT be part of an alphanumeric code like A1c, B12, T3, CD4.
    # So it must be preceded by space, colon, or start of string.
    val_pat = r"(?:^|(?<=[\s:]))((?:[<>]=?\s*)?\d+(?:\.\d+)?)(?=\s|$)"
    matches = list(re.finditer(val_pat, line))
    if not matches:
        return None

    # Pick the value match (if test name had a colon, take value after colon; else first valid match)
    if ":" in line:
        parts = line.split(":", 1)
        test_name = parts[0].strip()
        rest = parts[1].strip()
        m_val = re.search(val_pat, rest)
        if not m_val:
            return None
        val_str = m_val.group(1).strip()
        unit_part = rest[m_val.end():].strip()
    else:
        # In space-separated table row, the first standalone number is the value
        m_val = matches[0]
        val_str = m_val.group(1).strip()
        test_name = line[:m_val.start()].strip(" .:-\t")
        unit_part = line[m_val.end():].strip()

    if not test_name or len(test_name) > 60:
        return None

    # Parse numeric value
    result_numeric = None
    qualifier = None
    if val_str.startswith("<"):
        qualifier = "less_than"
        try: result_numeric = float(re.sub(r"^[<>=]+\s*", "", val_str))
        except: pass
    elif val_str.startswith(">"):
        qualifier = "greater_than"
        try: result_numeric = float(re.sub(r"^[<>=]+\s*", "", val_str))
        except: pass
    else:
        try: result_numeric = float(val_str)
        except: pass

    # Parse unit from unit_part
    unit = None
    if unit_part:
        m_unit = re.search(r"^([a-zA-Z/%µμ^0-9]+(?:/[a-zA-Z0-9]+)?)", unit_part)
        if m_unit:
            candidate_unit = m_unit.group(1).strip()
            if candidate_unit.lower() not in ("high", "low", "normal", "abnormal", "h", "l"):
                unit = candidate_unit

    # Determine derived flag
    derived = "unknown"
    if qualifier:
        derived = "qualitative"
    elif result_numeric is not None and ref_low is not None and ref_high is not None:
        if result_numeric < ref_low: derived = "below_range"
        elif result_numeric > ref_high: derived = "above_range"
        else: derived = "within_range"
    elif result_numeric is not None and ref_high is not None:
        if result_numeric > ref_high: derived = "above_range"
        else: derived = "within_range"
    elif result_numeric is not None and ref_low is not None:
        if result_numeric < ref_low: derived = "below_range"
        else: derived = "within_range"

    return {
        "test": test_name,
        "val_str": val_str,
        "val_num": result_numeric,
        "unit": unit,
        "ref_str": ref_str,
        "ref_low": ref_low,
        "ref_high": ref_high,
        "flag": flag,
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

for tl in test_lines:
    res = parse_line(tl)
    if res:
        print(f"PASS: {res['test']:25} | val: {res['val_str']:6} ({res['val_num']}) | unit: {str(res['unit']):10} | ref: {str(res['ref_str']):12} | flag: {str(res['flag']):6} | derived: {res['derived']}")
    else:
        print(f"SKIP (header/invalid): {tl}")
