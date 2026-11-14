"""Generate the deterministic Phase 9.5 photographed laboratory-report JPG.

The source page is a clean synthetic report. It is then transformed with a
mild camera simulation: perspective warp, rotation, uneven lighting, a soft
shadow, mild Gaussian blur, sensor noise, and JPEG compression.

Run from the repository root:
    py -3.12 backend/tests/fixtures/phase9_5/generate_photographed_report.py

The companion ground-truth JSON is authored from the clean source report and
is not derived from OCR output.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FIXTURE_DIR = Path(__file__).resolve().parent
JPG_PATH = FIXTURE_DIR / "photographed_report.jpg"
METADATA_PATH = FIXTURE_DIR / "photographed_report_photo.json"

PAGE_SIZE = (1700, 2200)
CANVAS_SIZE = (2000, 2500)
ROTATION_DEGREES = -0.8
BLUR_SIGMA = 0.6
JPEG_QUALITY = 87

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

ROWS = (
    ("Hemoglobin", "13.8", "g/dL", "12.0 - 16.0"),
    ("WBC", "7.2", "x10^3/uL", "4.0 - 11.0"),
    ("Platelet Count", "265", "x10^3/uL", "150 - 450"),
    ("Glucose", "98", "mg/dL", "70 - 99"),
    ("Creatinine", "1.0", "mg/dL", "0.7 - 1.3"),
)

# Destination page corners in the larger camera canvas.
PERSPECTIVE_CORNERS = (
    (150.0, 120.0),   # top-left
    (1800.0, 135.0),  # top-right
    (1840.0, 2360.0),  # bottom-right
    (110.0, 2340.0),  # bottom-left
)


def _font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    candidates = BOLD_FONT_CANDIDATES if bold else FONT_CANDIDATES
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default(size=size)


def _draw_source_page() -> Image.Image:
    width, height = PAGE_SIZE
    image = Image.new("RGB", PAGE_SIZE, color=(252, 251, 248))
    draw = ImageDraw.Draw(image)

    title_font = _font(60, bold=True)
    subtitle_font = _font(38)
    meta_font = _font(27)
    body_font = _font(42)
    footer_font = _font(27)

    margin = 130
    draw.text(
        (margin, 100),
        "SYNTHETIC LABORATORY REPORT",
        fill=(20, 20, 20),
        font=title_font,
    )
    draw.text(
        (margin, 190),
        "Complete Blood Count & Metabolic Panel",
        fill=(45, 45, 45),
        font=subtitle_font,
    )
    draw.line((margin, 260, width - margin, 260), fill=(60, 60, 60), width=3)

    draw.text(
        (margin, 300),
        "Patient: Synthetic Sample    DOB: 1990-01-01    Collected: 2026-11-12",
        fill=(55, 55, 55),
        font=meta_font,
    )
    draw.text(
        (margin, 345),
        "Accession: SYN-954    Physician: Dr. Example    Reported: 2026-11-12",
        fill=(55, 55, 55),
        font=meta_font,
    )
    draw.line((margin, 405, width - margin, 405), fill=(120, 120, 120), width=2)

    row_y = 520
    for name, result, unit, reference in ROWS:
        draw.text(
            (margin, row_y),
            f"{name}: {result} {unit}    Reference: {reference}",
            fill=(15, 15, 15),
            font=body_font,
        )
        draw.line(
            (margin, row_y + 92, width - margin, row_y + 92),
            fill=(180, 180, 180),
            width=1,
        )
        row_y += 150

    draw.line((margin, 1370, width - margin, 1370), fill=(120, 120, 120), width=2)
    draw.text(
        (margin, 1415),
        "Synthetic benchmark values. Not clinical recommendations.",
        fill=(70, 70, 70),
        font=meta_font,
    )
    draw.text(
        (margin, height - 130),
        "Synthetic demonstration data - not for clinical use",
        fill=(80, 80, 80),
        font=footer_font,
    )
    draw.text(
        (width - margin - 150, height - 130),
        "Page 1 of 1",
        fill=(80, 80, 80),
        font=footer_font,
    )
    return image


def _desk_background(width: int, height: int, rng: np.random.Generator) -> np.ndarray:
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    base = 52.0 + 18.0 * (yy / height) + 7.0 * np.sin(xx / width * np.pi)
    noise = rng.normal(0.0, 2.5, (height, width)).astype(np.float32)
    gray = np.clip(base + noise, 0, 255)
    return np.stack([gray * 1.02, gray * 0.99, gray * 0.95], axis=-1)


def _photo_transform(source: Image.Image) -> tuple[Image.Image, dict]:
    page = np.asarray(source, dtype=np.uint8)
    page_h, page_w = page.shape[:2]
    canvas_w, canvas_h = CANVAS_SIZE

    src_corners = np.float32(
        [[0, 0], [page_w, 0], [page_w, page_h], [0, page_h]]
    )
    dst_corners = np.float32(PERSPECTIVE_CORNERS)
    matrix = cv2.getPerspectiveTransform(src_corners, dst_corners)

    warped = cv2.warpPerspective(
        page,
        matrix,
        (canvas_w, canvas_h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0),
    )
    mask = cv2.warpPerspective(
        np.full((page_h, page_w), 255, dtype=np.uint8),
        matrix,
        (canvas_w, canvas_h),
        flags=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    ).astype(np.float32) / 255.0

    rng = np.random.default_rng(954)
    desk = _desk_background(canvas_w, canvas_h, rng)

    shadow = cv2.GaussianBlur(mask, (0, 0), 32)
    shadow = np.roll(shadow, 20, axis=0)
    shadow = np.roll(shadow, 14, axis=1)
    desk = desk * (1.0 - 0.55 * shadow[..., None])

    alpha = cv2.GaussianBlur(mask, (0, 0), 1.2)[..., None]
    composed = warped.astype(np.float32) * alpha + desk * (1.0 - alpha)

    # A small camera roll on top of the perspective tilt.
    center = (canvas_w / 2.0, canvas_h / 2.0)
    rotation = cv2.getRotationMatrix2D(center, ROTATION_DEGREES, 1.0)
    cos = abs(rotation[0, 0])
    sin = abs(rotation[0, 1])
    rotated_w = int(canvas_h * sin + canvas_w * cos)
    rotated_h = int(canvas_h * cos + canvas_w * sin)
    rotation[0, 2] += rotated_w / 2.0 - center[0]
    rotation[1, 2] += rotated_h / 2.0 - center[1]
    composed = cv2.warpAffine(
        composed,
        rotation,
        (rotated_w, rotated_h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(43, 42, 40),
    )

    height, width = composed.shape[:2]
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)

    # Uneven indoor light: brighter toward the upper-left, with a soft shadow
    # pooling near the lower-left corner.
    light = (
        0.92
        + 0.20 * (1.0 - xx / width)
        + 0.08 * (1.0 - yy / height)
    )
    radius = ((xx - width / 2.0) / (width / 2.0)) ** 2 + (
        (yy - height / 2.0) / (height / 2.0)
    ) ** 2
    light *= 1.0 - 0.17 * np.clip(radius, 0.0, 1.0)
    band = np.exp(
        -(
            ((xx - 0.18 * width) / (0.24 * width)) ** 2
            + ((yy - 0.78 * height) / (0.30 * height)) ** 2
        )
    )
    light -= 0.10 * band
    light = cv2.GaussianBlur(light.astype(np.float32), (0, 0), 70)

    composed *= light[..., None]
    composed *= np.array([1.015, 1.0, 0.965], dtype=np.float32)

    # Mild optical blur, then light sensor noise.
    composed = cv2.GaussianBlur(composed, (0, 0), BLUR_SIGMA)
    composed += rng.normal(0.0, 1.1, composed.shape).astype(np.float32)
    composed = np.clip(composed, 0, 255).astype(np.uint8)

    final = Image.fromarray(composed, mode="RGB")
    metadata = {
        "source_page_pixels": {"width": page_w, "height": page_h},
        "final_image_pixels": {"width": final.width, "height": final.height},
        "format": "JPEG",
        "jpeg_quality": JPEG_QUALITY,
        "jpeg_subsampling": "4:2:0",
        "rotation_degrees": ROTATION_DEGREES,
        "perspective_destination_corners": [
            {"x": x, "y": y} for x, y in PERSPECTIVE_CORNERS
        ],
        "lighting": "upper-left highlight, lower-right falloff, lower-left soft shadow",
        "gaussian_blur_sigma": BLUR_SIGMA,
        "sensor_noise_sigma": 1.1,
        "seed": 954,
        "transformations": [
            "clean synthetic report render",
            "perspective warp",
            "camera roll rotation",
            "uneven illumination and vignette",
            "soft shadow",
            "mild Gaussian blur",
            "sensor noise",
            "JPEG compression",
        ],
    }
    return final, metadata


def generate() -> Path:
    final, metadata = _photo_transform(_draw_source_page())
    final.save(
        JPG_PATH,
        format="JPEG",
        quality=JPEG_QUALITY,
        subsampling=2,
        optimize=True,
    )
    METADATA_PATH.write_text(
        json.dumps(metadata, indent=2) + "\n",
        encoding="utf-8",
    )

    with Image.open(JPG_PATH) as written:
        assert written.format == "JPEG"
        assert written.size == (metadata["final_image_pixels"]["width"], metadata["final_image_pixels"]["height"])
    return JPG_PATH


if __name__ == "__main__":
    path = generate()
    print(f"Wrote {path} ({path.stat().st_size} bytes)")
    print(METADATA_PATH.read_text(encoding="utf-8"))
