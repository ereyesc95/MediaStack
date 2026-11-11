"""Persist per-machine settings (media root, URLs, admin passwords)."""
from __future__ import annotations

import json
from pathlib import Path

from app.paths import DATA_DIR

SETTINGS_FILE = DATA_DIR / "user_settings.json"

DEFAULT_MEMBER_PHOTO_REFRESH_DAYS = 730


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


def _set_str(key: str, value: str) -> str:
    data = load_user_settings()
    cleaned = (value or "").strip()
    if cleaned:
        data[key] = cleaned
    else:
        data.pop(key, None)
    save_user_settings(data)
    return cleaned


def get_saved_media_root() -> str:
    return (load_user_settings().get("media_root") or "").strip()


def _normalize_path(path: str) -> str:
    """Absolute path; keep UNC form on Windows."""
    raw = (path or "").strip()
    p = Path(raw).expanduser()
    try:
        text = str(p)
        if text.startswith("\\\\") or text.startswith("//"):
            return str(p)
        return str(p.resolve())
    except OSError:
        return str(p)


def save_media_root(path: str) -> str:
    resolved = _normalize_path(path)
    data = load_user_settings()
    data["media_root"] = resolved
    save_user_settings(data)
    return resolved


def is_valid_media_root(path: str | None) -> bool:
    if not path or not str(path).strip():
        return False
    root = Path(path).expanduser()
    try:
        return root.is_dir()
    except OSError:
        return False


def suggested_library_parent() -> str:
    docs = Path.home() / "Documents"
    try:
        if docs.is_dir():
            return str(docs)
    except OSError:
        pass
    return str(Path.home())


def create_media_library(parent: str) -> str:
    """Create ``{parent}/Media`` (or reuse) and ensure the 8 module roots."""
    parent_path = Path(parent).expanduser()
    try:
        if not parent_path.is_dir():
            raise ValueError("Parent folder does not exist or is not accessible")
    except OSError as exc:
        raise ValueError(f"Parent folder is not accessible: {exc}") from exc

    media = parent_path / "Media"
    try:
        media.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ValueError(f"Could not create Media folder: {exc}") from exc

    resolved = _normalize_path(str(media))
    save_media_root(resolved)

    from app.config import settings

    settings.media_root = resolved

    from app.folder_icons import ensure_media_module_roots

    ensure_media_module_roots(force_ini=True)
    return resolved


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


def get_saved_public_url() -> str:
    return (load_user_settings().get("public_url") or "").strip()


def save_public_url(url: str) -> str:
    return _set_str("public_url", url)


def get_saved_media_server_url() -> str:
    return (load_user_settings().get("media_server_url") or "").strip()


def save_media_server_url(url: str) -> str:
    return _set_str("media_server_url", url)


def get_saved_admin_password() -> str | None:
    value = (load_user_settings().get("admin_password") or "").strip()
    return value or None


def get_saved_admin_nsfw_password() -> str | None:
    value = (load_user_settings().get("admin_nsfw_password") or "").strip()
    return value or None


def save_admin_passwords(
    *,
    admin_password: str | None = None,
    admin_nsfw_password: str | None = None,
) -> dict:
    data = load_user_settings()
    if admin_password is not None:
        cleaned = admin_password.strip()
        if cleaned:
            data["admin_password"] = cleaned
        else:
            data.pop("admin_password", None)
    if admin_nsfw_password is not None:
        cleaned = admin_nsfw_password.strip()
        if cleaned:
            data["admin_nsfw_password"] = cleaned
        else:
            data.pop("admin_nsfw_password", None)
    save_user_settings(data)
    return {
        "admin_password_set": bool(data.get("admin_password")),
        "admin_nsfw_password_set": bool(data.get("admin_nsfw_password")),
    }


def get_saved_musicbrainz_user_agent() -> str:
    return (load_user_settings().get("musicbrainz_user_agent") or "").strip()


def save_musicbrainz_user_agent(value: str) -> str:
    return _set_str("musicbrainz_user_agent", value)


def apply_saved_media_root(settings) -> None:
    """User-picked path overrides .env when present."""
    saved = get_saved_media_root()
    if saved:
        settings.media_root = saved


def apply_saved_app_settings(settings) -> None:
    """Overlay persisted URLs / passwords / MB UA onto runtime settings."""
    apply_saved_media_root(settings)
    public = get_saved_public_url()
    if public:
        settings.public_url = public
    media_server = get_saved_media_server_url()
    if media_server:
        settings.media_server_url = media_server
    admin_pw = get_saved_admin_password()
    if admin_pw:
        settings.admin_password = admin_pw
    nsfw_pw = get_saved_admin_nsfw_password()
    if nsfw_pw:
        settings.admin_nsfw_password = nsfw_pw
    mb_ua = get_saved_musicbrainz_user_agent()
    if mb_ua:
        settings.musicbrainz_user_agent = mb_ua
