import os
import uuid
from pathlib import Path

from fastapi import HTTPException

from app.config import settings


def _safe_storage_path(storage_key: str, extension: str) -> Path:
    # storage_key is a UUID string; never trust user input
    if not storage_key or "/" in storage_key or "\\" in storage_key or ".." in storage_key:
        raise HTTPException(status_code=400, detail="Invalid storage key.")
    name = f"{storage_key}.{extension}"
    path = settings.uploads_dir / name
    # ensure within uploads_dir
    try:
        path.resolve().relative_to(settings.uploads_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid storage path.")
    return path


def save_file(data: bytes, extension: str) -> tuple[str, str]:
    """Save bytes to a private path. Returns (storage_key, sha256)."""
    storage_key = str(uuid.uuid4())
    target = _safe_storage_path(storage_key, extension)
    if target.exists():
        raise HTTPException(status_code=500, detail="Storage collision, retry.")
    tmp = target.with_suffix(target.suffix + ".tmp")
    try:
        with open(tmp, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, target)
    except Exception:
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass
        raise HTTPException(status_code=500, detail="Failed to store file.")
    return storage_key, target.name


def delete_file(storage_key: str, extension: str) -> None:
    path = _safe_storage_path(storage_key, extension)
    try:
        if path.exists():
            path.unlink()
    except OSError:
        raise HTTPException(status_code=500, detail="Failed to delete file.")


def resolve_path(storage_key: str, extension: str) -> Path:
    path = _safe_storage_path(storage_key, extension)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found.")
    return path
