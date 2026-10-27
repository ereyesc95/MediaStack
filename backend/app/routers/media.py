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
    from app.franchise_index import FRANCHISE_INDEX_VERSION

    cached = load_franchise_index()
    if (
        cached
        and cached.franchises
        and getattr(cached, "index_version", 0) == FRANCHISE_INDEX_VERSION
    ):
        return cached
    root = settings.media_root
    if not root:
        raise HTTPException(400, "Set MYSTACK_MEDIA_ROOT")
    index = build_franchise_index(Path(root))
    save_franchise_index(index)
    return index


def _enrich_buckets(
    related: dict[str, list],
    *,
    media_root: Path | None = None,
) -> dict[str, list]:
    """Attach cover/banner/logo URLs onto related entry cards."""
    root = media_root
    if root is None:
        raw = settings.media_root
        if not raw:
            return related
        root = Path(raw)
    if not root.is_dir():
        return related
    from app.series_overview import _enrich_related_cards

    out: dict[str, list] = {}
    for bucket, entries in related.items():
        if not isinstance(entries, list) or not entries:
            out[bucket] = list(entries or [])
            continue
        # Ensure kind is present for enricher (bucket name → singular).
        kind = {
            "movies": "movie",
            "series": "series",
            "books": "book",
            "games": "game",
            "music": "music",
        }.get(bucket, bucket.rstrip("s"))
        stamped = []
        for e in entries:
            if not isinstance(e, dict):
                continue
            row = dict(e)
            row.setdefault("kind", kind)
            stamped.append(row)
        out[bucket] = _enrich_related_cards(stamped, root)
    return out


@router.post("/open-local")
def open_local_media(path: str = Query(..., min_length=1)):
    """Open a media file with the OS default application (e.g. ROM emulator)."""
    import os
    import sys

    root = settings.media_root
    if not root:
        raise HTTPException(400, "Set MYSTACK_MEDIA_ROOT")
    media_root = Path(root).resolve()
    cleaned = path.replace("\\", "/").lstrip("/")
    if ".." in cleaned.split("/"):
        raise HTTPException(400, "Invalid path")
    target = (media_root / cleaned).resolve()
    try:
        target.relative_to(media_root)
    except ValueError as exc:
        raise HTTPException(400, "Path escapes media root") from exc
    if not target.is_file():
        raise HTTPException(404, "File not found")
    try:
        if sys.platform == "win32":
            os.startfile(str(target))  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            import subprocess

            subprocess.Popen(["open", str(target)], close_fds=True)
        else:
            import subprocess

            subprocess.Popen(["xdg-open", str(target)], close_fds=True)
    except OSError as exc:
        raise HTTPException(
            400,
            f"No application is associated with this file type ({target.suffix}).",
        ) from exc
    return {"ok": True, "path": cleaned}


@router.get("/related")
def media_related(
    path: str = Query(..., min_length=1),
    subseries: str | None = Query(
        None,
        description="Optional subseries title filter (e.g. Dragon Ball Z)",
    ),
):
    index = _ensure_index()
    slug = franchise_slug_for_path(index, path)
    related = related_for_path(index, path, subseries=subseries)
    related = _enrich_buckets(related)
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
def franchise_related(
    slug: str,
    subseries: str | None = Query(
        None,
        description="Optional subseries title filter (e.g. Dragon Ball Z)",
    ),
):
    index = _ensure_index()
    group = index.franchises.get(normalize_franchise_slug(slug))
    if not group:
        raise HTTPException(404, "Franchise not found")
    entries: dict[str, list] = {
        "movies": [],
        "series": [],
        "books": [],
        "games": [],
        "music": [],
    }
    want_sub = (subseries or "").strip().casefold() or None
    for entry in group.entries:
        if want_sub:
            entry_sub = (entry.subseries or "").strip().casefold()
            if entry_sub and entry_sub != want_sub:
                continue
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
    entries = _enrich_buckets(entries)
    return {
        "franchise": {"slug": group.slug, "display_name": group.display_name},
        **entries,
    }
