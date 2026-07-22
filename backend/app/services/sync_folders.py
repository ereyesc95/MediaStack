"""Filesystem folder scan — port of PrimaryPage.SyncFolders (bands + series)."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Band, Series
from app.services import musicbrainz, tmdb


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


def _iter_series_franchise_dirs(series_root: Path) -> list[Path]:
    """Yield franchise folders under Series/{Letter}/{Franchise}/ (or legacy flat Series/{Show}/)."""
    out: list[Path] = []
    try:
        children = sorted(series_root.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return out

    letter_dirs = [
        p
        for p in children
        if p.is_dir() and (len(p.name) == 1 or p.name == "#")
    ]
    if letter_dirs:
        for letter_dir in letter_dirs:
            try:
                for franchise_dir in sorted(
                    letter_dir.iterdir(), key=lambda p: p.name.casefold()
                ):
                    if franchise_dir.is_dir() and not franchise_dir.name.startswith("["):
                        out.append(franchise_dir)
            except OSError:
                continue
        return out

    # Legacy: Series/{Show}/ directly under Series/
    for show_dir in children:
        if show_dir.is_dir() and not show_dir.name.startswith("["):
            out.append(show_dir)
    return out


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
    for franchise_dir in _iter_series_franchise_dirs(series_root):
        scanned += 1
        folder_name = _normalize_folder_name(franchise_dir.name)
        if folder_name in known:
            continue
        # Skip empty scaffolding-only trees later if TMDb fails; still attempt lookup.
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
