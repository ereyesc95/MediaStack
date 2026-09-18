"""Play-history helpers: quiz exclusion, asset slugs, subgenre artwork."""
from __future__ import annotations

import re
from pathlib import Path

from app.paths import PROJECT_ROOT

QUIZ_PLAY_TITLE = "quiz"
_ASSET_SLUG_RE = re.compile(r"[^a-z0-9]+")
_ASSETS_ROOT = PROJECT_ROOT / "assets"
_IMAGE_EXTS = (".png", ".jpg", ".webp", ".jpeg")
# Prefer parent genre art, then subgenre folders (system + flat).
_GENRE_IMAGE_DIRS: tuple[tuple[Path, str], ...] = (
    (_ASSETS_ROOT / "genre", "genre"),
    (_ASSETS_ROOT / "system" / "subgenre", "subgenre"),
    (_ASSETS_ROOT / "subgenre", "subgenre"),
    (_ASSETS_ROOT / "system" / "genre", "genre"),
)


def is_quiz_play_title(title: str | None) -> bool:
    return (title or "").strip().casefold() == QUIZ_PLAY_TITLE


def asset_slug(name: str | None) -> str:
    slug = _ASSET_SLUG_RE.sub("-", (name or "").lower()).strip("-")
    return slug


def _stem_key(stem: str) -> str:
    """Normalize stems so 'alternative rock' and 'alternative-rock' match."""
    return _ASSET_SLUG_RE.sub("-", stem.casefold()).strip("-")


def _find_genre_image(folder: Path, slug: str) -> Path | None:
    if not folder.is_dir() or not slug:
        return None
    want = _stem_key(slug)
    for ext in _IMAGE_EXTS:
        direct = folder / f"{slug}{ext}"
        if direct.is_file():
            return direct
        spaced = folder / f"{slug.replace('-', ' ')}{ext}"
        if spaced.is_file():
            return spaced
    try:
        for f in folder.iterdir():
            if not f.is_file():
                continue
            if f.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
                continue
            if _stem_key(f.stem) == want:
                return f
    except OSError:
        pass
    return None


def subgenre_image_url(name: str | None) -> str | None:
    """Resolve Music Vibes / genre tile art from assets/genre or subgenre dirs."""
    slug = asset_slug(name)
    if not slug:
        return None
    for folder, prefix in _GENRE_IMAGE_DIRS:
        found = _find_genre_image(folder, slug)
        if found:
            return f"/api/assets/{prefix}-{slug}"
    return None
