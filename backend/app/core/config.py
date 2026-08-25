from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    """Application settings loaded from environment / .env files."""

    model_config = SettingsConfigDict(
        env_file=(
            str(REPO_ROOT / ".env"),
            str(BACKEND_DIR / ".env"),
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = (
        "postgresql+psycopg://face_auth:change_me_local_only@localhost:5433/face_auth"
    )

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    # Provisional Week 1 value from schema docs — verify against real SFace output
    # before treating this as production-final.
    face_embedding_dimensions: int = 128


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
