import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def make_pdf_bytes() -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Vitamin D (25-OH): 24 ng/mL")
    page.insert_text((72, 90), "Reference range: 30 - 100")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def make_png_bytes() -> bytes:
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (400, 120), color="white")
    d = ImageDraw.Draw(img)
    d.text((20, 20), "Vitamin D (25-OH)", fill="black")
    d.text((20, 60), "24 ng/mL", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def upload(data, name, mime):
    files = {"file": (name, io.BytesIO(data), mime)}
    return client.post("/api/reports", data={"consent": "true"}, files=files)


def test_digital_pdf_extraction():
    data = make_pdf_bytes()
    r = upload(data, "t.pdf", "application/pdf")
    assert r.status_code == 201
    rid = r.json()["id"]
    ex = client.post(f"/api/reports/{rid}/extract")
    assert ex.status_code == 200
    body = ex.json()
    assert body["status"] in ("completed", "review_required")
    assert body["total_pages"] == 1
    full = client.get(f"/api/reports/{rid}/extraction").json()
    assert full["pages"][0]["extraction_method"] == "digital"
    assert "Vitamin D" in full["pages"][0]["raw_text"]
    client.delete(f"/api/reports/{rid}")


def test_image_ocr_extraction():
    data = make_png_bytes()
    r = upload(data, "t.png", "image/png")
    assert r.status_code == 201
    rid = r.json()["id"]
    ex = client.post(f"/api/reports/{rid}/extract")
    assert ex.status_code == 200
    full = client.get(f"/api/reports/{rid}/extraction").json()
    assert full["pages"][0]["extraction_method"] == "ocr"
    assert "Vitamin D" in (full["pages"][0]["raw_text"] or "")
    client.delete(f"/api/reports/{rid}")


def test_extraction_not_found():
    r = client.post("/api/reports/00000000-0000-0000-0000-000000000000/extract")
    assert r.status_code == 404


def test_extraction_idempotent():
    data = make_pdf_bytes()
    r = upload(data, "t.pdf", "application/pdf")
    rid = r.json()["id"]
    client.post(f"/api/reports/{rid}/extract")
    r2 = client.post(f"/api/reports/{rid}/extract")
    assert r2.status_code == 200
    client.delete(f"/api/reports/{rid}")
