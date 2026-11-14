"""Pytest safety guard: force an isolated LabLens data directory for every run."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REAL_DATA_DIR = (BACKEND_DIR / "data").resolve()

# This must happen before app.config or app.database is imported by any test.
if "app.config" in sys.modules or "app.database" in sys.modules:
    raise RuntimeError(
        "LabLens pytest isolation failed: application modules were imported "
        "before backend/tests/conftest.py could configure an isolated data directory."
    )

ISOLATED_DATA_DIR = Path(tempfile.mkdtemp(prefix="lablens-pytest-")).resolve()
# Deliberately override any inherited value. A pre-existing LABLENS_DATA_DIR must
# not be able to redirect pytest at the real application database.
os.environ["LABLENS_DATA_DIR"] = str(ISOLATED_DATA_DIR)

for directory in (ISOLATED_DATA_DIR, ISOLATED_DATA_DIR / "uploads", ISOLATED_DATA_DIR / "tmp"):
    directory.mkdir(parents=True, exist_ok=True)

from app.config import settings

resolved_data_dir = settings.data_dir.resolve()
resolved_uploads_dir = settings.uploads_dir.resolve()
resolved_tmp_dir = (settings.data_dir / "tmp").resolve()
resolved_db_path = settings.db_path.resolve()

for label, path in (
    ("data_dir", resolved_data_dir),
    ("uploads_dir", resolved_uploads_dir),
    ("tmp_dir", resolved_tmp_dir),
    ("db_path", resolved_db_path),
):
    if path != ISOLATED_DATA_DIR and ISOLATED_DATA_DIR not in path.parents:
        raise RuntimeError(
            f"LabLens pytest isolation failed: {label} ({path}) is outside "
            f"the isolated directory ({ISOLATED_DATA_DIR})."
        )

if resolved_db_path == (REAL_DATA_DIR / "lablens.db").resolve():
    raise RuntimeError(
        "LabLens pytest isolation failed: pytest selected the real application database."
    )

print(f"LabLens pytest isolated data directory: {ISOLATED_DATA_DIR}")
print(f"LabLens pytest isolated database: {resolved_db_path}")

# Initialize the isolated schema once for the pytest session. Existing tests
# assume that an application database is available.
from app.database import init_db

init_db()


def pytest_report_header(config):
    return [
        f"lablens isolated data dir: {ISOLATED_DATA_DIR}",
        f"lablens isolated database: {resolved_db_path}",
    ]
