"""Generate the deterministic Phase 9.6 dense small-text scanned laboratory PDF.

The PDF has two image-only pages with no text layer, so the application
classifies each page as scanned and runs OCR.
"""

from __future__ import annotations

import io
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

FIXTURE_DIR = Path(__file__).resolve().parent
PDF_PATH = FIXTURE_DIR / "dense_small_text_report.pdf"

PAGE_SIZE = (1700, 2200)
FONT_CANDIDATES = (
    Path("C:/Windows/Fonts/arial.ttf"),
    Path("C:/Windows/Fonts/calibri.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
)
BOLD_FONT_CANDIDATES = (
    Path("C:/Windows/Fonts/arialbd.ttf"),
    Path("C:/Windows/Fonts/calibrib.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
)

ROWS_PAGE_1 = (
    ("Hemoglobin", "17.0", "g/dL", "12.0 - 16.0"),
    ("WBC", "3.5", "x10^3/uL", "4.0 - 11.0"),
    ("Platelet Count", "150", "x10^3/uL", "150 - 450"),
    ("RBC", "5.5", "x10^6/uL", "4.0 - 5.5"),
    ("Hematocrit", "52", "%", "38 - 50"),
    ("MCV", "100", "fL", "80 - 100"),
)

ROWS_PAGE_2 = (
    ("ALT", "60", "U/L", "7 - 56"),
    ("AST", "38", "U/L", "10 - 40"),
    ("Glucose", "110", "mg/dL", "70 - 99"),
    ("Creatinine", "1.4", "mg/dL", "0.7 - 1.3"),
    ("BUN", "25", "mg/dL", "7 - 20"),
    ("Sodium", "130", "mEq/L", "135 - 145"),
)

ALL_ROWS = ROWS_PAGE_1 + ROWS_PAGE_2


def _font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    candidates = BOLD_FONT_CANDIDATES if bold else FONT_CANDIDATES
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default(size=size)


def _draw_page(rows: tuple, page_number: int) -> Image.Image:
    width, height = PAGE_SIZE
    image = Image.new("RGB", PAGE_SIZE, color=(250, 249, 246))
    draw = ImageDraw.Draw(image)

    title_font = _font(28, bold=True)
    subtitle_font = _font(17)
    meta_font = _font(14)
    body_font = _font(20)
    footer_font = _font(13)

    margin = 95
    draw.text((margin, 70), "SYNTHETIC LABORATORY REPORT", fill=(18, 18, 18), font=title_font)
    draw.text((margin, 112), "Complete Blood Count & Metabolic Panel", fill=(40, 40, 40), font=subtitle_font)
    draw.line((margin, 148, width - margin, 148), fill=(60, 60, 60), width=2)

    draw.text((margin, 172), "Patient: Synthetic Sample    DOB: 1990-01-01    Collected: 2026-11-12", fill=(50, 50, 50), font=meta_font)
    draw.text((margin, 194), f"Accession: SYN-962-{page_number}    Physician: Dr. Example    Reported: 2026-11-12", fill=(50, 50, 50), font=meta_font)
    draw.line((margin, 222, width - margin, 222), fill=(110, 110, 110), width=1)

    row_y = 270
    for name, result, unit, reference in rows:
        draw.text(
            (margin, row_y),
            f"{name}: {result} {unit}    Reference: {reference}",
            fill=(12, 12, 12),
            font=body_font,
        )
        draw.line((margin, row_y + 30, width - margin, row_y + 30), fill=(185, 185, 185), width=1)
        row_y += 34

    draw.line((margin, height - 150, width - margin, height - 150), fill=(110, 110, 110), width=1)
    draw.text((margin, height - 122), "Synthetic benchmark values. Not clinical recommendations.", fill=(70, 70, 70), font=meta_font)
    draw.text((margin, height - 72), "Synthetic demonstration data - not for clinical use", fill=(80, 80, 80), font=footer_font)
    draw.text((width - margin - 105, height - 72), f"Page {page_number} of 2", fill=(80, 80, 80), font=footer_font)
    return image


def _image_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90, optimize=True)
    return buffer.getvalue()


def generate() -> Path:
    doc = fitz.open()
    for page_number, rows in enumerate((ROWS_PAGE_1, ROWS_PAGE_2), start=1):
        image = _draw_page(rows, page_number)
        page = doc.new_page(width=612, height=792)
        page.insert_image(fitz.Rect(0, 0, 612, 792), stream=_image_bytes(image), keep_proportion=False)
    doc.save(PDF_PATH)
    doc.close()

    with fitz.open(str(PDF_PATH)) as document:
        assert document.page_count == 2
        for page in document:
            assert page.get_text() == ""
            assert page.get_images(full=True)
    return PDF_PATH


if __name__ == "__main__":
    path = generate()
    print(f"Wrote {path} ({path.stat().st_size} bytes)")
