import sqlite3
from contextlib import contextmanager

from app.config import settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    file_extension TEXT NOT NULL,
    media_type TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    sha256_hash TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'uploaded',
    consent_timestamp TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS extraction_jobs (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    document_type TEXT,
    total_pages INTEGER NOT NULL DEFAULT 0,
    processed_pages INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    error_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS page_extractions (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    extraction_method TEXT NOT NULL,
    raw_text TEXT,
    extraction_metadata TEXT,
    page_width REAL,
    page_height REAL,
    text_detection_metadata TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_report ON extraction_jobs(report_id);
CREATE INDEX IF NOT EXISTS idx_page_extractions_report ON page_extractions(report_id);

CREATE TABLE IF NOT EXISTS report_measurements (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    test_name_original TEXT NOT NULL,
    test_name_normalized TEXT NOT NULL,
    test_code TEXT,
    result_original TEXT NOT NULL,
    result_numeric REAL,
    result_qualifier TEXT,
    unit_original TEXT,
    unit_normalized TEXT,
    reference_range_original TEXT,
    reference_low REAL,
    reference_high REAL,
    reference_unit TEXT,
    reference_context TEXT,
    lab_flag TEXT,
    derived_flag TEXT,
    sample_date TEXT,
    specimen_type TEXT,
    page_number INTEGER NOT NULL,
    source_text TEXT,
    source_bbox TEXT,
    extraction_method TEXT NOT NULL,
    ocr_confidence REAL,
    verification_status TEXT NOT NULL DEFAULT 'extracted',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS measurement_corrections (
    id TEXT PRIMARY KEY,
    measurement_id TEXT NOT NULL,
    original_payload TEXT NOT NULL,
    corrected_payload TEXT NOT NULL,
    correction_timestamp TEXT NOT NULL,
    correction_reason TEXT,
    FOREIGN KEY (measurement_id) REFERENCES report_measurements(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_report_measurements_report ON report_measurements(report_id);
CREATE INDEX IF NOT EXISTS idx_measurement_corrections_measurement ON measurement_corrections(measurement_id);

CREATE TABLE IF NOT EXISTS analysis_runs (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    engine_version TEXT NOT NULL,
    rule_set_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    started_at TEXT NOT NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    summary TEXT,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS measurement_assessments (
    id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL,
    measurement_id TEXT NOT NULL,
    comparison_status TEXT NOT NULL,
    assessment_metadata TEXT,
    limitations TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (analysis_id) REFERENCES analysis_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (measurement_id) REFERENCES report_measurements(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pattern_findings (
    id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    finding_code TEXT NOT NULL,
    evidence_measurement_ids TEXT NOT NULL,
    evidence_reference_ids TEXT,
    finding_metadata TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (analysis_id) REFERENCES analysis_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_report ON analysis_runs(report_id);
CREATE INDEX IF NOT EXISTS idx_measurement_assessments_analysis ON measurement_assessments(analysis_id);
CREATE INDEX IF NOT EXISTS idx_pattern_findings_analysis ON pattern_findings(analysis_id);
"""


def init_db() -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(settings.db_path))
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.executescript(SCHEMA)
        # additive migrations for Phase 4 analysis tables
        existing = {row[1] for row in conn.execute("PRAGMA table_info(analysis_runs)").fetchall()}
        if "summary" not in existing:
            conn.execute("ALTER TABLE analysis_runs ADD COLUMN summary TEXT")
        conn.commit()
    finally:
        conn.close()


@contextmanager
def get_connection():
    conn = sqlite3.connect(str(settings.db_path))
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys=ON;")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
