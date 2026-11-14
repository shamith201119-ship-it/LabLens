import math
from typing import Optional

import cv2
import numpy as np


def read_image(path: str):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not read image")
    return img


def assess_quality(img) -> dict:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    brightness = float(gray.mean())
    # blur via variance of Laplacian
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return {
        "width": int(w),
        "height": int(h),
        "brightness": round(float(brightness), 2),
        "blur_variance": round(float(blur), 2),
        "low_resolution": bool(w < 800 or h < 800),
        "possibly_blurry": bool(blur < 50),
        "low_contrast": bool(gray.std() < 25),
    }


def preprocess_for_ocr(img) -> list[tuple[str, any]]:
    """Return list of (variant_name, image) to try."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    variants = [("original", img)]
    # grayscale
    variants.append(("grayscale", cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)))
    # adaptive threshold
    thr = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)
    variants.append(("adaptive_threshold", cv2.cvtColor(thr, cv2.COLOR_GRAY2BGR)))
    # denoised
    den = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
    variants.append(("denoised", cv2.cvtColor(den, cv2.COLOR_GRAY2BGR)))
    return variants


def save_temp_image(img, path: str) -> None:
    cv2.imwrite(path, img)


def _bbox_bounds(bbox) -> Optional[tuple[float, float, float, float]]:
    """Return (x0, y0, x1, y1) for a polygon or flat box, or None if invalid."""
    if bbox is None:
        return None
    if hasattr(bbox, "tolist"):
        try:
            bbox = bbox.tolist()
        except Exception:
            return None
    if not isinstance(bbox, (list, tuple)) or len(bbox) == 0:
        return None

    # Flat box: [x0, y0, x1, y1]
    if len(bbox) == 4 and all(not isinstance(v, (list, tuple, dict)) for v in bbox):
        try:
            values = [float(v) for v in bbox]
        except (TypeError, ValueError):
            return None
        if not all(math.isfinite(v) for v in values):
            return None
        x0, y0, x1, y1 = values
        return (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))

    # Polygon: [[x0, y0], [x1, y1], ...]
    xs = []
    ys = []
    for point in bbox:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            return None
        try:
            x = float(point[0])
            y = float(point[1])
        except (TypeError, ValueError):
            return None
        if not (math.isfinite(x) and math.isfinite(y)):
            return None
        xs.append(x)
        ys.append(y)
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


def _confidence_score(value) -> Optional[float]:
    if value is None:
        return None
    try:
        score = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(score):
        return None
    return score


def _prepare_ocr_items(items: list[dict]) -> list[dict]:
    parsed = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        text = str(it.get("text", "")).strip()
        if not text:
            continue
        bbox = _bbox_bounds(it.get("bbox"))
        if bbox is not None:
            min_x, min_y, max_x, max_y = bbox
            center_y = (min_y + max_y) / 2.0
            height = max_y - min_y
        else:
            min_x = max_x = min_y = max_y = 0
            center_y = 0
            height = 10
        parsed.append({
            "text": text,
            "bbox": bbox,
            "confidence": _confidence_score(it.get("confidence")),
            "min_x": min_x,
            "max_x": max_x,
            "min_y": min_y,
            "max_y": max_y,
            "center_y": center_y,
            "height": height,
        })
    return parsed


def _group_ocr_lines(parsed: list[dict]) -> list[list[dict]]:
    # Sort primarily by min_y
    parsed.sort(key=lambda item: item["min_y"])

    # Cluster into lines based on vertical overlap / tolerance
    lines: list[list[dict]] = []
    for item in parsed:
        placed = False
        for line in lines:
            avg_cy = sum(it["center_y"] for it in line) / len(line)
            avg_h = sum(it["height"] for it in line) / len(line)
            tolerance = max(avg_h * 0.6, 8.0)
            if abs(item["center_y"] - avg_cy) <= tolerance:
                line.append(item)
                placed = True
                break
        if not placed:
            lines.append([item])

    # Sort lines vertically by top y
    lines.sort(key=lambda line: min(it["min_y"] for it in line))

    # In each line, sort words horizontally by min_x
    for line in lines:
        line.sort(key=lambda it: it["min_x"])
    return lines


def assemble_ocr_line_records(items: list[dict]) -> list[dict]:
    """Group OCR bounding boxes into lines, retaining source boxes and confidence."""
    records = []
    for line in _group_ocr_lines(_prepare_ocr_items(items)):
        boxes = [it["bbox"] for it in line if it["bbox"] is not None]
        if boxes:
            bbox = [
                min(b[0] for b in boxes),
                min(b[1] for b in boxes),
                max(b[2] for b in boxes),
                max(b[3] for b in boxes),
            ]
        else:
            bbox = None
        scores = [it["confidence"] for it in line if it["confidence"] is not None]
        records.append({
            "text": " ".join(it["text"] for it in line),
            "bbox": bbox,
            "confidence": min(scores) if scores else None,
        })
    return records


def assemble_ocr_lines(items: list[dict]) -> str:
    """Group OCR bounding boxes into horizontal lines, sorting top-to-bottom and left-to-right."""
    return "\n".join(record["text"] for record in assemble_ocr_line_records(items))

