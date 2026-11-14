import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Optional

import uuid

from fastapi import HTTPException, UploadFile

from app.config import settings
from app.database import get_connection
from app.schemas.report import ReportResponse
from app.services.file_validation import sha256_bytes, validate_upload
from app.services.report_storage import delete_file, resolve_path, save_file


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_response(row) -> ReportResponse:
    return ReportResponse(
        id=row["id"],
        original_filename=row["original_filename"],
        file_extension=row["file_extension"],
        media_type=row["media_type"],
        file_size_bytes=row["file_size_bytes"],
        sha256_hash=row["sha256_hash"],
        status=row["status"],
        consent_timestamp=row["consent_timestamp"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def create_report(file: UploadFile, consent: bool, consent_timestamp: Optional[str]) -> ReportResponse:
    data, ext, media_type = validate_upload(file, consent)
    digest = sha256_bytes(data)
    try:
        storage_key, _ = save_file(data, ext)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to store file.")

    report_id = str(uuid.uuid4())
    now = _now()
    ct = consent_timestamp or now

    try:
        with get_connection() as conn:
            conn.execute(
                """INSERT INTO reports
                (id, original_filename, file_extension, media_type, file_size_bytes,
                 sha256_hash, storage_key, status, consent_timestamp, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    report_id,
                    file.filename or "upload",
                    ext,
                    media_type,
                    len(data),
                    digest,
                    storage_key,
                    "uploaded",
                    ct,
                    now,
                    now,
                ),
            )
    except Exception as e:
        try:
            delete_file(storage_key, ext)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to store report metadata.")

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    return _row_to_response(row)


def list_reports() -> list[ReportResponse]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM reports ORDER BY created_at DESC").fetchall()
    return [_row_to_response(r) for r in rows]


def get_report(report_id: str) -> ReportResponse:
    _validate_id(report_id)
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found.")
    return _row_to_response(row)


def download_report(report_id: str) -> tuple[str, str, object]:
    _validate_id(report_id)
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found.")
    path = resolve_path(row["storage_key"], row["file_extension"])
    return row["original_filename"], row["media_type"], path


def delete_report(report_id: str) -> None:
    _validate_id(report_id)
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Report not found.")
        storage_key = row["storage_key"]
        ext = row["file_extension"]
        conn.execute("DELETE FROM reports WHERE id = ?", (report_id,))
    # remove file after db delete
    delete_file(storage_key, ext)


def delete_all() -> int:
    with get_connection() as conn:
        rows = conn.execute("SELECT storage_key, file_extension FROM reports").fetchall()
        conn.execute("DELETE FROM reports")
    count = 0
    for r in rows:
        try:
            delete_file(r["storage_key"], r["file_extension"])
            count += 1
        except Exception:
            pass
    return count


def _validate_id(report_id: str) -> None:
    try:
        uuid.UUID(report_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid report ID.")
