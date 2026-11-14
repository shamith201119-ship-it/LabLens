"""Focused safety test for automatic pytest database isolation."""

from pathlib import Path

import os

from app.config import settings


def test_pytest_uses_isolated_database():
    isolated_root = Path(os.environ["LABLENS_DATA_DIR"]).resolve()

    assert settings.data_dir.resolve() == isolated_root
    assert settings.db_path.resolve().is_relative_to(isolated_root)
    assert settings.uploads_dir.resolve().is_relative_to(isolated_root)
    assert (settings.data_dir / "tmp").resolve().is_relative_to(isolated_root)

    real_database = Path(__file__).resolve().parents[1] / "data" / "lablens.db"
    assert settings.db_path.resolve() != real_database.resolve()

    from app.database import init_db

    init_db()
    assert settings.db_path.exists()
    assert settings.db_path.stat().st_size > 0
