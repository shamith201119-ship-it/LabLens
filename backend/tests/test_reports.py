import io
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def make_pdf_bytes(text: str = "hello") -> bytes:
    # Minimal valid PDF
    content = f"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 0000000058 00000000 n 
0000000058 0000000115 00000000 n 
0000000115 0000000190 00000000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
230
%%EOF
"""
    return content.encode()


def make_png_bytes() -> bytes:
    from PIL import Image

    img = Image.new("RGB", (4, 4), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def make_jpeg_bytes() -> bytes:
    from PIL import Image

    img = Image.new("RGB", (4, 4), color=(0, 255, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def clean_state():
    # delete all before each test
    client.delete("/api/reports")
    yield
    client.delete("/api/reports")


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_upload_pdf():
    data = make_pdf_bytes()
    files = {"file": ("report.pdf", io.BytesIO(data), "application/pdf")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["file_extension"] == "pdf"
    assert body["file_size_bytes"] == len(data)
    assert body["status"] == "uploaded"
    assert len(body["sha256_hash"]) == 64


def test_upload_png():
    data = make_png_bytes()
    files = {"file": ("img.png", io.BytesIO(data), "image/png")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    assert r.status_code == 201, r.text


def test_upload_jpeg():
    data = make_jpeg_bytes()
    files = {"file": ("img.jpg", io.BytesIO(data), "image/jpeg")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    assert r.status_code == 201, r.text


def test_empty_file():
    files = {"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    assert r.status_code == 400


def test_oversized():
    big = b"%PDF" + b"x" * (20 * 1024 * 1024 + 10)
    files = {"file": ("big.pdf", io.BytesIO(big), "application/pdf")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    assert r.status_code in (400, 413)


def test_wrong_extension():
    data = make_png_bytes()
    files = {"file": ("img.pdf", io.BytesIO(data), "application/pdf")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    assert r.status_code == 400


def test_mime_signature_mismatch():
    data = make_png_bytes()
    files = {"file": ("img.png", io.BytesIO(data), "text/html")}
    # content-type weak signal; magic should still allow png; extension matches
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    # content type mismatch is weak; validation passes on bytes
    assert r.status_code == 201


def test_corrupted_pdf():
    files = {"file": ("bad.pdf", io.BytesIO(b"not a pdf at all"), "application/pdf")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    assert r.status_code == 400


def test_invalid_image():
    files = {"file": ("bad.png", io.BytesIO(b"not an image"), "image/png")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    assert r.status_code == 400


def test_no_consent():
    data = make_pdf_bytes()
    files = {"file": ("report.pdf", io.BytesIO(data), "application/pdf")}
    r = client.post("/api/reports", files=files)
    assert r.status_code in (400, 422)


def test_list_and_get():
    data = make_pdf_bytes()
    files = {"file": ("report.pdf", io.BytesIO(data), "application/pdf")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    rid = r.json()["id"]
    r2 = client.get("/api/reports")
    assert r2.status_code == 200
    assert r2.json()["total"] == 1
    r3 = client.get(f"/api/reports/{rid}")
    assert r3.status_code == 200
    assert r3.json()["id"] == rid


def test_download():
    data = make_pdf_bytes()
    files = {"file": ("report.pdf", io.BytesIO(data), "application/pdf")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    rid = r.json()["id"]
    r2 = client.get(f"/api/reports/{rid}/download")
    assert r2.status_code == 200
    assert r2.content == data


def test_delete_individual():
    data = make_pdf_bytes()
    files = {"file": ("report.pdf", io.BytesIO(data), "application/pdf")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    rid = r.json()["id"]
    r2 = client.delete(f"/api/reports/{rid}")
    assert r2.status_code == 204
    r3 = client.get(f"/api/reports/{rid}")
    assert r3.status_code == 404


def test_delete_all():
    for _ in range(2):
        data = make_pdf_bytes()
        files = {"file": ("report.pdf", io.BytesIO(data), "application/pdf")}
        client.post("/api/reports", data={"consent": "true"}, files=files)
    r = client.delete("/api/reports")
    assert r.status_code == 200
    assert r.json()["deleted"] == 2
    r2 = client.get("/api/reports")
    assert r2.json()["total"] == 0


def test_malformed_id():
    r = client.get("/api/reports/not-a-uuid")
    assert r.status_code == 400


def test_path_traversal_download():
    r = client.get("/api/reports/../../etc/passwd/download")
    assert r.status_code in (400, 404, 422)


def test_duplicate_file_allowed():
    data = make_pdf_bytes()
    files = {"file": ("report.pdf", io.BytesIO(data), "application/pdf")}
    r1 = client.post("/api/reports", data={"consent": "true"}, files=files)
    files2 = {"file": ("report2.pdf", io.BytesIO(data), "application/pdf")}
    r2 = client.post("/api/reports", data={"consent": "true"}, files=files2)
    assert r1.status_code == 201
    assert r2.status_code == 201


def test_failed_storage_write_cleanup(monkeypatch):
    # simulate storage failure
    import app.services.report_service as rs
    orig = rs.save_file
    def boom(*a, **k):
        raise Exception("boom")
    monkeypatch.setattr(rs, "save_file", boom)
    data = make_pdf_bytes()
    files = {"file": ("report.pdf", io.BytesIO(data), "application/pdf")}
    r = client.post("/api/reports", data={"consent": "true"}, files=files)
    assert r.status_code == 500
    # no record created
    r2 = client.get("/api/reports")
    assert r2.json()["total"] == 0
