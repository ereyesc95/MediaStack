"""Play-history helpers: quiz exclusion, asset slugs, subgenre artwork."""
from __future__ import annotations

import re
from pathlib import Path

from app.paths import PROJECT_ROOT

QUIZ_PLAY_TITLE = "quiz"
_ASSET_SLUG_RE = re.compile(r"[^a-z0-9]+")
_SUBGENRE_DIR = PROJECT_ROOT / "assets" / "system" / "subgenre"
_IMAGE_EXTS = (".png", ".jpg", ".webp")


def is_quiz_play_title(title: str | None) -> bool:
    return (title or "").strip().casefold() == QUIZ_PLAY_TITLE


def asset_slug(name: str | None) -> str:
    slug = _ASSET_SLUG_RE.sub("-", (name or "").lower()).strip("-")
    return slug


def subgenre_image_url(name: str | None) -> str | None:
    slug = asset_slug(name)
    if not slug:
        return None
    for ext in _IMAGE_EXTS:
        if (_SUBGENRE_DIR / f"{slug}{ext}").is_file():
            return f"/api/assets/subgenre-{slug}"
    return None
