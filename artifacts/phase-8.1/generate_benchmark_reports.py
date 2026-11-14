import io
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
SCRIPT_DIR = Path(__file__).resolve().parent

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient

from accuracy_evaluator import (
    aggregate_fixtures,
    evaluate_fixture,
    evaluate_page_attribution,
)
from app.database import init_db
from app.main import app

client = TestClient(app)
init_db()


def run_benchmarks():
    fixtures = [
        {
            "directory": BACKEND_DIR / "tests" / "fixtures" / "phase8_1_accuracy",
            "filename": "clean_digital_report.pdf",
            "ground_truth": "clean_digital_report.json",
            "media_type": "application/pdf",
        },
        {
            "directory": BACKEND_DIR / "tests" / "fixtures" / "phase8_1_accuracy",
            "filename": "cbc_report.png",
            "ground_truth": "cbc_report.json",
            "media_type": "image/png",
        },
        {
            "directory": BACKEND_DIR / "tests" / "fixtures" / "phase8_1_accuracy",
            "filename": "keyvalue_report.pdf",
            "ground_truth": "keyvalue_report.json",
            "media_type": "application/pdf",
        },
        {
            "directory": BACKEND_DIR / "tests" / "fixtures" / "phase9_5",
            "filename": "multipage_scanned_report.pdf",
            "ground_truth": "multipage_scanned_report.json",
            "media_type": "application/pdf",
        },
        {
            "directory": BACKEND_DIR / "tests" / "fixtures" / "phase9_5",
            "filename": "digital_edge_cases.pdf",
            "ground_truth": "digital_edge_cases.json",
            "media_type": "application/pdf",
        },
        {
            "directory": BACKEND_DIR / "tests" / "fixtures" / "phase9_5",
            "filename": "photographed_report.jpg",
            "ground_truth": "photographed_report.json",
            "media_type": "image/jpeg",
        },
    ]

    perf = {}
    accuracy = {}

    for fixture in fixtures:
        filename = fixture["filename"]
        filepath = fixture["directory"] / filename
        gtpath = fixture["directory"] / fixture["ground_truth"]
        media_type = fixture["media_type"]
        with open(filepath, "rb") as f, open(gtpath, encoding="utf-8") as gf:
            file_data = f.read()
            gt = json.load(gf)

        # 1. Upload
        t0 = time.perf_counter()
        r = client.post(
            "/api/reports",
            data={"consent": "true"},
            files={"file": (filename, io.BytesIO(file_data), media_type)},
        )
        t_upload = time.perf_counter() - t0
        assert r.status_code == 201, r.text
        rid = r.json()["id"]

        # 2. Extract
        t0 = time.perf_counter()
        ex = client.post(f"/api/reports/{rid}/extract")
        t_extract = time.perf_counter() - t0
        assert ex.status_code == 200

        # 3. Structure
        t0 = time.perf_counter()
        st = client.post(f"/api/reports/{rid}/structure")
        t_struct = time.perf_counter() - t0
        assert st.status_code == 200

        # 4. Measurements
        ms = client.get(f"/api/reports/{rid}/measurements").json().get("measurements", [])
        client.delete(f"/api/reports/{rid}")

        perf[filename] = {
            "upload_seconds": round(t_upload, 4),
            "extraction_seconds": round(t_extract, 4),
            "structuring_seconds": round(t_struct, 4),
            "total_pipeline_seconds": round(t_upload + t_extract + t_struct, 4),
        }

        fixture_result = evaluate_fixture(gt, ms)
        fixture_result["page_attribution"] = evaluate_page_attribution(gt, ms)
        accuracy[filename] = fixture_result
        totals = fixture_result["field_totals"]
        pages = fixture_result["page_attribution"]
        print(
            f"{filename}: {totals['correct']}/{totals['scored']} scored fields correct, "
            f"{totals['incorrect']} incorrect, {totals['not_scored']} not scored; "
            f"pages {pages['correct']}/{pages['scored']} correct"
        )

    results = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "benchmark_type": "synthetic_fixture_engineering_benchmark",
        "disclaimer": (
            "Synthetic fixture-based engineering benchmark. Not a clinical "
            "accuracy measurement."
        ),
        "fixtures": accuracy,
        "totals": aggregate_fixtures(accuracy),
        "page_attribution_totals": {
            key: sum(
                fixture["page_attribution"][key] for fixture in accuracy.values()
            )
            for key in ("scored", "correct", "incorrect", "not_scored")
        },
    }

    (SCRIPT_DIR / "PERFORMANCE_RESULTS.json").write_text(
        json.dumps(perf, indent=2), encoding="utf-8"
    )
    (SCRIPT_DIR / "ACCURACY_RESULTS.json").write_text(
        json.dumps(results, indent=2), encoding="utf-8"
    )

    totals = results["totals"]["field_totals"]
    page_totals = results["page_attribution_totals"]
    print(
        "Benchmark completed. "
        f"All fixtures: {totals['correct']}/{totals['scored']} scored fields correct, "
        f"{totals['incorrect']} incorrect, {totals['not_scored']} not scored. "
        f"Page attribution: {page_totals['correct']}/{page_totals['scored']} correct."
    )
    print("Saved PERFORMANCE_RESULTS.json and ACCURACY_RESULTS.json.")


if __name__ == "__main__":
    run_benchmarks()
