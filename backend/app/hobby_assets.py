"""Resolve HobbyStack preset art from assets/hobbies/."""
from __future__ import annotations

import re
from pathlib import Path

from app.paths import PROJECT_ROOT

HOBBIES_DIR = PROJECT_ROOT / "assets" / "hobbies"
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".svg")
# No default image — media/hobbies.svg is rounded and looks wrong as a tile cover.


def _norm(stem: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (stem or "").casefold()).strip("-")


def _kind(stem: str) -> str:
    cf = stem.casefold().strip()
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


def _find(preset: str, kind: str) -> Path | None:
    if not HOBBIES_DIR.is_dir() or not preset.strip():
        return None
    want = _norm(preset)
    # Also accept label-like stems (e.g. "fillable-album", "fillable album")
    aliases = {want, _norm(preset.replace("_", " ")), _norm(preset.replace("_", "-"))}
    try:
        for f in HOBBIES_DIR.iterdir():
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            if _kind(f.stem) != kind:
                continue
            base = _base_name(f.stem) if kind != "cover" else f.stem
            if _norm(base) in aliases or base.casefold() == preset.casefold():
                return f
    except OSError:
        return None
    return None


def hobby_preset_urls(preset: str) -> dict[str, str | None]:
    """Return cover / logo / icon URLs for a hobby preset id."""
    key = (preset or "").strip()
    cover = _find(key, "cover")
    logo = _find(key, "logo")
    icon = _find(key, "icon")
    return {
        "cover_url": (
            f"/api/assets/hobbies/{cover.name}" if cover else None
        ),
        "logo_url": (
            f"/api/assets/hobbies/{logo.name}" if logo else None
        ),
        "icon_url": (
            f"/api/assets/hobbies/{icon.name}" if icon else None
        ),
    }
