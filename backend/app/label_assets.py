"""Resolve label logos from assets/system/labels/."""
from __future__ import annotations

import re
from pathlib import Path

from app.paths import PROJECT_ROOT

LABELS_DIR = PROJECT_ROOT / "assets" / "system" / "labels"
IMAGE_EXTS = (".png", ".jpg", ".webp")


def label_slug(name: str) -> str:
    raw = name.strip().casefold()
    raw = raw.replace("&", "and")
    raw = re.sub(r"[^a-z0-9]+", "-", raw)
    return raw.strip("-") or "unknown"


def label_logo_url(name: str | None) -> str | None:
    if not name or not name.strip():
        return None
    slug = label_slug(name)
    if not LABELS_DIR.is_dir():
        return None
    for ext in IMAGE_EXTS:
        path = LABELS_DIR / f"{slug}{ext}"
        if path.is_file():
            return f"/api/assets/system/labels/{slug}{ext}"
    return "/api/assets/system/default/label.png"
