"""Generate the deterministic Phase 9.5 two-page scanned laboratory PDF.

The PDF contains two image-only pages. It intentionally has no text layer, so
``page.get_text()`` is empty for both pages and the application classifies each
page as scanned.

Run from the repository root:
    py -3.12 backend/tests/fixtures/phase9_5/generate_multipage_fixture.py

The companion ground-truth JSON is authored separately and is not derived from
OCR output.
"""

from __future__ import annotations

import io
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

FIXTURE_DIR = Path(__file__).resolve().parent
PDF_PATH = FIXTURE_DIR / "multipage_scanned_report.pdf"

PAGE_SIZE = (1700, 2200)  # Letter aspect ratio at approximately 200 DPI.
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


def _font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    candidates = BOLD_FONT_CANDIDATES if bold else FONT_CANDIDATES
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default(size=size)


def _new_page() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", PAGE_SIZE, color="white")
    return image, ImageDraw.Draw(image)


def _draw_page_one() -> Image.Image:
    image, draw = _new_page()
    title_font = _font(64, bold=True)
    subtitle_font = _font(42)
    header_font = _font(38, bold=True)
    body_font = _font(40)
    footer_font = _font(28)

    draw.text((120, 110), "SYNTHETIC LABORATORY REPORT", fill="black", font=title_font)
    draw.text((120, 210), "Complete Blood Count Panel", fill="black", font=subtitle_font)
    draw.line((120, 300, 1580, 300), fill="black", width=3)

    columns = {
        "test": 150,
        "result": 820,
        "unit": 1010,
        "reference": 1310,
    }
    header_y = 390
    draw.text((columns["test"], header_y), "Test", fill="black", font=header_font)
    draw.text((columns["result"], header_y), "Result", fill="black", font=header_font)
    draw.text((columns["unit"], header_y), "Unit", fill="black", font=header_font)
    draw.text((columns["reference"], header_y), "Reference", fill="black", font=header_font)
    draw.line((120, 460, 1580, 460), fill="black", width=3)

    rows = (
        ("Hemoglobin", "14.2", "g/dL", "12.0 - 16.0"),
        ("WBC", "8.5", "x10^3/uL", "4.0 - 11.0"),
        ("Platelet Count", "240", "x10^3/uL", "150 - 450"),
    )
    row_y = 530
    for test, result, unit, reference in rows:
        draw.text((columns["test"], row_y), test, fill="black", font=body_font)
        draw.text((columns["result"], row_y), result, fill="black", font=body_font)
        draw.text((columns["unit"], row_y), unit, fill="black", font=body_font)
        draw.text((columns["reference"], row_y), reference, fill="black", font=body_font)
        draw.line((120, row_y + 90, 1580, row_y + 90), fill=(120, 120, 120), width=2)
        row_y += 150

    draw.text((120, 2070), "Synthetic demonstration data - Page 1 of 2", fill="black", font=footer_font)
    return image


def _draw_page_two() -> Image.Image:
    image, draw = _new_page()
    title_font = _font(64, bold=True)
    subtitle_font = _font(42)
    body_font = _font(44)
    reference_font = _font(36)
    footer_font = _font(28)

    draw.text((120, 110), "SYNTHETIC LABORATORY REPORT", fill="black", font=title_font)
    draw.text((120, 210), "Metabolic Panel", fill="black", font=subtitle_font)
    draw.line((120, 300, 1580, 300), fill="black", width=3)

    draw.text((150, 430), "Glucose: 128 mg/dL", fill="black", font=body_font)
    draw.text((150, 520), "Reference range: 70 - 99 mg/dL", fill="black", font=reference_font)

    draw.line((150, 640, 1580, 640), fill=(120, 120, 120), width=2)

    draw.text(
        (150, 730),
        "Creatinine: 1.0 mg/dL (reference 0.7 - 1.3 mg/dL)",
        fill="black",
        font=body_font,
    )

    draw.text((120, 2070), "Synthetic demonstration data - Page 2 of 2", fill="black", font=footer_font)
    return image


def _png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def generate() -> Path:
    document = fitz.open()
    try:
        for image in (_draw_page_one(), _draw_page_two()):
            page = document.new_page(width=612, height=792)
            page.insert_image(page.rect, stream=_png_bytes(image))
        document.save(str(PDF_PATH), deflate=True, garbage=4)
    finally:
        document.close()

    with fitz.open(str(PDF_PATH)) as written:
        assert written.page_count == 2, "fixture must contain exactly two pages"
        for page in written:
            assert page.get_text() == "", "fixture pages must not contain a text layer"
    return PDF_PATH


if __name__ == "__main__":
    path = generate()
    print(f"Wrote {path} ({path.stat().st_size} bytes)")
