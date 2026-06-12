"""Import band lineup from MusicBrainz into artists + artistparticipations."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.lineup_instruments import map_mb_attributes
from app.models import Artist, ArtistParticipation, Band
from app.services.musicbrainz import fetch_artist, fetch_artist_with_members

PAR_OFFICIAL = 0
PAR_ORIGINAL = 1
PAR_FORMER = 3

MB_FETCH_DELAY = 1.1


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _display_name(name: str | None) -> str:
    if not name:
        return "Unknown"
    return name.replace("■", ",").replace("█", "'").strip()


def _extract_urls(relations: list[dict] | None) -> dict[str, str]:
    urls: dict[str, str] = {}
    for rel in relations or []:
        url = (rel.get("url") or {}).get("resource")
        if not url:
            continue
        rtype = (rel.get("type") or "").lower()
        if "wikipedia" in rtype and "wikipedia" not in urls:
            urls["wikipedia"] = url
        elif rtype == "wikidata" and "wikidata" not in urls:
            urls["wikidata"] = url
        elif rtype == "image" and "image" not in urls:
            urls["image"] = url
        elif "musicbrainz" in rtype and "musicbrainz" not in urls:
            urls["musicbrainz"] = url
    return urls


def _founding_year(band: Band) -> int | None:
    raw = (band.bnd_starting_dates or "").split(";")[0].strip()[:4]
    return int(raw) if raw.isdigit() else None


def _participation_type_ids(
    *,
    has_end: bool,
    is_original: bool,
) -> str:
    ids: list[int] = []
    if not has_end:
        ids.append(PAR_OFFICIAL)
    if is_original:
        ids.append(PAR_ORIGINAL)
    if has_end:
        ids.append(PAR_FORMER)
    if not ids:
        ids.append(PAR_OFFICIAL)
    return ";".join(str(i) for i in ids)


def _next_artist_id(db: Session) -> int:
    return (db.scalar(select(func.max(Artist.art_id))) or 0) + 1


def _next_arp_id(db: Session) -> int:
    return (db.scalar(select(func.max(ArtistParticipation.arp_id))) or 0) + 1


def _upsert_artist_from_mb(db: Session, mbid: str, data: dict) -> Artist:
    row = db.scalars(select(Artist).where(Artist.art_code == mbid)).first()
    if not row:
        row = Artist(art_id=_next_artist_id(db), art_code=mbid, art_source="musicbrainz")
        db.add(row)

    if not row.art_fields_manual or row.art_source != "manual":
        row.art_name = data.get("name") or row.art_name
        aliases = ";".join(
            a.get("name", "") for a in data.get("aliases", []) if a.get("name")
        )
        if aliases:
            row.art_aliases = aliases
        life = data.get("life-span") or {}
        if life.get("begin"):
            row.art_birth_date = life.get("begin")
        if life.get("end"):
            row.art_death_date = life.get("end")
        if data.get("country"):
            pass  # country FK mapping deferred
        urls = _extract_urls(data.get("relations"))
        if urls:
            row.art_external_urls = json.dumps(urls)
        row.art_source = "musicbrainz"

    sort_name = data.get("sort-name") or row.art_name
    if sort_name and not row.art_stage_name:
        row.art_stage_name = _display_name(row.art_name)

    return row


async def _fetch_member_details(mbid: str) -> dict:
    await asyncio.sleep(MB_FETCH_DELAY)
    return await fetch_artist(mbid, inc="aliases+tags+url-rels")


async def import_band_lineup(
    db: Session,
    band: Band,
    *,
    replace_non_manual: bool = True,
) -> dict:
    if not band.bnd_code:
        return {"ok": False, "error": "No MusicBrainz ID on band"}

    try:
        group_data = await fetch_artist_with_members(band.bnd_code)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    founding = _founding_year(band)
    members: list[dict] = []
    for rel in group_data.get("relations") or []:
        rtype = (rel.get("type") or "").lower()
        if rtype != "member of band" and "member" not in rtype:
            continue
        member = rel.get("artist") or {}
        mbid = member.get("id")
        if not mbid:
            continue
        members.append(
            {
                "mbid": mbid,
                "name": member.get("name"),
                "begin": rel.get("begin"),
                "end": rel.get("end"),
                "ended": rel.get("ended"),
                "attributes": rel.get("attributes") or [],
            }
        )

    if replace_non_manual:
        manual_arps = db.scalars(
            select(ArtistParticipation).where(
                ArtistParticipation.arp_fk_bands == band.bnd_id,
                ArtistParticipation.arp_manual == 1,
            )
        ).all()
        manual_artist_ids = {a.arp_fk_artists for a in manual_arps if a.arp_fk_artists}
        db.execute(
            delete(ArtistParticipation).where(
                ArtistParticipation.arp_fk_bands == band.bnd_id,
                or_(
                    ArtistParticipation.arp_manual == 0,
                    ArtistParticipation.arp_manual.is_(None),
                ),
            )
        )
        db.flush()
    else:
        manual_artist_ids = set()

    imported = 0
    for entry in members:
        mbid = entry["mbid"]
        if mbid in manual_artist_ids:
            continue
        try:
            detail = await _fetch_member_details(mbid)
        except Exception:
            detail = {"id": mbid, "name": entry.get("name")}

        artist = _upsert_artist_from_mb(db, mbid, detail)
        db.flush()

        inst_ids, role_labels = map_mb_attributes(db, entry.get("attributes"))
        start = (entry.get("begin") or "").strip() or None
        end = (entry.get("end") or "").strip() or None
        has_end = bool(end) or entry.get("ended") is True
        attrs_lower = [a.lower() for a in entry.get("attributes") or []]
        is_original = "original" in attrs_lower
        if not is_original and founding and start and start[:4].isdigit():
            is_original = int(start[:4]) <= founding + 2

        existing = db.scalars(
            select(ArtistParticipation).where(
                ArtistParticipation.arp_fk_bands == band.bnd_id,
                ArtistParticipation.arp_fk_artists == artist.art_id,
            )
        ).first()

        if existing and existing.arp_manual:
            continue

        if not existing:
            existing = ArtistParticipation(
                arp_id=_next_arp_id(db),
                arp_fk_bands=band.bnd_id,
                arp_fk_artists=artist.art_id,
            )
            db.add(existing)

        existing.arp_start_dates = start
        existing.arp_end_dates = end
        existing.arp_fk_instruments = (
            ";".join(str(i) for i in inst_ids) if inst_ids else None
        )
        existing.arp_fk_participation_types = _participation_type_ids(
            has_end=has_end,
            is_original=is_original,
        )
        existing.arp_manual = 0
        imported += 1

    band.bnd_lineup_imported_at = _now()
    band.bnd_lineup_source = "musicbrainz"
    db.commit()
    from app.band_overview_cache import invalidate_overview_cache

    invalidate_overview_cache(band.bnd_id)
    return {"ok": True, "imported": imported, "imported_at": band.bnd_lineup_imported_at}


def ensure_lineup_imported_sync(db: Session, band: Band) -> dict | None:
    """Run first-visit import synchronously if not yet imported."""
    if band.bnd_lineup_imported_at or not band.bnd_code:
        return None
    return asyncio.run(import_band_lineup(db, band, replace_non_manual=True))
