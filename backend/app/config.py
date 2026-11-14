import os
from pathlib import Path

from dataclasses import dataclass, field


@dataclass
class Settings:
    app_name: str = "LabLens API"
    host: str = "127.0.0.1"
    port: int = 8000
    data_dir: Path = field(default_factory=lambda: Path(
        os.getenv("LABLENS_DATA_DIR", str(Path(__file__).resolve().parents[1] / "data"))
    ))
    max_file_size_bytes: int = 20 * 1024 * 1024
    allowed_extensions: tuple = ("pdf", "jpg", "jpeg", "png")
    allowed_mime_types: tuple = ("application/pdf", "image/jpeg", "image/png")

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "lablens.db"


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.uploads_dir.mkdir(parents=True, exist_ok=True)
