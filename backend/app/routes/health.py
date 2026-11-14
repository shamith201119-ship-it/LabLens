from fastapi import APIRouter

from app.config import settings
from app.database import get_connection
from app.schemas.report import HealthResponse

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
def health():
    db_ok = "ok"
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1").fetchone()
    except Exception:
        db_ok = "error"
    storage_ok = "ok" if settings.uploads_dir.exists() else "error"
    status = "ok" if db_ok == "ok" and storage_ok == "ok" else "degraded"
    return HealthResponse(
        status=status,
        database=db_ok,
        storage=storage_ok,
        max_file_size_bytes=settings.max_file_size_bytes,
    )
