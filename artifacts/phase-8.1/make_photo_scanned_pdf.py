"""Build a temporary 200-DPI image-only PDF from the photographed fixture.

Phase 9.10.1 diagnostic helper. The derived PDF is written only under the
approved isolated temp root; the original fixture is never modified.

Usage:
    py -3.12 artifacts/phase-8.1/make_photo_scanned_pdf.py [--temp-root DIR]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
SOURCE_JPG = ROOT_DIR / "backend" / "tests" / "fixtures" / "phase9_5" / "photographed_report.jpg"
DEFAULT_TEMP_ROOT = Path(
    os.environ.get(
        "LABLENS_LAB_TEMP_ROOT",
        str(Path(os.environ.get("TEMP", tempfile.gettempdir())) / "opencode" / "lablens-phase9101"),
    )
).resolve()
RENDER_DPI = 200


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build(temp_root: Path = DEFAULT_TEMP_ROOT) -> dict:
    import fitz
    from PIL import Image

    temp_root = temp_root.resolve()
    fixture_dir = (temp_root / "fixtures").resolve()
    fixture_dir.mkdir(parents=True, exist_ok=True)
    target = fixture_dir / "photo_scanned_report_200dpi.pdf"
    metadata_path = fixture_dir / "photo_scanned_report_200dpi.json"

    if not SOURCE_JPG.is_file():
        raise FileNotFoundError(f"Missing source photograph: {SOURCE_JPG}")

    with Image.open(SOURCE_JPG) as image:
        pixel_width, pixel_height = image.size
        image_format = image.format

    point_width = pixel_width * 72.0 / RENDER_DPI
    point_height = pixel_height * 72.0 / RENDER_DPI

    document = fitz.open()
    try:
        page = document.new_page(width=point_width, height=point_height)
        page.insert_image(page.rect, filename=str(SOURCE_JPG))
        document.save(str(target), garbage=4, deflate=True)
    finally:
        document.close()

    # Verify the page renders back to the same pixel dimensions at 200 DPI.
    check = fitz.open(str(target))
    try:
        rendered = check[0].get_pixmap(dpi=RENDER_DPI)
        rendered_size = [rendered.width, rendered.height]
        text_length = len(check[0].get_text().strip())
        page_count = check.page_count
        page_size = [round(check[0].rect.width, 3), round(check[0].rect.height, 3)]
    finally:
        check.close()

    metadata = {
        "source_jpg": str(SOURCE_JPG),
        "source_sha256": sha256_file(SOURCE_JPG),
        "source_pixels": [pixel_width, pixel_height],
        "source_format": image_format,
        "derived_pdf": str(target),
        "derived_sha256": sha256_file(target),
        "derived_size_bytes": target.stat().st_size,
        "page_count": page_count,
        "page_size_points": page_size,
        "render_dpi": RENDER_DPI,
        "rendered_pixels": rendered_size,
        "pixel_dimensions_preserved": rendered_size == [pixel_width, pixel_height],
        "embedded_text_length": text_length,
        "image_only": text_length == 0,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    metadata["metadata_path"] = str(metadata_path)
    return metadata


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--temp-root", default=str(DEFAULT_TEMP_ROOT))
    args = parser.parse_args()
    info = build(Path(args.temp_root))
    print(json.dumps(info, indent=2))
    if not (info["pixel_dimensions_preserved"] and info["image_only"] and info["page_count"] == 1):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
