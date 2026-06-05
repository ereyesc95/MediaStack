"""Filesystem folder scan — port of PrimaryPage.SyncFolders (bands + series)."""
from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Band, Series
from app.services import musicbrainz, tmdb

_GALLERY = re.compile(r"\\bGallery\\b|/Gallery/")


def _normalize_folder_name(name: str) -> str:
    return name.replace(",", "■").replace("'", "█")


def _depth_under(root: Path, path: Path) -> int:
    try:
        return len(path.relative_to(root).parts)
    except ValueError:
        return -1


def _existing_names(db: Session, model, name_col) -> set[str]:
    rows = db.scalars(select(name_col)).all()
    return {r or "" for r in rows if r}


async def sync_bands(
    db: Session,
    root: Path,
    *,
    user_agent: str,
) -> dict:
    music_root = root / "Music" if (root / "Music").is_dir() else root
    if not music_root.is_dir():
        return {"table": "bands", "added": 0, "scanned": 0, "error": "Music root not found"}

    known = _existing_names(db, Band.bnd_name, Band.bnd_name)
    added = 0
    scanned = 0
    for letter_dir in sorted(music_root.iterdir()):
        if not letter_dir.is_dir():
            continue
        for artist_dir in sorted(letter_dir.iterdir()):
            if not artist_dir.is_dir():
                continue
            if _depth_under(music_root, artist_dir) != 1:
                continue
            scanned += 1
            folder_name = _normalize_folder_name(artist_dir.name)
            if folder_name in known:
                continue
            mbid = await musicbrainz.search_artist_mbid(folder_name, user_agent=user_agent)
            if not mbid:
                continue
            max_id = db.scalar(select(func.max(Band.bnd_id))) or 0
            row = Band(bnd_id=max_id + 1, bnd_name=folder_name, bnd_code=mbid)
            db.add(row)
            known.add(folder_name)
            added += 1
    db.commit()
    return {"table": "bands", "added": added, "scanned": scanned}


async def sync_series(
    db: Session,
    root: Path,
    *,
    tmdb_api_key: str,
) -> dict:
    series_root = root / "Series" if (root / "Series").is_dir() else root
    if not series_root.is_dir():
        return {"table": "series", "added": 0, "scanned": 0, "error": "Series root not found"}

    known = _existing_names(db, Series.ser_name, Series.ser_name)
    added = 0
    scanned = 0
    for show_dir in sorted(series_root.iterdir()):
        if not show_dir.is_dir():
            continue
        if _depth_under(series_root, show_dir) != 0:
            continue
        scanned += 1
        folder_name = _normalize_folder_name(show_dir.name)
        if folder_name in known:
            continue
        subdirs = [p for p in show_dir.iterdir() if p.is_dir()]
        has_gallery = any(_GALLERY.search(str(p)) for p in subdirs)
        if not has_gallery and subdirs:
            continue
        tv_id, _ = await tmdb.search_tv_id(folder_name, tmdb_api_key)
        if not tv_id:
            continue
        max_id = db.scalar(select(func.max(Series.ser_id))) or 0
        row = Series(ser_id=max_id + 1, ser_name=folder_name, ser_code=str(tv_id))
        db.add(row)
        known.add(folder_name)
        added += 1
    db.commit()
    return {"table": "series", "added": added, "scanned": scanned}


async def run_folder_sync(
    db: Session,
    *,
    media_root: str,
    module: str,
    tmdb_api_key: str | None,
    musicbrainz_ua: str,
) -> list[dict]:
    root = Path(media_root)
    if not root.is_dir():
        return [{"error": f"media_root not found: {media_root}"}]

    results: list[dict] = []
    if module in ("music", "bands", "all"):
        results.append(
            await sync_bands(db, root, user_agent=musicbrainz_ua)
        )
    if module in ("series", "all"):
        if not tmdb_api_key:
            results.append({"table": "series", "error": "TMDb API key not configured"})
        else:
            results.append(
                await sync_series(db, root, tmdb_api_key=tmdb_api_key)
            )
    return results
