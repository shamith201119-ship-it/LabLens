import hashlib
import io
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.database import get_connection, init_db
from app.main import app
from app.services.pdf_processor import render_page_to_image

client = TestClient(app)

FIXTURES = Path(__file__).parent / "fixtures" / "phase8_1_accuracy"
SCANNED_PDF = FIXTURES / "scanned_cbc_report.pdf"
DIGITAL_PDF = FIXTURES / "clean_digital_report.pdf"
PNG_REPORT = FIXTURES / "cbc_report.png"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@pytest.fixture(scope="module", autouse=True)
def _database():
    init_db()


def _upload(name: str, path: Path, mime: str) -> str:
    response = client.post(
        "/api/reports",
        data={"consent": "true"},
        files={"file": (name, io.BytesIO(path.read_bytes()), mime)},
    )
    assert response.status_code == 201
    return response.json()["id"]


def _insert_page_extraction(
    report_id: str,
    page_number: int,
    method: str,
    metadata: dict,
    width: float | None,
    height: float | None,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO page_extractions
            (id, report_id, page_number, extraction_method, raw_text,
             extraction_metadata, page_width, page_height, text_detection_metadata, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                str(uuid.uuid4()),
                report_id,
                page_number,
                method,
                "Hemoglobin 14.2 g/dL 12.0 - 16.0",
                json.dumps(metadata),
                width,
                height,
                json.dumps({"warnings": []}),
                _now(),
            ),
        )


def _rendered_png(page_index: int = 0) -> tuple[bytes, int, int]:
    doc = fitz.open(str(SCANNED_PDF))
    try:
        pix = doc[page_index].get_pixmap(matrix=fitz.Matrix(200 / 72, 200 / 72))
        return render_page_to_image(doc[page_index], dpi=200), pix.width, pix.height
    finally:
        doc.close()


@pytest.fixture(scope="module")
def scanned_report():
    client.delete("/api/reports")
    report_id = _upload("scanned_cbc_report.pdf", SCANNED_PDF, "application/pdf")
    png, width, height = _rendered_png()
    _insert_page_extraction(
        report_id,
        1,
        "ocr",
        {
            "ocr_items": [
                {
                    "text": "Hemoglobin 14.2 g/dL 12.0 - 16.0",
                    "confidence": 0.96,
                    "bbox": [[37, 69], [244, 69], [244, 83], [37, 83]],
                }
            ],
            "quality": {"width": width, "height": height},
        },
        width,
        height,
    )
    yield report_id, png, width, height
    client.delete(f"/api/reports/{report_id}")


def test_valid_scanned_pdf_page_returns_png(scanned_report):
    report_id, _, _, _ = scanned_report

    response = client.get(f"/api/reports/{report_id}/pages/1/image")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(response.content) > 1000


def test_returned_dimensions_match_ocr_rendering(scanned_report):
    report_id, _, width, height = scanned_report

    response = client.get(f"/api/reports/{report_id}/pages/1/image")
    image = Image.open(io.BytesIO(response.content))

    assert image.size == (width, height)
    assert image.size == (2500, 1000)


def test_page_one_uses_one_based_indexing(scanned_report):
    report_id, expected_png, _, _ = scanned_report

    response = client.get(f"/api/reports/{report_id}/pages/1/image")
    expected_image = Image.open(io.BytesIO(expected_png)).convert("RGB")
    actual_image = Image.open(io.BytesIO(response.content)).convert("RGB")

    assert actual_image.size == expected_image.size
    assert hashlib.sha256(actual_image.tobytes()).digest() == hashlib.sha256(
        expected_image.tobytes()
    ).digest()


def test_page_zero_is_rejected(scanned_report):
    report_id, _, _, _ = scanned_report

    response = client.get(f"/api/reports/{report_id}/pages/0/image")

    assert response.status_code == 400


def test_out_of_range_page_is_rejected(scanned_report):
    report_id, _, _, _ = scanned_report

    response = client.get(f"/api/reports/{report_id}/pages/2/image")

    assert response.status_code == 404


def test_missing_report_is_rejected():
    missing_id = str(uuid.uuid4())

    response = client.get(f"/api/reports/{missing_id}/pages/1/image")

    assert response.status_code == 404


def test_non_pdf_report_is_rejected():
    report_id = _upload("cbc_report.png", PNG_REPORT, "image/png")
    try:
        response = client.get(f"/api/reports/{report_id}/pages/1/image")
        assert response.status_code == 400
    finally:
        client.delete(f"/api/reports/{report_id}")


def test_digital_pdf_page_is_served_without_ocr():
    report_id = _upload("clean_digital_report.pdf", DIGITAL_PDF, "application/pdf")
    _insert_page_extraction(
        report_id,
        1,
        "digital",
        {"words": [], "width": 612, "height": 792},
        612,
        792,
    )
    try:
        response = client.get(f"/api/reports/{report_id}/pages/1/image")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
    finally:
        client.delete(f"/api/reports/{report_id}")


def test_original_pdf_remains_unchanged(scanned_report):
    report_id, _, _, _ = scanned_report

    before = client.get(f"/api/reports/{report_id}/download")
    assert before.status_code == 200
    before_hash = hashlib.sha256(before.content).hexdigest()

    response = client.get(f"/api/reports/{report_id}/pages/1/image")
    assert response.status_code == 200

    after = client.get(f"/api/reports/{report_id}/download")
    assert after.status_code == 200
    assert hashlib.sha256(after.content).hexdigest() == before_hash
    assert after.content == SCANNED_PDF.read_bytes()
