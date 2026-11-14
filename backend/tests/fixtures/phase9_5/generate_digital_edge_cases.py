"""Generate the deterministic Phase 9.5 digital edge-case laboratory PDF.

Unlike the scanned fixture, this PDF is built with selectable PDF text. It
contains two digital pages with qualified results, missing fields, and a
thousands-separated result.

Run from the repository root:
    py -3.12 backend/tests/fixtures/phase9_5/generate_digital_edge_cases.py

The companion ground-truth JSON is authored separately and is not derived from
extraction output.
"""

from __future__ import annotations

from pathlib import Path

import fitz

FIXTURE_DIR = Path(__file__).resolve().parent
PDF_PATH = FIXTURE_DIR / "digital_edge_cases.pdf"


def _add_header(page, subtitle: str) -> None:
    page.insert_text((50, 60), "SYNTHETIC DIGITAL LABORATORY REPORT", fontsize=16)
    page.insert_text((50, 85), subtitle, fontsize=11)
    page.draw_line((50, 100), (562, 100), color=(0, 0, 0), width=1.2)


def _add_footer(page, page_number: int) -> None:
    page.insert_text(
        (50, 760),
        f"Synthetic demonstration data - Page {page_number} of 2",
        fontsize=9,
    )


def generate() -> Path:
    document = fitz.open()
    try:
        page_one = document.new_page(width=612, height=792)
        _add_header(page_one, "Hormone and Metabolic Panel")
        page_one.insert_text(
            (50, 140),
            "TSH: <0.5 uIU/mL    Reference: 0.40 - 4.50 uIU/mL",
            fontsize=11,
        )
        page_one.insert_text(
            (50, 175),
            "Vitamin B12: >100 pg/mL    Reference: 200 - 900 pg/mL",
            fontsize=11,
        )
        page_one.insert_text((50, 210), "Glucose: 98 mg/dL", fontsize=11)
        _add_footer(page_one, 1)

        page_two = document.new_page(width=612, height=792)
        _add_header(page_two, "Additional Results")
        page_two.insert_text(
            (50, 140),
            "Hemoglobin: 14.2    12.0 - 16.0",
            fontsize=11,
        )
        page_two.insert_text(
            (50, 175),
            "Triglycerides: 1,234 mg/dL    Reference: <150 mg/dL",
            fontsize=11,
        )
        _add_footer(page_two, 2)

        document.save(str(PDF_PATH), deflate=True, garbage=4)
    finally:
        document.close()

    with fitz.open(str(PDF_PATH)) as written:
        assert written.page_count == 2, "fixture must contain exactly two pages"
        for page in written:
            assert page.get_text().strip(), "fixture pages must contain selectable text"
    return PDF_PATH


if __name__ == "__main__":
    path = generate()
    print(f"Wrote {path} ({path.stat().st_size} bytes)")
