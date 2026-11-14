import io
import os
import tempfile
from pathlib import Path

_TEMP_DATA_DIR = Path(tempfile.mkdtemp(prefix="lablens-phase972-page-image"))
os.environ["LABLENS_DATA_DIR"] = str(_TEMP_DATA_DIR)

import fitz
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.database import init_db
from app.main import app
from app.services.pdf_processor import render_page_to_image

client = TestClient(app)
init_db()

DIGITAL_PDF_BYTES = None


def _pdf_bytes(setup) -> bytes:
    document = fitz.open()
    try:
        page = document.new_page(width=300, height=400)
        setup(page)
        return document.tobytes()
    finally:
        document.close()


def _expected_size(pdf_bytes: bytes, page_index: int = 0) -> tuple[int, int]:
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        pixmap = document[page_index].get_pixmap(matrix=fitz.Matrix(200 / 72, 200 / 72))
        return pixmap.width, pixmap.height
    finally:
        document.close()


def _upload_pdf(pdf_bytes: bytes, filename: str = "report.pdf") -> str:
    response = client.post(
        "/api/reports",
        data={"consent": "true"},
        files={"file": (filename, io.BytesIO(pdf_bytes), "application/pdf")},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_digital_pdf_page_returns_png():
    pdf_bytes = _pdf_bytes(lambda page: page.insert_text((72, 100), "Digital source text"))
    report_id = _upload_pdf(pdf_bytes)

    try:
        response = client.get(f"/api/reports/{report_id}/pages/1/image")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert response.headers["cache-control"] == "private, no-store"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.content.startswith(b"\x89PNG\r\n\x1a\n")

        image = Image.open(io.BytesIO(response.content))
        assert image.size == _expected_size(pdf_bytes)
    finally:
        client.delete(f"/api/reports/{report_id}")


def test_digital_page_rendering_does_not_call_ocr(monkeypatch):
    import app.services.extraction_service as extraction_service

    def fail_if_called(*args, **kwargs):
        raise AssertionError("OCR must not be called for PDF page rendering")

    monkeypatch.setattr(extraction_service, "ocr_image", fail_if_called)

    pdf_bytes = _pdf_bytes(lambda page: page.insert_text((72, 100), "Digital source text"))
    report_id = _upload_pdf(pdf_bytes)

    try:
        response = client.get(f"/api/reports/{report_id}/pages/1/image")
        assert response.status_code == 200
    finally:
        client.delete(f"/api/reports/{report_id}")


def test_rotated_digital_page_preserves_displayed_orientation():
    def setup(page):
        page.insert_text((50, 100), "Rotated digital text")
        page.set_rotation(90)

    pdf_bytes = _pdf_bytes(setup)
    report_id = _upload_pdf(pdf_bytes)

    try:
        response = client.get(f"/api/reports/{report_id}/pages/1/image")
        assert response.status_code == 200
        image = Image.open(io.BytesIO(response.content))
        assert image.size == _expected_size(pdf_bytes)
    finally:
        client.delete(f"/api/reports/{report_id}")


def test_cropped_digital_page_preserves_visible_region():
    def setup(page):
        page.set_cropbox(fitz.Rect(20, 20, 200, 200))
        page.insert_text((30, 60), "Cropped digital text")

    pdf_bytes = _pdf_bytes(setup)
    report_id = _upload_pdf(pdf_bytes)

    try:
        response = client.get(f"/api/reports/{report_id}/pages/1/image")
        assert response.status_code == 200
        image = Image.open(io.BytesIO(response.content))
        assert image.size == _expected_size(pdf_bytes)
    finally:
        client.delete(f"/api/reports/{report_id}")


def test_requested_page_number_is_respected():
    document = fitz.open()
    try:
        first = document.new_page(width=300, height=400)
        first.insert_text((72, 100), "First page")
        second = document.new_page(width=300, height=400)
        second.insert_text((72, 100), "Second page")
        pdf_bytes = document.tobytes()
    finally:
        document.close()

    report_id = _upload_pdf(pdf_bytes)

    try:
        first_response = client.get(f"/api/reports/{report_id}/pages/1/image")
        second_response = client.get(f"/api/reports/{report_id}/pages/2/image")

        assert first_response.status_code == 200
        assert second_response.status_code == 200
        assert first_response.content != second_response.content
        assert Image.open(io.BytesIO(first_response.content)).size == _expected_size(pdf_bytes, 0)
        assert Image.open(io.BytesIO(second_response.content)).size == _expected_size(pdf_bytes, 1)
    finally:
        client.delete(f"/api/reports/{report_id}")


def test_page_zero_is_rejected():
    pdf_bytes = _pdf_bytes(lambda page: page.insert_text((72, 100), "Digital source text"))
    report_id = _upload_pdf(pdf_bytes)

    try:
        response = client.get(f"/api/reports/{report_id}/pages/0/image")
        assert response.status_code == 400
    finally:
        client.delete(f"/api/reports/{report_id}")


def test_out_of_range_page_is_rejected():
    pdf_bytes = _pdf_bytes(lambda page: page.insert_text((72, 100), "Digital source text"))
    report_id = _upload_pdf(pdf_bytes)

    try:
        response = client.get(f"/api/reports/{report_id}/pages/2/image")
        assert response.status_code == 404
    finally:
        client.delete(f"/api/reports/{report_id}")


def test_missing_report_is_rejected():
    response = client.get(f"/api/reports/{'0' * 32}/pages/1/image")
    assert response.status_code in (404, 422)


def test_non_pdf_report_is_rejected():
    png_path = Path(__file__).parent / "fixtures" / "phase8_1_accuracy" / "cbc_report.png"
    response = client.post(
        "/api/reports",
        data={"consent": "true"},
        files={"file": ("cbc_report.png", io.BytesIO(png_path.read_bytes()), "image/png")},
    )
    assert response.status_code == 201
    report_id = response.json()["id"]

    try:
        response = client.get(f"/api/reports/{report_id}/pages/1/image")
        assert response.status_code == 400
    finally:
        client.delete(f"/api/reports/{report_id}")


def test_scanned_pdf_page_still_renders():
    scanned_pdf = Path(__file__).parent / "fixtures" / "phase8_1_accuracy" / "scanned_cbc_report.pdf"
    report_id = _upload_pdf(scanned_pdf.read_bytes(), "scanned_cbc_report.pdf")

    try:
        response = client.get(f"/api/reports/{report_id}/pages/1/image")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        image = Image.open(io.BytesIO(response.content))
        assert image.size == (2500, 1000)
    finally:
        client.delete(f"/api/reports/{report_id}")
