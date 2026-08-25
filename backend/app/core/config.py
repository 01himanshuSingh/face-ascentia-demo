# Placeholder — application settings (not implemented yet)
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Scaffold settings container. Values will be wired in a later task."""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
