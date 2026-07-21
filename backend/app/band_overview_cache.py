"""Disk cache for band overview payloads."""
from __future__ import annotations

import json
from pathlib import Path

from app.paths import DATA_DIR

CACHE_DIR = DATA_DIR / "overview_cache"
OVERVIEW_CACHE_VERSION = 9


def _cache_path(band_id: int, orientation: str) -> Path:
    from app.gallery import normalize_card_orientation

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ori = normalize_card_orientation(orientation)
    return CACHE_DIR / f"{band_id}_{ori}.json"


def cache_fingerprint(
    *,
    library_scanned_at: str | None,
    metadata_refreshed_at: str | None,
    lineup_imported_at: str | None,
    gallery_mtime: float,
    audio_mtime: float,
    video_mtime: float = 0.0,
    library_mtime: float = 0.0,
) -> str:
    return "|".join(
        [
            str(OVERVIEW_CACHE_VERSION),
            library_scanned_at or "",
            metadata_refreshed_at or "",
            lineup_imported_at or "",
            f"{gallery_mtime:.0f}",
            f"{audio_mtime:.0f}",
            f"{video_mtime:.0f}",
            f"{library_mtime:.0f}",
        ]
    )


def load_cached_overview(
    band_id: int,
    orientation: str,
    *,
    fingerprint: str,
) -> dict | None:
    path = _cache_path(band_id, orientation)
    if not path.is_file():
        return None
    try:
        wrapper = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if wrapper.get("fingerprint") != fingerprint:
        return None
    payload = wrapper.get("data")
    return payload if isinstance(payload, dict) else None


def save_cached_overview(
    band_id: int,
    orientation: str,
    *,
    fingerprint: str,
    data: dict,
) -> None:
    path = _cache_path(band_id, orientation)
    try:
        path.write_text(
            json.dumps({"fingerprint": fingerprint, "data": data}, ensure_ascii=False),
            encoding="utf-8",
        )
    except OSError:
        pass


def invalidate_overview_cache(band_id: int) -> None:
    if not CACHE_DIR.is_dir():
        return
    for path in CACHE_DIR.glob(f"{band_id}_*.json"):
        try:
            path.unlink()
        except OSError:
            pass
