"""
Application settings (Debian plant deploy).

System design
-------------
Single Settings object loaded from env / .env — no scattered os.environ reads
in routes or services.

  .env / process env
        ↓
  Settings (this module)
        ↓
  auth service (threshold), main (CORS, bind), embedder (dim / model version)

Auth-related knobs live here so plant ops can tune cosine gate without code
changes. Schemas document the API; Settings own runtime policy.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    """Typed runtime config for the Face Authentication API."""

    model_config = SettingsConfigDict(
        env_file=(
            str(REPO_ROOT / ".env"),
            str(BACKEND_DIR / ".env"),
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- process / HTTP ---
    database_url: str = (
        "postgresql+psycopg://face_auth:change_me_local_only@localhost:5432/face_auth"
    )
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    # Comma-separated origins, or "*" for Week 1 harness / ngrok / Mendix kiosk.
    # Production Debian: set explicit Mendix + plant origins.
    cors_allow_origins: str = "*"

    # --- SFace / pgvector (must stay aligned with enrollments.embedding) ---
    # Verified: OpenCV Zoo SFace 2021dec outputs 128-D (Apache-2.0).
    face_embedding_dimensions: int = 128
    face_embedding_model_version: str = "sface_2021dec_opencv_zoo"

    # 1:1 cosine gate for POST /authenticate (higher = stricter).
    # OpenCV SFace common starting point (~0.363). Tune per plant after score logs.
    face_match_cosine_threshold: float = Field(
        default=0.463,
        ge=-1.0,
        le=1.0,
    )

    # 1:N duplicate gate at register / approve / kiosk enroll (higher = stricter).
    # Separate from 1:1 auth so false plant duplicates can be tuned independently.
    face_duplicate_cosine_threshold: float = Field(
        default=0.58,
        ge=-1.0,
        le=1.0,
    )

    # Hard cap for multipart `image` on /authenticate (bytes).
    # Keep in sync with schemas.auth.AuthenticateFormFields.max_image_bytes.
    auth_max_image_bytes: int = Field(default=8 * 1024 * 1024, ge=64 * 1024)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
