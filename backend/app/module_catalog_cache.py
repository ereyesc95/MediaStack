"""Disk cache for filesystem catalogs (Series/Movies/Books/Games).

Caches the raw ``build_*_catalog`` payload keyed by module listing signature
so folder add/delete invalidates without relying on mtime alone. DB enrichment
(genres, NSFW, music identity) still runs on every request.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

from app.media_listing_sig import module_listing_sig
from app.paths import DATA_DIR

CATALOG_CACHE_VERSION = 1


def _cache_dir() -> Path:
    d = DATA_DIR / "catalog_cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _cache_path(module: str) -> Path:
    return _cache_dir() / f"{module}.json"


def get_or_build_catalog(
    module: str,
    *,
    media_root: Path,
    builder: Callable[[], dict],
    force: bool = False,
) -> dict:
    """Return filesystem catalog for ``module``, rebuilding when listing changes."""
    mod = (module or "").strip().casefold()
    if mod not in ("series", "movies", "books", "games"):
        return builder()

    listing = module_listing_sig(media_root, mod) if media_root.is_dir() else "0:"
    path = _cache_path(mod)

    if not force and path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if (
                isinstance(raw, dict)
                and raw.get("cache_version") == CATALOG_CACHE_VERSION
                and raw.get("disk_listing") == listing
                and isinstance(raw.get("payload"), dict)
            ):
                return raw["payload"]
        except (json.JSONDecodeError, OSError, TypeError):
            pass

    payload = builder()
    try:
        path.write_text(
            json.dumps(
                {
                    "cache_version": CATALOG_CACHE_VERSION,
                    "disk_listing": listing,
                    "payload": payload,
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    except OSError:
        pass
    return payload


def invalidate_module_catalog(module: str | None = None) -> None:
    if module:
        path = _cache_path(module.strip().casefold())
        if path.is_file():
            try:
                path.unlink()
            except OSError:
                pass
        return
    try:
        for child in _cache_dir().iterdir():
            if child.suffix.casefold() == ".json":
                try:
                    child.unlink()
                except OSError:
                    pass
    except OSError:
        pass
