import io
import json
import os
import tempfile
import time
import uuid

import cv2
from datetime import datetime, timezone

import fitz
from fastapi import HTTPException

from app.config import settings
from app.database import get_connection
from app.services import ocr_runtime
from app.services.ocr_engine import ocr_image
from app.services.report_service import download_report, get_report
from app.services.image_processor import (
    assess_quality,
    assemble_ocr_lines,
    preprocess_for_ocr,
    read_image,
    save_temp_image,
)
from app.services.pdf_processor import (
    classify_page,
    extract_digital_page,
    page_count,
    render_page_to_image,
)
from app.services.report_storage import resolve_path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_job(report_id: str):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM extraction_jobs WHERE report_id = ? ORDER BY created_at DESC LIMIT 1",
            (report_id,),
        ).fetchone()
    return row


def create_job(report_id: str) -> str:
    job_id = str(uuid.uuid4())
    now = _now()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO extraction_jobs
            (id, report_id, status, total_pages, processed_pages, created_at, updated_at)
            VALUES (?, ?, 'queued', 0, 0, ?, ?)""",
            (job_id, report_id, now, now),
        )
    return job_id


def _update_job(job_id: str, **fields):
    sets = ", ".join(f"{k} = ?" for k in fields)
    vals = list(fields.values()) + [job_id]
    with get_connection() as conn:
        conn.execute(f"UPDATE extraction_jobs SET {sets}, updated_at = ? WHERE id = ?", vals[:-1] + [_now(), job_id])


def extract_report(report_id: str) -> dict:
    # verify report exists
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if not row:
        raise ValueError("Report not found")

    existing = get_job(report_id)
    if existing and existing["status"] in ("completed", "review_required"):
        return {
            "job_id": existing["id"],
            "report_id": report_id,
            "status": existing["status"],
            "total_pages": existing["total_pages"],
            "processed_pages": existing["processed_pages"],
            "warnings": [],
        }
    # remove previous failed/partial pages for a fresh run
    with get_connection() as conn:
        conn.execute("DELETE FROM page_extractions WHERE report_id = ?", (report_id,))
        conn.execute("DELETE FROM extraction_jobs WHERE report_id = ?", (report_id,))
    job_id = create_job(report_id)
    _update_job(job_id, status="processing", started_at=_now())

    ext = row["file_extension"]
    storage_key = row["storage_key"]
    path = resolve_path(storage_key, ext)

    pages_total = 0
    processed = 0
    warnings = []

    tmp_parent = settings.data_dir / "tmp"
    tmp_parent.mkdir(parents=True, exist_ok=True)
    tmpdir = tempfile.mkdtemp(dir=str(tmp_parent))

    try:
        if ext == "pdf":
            doc = fitz.open(str(path))
            pages_total = doc.page_count
            _update_job(job_id, total_pages=pages_total)

            for i in range(pages_total):
                page = doc[i]
                ptype = classify_page(page)
                if ptype == "digital":
                    pdata = extract_digital_page(page)
                    method = "digital"
                    raw_text = pdata["raw_text"]
                    meta = {
                        "words": pdata["words"],
                        "width": pdata["width"],
                        "height": pdata["height"],
                        "ocr_runtime": ocr_runtime.digital_execution_metadata(),
                    }
                    q_warnings = []
                    if len(raw_text.strip()) < 40:
                        q_warnings.append("Sparse text detected; page may need OCR.")
                else:
                    # render and OCR
                    img_bytes = render_page_to_image(page, dpi=200)
                    img_path = os.path.join(tmpdir, f"page_{i}.png")
                    with open(img_path, "wb") as f:
                        f.write(img_bytes)
                    quality = assess_quality(__import__("cv2").imread(img_path))
                    items = ocr_image(img_path)
                    ocr_exec = ocr_runtime.get_last_execution()
                    raw_text = assemble_ocr_lines(items)
                    meta = {"ocr_items": items, "quality": quality, "ocr_runtime": ocr_exec}
                    method = "ocr"
                    q_warnings = []
                    if quality.get("possibly_blurry"):
                        q_warnings.append("Page appears blurry; OCR may be inaccurate.")
                    if quality.get("low_resolution"):
                        q_warnings.append("Low resolution; consider a higher-quality scan.")
                    if len(items) == 0:
                        q_warnings.append("No text detected on this page.")
                warnings.extend(q_warnings)

                page_id = str(uuid.uuid4())
                with get_connection() as conn:
                    conn.execute(
                        """INSERT INTO page_extractions
                        (id, report_id, page_number, extraction_method, raw_text,
                         extraction_metadata, page_width, page_height, text_detection_metadata, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            page_id,
                            report_id,
                            i + 1,
                            method,
                            raw_text,
                            json.dumps(meta),
                            meta.get("width") if isinstance(meta, dict) else None,
                            meta.get("height") if isinstance(meta, dict) else None,
                            json.dumps({"warnings": q_warnings}),
                            _now(),
                        ),
                    )
                processed += 1
                _update_job(job_id, processed_pages=processed)

            doc.close()
        else:
            # image upload
            pages_total = 1
            _update_job(job_id, total_pages=1)
            img = read_image if False else None
            import cv2

            image = cv2.imread(str(path))
            quality = assess_quality(image)

            # High-efficiency, low-latency OCR pipeline
            # Pass 1: Original image directly
            best_items = ocr_image(str(path))
            best_execution = ocr_runtime.get_last_execution()
            best_variant = "original"
            variants_tried = ["original"]

            # Only fallback if no text detected and image has poor contrast
            if len(best_items) == 0 and quality.get("low_contrast"):
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                enhanced = clahe.apply(gray)
                enh_path = os.path.join(tmpdir, "variant_enhanced.png")
                cv2.imwrite(enh_path, enhanced)
                items_enh = ocr_image(enh_path)
                variants_tried.append("contrast_enhanced")
                if len(items_enh) > 0:
                    best_items = items_enh
                    best_execution = ocr_runtime.get_last_execution()
                    best_variant = "contrast_enhanced"

            raw_text = assemble_ocr_lines(best_items)
            meta = {"ocr_items": best_items, "quality": quality, "variant": best_variant, "variants_tried": variants_tried, "ocr_runtime": best_execution}
            q_warnings = []
            if quality.get("possibly_blurry"):
                q_warnings.append("Image appears blurry; OCR may be inaccurate.")
            if quality.get("low_resolution"):
                q_warnings.append("Low resolution; consider a higher-quality photo.")
            if len(best_items) == 0:
                q_warnings.append("No text detected.")
            warnings.extend(q_warnings)

            page_id = str(uuid.uuid4())
            with get_connection() as conn:
                conn.execute(
                    """INSERT INTO page_extractions
                    (id, report_id, page_number, extraction_method, raw_text,
                     extraction_metadata, page_width, page_height, text_detection_metadata, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        page_id,
                        report_id,
                        1,
                        "ocr",
                        raw_text,
                        json.dumps(meta),
                        quality["width"],
                        quality["height"],
                        json.dumps({"warnings": q_warnings}),
                        _now(),
                    ),
                )
            processed = 1
            _update_job(job_id, processed_pages=1)

        status = "completed" if not warnings else "review_required"
        _update_job(job_id, status=status, completed_at=_now())
    except Exception as e:
        _update_job(job_id, status="failed", error_code=str(e)[:200], completed_at=_now())
        raise
    finally:
        # cleanup tmp
        for root_, _, files in os.walk(tmpdir, topdown=False):
            for f in files:
                try:
                    os.remove(os.path.join(root_, f))
                except OSError:
                    pass
        try:
            os.rmdir(tmpdir)
        except OSError:
            pass

    return {
        "job_id": job_id,
        "report_id": report_id,
        "status": status,
        "total_pages": pages_total if pages_total else 1,
        "processed_pages": processed,
        "warnings": warnings,
    }


def get_extraction(report_id: str) -> dict:
    with get_connection() as conn:
        job = conn.execute(
            "SELECT * FROM extraction_jobs WHERE report_id = ? ORDER BY created_at DESC LIMIT 1",
            (report_id,),
        ).fetchone()
        pages = conn.execute(
            "SELECT * FROM page_extractions WHERE report_id = ? ORDER BY page_number",
            (report_id,),
        ).fetchall()
    if not job:
        return {"status": "not_started", "pages": []}
    return {
        "job_id": job["id"],
        "report_id": report_id,
        "status": job["status"],
        "document_type": job["document_type"],
        "total_pages": job["total_pages"],
        "processed_pages": job["processed_pages"],
        "started_at": job["started_at"],
        "completed_at": job["completed_at"],
        "error_code": job["error_code"],
        "pages": [
            {
                "page_number": p["page_number"],
                "extraction_method": p["extraction_method"],
                "raw_text": p["raw_text"],
                "metadata": json.loads(p["extraction_metadata"]) if p["extraction_metadata"] else None,
                "page_width": p["page_width"],
                "page_height": p["page_height"],
                "warnings": json.loads(p["text_detection_metadata"]).get("warnings", []) if p["text_detection_metadata"] else [],
            }
            for p in pages
        ],
    }


def get_page_image(report_id: str, page_number: int) -> bytes:
    report = get_report(report_id)
    if report.file_extension.lower() != "pdf":
        raise HTTPException(status_code=400, detail="Page images are only available for PDF reports.")
    if page_number < 1:
        raise HTTPException(status_code=400, detail="Page number must be 1 or greater.")

    _, _, path = download_report(report_id)
    try:
        doc = fitz.open(str(path))
    except Exception:
        raise HTTPException(status_code=500, detail="Could not open stored PDF.")

    try:
        if page_number > doc.page_count:
            raise HTTPException(status_code=404, detail="Page not found.")
        return render_page_to_image(doc[page_number - 1], dpi=200)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not render PDF page.")
    finally:
        doc.close()
