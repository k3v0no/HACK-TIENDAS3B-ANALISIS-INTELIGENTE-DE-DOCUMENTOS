"""Configuración del backend, leída de variables de entorno o de back/.env."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    api_key: str = ""
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    data_dir: Path = BASE_DIR / "data"
    # Vacía = SQLite en data/expedientes.db. Ejemplo: postgresql+psycopg://usuario:clave@host/base
    database_url: str = ""

    deepseek_api_key: str = ""
    llm_model: str = "deepseek-chat"
    llm_base_url: str = ""

    ocr_device: str = "gpu"
    ocr_dpi: int = 200
    ocr_lang: str = "es"
    ocr_unwarp: bool = True

    max_pdf_mb: int = 100

    # Fecha contra la que se evalúan vigencias (AAAA-MM-DD). Vacía = hoy.
    fecha_referencia: str = ""
    llm_concurrencia: int = 4

    @property
    def origenes(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def dir_expedientes(self) -> Path:
        return self.data_dir / "expedientes"

    @property
    def dir_ocr(self) -> Path:
        return self.data_dir / "ocr_cache"


settings = Settings()
