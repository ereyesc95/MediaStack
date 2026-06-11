"""Persist per-machine settings (e.g. media library root)."""
from __future__ import annotations

import json
from pathlib import Path

from app.paths import DATA_DIR

SETTINGS_FILE = DATA_DIR / "user_settings.json"


def load_user_settings() -> dict:
    if not SETTINGS_FILE.is_file():
        return {}
    try:
        return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_user_settings(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(
        json.dumps(data, indent=2) + "\n",
        encoding="utf-8",
    )


def get_saved_media_root() -> str:
    return (load_user_settings().get("media_root") or "").strip()


def save_media_root(path: str) -> str:
    resolved = str(Path(path).expanduser().resolve())
    data = load_user_settings()
    data["media_root"] = resolved
    save_user_settings(data)
    return resolved


def is_valid_media_root(path: str | None) -> bool:
    if not path or not str(path).strip():
        return False
    root = Path(path).expanduser()
    return root.is_dir()


def apply_saved_media_root(settings) -> None:
    """User-picked path overrides .env when present."""
    saved = get_saved_media_root()
    if saved:
        settings.media_root = saved


DEFAULT_MEMBER_PHOTO_REFRESH_DAYS = 730


def get_member_photo_refresh_days() -> int:
    raw = load_user_settings().get("member_photo_refresh_days")
    try:
        days = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_MEMBER_PHOTO_REFRESH_DAYS
    return max(30, min(days, 3650))


def save_member_photo_refresh_days(days: int) -> int:
    clamped = max(30, min(int(days), 3650))
    data = load_user_settings()
    data["member_photo_refresh_days"] = clamped
    save_user_settings(data)
    return clamped
