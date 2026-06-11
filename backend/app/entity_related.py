"""Related artists: similar music + member participations."""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import crud
from app.config import settings
from app.artist_details import _band_in_library, _external_urls_for_band
from app.gallery import resolve_artist_card
from app.models import Artist, ArtistParticipation, Band, EntityRelated
from app.services.lastfm import fetch_similar_artists
from app.services.musicbrainz import fetch_artist, search_artists

KIND_SIMILAR = "similar"
KIND_PARTICIPATION = "participation"

MB_FETCH_DELAY = 1.1
TRIBUTE_RE = re.compile(r"tribute|cover\s+band", re.I)
SESSION_RE = re.compile(r"session|supporting", re.I)

MB_MEMBER_TYPES = frozenset(
    {
        "member of band",
        "member of",
        "founder of",
        "original member of",
        "vocal of",
        "instrument of",
    }
)
MB_EXCLUDED_TYPES = frozenset(
    {
        "supporting musician",
        "tribute",
        "session musician",
        "guest",
    }
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _display_name(name: str | None) -> str:
    if not name:
        return "Unknown"
    return name.replace("■", ",").replace("█", "'").strip()


def _parse_ids(raw: str | None) -> list[int]:
    if not raw:
        return []
    out: list[int] = []
    for part in raw.split(";"):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(int(part.split("[")[0]))
        except ValueError:
            continue
    return out


def _next_erl_id(db: Session) -> int:
    return (db.scalar(select(func.max(EntityRelated.erl_id))) or 0) + 1


def _parse_urls_json(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _dump_urls(urls: dict[str, str]) -> str | None:
    clean = {k: v for k, v in urls.items() if v}
    return json.dumps(clean) if clean else None


def _encode_via_members(names: list[str] | set[str]) -> str:
    return ";".join(sorted({n.strip() for n in names if n and n.strip()}))


def _parse_via_members(urls: dict[str, str]) -> list[str]:
    raw = (urls.get("via_members") or "").strip()
    if not raw:
        return []
    return [part.strip() for part in raw.split(";") if part.strip()]


def _external_urls_with_via(
    urls: dict[str, str] | None, via_members: list[str] | set[str] | None
) -> dict[str, str]:
    out = dict(urls or {})
    if via_members:
        merged = set(_parse_via_members(out))
        merged.update(via_members)
        encoded = _encode_via_members(merged)
        if encoded:
            out["via_members"] = encoded
    return out


def _extract_mb_urls(relations: list[dict] | None) -> dict[str, str]:
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


async def _resolve_remote_photo_and_urls(mbid: str) -> tuple[str | None, dict[str, str]]:
    from app.artist_photo import _commons_direct_thumb, _wikidata_entity_image

    try:
        data = await fetch_artist(mbid, inc="url-rels")
    except Exception:
        return None, {}
    urls = _extract_mb_urls(data.get("relations"))
    photo: str | None = None
    if urls.get("image"):
        photo = _commons_direct_thumb(urls["image"])
    if not photo and urls.get("wikidata"):
        import httpx

        async with httpx.AsyncClient(timeout=15.0) as client:
            photo = await _wikidata_entity_image(client, urls["wikidata"])
    if not urls.get("musicbrainz"):
        urls["musicbrainz"] = f"https://musicbrainz.org/artist/{mbid}"
    return photo, urls


def _find_local_band(
    db: Session, *, name: str | None = None, mbid: str | None = None
) -> Band | None:
    if mbid:
        row = db.scalars(select(Band).where(Band.bnd_code == mbid)).first()
        if row:
            return row
    if name:
        norm = _display_name(name).lower()
        for band in db.scalars(select(Band)).all():
            if band.bnd_name and _display_name(band.bnd_name).lower() == norm:
                return band
    return None


def _is_tribute_name(name: str) -> bool:
    return bool(TRIBUTE_RE.search(name))


def _entity_owner_filter(
    *,
    band_id: int | None = None,
    artist_id: int | None = None,
):
    q = select(EntityRelated).where(EntityRelated.erl_hidden == 0)
    if band_id is not None:
        q = q.where(EntityRelated.erl_fk_bands == band_id)
    if artist_id is not None:
        q = q.where(EntityRelated.erl_fk_artists == artist_id)
    return q


def _list_rows(
    db: Session,
    *,
    kind: str,
    band_id: int | None = None,
    artist_id: int | None = None,
) -> list[EntityRelated]:
    q = _entity_owner_filter(band_id=band_id, artist_id=artist_id).where(
        EntityRelated.erl_kind == kind
    )
    return list(
        db.scalars(q.order_by(EntityRelated.erl_sort_order, EntityRelated.erl_id)).all()
    )


def _dedupe_key(row: EntityRelated) -> str:
    if row.erl_code:
        return f"mbid:{row.erl_code.lower()}"
    if row.erl_target_band_id:
        return f"band:{row.erl_target_band_id}"
    return f"name:{(_display_name(row.erl_name) or '').lower()}"


def _upsert_row(
    db: Session,
    *,
    kind: str,
    band_id: int | None,
    artist_id: int | None,
    name: str,
    mbid: str | None = None,
    local_band_id: int | None = None,
    photo_url: str | None = None,
    external_urls: dict[str, str] | None = None,
    source: str,
    manual: bool = False,
    sort_order: int = 0,
    via_members: list[str] | set[str] | None = None,
) -> EntityRelated:
    if via_members or external_urls:
        external_urls = _external_urls_with_via(external_urls, via_members)
    existing = None
    norm_name = _display_name(name)
    for row in _list_rows(db, kind=kind, band_id=band_id, artist_id=artist_id):
        if mbid and row.erl_code and row.erl_code.lower() == mbid.lower():
            existing = row
            break
        if local_band_id and row.erl_target_band_id == local_band_id:
            existing = row
            break
        if (
            not mbid
            and not local_band_id
            and row.erl_name
            and _display_name(row.erl_name).lower() == norm_name.lower()
        ):
            existing = row
            break

    if existing:
        if manual:
            existing.erl_manual = 1
        if not existing.erl_manual or manual:
            existing.erl_name = norm_name
            if mbid:
                existing.erl_code = mbid
            if local_band_id:
                existing.erl_target_band_id = local_band_id
            if photo_url:
                existing.erl_photo_url = photo_url
            if external_urls:
                if via_members and existing.erl_external_urls:
                    prior = _parse_urls_json(existing.erl_external_urls)
                    external_urls = _external_urls_with_via(
                        {**prior, **external_urls},
                        _parse_via_members(prior) + list(via_members or []),
                    )
                existing.erl_external_urls = _dump_urls(external_urls)
            elif via_members:
                prior = _parse_urls_json(existing.erl_external_urls)
                existing.erl_external_urls = _dump_urls(
                    _external_urls_with_via(prior, via_members)
                )
            existing.erl_source = source
        return existing

    row = EntityRelated(
        erl_id=_next_erl_id(db),
        erl_kind=kind,
        erl_fk_bands=band_id,
        erl_fk_artists=artist_id,
        erl_target_band_id=local_band_id,
        erl_name=norm_name,
        erl_code=mbid,
        erl_photo_url=photo_url,
        erl_external_urls=_dump_urls(external_urls or {}),
        erl_source=source,
        erl_manual=1 if manual else 0,
        erl_hidden=0,
        erl_sort_order=sort_order,
    )
    db.add(row)
    db.flush()
    return row


def _delete_non_manual(
    db: Session,
    *,
    kind: str,
    band_id: int | None = None,
    artist_id: int | None = None,
) -> None:
    ids = [
        row.erl_id
        for row in db.scalars(
            _entity_owner_filter(band_id=band_id, artist_id=artist_id).where(
                EntityRelated.erl_kind == kind,
                EntityRelated.erl_manual == 0,
            )
        ).all()
    ]
    if ids:
        db.execute(delete(EntityRelated).where(EntityRelated.erl_id.in_(ids)))


def import_legacy_similar(db: Session, band: Band) -> int:
    if band.bnd_related_legacy_imported:
        return 0
    raw = band.bnd_fk_artists or ""
    if not raw.strip():
        band.bnd_related_legacy_imported = 1
        return 0
    count = 0
    order = 0
    for part in raw.split(";"):
        part = part.strip()
        if not part or part == str(band.bnd_id):
            continue
        order += 1
        if part.endswith("_not_found"):
            name = part[: -len("_not_found")].replace("_", " ")
            local = _find_local_band(db, name=name)
            _upsert_row(
                db,
                kind=KIND_SIMILAR,
                band_id=band.bnd_id,
                artist_id=None,
                name=name,
                local_band_id=local.bnd_id if local else None,
                mbid=local.bnd_code if local else None,
                source="legacy",
                sort_order=order,
            )
            count += 1
            continue
        try:
            bid = int(part.split("[")[0])
        except ValueError:
            name = part.replace("_", " ")
            _upsert_row(
                db,
                kind=KIND_SIMILAR,
                band_id=band.bnd_id,
                artist_id=None,
                name=name,
                source="legacy",
                sort_order=order,
            )
            count += 1
            continue
        if bid == band.bnd_id:
            continue
        local = db.get(Band, bid)
        if not local or not local.bnd_name:
            continue
        _upsert_row(
            db,
            kind=KIND_SIMILAR,
            band_id=band.bnd_id,
            artist_id=None,
            name=local.bnd_name,
            local_band_id=local.bnd_id,
            mbid=local.bnd_code,
            source="legacy",
            sort_order=order,
        )
        count += 1
    band.bnd_related_legacy_imported = 1
    return count


async def _enrich_similar_candidate(
    db: Session,
    *,
    name: str,
    mbid: str | None,
) -> tuple[str | None, int | None, str | None, dict[str, str]]:
    local = _find_local_band(db, name=name, mbid=mbid)
    if local:
        return local.bnd_code, local.bnd_id, None, {}
    resolved_mbid = mbid
    if not resolved_mbid:
        matches = await search_artists(name, limit=1)
        resolved_mbid = matches[0]["mbid"] if matches else None
    photo: str | None = None
    urls: dict[str, str] = {}
    if resolved_mbid:
        photo, urls = await _resolve_remote_photo_and_urls(resolved_mbid)
    return resolved_mbid, None, photo, urls


async def refresh_similar_for_band(db: Session, band: Band, *, first_fetch: bool = False) -> dict:
    if first_fetch:
        import_legacy_similar(db, band)
        band.bnd_related_similar_at = _now()
        db.commit()
    else:
        _delete_non_manual(db, kind=KIND_SIMILAR, band_id=band.bnd_id)

    api_key = crud.get_lastfm_key(db)
    added = 0
    if api_key and band.bnd_name:
        try:
            items = await fetch_similar_artists(
                band.bnd_name, api_key=api_key, limit=24
            )
        except Exception:
            items = []
        order = 100
        for item in items:
            name = item["name"]
            if _is_tribute_name(name):
                continue
            if _display_name(name).lower() == _display_name(band.bnd_name).lower():
                continue
            local = _find_local_band(db, name=name, mbid=item.get("mbid"))
            _upsert_row(
                db,
                kind=KIND_SIMILAR,
                band_id=band.bnd_id,
                artist_id=None,
                name=name,
                mbid=item.get("mbid") or (local.bnd_code if local else None),
                local_band_id=local.bnd_id if local else None,
                source="lastfm",
                sort_order=order,
            )
            order += 1
            added += 1

    await _resolve_missing_photos(
        db, kind=KIND_SIMILAR, band_id=band.bnd_id, limit=16 if first_fetch else None
    )
    band.bnd_related_similar_at = _now()
    db.commit()
    return {"ok": True, "added": added, "fetched_at": band.bnd_related_similar_at}


async def refresh_similar_for_artist(db: Session, artist: Artist) -> dict:
    _delete_non_manual(db, kind=KIND_SIMILAR, artist_id=artist.art_id)
    api_key = crud.get_lastfm_key(db)
    added = 0
    name = artist.art_stage_name or artist.art_name or "Unknown"
    if api_key:
        try:
            items = await fetch_similar_artists(name, api_key=api_key, limit=24)
        except Exception:
            items = []
        order = 100
        for item in items:
            n = item["name"]
            if _is_tribute_name(n):
                continue
            if _display_name(n).lower() == _display_name(name).lower():
                continue
            mbid, local_id, photo, urls = await _enrich_similar_candidate(
                db, name=n, mbid=item.get("mbid")
            )
            _upsert_row(
                db,
                kind=KIND_SIMILAR,
                band_id=None,
                artist_id=artist.art_id,
                name=n,
                mbid=mbid,
                local_band_id=local_id,
                photo_url=photo,
                external_urls=urls,
                source="lastfm",
                sort_order=order,
            )
            order += 1
            added += 1
            await asyncio.sleep(0.15)
    await _resolve_missing_photos(db, kind=KIND_SIMILAR, artist_id=artist.art_id)
    artist.art_related_similar_at = _now()
    db.commit()
    return {"ok": True, "added": added, "fetched_at": artist.art_related_similar_at}


def _member_display(db: Session, artist_id: int) -> str:
    artist = db.get(Artist, artist_id)
    if not artist:
        return "Unknown"
    return _display_name(artist.art_stage_name or artist.art_name)


def _db_participations_for_band(db: Session, band: Band) -> list[dict]:
    member_ids = {
        arp.arp_fk_artists
        for arp in db.scalars(
            select(ArtistParticipation).where(
                ArtistParticipation.arp_fk_bands == band.bnd_id
            )
        ).all()
        if arp.arp_fk_artists
    }
    by_target: dict[int, dict] = {}
    for mid in member_ids:
        member_name = _member_display(db, mid)
        for arp in db.scalars(
            select(ArtistParticipation).where(ArtistParticipation.arp_fk_artists == mid)
        ).all():
            bid = arp.arp_fk_bands
            if not bid or bid == band.bnd_id:
                continue
            b = db.get(Band, bid)
            if not b or not b.bnd_name:
                continue
            if _is_tribute_name(b.bnd_name):
                continue
            entry = by_target.get(bid)
            if not entry:
                entry = {
                    "name": b.bnd_name,
                    "local_band_id": b.bnd_id,
                    "mbid": b.bnd_code,
                    "source": "db",
                    "via_members": set(),
                }
                by_target[bid] = entry
            entry["via_members"].add(member_name)
    out: list[dict] = []
    for entry in by_target.values():
        entry["via_members"] = sorted(entry["via_members"])
        out.append(entry)
    return out


def _db_participations_for_artist(db: Session, artist: Artist) -> list[dict]:
    seen: set[int] = set()
    out: list[dict] = []
    for arp in db.scalars(
        select(ArtistParticipation).where(
            ArtistParticipation.arp_fk_artists == artist.art_id
        )
    ).all():
        bid = arp.arp_fk_bands
        if not bid or bid in seen:
            continue
        b = db.get(Band, bid)
        if not b or not b.bnd_name:
            continue
        if _is_tribute_name(b.bnd_name):
            continue
        seen.add(bid)
        out.append(
            {
                "name": b.bnd_name,
                "local_band_id": b.bnd_id,
                "mbid": b.bnd_code,
                "source": "db",
            }
        )
    return out


def _mb_relation_allowed(rel: dict) -> bool:
    rtype = (rel.get("type") or "").lower()
    if any(ex in rtype for ex in MB_EXCLUDED_TYPES):
        return False
    if SESSION_RE.search(rtype):
        return False
    if "member of" in rtype or rtype in MB_MEMBER_TYPES:
        return True
    if rel.get("direction") == "backward" and "member" in rtype:
        return True
    return False


async def _mb_participations_for_members(
    db: Session,
    member_ids: set[int],
    *,
    exclude_band_id: int | None = None,
) -> list[dict]:
    by_key: dict[str, dict] = {}
    for mid in member_ids:
        artist = db.get(Artist, mid)
        if not artist or not artist.art_code:
            continue
        member_name = _member_display(db, mid)
        try:
            data = await fetch_artist(
                artist.art_code,
                inc="artist-rels",
            )
        except Exception:
            continue
        for rel in data.get("relations") or []:
            if not _mb_relation_allowed(rel):
                continue
            target = rel.get("artist") or {}
            tname = target.get("name") or ""
            tmbid = target.get("id")
            if not tname or not tmbid:
                continue
            if _is_tribute_name(tname):
                continue
            local = _find_local_band(db, name=tname, mbid=tmbid)
            if local and local.bnd_id == exclude_band_id:
                continue
            key = (
                f"band:{local.bnd_id}"
                if local
                else f"mbid:{tmbid.lower()}"
            )
            entry = by_key.get(key)
            if not entry:
                entry = {
                    "name": tname,
                    "local_band_id": local.bnd_id if local else None,
                    "mbid": tmbid,
                    "source": "musicbrainz",
                    "via_members": set(),
                }
                by_key[key] = entry
            entry["via_members"].add(member_name)
        await asyncio.sleep(MB_FETCH_DELAY)
    out: list[dict] = []
    for entry in by_key.values():
        entry["via_members"] = sorted(entry["via_members"])
        out.append(entry)
    return out


async def refresh_participations_for_band(
    db: Session, band: Band, *, first_fetch: bool = False
) -> dict:
    if not first_fetch:
        _delete_non_manual(db, kind=KIND_PARTICIPATION, band_id=band.bnd_id)
    items = _db_participations_for_band(db, band)
    member_ids = {
        arp.arp_fk_artists
        for arp in db.scalars(
            select(ArtistParticipation).where(
                ArtistParticipation.arp_fk_bands == band.bnd_id
            )
        ).all()
        if arp.arp_fk_artists
    }
    order = 0
    if first_fetch:
        for item in items:
            order += 1
            _upsert_row(
                db,
                kind=KIND_PARTICIPATION,
                band_id=band.bnd_id,
                artist_id=None,
                name=item["name"],
                mbid=item.get("mbid"),
                local_band_id=item.get("local_band_id"),
                source=item.get("source", "db"),
                sort_order=order,
                via_members=item.get("via_members"),
            )
        band.bnd_related_participations_at = _now()
        db.commit()
        items = []
    items.extend(
        await _mb_participations_for_members(
            db, member_ids, exclude_band_id=band.bnd_id
        )
    )
    for item in items:
        order += 1
        _upsert_row(
            db,
            kind=KIND_PARTICIPATION,
            band_id=band.bnd_id,
            artist_id=None,
            name=item["name"],
            mbid=item.get("mbid"),
            local_band_id=item.get("local_band_id"),
            source=item.get("source", "db"),
            sort_order=order,
            via_members=item.get("via_members"),
        )
    await _resolve_missing_photos(
        db,
        kind=KIND_PARTICIPATION,
        band_id=band.bnd_id,
        limit=16 if first_fetch else None,
    )
    band.bnd_related_participations_at = _now()
    db.commit()
    return {
        "ok": True,
        "count": order,
        "fetched_at": band.bnd_related_participations_at,
    }


async def refresh_participations_for_artist(db: Session, artist: Artist) -> dict:
    _delete_non_manual(db, kind=KIND_PARTICIPATION, artist_id=artist.art_id)
    items = _db_participations_for_artist(db, artist)
    items.extend(
        await _mb_participations_for_members(
            db, {artist.art_id}, exclude_band_id=None
        )
    )
    order = 0
    for item in items:
        order += 1
        _upsert_row(
            db,
            kind=KIND_PARTICIPATION,
            band_id=None,
            artist_id=artist.art_id,
            name=item["name"],
            mbid=item.get("mbid"),
            local_band_id=item.get("local_band_id"),
            source=item.get("source", "db"),
            sort_order=order,
        )
    await _resolve_missing_photos(
        db, kind=KIND_PARTICIPATION, artist_id=artist.art_id
    )
    artist.art_related_participations_at = _now()
    db.commit()
    return {
        "ok": True,
        "count": order,
        "fetched_at": artist.art_related_participations_at,
    }


def _row_mbid(db: Session, row: EntityRelated) -> str | None:
    if row.erl_code:
        return row.erl_code
    if row.erl_target_band_id:
        band = db.get(Band, row.erl_target_band_id)
        if band and band.bnd_code:
            return band.bnd_code
    return None


def _local_row_has_visual(
    db: Session, row: EntityRelated, *, media_root: Path | None, orientation: str
) -> bool:
    if not row.erl_target_band_id or not media_root or not media_root.is_dir():
        return False
    band = db.get(Band, row.erl_target_band_id)
    if not band or not band.bnd_name:
        return False
    card = resolve_artist_card(band.bnd_name, orientation=orientation)
    return bool(card.photo_url or card.logo_url or card.icon_url)


def _compute_via_members(
    db: Session, owner_band_id: int, row: EntityRelated
) -> list[str]:
    member_ids = {
        arp.arp_fk_artists
        for arp in db.scalars(
            select(ArtistParticipation).where(
                ArtistParticipation.arp_fk_bands == owner_band_id
            )
        ).all()
        if arp.arp_fk_artists
    }
    target_band_id = row.erl_target_band_id
    target_mbid = (_row_mbid(db, row) or "").strip().lower()
    names: set[str] = set()
    for mid in member_ids:
        member_name = _member_display(db, mid)
        for arp in db.scalars(
            select(ArtistParticipation).where(ArtistParticipation.arp_fk_artists == mid)
        ).all():
            bid = arp.arp_fk_bands
            if not bid or bid == owner_band_id:
                continue
            if target_band_id and bid == target_band_id:
                names.add(member_name)
                continue
            if target_mbid:
                other = db.get(Band, bid)
                if other and other.bnd_code and other.bnd_code.lower() == target_mbid:
                    names.add(member_name)
    return sorted(names)


async def _resolve_missing_photos(
    db: Session,
    *,
    kind: str,
    band_id: int | None = None,
    artist_id: int | None = None,
    limit: int | None = None,
) -> int:
    media_root = Path(settings.media_root) if settings.media_root else None
    root = media_root if media_root and media_root.is_dir() else None
    resolved = 0
    for row in _list_rows(db, kind=kind, band_id=band_id, artist_id=artist_id):
        if limit is not None and resolved >= limit:
            break
        if row.erl_photo_url:
            continue
        if _local_row_has_visual(db, row, media_root=root, orientation="landscape"):
            continue
        mbid = _row_mbid(db, row)
        if not mbid:
            continue
        photo, urls = await _resolve_remote_photo_and_urls(mbid)
        if photo:
            row.erl_photo_url = photo
            resolved += 1
        existing = _parse_urls_json(row.erl_external_urls)
        for key, val in urls.items():
            if key != "via_members":
                existing[key] = val
        row.erl_external_urls = _dump_urls(existing)
        await asyncio.sleep(0.15)
    return resolved


async def resolve_related_photos(
    db: Session,
    *,
    band: Band | None = None,
    artist: Artist | None = None,
    limit: int = 24,
) -> dict:
    total = 0
    if artist:
        total += await _resolve_missing_photos(
            db, kind=KIND_SIMILAR, artist_id=artist.art_id, limit=limit
        )
        total += await _resolve_missing_photos(
            db, kind=KIND_PARTICIPATION, artist_id=artist.art_id, limit=limit
        )
    elif band:
        total += await _resolve_missing_photos(
            db, kind=KIND_SIMILAR, band_id=band.bnd_id, limit=limit
        )
        total += await _resolve_missing_photos(
            db, kind=KIND_PARTICIPATION, band_id=band.bnd_id, limit=limit
        )
    db.commit()
    return {"ok": True, "resolved": total}


async def ensure_related_fetched(
    db: Session,
    *,
    band: Band | None = None,
    artist: Artist | None = None,
) -> dict:
    """Background first-time fetch for similar + participations."""
    results: dict = {}
    if artist:
        if not artist.art_related_similar_at:
            results["similar"] = await refresh_similar_for_artist(db, artist)
        if not artist.art_related_participations_at:
            results["participations"] = await refresh_participations_for_artist(
                db, artist
            )
        return results
    if band and not band.bnd_related_similar_at:
        results["similar"] = await refresh_similar_for_band(
            db, band, first_fetch=True
        )
    if band and not band.bnd_related_participations_at:
        results["participations"] = await refresh_participations_for_band(
            db, band, first_fetch=True
        )
    return results


async def add_similar_manual(
    db: Session,
    *,
    band_id: int | None = None,
    artist_id: int | None = None,
    name: str,
    mbid: str | None = None,
) -> EntityRelated:
    local = _find_local_band(db, name=name, mbid=mbid)
    resolved_mbid = mbid or (local.bnd_code if local else None)
    photo: str | None = None
    urls: dict[str, str] = {}
    if not local and resolved_mbid:
        photo, urls = await _resolve_remote_photo_and_urls(resolved_mbid)
    elif not local and not resolved_mbid:
        resolved_mbid, _, photo, urls = await _enrich_similar_candidate(
            db, name=name, mbid=None
        )
    row = _upsert_row(
        db,
        kind=KIND_SIMILAR,
        band_id=band_id,
        artist_id=artist_id,
        name=name,
        mbid=resolved_mbid,
        local_band_id=local.bnd_id if local else None,
        photo_url=photo,
        external_urls=urls,
        source="manual",
        manual=True,
        sort_order=0,
    )
    db.commit()
    return row


def hide_related(db: Session, row: EntityRelated) -> None:
    row.erl_hidden = 1
    db.commit()


def _serialize_card(
    db: Session,
    row: EntityRelated,
    *,
    orientation: str,
    media_root: Path | None,
    owner_band_id: int | None = None,
) -> dict:
    urls = _parse_urls_json(row.erl_external_urls)
    via_members = _parse_via_members(urls)
    if (
        not via_members
        and row.erl_kind == KIND_PARTICIPATION
        and owner_band_id is not None
    ):
        via_members = _compute_via_members(db, owner_band_id, row)
    public_urls = {k: v for k, v in urls.items() if k != "via_members"}
    local_id = row.erl_target_band_id
    name = _display_name(row.erl_name)
    code = row.erl_code
    photo_url: str | None = None
    logo_url: str | None = None
    icon_url: str | None = None
    era_year: int | None = None
    in_library = False

    if local_id:
        band = db.get(Band, local_id)
        if band and band.bnd_name:
            name = _display_name(band.bnd_name)
            code = band.bnd_code
            in_library = _band_in_library(db, band, media_root)
            if not in_library:
                for key, val in _external_urls_for_band(band).items():
                    public_urls.setdefault(key, val)
            if media_root and media_root.is_dir():
                card = resolve_artist_card(band.bnd_name, orientation=orientation)
                photo_url = card.photo_url
                logo_url = card.logo_url
                icon_url = card.icon_url
                era_year = card.era_year

    if not photo_url and row.erl_photo_url:
        photo_url = row.erl_photo_url

    if code and "musicbrainz" not in public_urls:
        public_urls.setdefault(
            "musicbrainz", f"https://musicbrainz.org/artist/{code}"
        )

    show_name_on_hover = not (logo_url or icon_url)
    if not photo_url:
        show_name_on_hover = True

    return {
        "id": row.erl_id,
        "name": name,
        "code": code,
        "local_band_id": local_id,
        "in_library": in_library,
        "photo_url": photo_url,
        "logo_url": logo_url,
        "icon_url": icon_url,
        "era_year": era_year,
        "show_name_on_hover": show_name_on_hover,
        "external_urls": public_urls,
        "via_members": via_members,
        "manual": bool(row.erl_manual),
        "source": row.erl_source,
    }


def related_payload(
    db: Session,
    *,
    band: Band | None = None,
    artist: Artist | None = None,
    solo_artist_id: int | None = None,
    orientation: str = "landscape",
) -> dict:
    media_root = Path(settings.media_root) if settings.media_root else None
    root = media_root if media_root and media_root.is_dir() else None

    if solo_artist_id:
        art = db.get(Artist, solo_artist_id)
        if not art:
            return _empty_payload("artist", solo_artist_id)
        similar = [
            _serialize_card(db, r, orientation=orientation, media_root=root)
            for r in _list_rows(db, kind=KIND_SIMILAR, artist_id=solo_artist_id)
        ]
        participations = [
            _serialize_card(db, r, orientation=orientation, media_root=root)
            for r in _list_rows(db, kind=KIND_PARTICIPATION, artist_id=solo_artist_id)
        ]
        return {
            "entity_type": "artist",
            "entity_id": solo_artist_id,
            "similar": similar,
            "participations": participations,
            "similar_count": len(similar),
            "participations_count": len(participations),
            "similar_fetched_at": art.art_related_similar_at,
            "participations_fetched_at": art.art_related_participations_at,
            "needs_similar_fetch": art.art_related_similar_at is None,
            "needs_participations_fetch": art.art_related_participations_at is None,
        }

    if not band:
        return _empty_payload("band", 0)

    similar = [
        _serialize_card(db, r, orientation=orientation, media_root=root)
        for r in _list_rows(db, kind=KIND_SIMILAR, band_id=band.bnd_id)
    ]
    participations = [
        _serialize_card(
            db,
            r,
            orientation=orientation,
            media_root=root,
            owner_band_id=band.bnd_id,
        )
        for r in _list_rows(db, kind=KIND_PARTICIPATION, band_id=band.bnd_id)
    ]
    return {
        "entity_type": "band",
        "entity_id": band.bnd_id,
        "similar": similar,
        "participations": participations,
        "similar_count": len(similar),
        "participations_count": len(participations),
        "similar_fetched_at": band.bnd_related_similar_at,
        "participations_fetched_at": band.bnd_related_participations_at,
        "needs_similar_fetch": band.bnd_related_similar_at is None,
        "needs_participations_fetch": band.bnd_related_participations_at is None,
    }


def _empty_payload(entity_type: str, entity_id: int) -> dict:
    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "similar": [],
        "participations": [],
        "similar_count": 0,
        "participations_count": 0,
        "similar_fetched_at": None,
        "participations_fetched_at": None,
        "needs_similar_fetch": True,
        "needs_participations_fetch": True,
    }
