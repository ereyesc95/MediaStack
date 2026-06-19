"""Resolve a person name to an in-library band folder when one exists."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.artist_details import _external_urls_for_band
from app.config import settings
from app.gallery import _artist_dir, _display_name
from app.media_index import _band_id_for_artist_name
from app.models import Artist, Band


def _urls_from_mb_artist(data: dict) -> dict[str, str]:
    urls: dict[str, str] = {}
    mbid = data.get("id")
    if mbid:
        urls["musicbrainz"] = f"https://musicbrainz.org/artist/{mbid}"
    for rel in data.get("relations") or []:
        if rel.get("type") != "wikipedia":
            continue
        resource = (rel.get("url") or {}).get("resource")
        if resource:
            urls["wikipedia"] = resource
    return urls


async def _musicbrainz_urls_for_name(name: str) -> dict[str, str]:
    from app.services.musicbrainz import fetch_artist, search_artists

    items = await search_artists(
        name, limit=5, user_agent=settings.musicbrainz_user_agent
    )
    norm = name.casefold()
    pick = next(
        (i for i in items if (i.get("name") or "").casefold() == norm),
        items[0] if items else None,
    )
    if not pick or not pick.get("mbid"):
        return {}
    data = await fetch_artist(
        pick["mbid"],
        inc="url-rels",
        user_agent=settings.musicbrainz_user_agent,
    )
    return _urls_from_mb_artist(data)


def _name_pool(raw: str | None) -> set[str]:
    if not raw:
        return set()
    out: set[str] = set()
    for part in raw.replace(";", ",").split(","):
        for sub in part.split("/"):
            text = sub.strip()
            if text:
                out.add(text.casefold())
    return out


def _artist_name_pools(db: Session) -> dict[int, set[str]]:
    pools: dict[int, set[str]] = {}
    for artist in db.scalars(select(Artist)).all():
        names = _name_pool(artist.art_name) | _name_pool(artist.art_stage_name)
        names |= _name_pool(artist.art_aliases)
        if names:
            pools[artist.art_id] = names
    return pools


def _band_has_local_folder(media_root: Path, band: Band) -> bool:
    if not band.bnd_name:
        return False
    folder = _artist_dir(media_root, band.bnd_name)
    return bool(folder and folder.is_dir())


def find_local_band_for_person(db: Session, name: str) -> int | None:
    want = name.strip()
    if not want:
        return None
    root = settings.media_root
    if not root:
        return None
    media_root = Path(root)
    norm = want.casefold()

    band_id = _band_id_for_artist_name(db, want)
    if band_id:
        band = db.get(Band, band_id)
        if band and _band_has_local_folder(media_root, band):
            return band_id

    artist_pools = _artist_name_pools(db)
    matched_artist_ids = [
        aid for aid, names in artist_pools.items() if norm in names
    ]

    for band in db.scalars(select(Band)).all():
        if not _band_has_local_folder(media_root, band):
            continue
        if _display_name(band.bnd_name or "").casefold() == norm:
            return band.bnd_id
        fk = band.bnd_fk_artists or ""
        for aid in matched_artist_ids:
            if str(aid) in fk or f"[{aid}]" in fk:
                return band.bnd_id

    for band in db.scalars(select(Band)).all():
        if not _band_has_local_folder(media_root, band):
            continue
        for alias in _name_pool(band.bnd_name):
            if alias == norm:
                return band.bnd_id

    return None


async def resolve_artist_name_navigation(db: Session, name: str) -> dict:
    want = name.strip()
    band_id = find_local_band_for_person(db, want)
    if band_id:
        return {
            "name": want,
            "in_library": True,
            "band_id": band_id,
            "urls": {},
        }

    urls: dict[str, str] = {}
    db_band_id = _band_id_for_artist_name(db, want)
    if db_band_id:
        band = db.get(Band, db_band_id)
        if band:
            urls = _external_urls_for_band(band)

    if not urls.get("wikipedia") or not urls.get("musicbrainz"):
        mb_urls = await _musicbrainz_urls_for_name(want)
        for key, val in mb_urls.items():
            urls.setdefault(key, val)

    return {
        "name": want,
        "in_library": False,
        "band_id": None,
        "urls": urls,
    }
