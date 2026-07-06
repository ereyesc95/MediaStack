"""Cross-module related media API."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.franchise_index import (
    build_franchise_index,
    franchise_slug_for_path,
    load_franchise_index,
    normalize_franchise_slug,
    related_for_path,
    save_franchise_index,
)

router = APIRouter(prefix="/api/media", tags=["media"])


def _ensure_index():
    cached = load_franchise_index()
    if cached and cached.franchises:
        return cached
    root = settings.media_root
    if not root:
        raise HTTPException(400, "Set MEDIASTACK_MEDIA_ROOT")
    index = build_franchise_index(Path(root))
    save_franchise_index(index)
    return index


@router.get("/related")
def media_related(path: str = Query(..., min_length=1)):
    index = _ensure_index()
    slug = franchise_slug_for_path(index, path)
    related = related_for_path(index, path)
    group = index.franchises.get(slug) if slug else None
    return {
        "franchise": (
            {"slug": slug, "display_name": group.display_name}
            if slug and group
            else None
        ),
        "from_path": path.replace("\\", "/"),
        "movies": related.get("movies", []),
        "series": related.get("series", []),
        "books": related.get("books", []),
        "games": related.get("games", []),
        "music": related.get("music", []),
    }


@router.get("/franchise/{slug}/related")
def franchise_related(slug: str):
    index = _ensure_index()
    group = index.franchises.get(normalize_franchise_slug(slug))
    if not group:
        raise HTTPException(404, "Franchise not found")
    entries = {
        "movies": [],
        "series": [],
        "books": [],
        "games": [],
        "music": [],
    }
    for entry in group.entries:
        bucket = f"{entry.kind}s"
        if entry.kind == "series":
            bucket = "series"
        elif entry.kind == "movie":
            bucket = "movies"
        elif entry.kind == "book":
            bucket = "books"
        elif entry.kind == "game":
            bucket = "games"
        elif entry.kind == "music":
            bucket = "music"
        entries.setdefault(bucket, []).append(
            {
                "kind": entry.kind,
                "path": entry.path,
                "title": entry.title,
                "date_iso": entry.date_iso,
                "letter": entry.letter,
                "platform": entry.platform,
                "subseries": entry.subseries,
                "franchise_display": entry.franchise_display,
            }
        )
    return {
        "franchise": {"slug": group.slug, "display_name": group.display_name},
        **entries,
    }
