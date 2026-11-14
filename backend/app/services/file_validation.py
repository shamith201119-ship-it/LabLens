import hashlib
import io
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image
from pypdf import PdfReader

from app.config import settings


ALLOWED_EXTENSIONS = set(settings.allowed_extensions)
MAGIC_SIGNATURES = {
    b"%PDF": "pdf",
    b"\x89PNG\r\n\x1a\n": "png",
    b"\xff\xd8\xff": "jpg",
}


def _extension_from_filename(filename: str) -> str:
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower().strip()


def _read_limited(file: UploadFile, max_bytes: int) -> bytes:
    chunks = []
    total = 0
    while True:
        chunk = file.file.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail="File exceeds the 20 MB limit.")
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise HTTPException(status_code=400, detail="Empty file is not allowed.")
    return data


def _detect_type_from_bytes(data: bytes) -> str:
    for sig, ext in MAGIC_SIGNATURES.items():
        if data.startswith(sig):
            if ext == "jpg":
                return "jpeg"
            return ext
    # JPEG check broader
    if data[:2] == b"\xff\xd8":
        return "jpeg"
    return ""


def validate_upload(file: UploadFile, consent: bool) -> tuple[bytes, str, str]:
    if not consent:
        raise HTTPException(status_code=400, detail="Explicit storage consent is required.")

    filename = file.filename or "upload"
    ext = _extension_from_filename(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file extension.")

    # weak content-type signal
    content_type = (file.content_type or "").lower()
    if content_type and content_type not in settings.allowed_mime_types:
        # allow generic binary as weak signal but still require magic match later
        pass

    data = _read_limited(file, settings.max_file_size_bytes)

    # extension vs bytes
    detected = _detect_type_from_bytes(data)
    # normalize ext for jpeg/jpg
    normalized_ext = "jpeg" if ext == "jpg" else ext
    if detected and detected != normalized_ext:
        raise HTTPException(
            status_code=400,
            detail="File content does not match its extension.",
        )

    # deeper validation
    if ext == "pdf":
        _validate_pdf(data)
    else:
        _validate_image(data, ext)

    media_type = _media_type_for_ext(ext)
    return data, ext, media_type


def _media_type_for_ext(ext: str) -> str:
    return {
        "pdf": "application/pdf",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
    }.get(ext, "application/octet-stream")


def _validate_pdf(data: bytes) -> None:
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed or unreadable PDF.")
    # check encryption
    try:
        if reader.is_encrypted:
            raise HTTPException(status_code=400, detail="Encrypted PDFs are not supported.")
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to inspect PDF.")
    # ensure at least one page
    try:
        pages = len(reader.pages)
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed PDF.")
    if pages < 1:
        raise HTTPException(status_code=400, detail="PDF has no pages.")


def _validate_image(data: bytes, ext: str) -> None:
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or corrupted image file.")
    # re-open after verify
    try:
        img2 = Image.open(io.BytesIO(data))
        img2.load()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or corrupted image file.")
    fmt = (img2.format or "").lower()
    expected = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png"}.get(ext)
    if expected and fmt != expected:
        raise HTTPException(status_code=400, detail="Image format does not match extension.")


def sha256_bytes(data: bytes) -> str:
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()
