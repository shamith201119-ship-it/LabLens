import io
import json
import os
import time
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "phase8_1_accuracy")

def run_benchmarks():
    results = {}
    print("\n================ RUNNING BASELINE ACCURACY & SPEED BENCHMARKS ================")
    
    # 1. Clean Digital PDF
    pdf1_path = os.path.join(FIXTURE_DIR, "clean_digital_report.pdf")
    gt1_path = os.path.join(FIXTURE_DIR, "clean_digital_report.json")
    with open(pdf1_path, "rb") as f, open(gt1_path) as gf:
        pdf1_data = f.read()
        gt1 = json.load(gf)

    t0 = time.perf_counter()
    r = client.post("/api/reports", data={"consent": "true"}, files={"file": ("clean_digital.pdf", io.BytesIO(pdf1_data), "application/pdf")})
    t_upload = time.perf_counter() - t0
    assert r.status_code == 201, f"Upload failed: {r.text}"
    rid1 = r.json()["id"]

    t0 = time.perf_counter()
    ex1 = client.post(f"/api/reports/{rid1}/extract")
    t_extract1 = time.perf_counter() - t0
    assert ex1.status_code == 200, f"Extract failed: {ex1.text}"

    t0 = time.perf_counter()
    st1 = client.post(f"/api/reports/{rid1}/structure")
    t_struct1 = time.perf_counter() - t0
    assert st1.status_code == 200, f"Structure failed: {st1.text}"

    ms1 = client.get(f"/api/reports/{rid1}/measurements").json().get("measurements", [])
    client.delete(f"/api/reports/{rid1}")

    results["clean_digital_pdf"] = {
        "upload_sec": round(t_upload, 4),
        "extract_sec": round(t_extract1, 4),
        "structure_sec": round(t_struct1, 4),
        "expected_count": len(gt1),
        "extracted_count": len(ms1),
        "measurements": [{"test": m["test_name_normalized"], "value": m["result_original"], "unit": m["unit_original"], "range": m["reference_range_original"], "flag": m["derived_flag"]} for m in ms1]
    }
    print(f"Digital PDF: upload={t_upload:.4f}s, extract={t_extract1:.4f}s, struct={t_struct1:.4f}s. Extracted {len(ms1)}/{len(gt1)}")

    # 2. PNG Image Report (OCR)
    png_path = os.path.join(FIXTURE_DIR, "cbc_report.png")
    gt2_path = os.path.join(FIXTURE_DIR, "cbc_report.json")
    with open(png_path, "rb") as f, open(gt2_path) as gf:
        png_data = f.read()
        gt2 = json.load(gf)

    t0 = time.perf_counter()
    r2 = client.post("/api/reports", data={"consent": "true"}, files={"file": ("cbc.png", io.BytesIO(png_data), "image/png")})
    t_upload2 = time.perf_counter() - t0
    assert r2.status_code == 201, f"Upload failed: {r2.text}"
    rid2 = r2.json()["id"]

    t0 = time.perf_counter()
    ex2 = client.post(f"/api/reports/{rid2}/extract")
    t_extract2 = time.perf_counter() - t0
    assert ex2.status_code == 200, f"Extract failed: {ex2.text}"

    t0 = time.perf_counter()
    st2 = client.post(f"/api/reports/{rid2}/structure")
    t_struct2 = time.perf_counter() - t0
    assert st2.status_code == 200, f"Structure failed: {st2.text}"

    ms2 = client.get(f"/api/reports/{rid2}/measurements").json().get("measurements", [])
    client.delete(f"/api/reports/{rid2}")

    results["cbc_png_ocr"] = {
        "upload_sec": round(t_upload2, 4),
        "extract_sec": round(t_extract2, 4),
        "structure_sec": round(t_struct2, 4),
        "expected_count": len(gt2),
        "extracted_count": len(ms2),
        "measurements": [{"test": m["test_name_normalized"], "value": m["result_original"], "unit": m["unit_original"], "range": m["reference_range_original"], "flag": m["derived_flag"]} for m in ms2]
    }
    print(f"PNG OCR: upload={t_upload2:.4f}s, extract={t_extract2:.4f}s, struct={t_struct2:.4f}s. Extracted {len(ms2)}/{len(gt2)}")

    # 3. KeyValue PDF
    pdf3_path = os.path.join(FIXTURE_DIR, "keyvalue_report.pdf")
    gt3_path = os.path.join(FIXTURE_DIR, "keyvalue_report.json")
    with open(pdf3_path, "rb") as f, open(gt3_path) as gf:
        pdf3_data = f.read()
        gt3 = json.load(gf)

    t0 = time.perf_counter()
    r3 = client.post("/api/reports", data={"consent": "true"}, files={"file": ("keyvalue.pdf", io.BytesIO(pdf3_data), "application/pdf")})
    t_upload3 = time.perf_counter() - t0
    rid3 = r3.json()["id"]
    t0 = time.perf_counter()
    ex3 = client.post(f"/api/reports/{rid3}/extract")
    t_extract3 = time.perf_counter() - t0
    t0 = time.perf_counter()
    st3 = client.post(f"/api/reports/{rid3}/structure")
    t_struct3 = time.perf_counter() - t0
    ms3 = client.get(f"/api/reports/{rid3}/measurements").json().get("measurements", [])
    client.delete(f"/api/reports/{rid3}")

    results["keyvalue_pdf"] = {
        "upload_sec": round(t_upload3, 4),
        "extract_sec": round(t_extract3, 4),
        "structure_sec": round(t_struct3, 4),
        "expected_count": len(gt3),
        "extracted_count": len(ms3),
        "measurements": [{"test": m["test_name_normalized"], "value": m["result_original"], "unit": m["unit_original"], "range": m["reference_range_original"], "flag": m["derived_flag"]} for m in ms3]
    }
    print(f"KeyValue PDF: upload={t_upload3:.4f}s, extract={t_extract3:.4f}s, struct={t_struct3:.4f}s. Extracted {len(ms3)}/{len(gt3)}")

    # Save to artifacts/phase-8.1/BASELINE_BENCHMARK.json
    out_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "artifacts", "phase-8.1", "BASELINE_BENCHMARK.json"))
    with open(out_path, "w") as out:
        json.dump(results, out, indent=2)
    print("Saved baseline results to:", out_path)

if __name__ == "__main__":
    run_benchmarks()
