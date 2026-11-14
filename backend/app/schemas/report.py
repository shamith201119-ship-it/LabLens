from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ReportResponse(BaseModel):
    id: str
    original_filename: str
    file_extension: str
    media_type: str
    file_size_bytes: int
    sha256_hash: str
    status: str
    consent_timestamp: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ReportListResponse(BaseModel):
    reports: list[ReportResponse]
    total: int


class HealthResponse(BaseModel):
    status: str
    database: str
    storage: str
    max_file_size_bytes: int
