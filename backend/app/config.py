from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # Coupa OAuth credentials — never exposed to the browser
    coupa_client_id: str = ""
    coupa_client_secret: str = ""
    coupa_api_url: str = ""
    coupa_scope: str = "core.approval.chains.read core.approval.chains.write"

    # File-based JSON storage directory (swap for DB_URL later)
    data_dir: Path = Path("./data")

    # CORS: frontend dev server origins
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:4173",
    ]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
