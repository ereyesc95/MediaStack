"""Resolve label logos from assets/labels/."""
from __future__ import annotations

import re
from pathlib import Path

from app.paths import PROJECT_ROOT

LABELS_DIR = PROJECT_ROOT / "assets" / "labels"
LEGACY_LABELS_DIR = PROJECT_ROOT / "assets" / "system" / "labels"
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")


def label_slug(name: str) -> str:
    raw = name.strip().casefold()
    raw = raw.replace("&", "and")
    raw = re.sub(r"[^a-z0-9]+", "-", raw)
    return raw.strip("-") or "unknown"


def _find_label_file(slug: str) -> Path | None:
    for base in (LABELS_DIR, LEGACY_LABELS_DIR):
        if not base.is_dir():
            continue
        # Exact slug match (case-sensitive on Linux)
        for ext in IMAGE_EXTS:
            path = base / f"{slug}{ext}"
            if path.is_file():
                return path
        # Case-insensitive stem match (BMG.png ↔ bmg)
        want = slug.casefold()
        try:
            for f in base.iterdir():
                if not f.is_file():
                    continue
                if f.suffix.lower() not in IMAGE_EXTS:
                    continue
                if f.stem.casefold() == want or label_slug(f.stem) == want:
                    return f
        except OSError:
            continue
    return None


def label_logo_url(name: str | None) -> str | None:
    if not name or not name.strip():
        return None
    slug = label_slug(name)
    if not LABELS_DIR.is_dir() and not LEGACY_LABELS_DIR.is_dir():
        return None
    found = _find_label_file(slug)
    if found:
        # Prefer stable slug URL; assets router resolves case-insensitively on Windows
        return f"/api/assets/labels/{slug}{found.suffix.lower()}"
    return "/api/assets/default/label.png"
