from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.paths import database_file, ensure_data_dir

ensure_data_dir()

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MEDIASTACK_",
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
    )
    database_url: str = f"sqlite:///{database_file()}"
    mysql_import_url: str = ""
    media_root: str = ""
    media_server_url: str = "http://127.0.0.1:8887"
    tmdb_api_key: str = ""
    musicbrainz_user_agent: str = "MediaStack/1.0 (local-dev)"
    cors_origins: list[str] = [
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    default_port: int = 8766
    admin_password: str = "mediastack"


settings = Settings()

from app.user_settings import apply_saved_media_root  # noqa: E402

apply_saved_media_root(settings)
