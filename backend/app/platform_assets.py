"""Resolve Games platform art from assets/platforms/."""
from __future__ import annotations

import re
from pathlib import Path

from app.paths import PROJECT_ROOT

PLATFORMS_DIR = PROJECT_ROOT / "assets" / "platforms"
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".svg")
DEFAULT_URL = "/api/assets/platforms/default.png"


def _norm(stem: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (stem or "").casefold()).strip("-")


def _kind(stem: str) -> str:
    """Return 'logo', 'icon', 'default', or 'cover' for a file stem."""
    cf = stem.casefold().strip()
    if cf == "default":
        return "default"
    if cf.endswith(" - logo") or cf.endswith("-logo"):
        return "logo"
    if cf.endswith(" - icon") or cf.endswith("-icon"):
        return "icon"
    return "cover"


def _base_name(stem: str) -> str:
    cf = stem.casefold().strip()
    for suffix in (" - logo", "-logo", " - icon", "-icon"):
        if cf.endswith(suffix):
            return stem[: -len(suffix)].rstrip()
    return stem


def _find(platform_name: str, kind: str) -> Path | None:
    if not PLATFORMS_DIR.is_dir() or not platform_name.strip():
        return None
    want = _norm(platform_name)
    try:
        for f in PLATFORMS_DIR.iterdir():
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            if _kind(f.stem) != kind:
                continue
            base = _base_name(f.stem) if kind != "cover" else f.stem
            if _norm(base) == want or base.casefold() == platform_name.casefold():
                return f
    except OSError:
        return None
    return None


def platform_card_urls(name: str | None) -> dict[str, str | None]:
    """Return cover / logo / icon URLs for a platform folder name."""
    display = (name or "").strip()
    if not display:
        return {"cover_url": DEFAULT_URL, "logo_url": None, "icon_url": None}

    cover = _find(display, "cover")
    logo = _find(display, "logo")
    icon = _find(display, "icon")

    return {
        "cover_url": (
            f"/api/assets/platforms/{cover.name}" if cover else DEFAULT_URL
        ),
        "logo_url": (
            f"/api/assets/platforms/{logo.name}" if logo else None
        ),
        "icon_url": (
            f"/api/assets/platforms/{icon.name}" if icon else None
        ),
    }
