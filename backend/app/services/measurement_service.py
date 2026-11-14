import json
import math
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.database import get_connection
from app.services.image_processor import (
    _bbox_bounds,
    assemble_ocr_line_records,
)
from app.services.test_dictionary import normalize_name


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_GROUPED_NUMBER_RE = re.compile(r"^\d{1,3}(?:,\d{3})+(?:\.\d+)?$")
_NUMBER_TOKEN = r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?"
_RANGE_BODY = rf"{_NUMBER_TOKEN}\s*[-–to]+\s*{_NUMBER_TOKEN}"
_BOUND_BODY = rf"[<>]=?\s*{_NUMBER_TOKEN}"
_RANGE_RE = re.compile(rf"(?<![\w.,])({_RANGE_BODY})(?![\w.,])", re.I)
_BOUND_RE = re.compile(rf"({_BOUND_BODY})(?![\d.,])", re.I)
_RANGE_PARTS_RE = re.compile(
    rf"(?<![\w.,])({_NUMBER_TOKEN})\s*[-–to]+\s*({_NUMBER_TOKEN})(?![\d.,])",
    re.I,
)
_BOUND_PARTS_RE = re.compile(rf"([<>]=?\s*)({_NUMBER_TOKEN})(?![\d.,])", re.I)


def _parse_number(tok: str) -> Optional[float]:
    tok = tok.strip()
    if tok.startswith("<") or tok.startswith(">"):
        return None
    if _GROUPED_NUMBER_RE.fullmatch(tok):
        tok = tok.replace(",", "")
    elif "," in tok:
        if "." in tok:
            return None
        if tok.count(",") != 1:
            return None
        # Preserve the existing decimal-comma fallback for a single comma.
        tok = tok.replace(",", ".")
    try:
        return float(tok)
    except ValueError:
        return None


def _parse_range(text: str) -> tuple[Optional[float], Optional[float], str]:
    original = text.strip()
    m = _RANGE_PARTS_RE.search(original)
    if m:
        low = _parse_number(m.group(1))
        high = _parse_number(m.group(2))
        return low, high, original
    m = _BOUND_PARTS_RE.search(original)
    if m:
        val = _parse_number(m.group(2))
        if "<" in m.group(1):
            return None, val, original
        return val, None, original
    return None, None, original


def _parse_result(result_str: str) -> tuple[Optional[float], Optional[str]]:
    """Parse effective result text into a numeric value and qualifier."""
    text = (result_str or "").strip()
    qualifier = None
    if text.startswith("<"):
        qualifier = "less_than"
    elif text.startswith(">"):
        qualifier = "greater_than"
    if qualifier:
        return None, qualifier
    return _parse_number(text), None


def _derive_flag(
    result_numeric: Optional[float],
    reference_low: Optional[float],
    reference_high: Optional[float],
    qualifier: Optional[str],
) -> str:
    """Derive a comparison flag from effective structured fields."""
    if qualifier:
        return "qualitative"
    if result_numeric is not None and reference_low is not None and reference_high is not None:
        if result_numeric < reference_low:
            return "below_range"
        if result_numeric > reference_high:
            return "above_range"
        return "within_range"
    if result_numeric is not None and reference_high is not None and reference_low is None:
        return "above_range" if result_numeric > reference_high else "within_range"
    if result_numeric is not None and reference_low is not None and reference_high is None:
        return "below_range" if result_numeric < reference_low else "within_range"
    return "unknown"


def _aligned_ocr_line_records(text: str, meta: dict) -> Optional[list[dict]]:
    """Return OCR line evidence only when it aligns with the stored raw text."""
    if not isinstance(meta, dict):
        return None
    items = meta.get("ocr_items")
    if not isinstance(items, list) or not items:
        return None
    try:
        records = assemble_ocr_line_records(items)
    except Exception:
        return None
    lines = text.splitlines()
    if len(records) != len(lines):
        return None
    for line, record in zip(lines, records):
        if line.strip() != str(record.get("text", "")).strip():
            return None
    return records


def _normalized_text(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _word_field(word: dict, *names: str) -> Any:
    for name in names:
        if name in word and word.get(name) is not None:
            return word.get(name)
    return None


def _word_number(word: dict) -> int:
    value = _word_field(word, "word_no", "word_number", "word", "word_index")
    try:
        return int(value)
    except (TypeError, ValueError):
        return 10**9


def _word_group_key(word: dict) -> tuple:
    block = _word_field(word, "block", "block_no", "block_number", "block_id")
    line = _word_field(word, "line", "line_no", "line_number", "line_id")
    if block is None and line is None:
        bbox = _bbox_bounds(word.get("bbox"))
        center_y = (bbox[1] + bbox[3]) / 2.0 if bbox is not None else 0.0
        return ("y", round(center_y / 5.0))
    return (str(block), str(line))


def _group_digital_words(words: list[dict]) -> list[dict]:
    groups: dict[tuple, list[dict]] = {}
    for word in words or []:
        if not isinstance(word, dict):
            continue
        text = str(word.get("text", "")).strip()
        if not text:
            continue
        groups.setdefault(_word_group_key(word), []).append(word)

    records = []
    for group in groups.values():
        group.sort(key=lambda item: (_word_number(item), float((_bbox_bounds(item.get("bbox")) or [0, 0, 0, 0])[0])))
        text = " ".join(str(item.get("text", "")).strip() for item in group if str(item.get("text", "")).strip())
        boxes = [_bbox_bounds(item.get("bbox")) for item in group]
        if boxes and all(box is not None for box in boxes):
            bbox = [
                min(box[0] for box in boxes),
                min(box[1] for box in boxes),
                max(box[2] for box in boxes),
                max(box[3] for box in boxes),
            ]
        else:
            bbox = None
        records.append({"text": text, "bbox": bbox, "confidence": None})

    records.sort(key=lambda record: (record["bbox"][1] if record["bbox"] is not None else 0.0,
                                    record["bbox"][0] if record["bbox"] is not None else 0.0))
    return records


def _aligned_digital_line_records(text: str, meta: dict) -> Optional[list[dict]]:
    """Return digital line evidence only when every raw line aligns uniquely."""
    if not isinstance(meta, dict):
        return None
    words = meta.get("words")
    if not isinstance(words, list) or not words:
        return None
    try:
        records = _group_digital_words(words)
    except Exception:
        return None
    lines = text.splitlines()
    if not lines or len(records) != len(lines):
        return None

    normalized_records = [_normalized_text(record.get("text")) for record in records]
    normalized_lines = [_normalized_text(line) for line in lines]
    matched: list[Optional[dict]] = [None] * len(lines)
    used: set[int] = set()
    for index, normalized_line in enumerate(normalized_lines):
        if not normalized_line:
            return None
        candidates = [
            record_index
            for record_index, normalized_record in enumerate(normalized_records)
            if normalized_record == normalized_line and record_index not in used
        ]
        if len(candidates) != 1:
            return None
        used.add(candidates[0])
        matched[index] = {
            "text": lines[index],
            "bbox": records[candidates[0]].get("bbox"),
            "confidence": None,
        }

    if any(record is None for record in matched):
        return None
    return matched


def _merge_line_evidence(candidate: dict, record: Optional[dict]) -> None:
    """Merge a source line's box and confidence into a measurement candidate."""
    if not record:
        return

    bbox = record.get("bbox")
    if isinstance(bbox, (list, tuple)) and len(bbox) == 4:
        try:
            box = [float(v) for v in bbox]
        except (TypeError, ValueError):
            box = None
        if box is not None and all(math.isfinite(v) for v in box):
            current = candidate.get("source_bbox")
            if isinstance(current, (list, tuple)) and len(current) == 4:
                try:
                    current = [float(v) for v in current]
                except (TypeError, ValueError):
                    current = None
            if current is not None:
                box = [
                    min(current[0], box[0]),
                    min(current[1], box[1]),
                    max(current[2], box[2]),
                    max(current[3], box[3]),
                ]
            candidate["source_bbox"] = box

    confidence = record.get("confidence")
    if confidence is not None:
        try:
            score = float(confidence)
        except (TypeError, ValueError):
            score = None
        if score is not None and math.isfinite(score):
            current_score = candidate.get("ocr_confidence")
            if current_score is None:
                candidate["ocr_confidence"] = score
            else:
                try:
                    candidate["ocr_confidence"] = min(float(current_score), score)
                except (TypeError, ValueError):
                    candidate["ocr_confidence"] = score


def _parse_line(line: str, page_number: int, method: str, meta: dict) -> Optional[dict]:
    line = line.strip()
    if not line:
        return None
    low_text = line.lower()

    # 1. Skip header and metadata lines
    header_keywords = [
        "patient", "doctor", "physician", "dr.", "mrn", "dob", "date of birth",
        "accession", "account", "specimen", "collected", "reported", "laboratory",
        "lab name", "test name", "analyte", "component"
    ]
    for kw in header_keywords:
        if re.match(r"^" + re.escape(kw) + r"[\s:]", low_text):
            return None
    if "reference range" in low_text or "ref range" in low_text:
        return None
    if re.search(r"\bpage\s+\d+\s+of\s+\d+\b", low_text):
        return None

    # 2. Extract lab flag at end of line (e.g. High, Low, Normal, Abnormal, H, L, *)
    lab_flag = None
    m_flag = re.search(r"[\s\t]+(High|Low|H|L|Normal|Abnormal|\*)\s*$", line, re.I)
    if m_flag:
        flag_val = m_flag.group(1).capitalize()
        if flag_val in ("H", "High"):
            lab_flag = "High"
        elif flag_val in ("L", "Low"):
            lab_flag = "Low"
        elif flag_val == "*":
            lab_flag = "Abnormal"
        else:
            lab_flag = flag_val
        line = line[:m_flag.start()].strip()

    # 3. Extract reference range
    range_str = None
    low = None
    high = None
    m_range = _RANGE_RE.search(line)
    if m_range:
        range_str = m_range.group(1).strip()
        low, high, _ = _parse_range(range_str)
        line = line[:m_range.start()] + " " + line[m_range.end():]
    else:
        # Check inequality reference range only if there is already another number on the line (the measurement value)
        has_prior_number = len(re.findall(r"\d+", line)) >= 2
        if has_prior_number:
            m_bound = re.search(
                rf"({_BOUND_BODY})(?:\s*(?:mg/dL|g/dL|%|uL|/uL))?\s*$",
                line,
                re.I,
            )
            if m_bound:
                range_str = m_bound.group(1).strip()
                low, high, _ = _parse_range(range_str)
                line = line[:m_bound.start()].strip()

    line = line.strip()

    # 4. In remaining string, locate the measurement value.
    # Value must be preceded by space, colon, or start of line (not part of A1c, B12, T3)
    val_pat = rf"(?:^|(?<=[\s:]))((?:[<>]=?\s*)?{_NUMBER_TOKEN})(?=\s|$)"
    matches = list(re.finditer(val_pat, line))
    if not matches:
        return None

    if ":" in line:
        parts = line.split(":", 1)
        name_part = parts[0].strip()
        rest = parts[1].strip()
        m_val = re.search(val_pat, rest)
        if not m_val:
            return None
        result_str = m_val.group(1).strip()
        unit_part = rest[m_val.end():].strip()
    else:
        m_val = matches[0]
        result_str = m_val.group(1).strip()
        name_part = line[:m_val.start()].strip(" .:-\t")
        unit_part = line[m_val.end():].strip()

    if not name_part or len(name_part) > 60:
        return None

    if name_part.lower() in ("patient", "date", "sample", "doctor", "mrn", "id", "name", "address"):
        return None

    unit = None
    if unit_part:
        m_unit = re.search(r"^([a-zA-Z/%µμ^0-9]+(?:/[a-zA-Z0-9]+)?)", unit_part)
        if m_unit:
            u = m_unit.group(1).strip()
            if u.lower() not in ("high", "low", "normal", "abnormal", "h", "l"):
                unit = u

    normalized, code, conf = normalize_name(name_part)
    result_numeric, qualifier = _parse_result(result_str)
    derived = _derive_flag(result_numeric, low, high, qualifier)

    status = "extracted"
    if conf < 0.7 or (result_numeric is None and qualifier is None) or unit is None:
        status = "needs_review"

    return {
        "test_name_original": name_part,
        "test_name_normalized": normalized,
        "test_code": code,
        "result_original": result_str,
        "result_numeric": result_numeric,
        "result_qualifier": qualifier,
        "unit_original": unit,
        "unit_normalized": None,
        "reference_range_original": range_str,
        "reference_low": low,
        "reference_high": high,
        "reference_unit": unit,
        "reference_context": None,
        "lab_flag": lab_flag,
        "derived_flag": derived,
        "sample_date": None,
        "specimen_type": None,
        "source_text": line,
        "source_bbox": None,
        "ocr_confidence": None,
        "verification_status": status,
    }


def structure_report(report_id: str) -> dict:
    with get_connection() as conn:
        pages = conn.execute(
            "SELECT * FROM page_extractions WHERE report_id = ? ORDER BY page_number",
            (report_id,),
        ).fetchall()
    if not pages:
        raise ValueError("No extraction found; run extraction first.")

    with get_connection() as conn:
        conn.execute("DELETE FROM report_measurements WHERE report_id = ?", (report_id,))

    candidates = []
    for p in pages:
        text = p["raw_text"] or ""
        page_num = p["page_number"]
        method = p["extraction_method"]
        meta = {}
        try:
            meta = json.loads(p["extraction_metadata"]) if p["extraction_metadata"] else {}
        except Exception:
            meta = {}
        if method == "digital":
            line_records = _aligned_digital_line_records(text, meta)
        else:
            line_records = _aligned_ocr_line_records(text, meta)
        for index, line in enumerate(text.splitlines()):
            record = line_records[index] if line_records else None
            low = line.lower()
            if "reference" in low and "range" in low:
                if candidates and candidates[-1].get("page_number") == page_num:
                    rmatch = _RANGE_RE.search(line)
                    bound_match = _BOUND_RE.search(line)
                    range_text = rmatch.group(1) if rmatch else (bound_match.group(1) if bound_match else None)
                    if range_text:
                        candidates[-1]["reference_range_original"] = range_text
                        l, h, _ = _parse_range(range_text)
                        candidates[-1]["reference_low"] = l
                        candidates[-1]["reference_high"] = h
                        after_range = line.replace(range_text, "")
                        for token in ["reference", "range", "Reference", "Range", ":"]:
                            after_range = after_range.replace(token, "")
                        runit_m = re.search(r"([a-zA-Z/%µμ^0-9]+(?:/[a-zA-Z]+)?)", after_range)
                        if runit_m and runit_m.group(1) not in ("H", "L", "N", "High", "Low"):
                            candidates[-1]["reference_unit"] = runit_m.group(1)
                        _merge_line_evidence(candidates[-1], record)
                        # recompute derived flag
                        rnum = candidates[-1].get("result_numeric")
                        if rnum is not None and l is not None and h is not None:
                            if rnum < l:
                                candidates[-1]["derived_flag"] = "below_range"
                            elif rnum > h:
                                candidates[-1]["derived_flag"] = "above_range"
                            else:
                                candidates[-1]["derived_flag"] = "within_range"
                        elif rnum is not None and h is not None and l is None:
                            if rnum > h:
                                candidates[-1]["derived_flag"] = "above_range"
                            else:
                                candidates[-1]["derived_flag"] = "within_range"
                        elif rnum is not None and l is not None and h is None:
                            if rnum < l:
                                candidates[-1]["derived_flag"] = "below_range"
                            else:
                                candidates[-1]["derived_flag"] = "within_range"
                continue
            m = _parse_line(line, page_num, method, meta)
            if m:
                m["page_number"] = page_num
                m["extraction_method"] = method
                _merge_line_evidence(m, record)
                candidates.append(m)

    saved = 0
    for c in candidates:
        mid = str(uuid.uuid4())
        with get_connection() as conn:
            conn.execute(
                """INSERT INTO report_measurements
                (id, report_id, test_name_original, test_name_normalized, test_code,
                 result_original, result_numeric, result_qualifier, unit_original,
                 unit_normalized, reference_range_original, reference_low, reference_high,
                 reference_unit, reference_context, lab_flag, derived_flag,
                 sample_date, specimen_type, page_number, source_text, source_bbox,
                 extraction_method, ocr_confidence, verification_status, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    mid,
                    report_id,
                    c["test_name_original"],
                    c["test_name_normalized"],
                    c.get("test_code"),
                    c["result_original"],
                    c.get("result_numeric"),
                    c.get("result_qualifier"),
                    c.get("unit_original"),
                    c.get("unit_normalized"),
                    c.get("reference_range_original"),
                    c.get("reference_low"),
                    c.get("reference_high"),
                    c.get("reference_unit"),
                    c.get("reference_context"),
                    c.get("lab_flag"),
                    c.get("derived_flag"),
                    c.get("sample_date"),
                    c.get("specimen_type"),
                    c["page_number"],
                    c["source_text"],
                    json.dumps(c.get("source_bbox")) if c.get("source_bbox") else None,
                    c["extraction_method"],
                    c.get("ocr_confidence"),
                    c.get("verification_status", "extracted"),
                    _now(),
                    _now(),
                ),
            )
        saved += 1

    return {"report_id": report_id, "measurements_saved": saved, "candidates": candidates}


_MEASUREMENT_SELECT = (
    "SELECT r.*, EXISTS(SELECT 1 FROM measurement_corrections c "
    "WHERE c.measurement_id = r.id) AS has_corrections "
    "FROM report_measurements r"
)


def _row_has_corrections(measurement_id: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM measurement_corrections WHERE measurement_id = ? LIMIT 1",
            (measurement_id,),
        ).fetchone()
    return row is not None


def _measurement_dict_from_row(r) -> dict:
    try:
        has_corrections = bool(r["has_corrections"])
    except (KeyError, IndexError):
        has_corrections = _row_has_corrections(r["id"])
    return {
        "id": r["id"],
        "report_id": r["report_id"],
        "test_name_original": r["test_name_original"],
        "test_name_normalized": r["test_name_normalized"],
        "test_code": r["test_code"],
        "result_original": r["result_original"],
        "result_numeric": r["result_numeric"],
        "result_qualifier": r["result_qualifier"],
        "unit_original": r["unit_original"],
        "unit_normalized": r["unit_normalized"],
        "reference_range_original": r["reference_range_original"],
        "reference_low": r["reference_low"],
        "reference_high": r["reference_high"],
        "reference_unit": r["reference_unit"],
        "reference_context": r["reference_context"],
        "lab_flag": r["lab_flag"],
        "derived_flag": r["derived_flag"],
        "sample_date": r["sample_date"],
        "specimen_type": r["specimen_type"],
        "page_number": r["page_number"],
        "source_text": r["source_text"],
        "source_bbox": json.loads(r["source_bbox"]) if r["source_bbox"] else None,
        "extraction_method": r["extraction_method"],
        "ocr_confidence": r["ocr_confidence"],
        "verification_status": r["verification_status"],
        "has_corrections": has_corrections,
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
    }


def get_measurements(report_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            f"{_MEASUREMENT_SELECT} WHERE report_id = ? ORDER BY page_number, created_at",
            (report_id,),
        ).fetchall()
    return [_measurement_dict_from_row(r) for r in rows]


class MeasurementCorrectionError(ValueError):
    """Raised when an ordinary measurement correction is invalid."""


ALLOWED_MEASUREMENT_CORRECTION_FIELDS = {
    "result_original",
    "unit_original",
    "reference_range_original",
}


def correct_measurement(measurement_id: str, patch: dict) -> dict:
    if not isinstance(patch, dict):
        raise MeasurementCorrectionError("Correction payload must be an object.")

    unsupported = {
        key for key in patch
        if key not in ALLOWED_MEASUREMENT_CORRECTION_FIELDS and key != "reason"
    }
    if unsupported:
        raise MeasurementCorrectionError(
            "Unsupported correction fields: " + ", ".join(sorted(unsupported))
        )

    updates = {
        key: value for key, value in patch.items()
        if key in ALLOWED_MEASUREMENT_CORRECTION_FIELDS
    }
    if not updates:
        with get_connection() as conn:
            row = conn.execute(
                f"{_MEASUREMENT_SELECT} WHERE id = ?", (measurement_id,)
            ).fetchone()
        if not row:
            raise ValueError("Measurement not found")
        return {key: row[key] for key in row.keys()}

    # Validate before opening a transaction so invalid corrections cannot
    # partially update a measurement or its audit record.
    if "result_original" in updates:
        result_value = updates["result_original"]
        if result_value is None or str(result_value).strip() == "":
            raise MeasurementCorrectionError("result_original must not be empty.")
        result_numeric, qualifier = _parse_result(result_value)
        if result_numeric is None and qualifier is None:
            raise MeasurementCorrectionError(
                f"Invalid result_original: {result_value!r}"
            )

    if "unit_original" in updates:
        unit_value = updates["unit_original"]
        if unit_value is not None and not isinstance(unit_value, str):
            raise MeasurementCorrectionError("unit_original must be a string or null.")

    if "reference_range_original" in updates:
        range_value = updates["reference_range_original"]
        if range_value is not None and str(range_value).strip() != "":
            low, high, _ = _parse_range(range_value)
            if low is None and high is None:
                raise MeasurementCorrectionError(
                    f"Invalid reference_range_original: {range_value!r}"
                )

    with get_connection() as conn:
        row = conn.execute(
            f"{_MEASUREMENT_SELECT} WHERE id = ?", (measurement_id,)
        ).fetchone()
        if not row:
            raise ValueError("Measurement not found")
        original = {key: row[key] for key in row.keys()}

        effective = dict(original)
        effective.update(updates)

        result_changed = (
            "result_original" in updates
            and updates["result_original"] != original.get("result_original")
        )
        unit_changed = (
            "unit_original" in updates
            and updates["unit_original"] != original.get("unit_original")
        )
        range_changed = (
            "reference_range_original" in updates
            and updates["reference_range_original"] != original.get("reference_range_original")
        )
        changed = result_changed or unit_changed or range_changed

        if not changed:
            return {key: row[key] for key in row.keys()}

        if "result_original" in updates:
            result_numeric, qualifier = _parse_result(effective.get("result_original"))
            updates["result_numeric"] = result_numeric
            updates["result_qualifier"] = qualifier

        if "unit_original" in updates:
            updates["reference_unit"] = effective.get("unit_original")

        if "reference_range_original" in updates:
            range_value = effective.get("reference_range_original")
            if range_value is None or str(range_value).strip() == "":
                low, high = None, None
            else:
                low, high, _ = _parse_range(range_value)
            updates["reference_low"] = low
            updates["reference_high"] = high

        result_numeric = updates.get("result_numeric", effective.get("result_numeric"))
        qualifier = updates.get("result_qualifier", effective.get("result_qualifier"))
        reference_low = updates.get("reference_low", effective.get("reference_low"))
        reference_high = updates.get("reference_high", effective.get("reference_high"))
        updates["derived_flag"] = _derive_flag(
            result_numeric, reference_low, reference_high, qualifier
        )
        updates["verification_status"] = "needs_review"

        audit_keys = set(updates)

        original_payload = {key: original.get(key) for key in sorted(audit_keys)}
        corrected_payload = {
            key: updates.get(key, effective.get(key, original.get(key)))
            for key in sorted(audit_keys)
        }

        audit_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO measurement_corrections
            (id, measurement_id, original_payload, corrected_payload, correction_timestamp, correction_reason)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (
                audit_id,
                measurement_id,
                json.dumps(original_payload),
                json.dumps(corrected_payload),
                _now(),
                patch.get("reason"),
            ),
        )
        sets = ", ".join(f"{k} = ?" for k in updates) + ", updated_at = ?"
        vals = list(updates.values()) + [_now(), measurement_id]
        conn.execute(f"UPDATE report_measurements SET {sets} WHERE id = ?", vals)
        row = conn.execute(f"{_MEASUREMENT_SELECT} WHERE id = ?", (measurement_id,)).fetchone()
    result = {key: row[key] for key in row.keys()}
    if result.get("source_bbox"):
        try:
            result["source_bbox"] = json.loads(result["source_bbox"])
        except (TypeError, ValueError, json.JSONDecodeError):
            result["source_bbox"] = None
    return result


def verify_measurement(measurement_id: str) -> dict:
    with get_connection() as conn:
        conn.execute(
            "UPDATE report_measurements SET verification_status = 'verified', updated_at = ? WHERE id = ?",
            (_now(), measurement_id),
        )
        row = conn.execute(f"{_MEASUREMENT_SELECT} WHERE id = ?", (measurement_id,)).fetchone()
    return {k: row[k] for k in row.keys()}


class VerificationSelectionError(ValueError):
    """Explicit-selection bulk verification failed validation."""


VERIFICATION_ELIGIBLE_STATES = {"extracted", "needs_review"}


def verify_selected_measurements(report_id: str, measurement_ids) -> dict:
    """Verify ONLY the explicitly selected measurement ids of `report_id`.

    Validates the complete selection before writing anything; the update is a
    single transaction, so a rejected request leaves every row unchanged.
    Duplicate ids are de-duplicated. No measurements outside the selection are
    ever approved.
    """
    if not isinstance(measurement_ids, list):
        raise VerificationSelectionError("measurement_ids must be a list of measurement IDs.")

    unique_ids: list[str] = []
    seen: set[str] = set()
    for item in measurement_ids:
        if not isinstance(item, str) or not item.strip():
            raise VerificationSelectionError("Every measurement ID must be a non-empty string.")
        measurement_id = item.strip()
        if measurement_id not in seen:
            seen.add(measurement_id)
            unique_ids.append(measurement_id)

    if not unique_ids:
        raise VerificationSelectionError("Select at least one measurement to confirm.")

    with get_connection() as conn:
        report = conn.execute(
            "SELECT id FROM reports WHERE id = ?", (report_id,)
        ).fetchone()
        if not report:
            raise ValueError("Report not found")

        placeholders = ",".join("?" for _ in unique_ids)
        rows = conn.execute(
            f"{_MEASUREMENT_SELECT} WHERE report_id = ? AND id IN ({placeholders})",
            (report_id, *unique_ids),
        ).fetchall()

        found_ids = {row["id"] for row in rows}
        missing = [mid for mid in unique_ids if mid not in found_ids]
        if missing:
            raise VerificationSelectionError(
                "Measurement(s) not found in this report: " + ", ".join(missing)
            )

        by_id = {row["id"]: row for row in rows}
        ineligible = [
            mid for mid in unique_ids
            if by_id[mid]["verification_status"] not in VERIFICATION_ELIGIBLE_STATES
        ]
        if ineligible:
            names = [by_id[mid]["test_name_normalized"] for mid in ineligible]
            raise VerificationSelectionError(
                "Cannot confirm measurement(s) that are not awaiting confirmation: "
                + ", ".join(names)
            )

        now = _now()
        conn.execute(
            f"UPDATE report_measurements SET verification_status = 'verified', updated_at = ? "
            f"WHERE report_id = ? AND id IN ({placeholders})",
            (now, report_id, *unique_ids),
        )
        rows = conn.execute(
            f"{_MEASUREMENT_SELECT} WHERE report_id = ? AND id IN ({placeholders})",
            (report_id, *unique_ids),
        ).fetchall()

    return {
        "verified": len(unique_ids),
        "measurements": [_measurement_dict_from_row(row) for row in rows],
    }