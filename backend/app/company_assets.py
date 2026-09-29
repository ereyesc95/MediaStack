"""Resolve venue / promoter / ticketer logos from assets/companies/."""
from __future__ import annotations

import re
from pathlib import Path

from app.paths import PROJECT_ROOT

COMPANIES_DIR = PROJECT_ROOT / "assets" / "companies"
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".svg")


def company_slug(name: str) -> str:
    raw = name.strip().casefold()
    raw = raw.replace("&", "and")
    raw = re.sub(r"[^a-z0-9]+", "-", raw)
    return raw.strip("-") or "unknown"


def _find_company_file(slug: str) -> Path | None:
    if not COMPANIES_DIR.is_dir():
        return None
    for ext in IMAGE_EXTS:
        path = COMPANIES_DIR / f"{slug}{ext}"
        if path.is_file():
            return path
    want = slug.casefold()
    try:
        for f in COMPANIES_DIR.iterdir():
            if not f.is_file():
                continue
            if f.suffix.lower() not in IMAGE_EXTS:
                continue
            if f.stem.casefold() == want or company_slug(f.stem) == want:
                return f
    except OSError:
        return None
    return None


def company_logo_url(name: str | None) -> str | None:
    """Return asset URL for a company logo, or None if name empty / no file."""
    if not name or not name.strip():
        return None
    slug = company_slug(name)
    found = _find_company_file(slug)
    if found:
        return f"/api/assets/companies/{slug}{found.suffix.lower()}"
    return None
