import re

def check_where_it_fails(line: str):
    line = line.strip()
    if not line: return "empty"
    low = line.lower()
    header_keywords = [
        "patient", "doctor", "physician", "dr.", "mrn", "dob", "date of birth",
        "accession", "account", "specimen", "collected", "reported", "laboratory",
        "lab name", "page ", "test name", "analyte", "component"
    ]
    for kw in header_keywords:
        if re.match(r"^" + re.escape(kw) + r"[\s:]", low):
            return f"matched header kw: {kw}"
    if "reference range" in low or "ref range" in low:
        return "matched ref range"
    if re.search(r"\bpage\s+\d+\s+of\s+\d+\b", low):
        return "matched page x of y"

    # flag
    flag = None
    m_flag = re.search(r"[\s\t]+(High|Low|H|L|Normal|Abnormal|\*)\s*$", line, re.I)
    if m_flag:
        flag = m_flag.group(1).capitalize()
        line = line[:m_flag.start()].strip()

    # range
    ref_low = None
    ref_high = None
    ref_str = None
    m_range = re.search(r"(\b\d+(?:\.\d+)?\s*[-–to]+\s*\d+(?:\.\d+)?\b)", line, re.I)
    if m_range:
        ref_str = m_range.group(1).strip()
        line = line[:m_range.start()] + " " + line[m_range.end():]
    else:
        m_bound = re.search(r"([<>]=?)\s*(\d+(?:\.\d+)?)(?:\s*(?:mg/dL|g/dL|%|uL|/uL))?\s*$", line, re.I)
        if m_bound:
            ref_str = m_bound.group(0).strip()
            line = line[:m_bound.start()].strip()

    line = line.strip()
    val_pat = r"(?:^|(?<=[\s:]))([<>]=?\s*\d+(?:\.\d+)?(?:\s*[xX]\s*10\^?\d+)?)(?=\s|$)"
    matches = list(re.finditer(val_pat, line))
    if not matches:
        return f"val_pat no match on line: '{line}'"
    return "OK"

for l in [
    "Patient: Synthetic Jane Doe Date: 2026-11-10",
    "Hemoglobin A1c 6.2 % 4.0 - 5.6 High",
    "Glucose 112 mg/dL 70 - 99 High",
]:
    print(l, "-->", check_where_it_fails(l))
