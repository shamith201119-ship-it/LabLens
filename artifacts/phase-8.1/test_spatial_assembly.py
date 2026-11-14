def assemble_ocr_lines(items: list[dict]) -> str:
    if not items:
        return ""
    
    # Calculate bounding box metrics for each item
    # PaddleOCR bbox is [[x0,y0], [x1,y1], [x2,y2], [x3,y3]]
    parsed = []
    for it in items:
        text = str(it.get("text", "")).strip()
        if not text:
            continue
        bbox = it.get("bbox")
        if bbox and len(bbox) == 4:
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            center_y = (min_y + max_y) / 2.0
            height = max_y - min_y
        else:
            min_x, max_x, min_y, max_y, center_y, height = 0, 0, 0, 0, 0, 10
        parsed.append({
            "text": text,
            "min_x": min_x,
            "max_x": max_x,
            "min_y": min_y,
            "max_y": max_y,
            "center_y": center_y,
            "height": height,
        })
    
    if not parsed:
        return ""

    # Sort primarily by min_y
    parsed.sort(key=lambda item: item["min_y"])

    # Cluster into lines
    lines = []
    for item in parsed:
        placed = False
        for line in lines:
            # Average center_y and height of line
            avg_cy = sum(it["center_y"] for it in line) / len(line)
            avg_h = sum(it["height"] for it in line) / len(line)
            # If item center_y is within half line-height of average
            tolerance = max(avg_h * 0.6, 8.0)
            if abs(item["center_y"] - avg_cy) <= tolerance:
                line.append(item)
                placed = True
                break
        if not placed:
            lines.append([item])

    # Sort lines vertically by top y
    lines.sort(key=lambda line: min(it["min_y"] for it in line))

    # In each line, sort words horizontally by min_x and join
    assembled_lines = []
    for line in lines:
        line.sort(key=lambda it: it["min_x"])
        assembled_lines.append(" ".join(it["text"] for it in line))

    return "\n".join(assembled_lines)

# Test with sample items
items = [
    {"text": "COMPLETE BLOOD COUNT (CBC)", "bbox": [[37, 29], [194, 29], [194, 42], [37, 42]]},
    {"text": "Hemoglobin", "bbox": [[37, 69], [99, 69], [99, 83], [37, 83]]},
    {"text": "14.2 g/dL 12.0 - 16.0", "bbox": [[139, 69], [244, 69], [244, 83], [139, 83]]},
    {"text": "White Blood Cell Count 8.5 x10^3/uL 4.0 - 11.0", "bbox": [[38, 108], [274, 108], [274, 122], [38, 122]]},
    {"text": "PlateletCount", "bbox": [[37, 148], [108, 148], [108, 163], [37, 163]]},
    {"text": "240 x10^3/uL 150 - 450", "bbox": [[137, 147], [255, 147], [255, 161], [137, 161]]},
    {"text": "Red Blood Cell Count", "bbox": [[38, 189], [140, 189], [140, 202], [38, 202]]},
    {"text": "4.65 mil/uL 4.20 -5.40", "bbox": [[157, 190], [268, 190], [268, 200], [157, 200]]},
    {"text": "Hematocrit", "bbox": [[38, 230], [92, 230], [92, 241], [38, 241]]},
    {"text": "42.0 %", "bbox": [[131, 228], [166, 228], [166, 242], [131, 242]]},
    {"text": "37.0 - 48.0", "bbox": [[178, 228], [229, 228], [229, 242], [178, 242]]},
]

print("Assembled text:")
assembled = assemble_ocr_lines(items)
print(assembled)
