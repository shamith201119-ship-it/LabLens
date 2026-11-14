import fitz  # PyMuPDF


def classify_page(page) -> str:
    text = page.get_text().strip()
    if len(text) == 0:
        return "scanned"
    return "digital"


def _normalized_word_bbox(page, rect) -> list[float]:
    """Return a word bbox in the page's displayed coordinate space."""
    matrix = getattr(page, "rotation_matrix", None)
    if matrix is None:
        return [round(float(rect[0]), 2), round(float(rect[1]), 2),
                round(float(rect[2]), 2), round(float(rect[3]), 2)]

    corners = (
        fitz.Point(rect[0], rect[1]),
        fitz.Point(rect[2], rect[1]),
        fitz.Point(rect[2], rect[3]),
        fitz.Point(rect[0], rect[3]),
    )
    transformed = [corner * matrix for corner in corners]
    xs = [point.x for point in transformed]
    ys = [point.y for point in transformed]
    return [round(min(xs), 2), round(min(ys), 2),
            round(max(xs), 2), round(max(ys), 2)]


def extract_digital_page(page) -> dict:
    words = page.get_text("words")  # list of (x0,y0,x1,y1,word,block,line,word_no)
    word_list = []
    for w in words:
        if not str(w[4]).strip():
            continue
        word_list.append(
            {
                "text": w[4],
                "bbox": _normalized_word_bbox(page, w[:4]),
                "block": w[5],
                "line": w[6],
                "word": w[7],
                "block_no": w[5],
                "block_number": w[5],
                "line_no": w[6],
                "line_number": w[6],
                "word_no": w[7],
                "word_number": w[7],
            }
        )
    raw_text = page.get_text()
    return {
        "method": "digital",
        "raw_text": raw_text,
        "words": word_list,
        "width": round(page.rect.width, 2),
        "height": round(page.rect.height, 2),
        "rotation": int(page.rotation),
    }


def render_page_to_image(page, dpi: int = 200) -> bytes:
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    return pix.tobytes("png")


def page_count(doc) -> int:
    return doc.page_count
