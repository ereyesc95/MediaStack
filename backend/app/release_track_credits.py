"""Track writing credits from legacy DB."""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Artist, Release, Track
from app.music_filters import _parse_ids
from app.release_overview import _match_db_release, resolve_release_content
from app.release_tracklist import _normalize_title

TRACK_WRITERS_RE = re.compile(r"~([^~]+)~\[\{(.+?)\}\]")
TRACK_WRITERS_SEP = "■"
LEAD_VOCALS_INSTRUMENT_ID = 1016


def _legacy_title_chars(title: str) -> str:
    return title.replace("█", "'").replace("▀", "'").strip()


def _normalize_credit_title(title: str) -> str:
    return _normalize_title(_legacy_title_chars(title))


def _credit_title_keys(title: str) -> set[str]:
    keys: set[str] = set()
    raw = title.strip()
    if not raw:
        return keys
    candidates = [raw]
    bracket = re.match(r"^(.+?)\s*\[([^\]]+)\]\s*$", raw)
    if bracket:
        candidates.append(bracket.group(1).strip())
    paren = re.match(r"^(.+?)\s*\(([^)]+)\)\s*$", raw)
    if paren:
        candidates.append(paren.group(1).strip())
    inner = bracket.group(2).strip() if bracket else (paren.group(2).strip() if paren else "")
    if inner:
        for part in re.split(r"[;:]+", inner):
            cover = re.match(r"^(.+?)\s+cover$", part.strip(), re.IGNORECASE)
            if cover:
                candidates.append(cover.group(1).strip())
    for candidate in candidates:
        key = _normalize_credit_title(candidate)
        if key:
            keys.add(key)
    return keys


def _cover_writers_from_title(title: str) -> list[str]:
    raw = title.strip()
    bracket = re.match(r"^(.+?)\s*\[([^\]]+)\]\s*$", raw)
    paren = re.match(r"^(.+?)\s*\(([^)]+)\)\s*$", raw)
    inner = bracket.group(2).strip() if bracket else (paren.group(2).strip() if paren else "")
    if not inner:
        return []
    writers: list[str] = []
    for part in re.split(r"[;:]+", inner):
        cover = re.match(r"^(.+?)\s+cover$", part.strip(), re.IGNORECASE)
        if cover:
            name = cover.group(1).strip()
            if name and name not in writers:
                writers.append(name)
    return writers


def _artist_names(db: Session, ids: list[int]) -> list[str]:
    names: list[str] = []
    for aid in ids:
        row = db.get(Artist, aid)
        if row and row.art_name:
            n = row.art_name.strip()
            if n and n not in names:
                names.append(n)
    return names


def _parse_writer_refs(db: Session, refs: str) -> list[str]:
    names: list[str] = []
    for part in refs.split(";"):
        token = part.strip().strip("{}")
        if not token:
            continue
        if token.endswith("_not_found"):
            name = token[: -len("_not_found")].strip()
            if name and name not in names:
                names.append(name)
            continue
        if token.isdigit():
            for artist_name in _artist_names(db, [int(token)]):
                if artist_name not in names:
                    names.append(artist_name)
            continue
        if token not in names:
            names.append(token)
    return names


def _writers_from_release_field(db: Session, raw: str, title: str) -> list[str]:
    keys = _credit_title_keys(title)
    for match in TRACK_WRITERS_RE.finditer(raw):
        track_part = match.group(1).strip()
        if _normalize_credit_title(track_part) not in keys:
            continue
        return _parse_writer_refs(db, match.group(2))
    return []


_band_releases_cache: dict[int, list[Release]] = {}
_lead_vocalist_cache: dict[tuple[int, int | None], list[str]] = {}


def _releases_for_band(db: Session, band_id: int) -> list[Release]:
    cached = _band_releases_cache.get(band_id)
    if cached is not None:
        return cached
    needle = str(band_id)
    rows: list[Release] = []
    for rel in db.scalars(select(Release)).all():
        fk = rel.rel_fk_bands or ""
        if fk == needle or needle in _parse_ids(fk):
            rows.append(rel)
    _band_releases_cache[band_id] = rows
    return rows


def _writer_refs_from_band_catalog(
    db: Session,
    band_id: int,
    title: str,
    *,
    skip_rel_id: int | None = None,
) -> str | None:
    keys = _credit_title_keys(title)
    for rel in _releases_for_band(db, band_id):
        if skip_rel_id is not None and rel.rel_id == skip_rel_id:
            continue
        raw = rel.rel_fk_writers or ""
        if not raw:
            continue
        for match in TRACK_WRITERS_RE.finditer(raw):
            track_part = match.group(1).strip()
            if _normalize_credit_title(track_part) not in keys:
                continue
            return match.group(2)
    return None


def _album_track_titles(
    db: Session,
    band_id: int,
    release_id: str,
) -> list[str]:
    from app.release_tracklist import build_release_tracklist

    payload = build_release_tracklist(db, band_id, release_id)
    if not payload:
        return []
    titles: list[str] = []
    seen: set[str] = set()
    for edition in payload.get("editions") or []:
        for group in edition.get("groups") or []:
            for track in group.get("tracks") or []:
                name = (track.get("title") or "").strip()
                if not name:
                    continue
                key = _normalize_credit_title(name)
                if key in seen:
                    continue
                seen.add(key)
                titles.append(name)
    return titles


def _supplement_release_writers(
    db: Session,
    band_id: int,
    rel: Release,
    *,
    release_id: str,
) -> str:
    base = (rel.rel_fk_writers or "").strip()
    album_titles = _album_track_titles(db, band_id, release_id)
    if not album_titles:
        return base

    supplements: list[str] = []
    for track_title in album_titles:
        if _writers_from_release_field(db, base, track_title):
            continue
        merged_so_far = base
        if supplements:
            merged_so_far = (
                f"{base}{TRACK_WRITERS_SEP}{TRACK_WRITERS_SEP.join(supplements)}"
                if base
                else TRACK_WRITERS_SEP.join(supplements)
            )
        if _writers_from_release_field(db, merged_so_far, track_title):
            continue
        refs = _writer_refs_from_band_catalog(
            db, band_id, track_title, skip_rel_id=rel.rel_id
        )
        if not refs:
            continue
        supplements.append(f"~{track_title}~[{{{refs}}}]")

    if not supplements:
        return base
    if base:
        return f"{base}{TRACK_WRITERS_SEP}{TRACK_WRITERS_SEP.join(supplements)}"
    return TRACK_WRITERS_SEP.join(supplements)


def _era_lead_vocalist(
    db: Session,
    band,
    media_root,
    year: int | None,
) -> list[str]:
    cache_key = (band.bnd_id, year)
    cached = _lead_vocalist_cache.get(cache_key)
    if cached is not None:
        return cached

    from app.band_overview import _build_lineup, _is_solo, _solo_performer
    from app.release_overview import _filter_lineup

    if _is_solo(db, band):
        solo = _solo_performer(db, band, media_root)
        if solo and solo.get("name"):
            result = [solo["name"]]
            _lead_vocalist_cache[cache_key] = result
            return result

    lineup = _build_lineup(db, band, media_root)
    members = _filter_lineup(lineup, year) if year is not None else (lineup.get("all") or [])

    leads: list[str] = []
    vocal_fallback: list[str] = []
    for member in members:
        name = (member.get("name") or "").strip()
        if not name:
            continue
        roles = [r.casefold() for r in (member.get("roles") or [])]
        inst_ids = _parse_ids(member.get("instrument_ids_raw") or "")
        if LEAD_VOCALS_INSTRUMENT_ID in inst_ids or any(r == "lead vocals" for r in roles):
            if name not in leads:
                leads.append(name)
            continue
        if any("vocal" in r for r in roles) and not any("backing" in r for r in roles):
            if name not in vocal_fallback:
                vocal_fallback.append(name)

    if leads:
        result = leads[:1]
    elif vocal_fallback:
        result = vocal_fallback[:1]
    else:
        result = []
    _lead_vocalist_cache[cache_key] = result
    return result


def _track_row(db: Session, band_id: int, title: str) -> Track | None:
    keys = _credit_title_keys(title)
    needle = str(band_id)
    for row in db.scalars(select(Track)).all():
        bid = row.tra_band_id or ""
        if bid != needle and needle not in _parse_ids(bid):
            continue
        name = (row.tra_name or "").strip()
        if _normalize_credit_title(name) in keys:
            return row
    return None


def _release_year(card: dict) -> int | None:
    date_iso = card.get("date_iso")
    if not date_iso or len(date_iso) < 4:
        return None
    year = date_iso[:4]
    return int(year) if year.isdigit() else None


def get_track_credits(
    db: Session,
    band_id: int,
    release_id: str,
    *,
    title: str,
) -> dict:
    resolved = resolve_release_content(db, band_id, release_id)
    if not resolved:
        return {"title": title, "writers": [], "composers": [], "lyricists": [], "source": None}

    band, card, media_root, _ = resolved
    album_title = card.get("title") or ""
    release_year = _release_year(card)
    rel = _match_db_release(db, band_id, album_title)

    writers: list[str] = []
    composers: list[str] = []
    lyricists: list[str] = []
    source: str | None = None

    track = _track_row(db, band_id, title)
    if track and track.tra_author_id:
        ids = _parse_ids(track.tra_author_id)
        writers = _artist_names(db, ids)
        if writers:
            source = "track"

    if not writers and rel:
        base = rel.rel_fk_writers or ""
        writers = _writers_from_release_field(db, base, title)
        if writers:
            source = "release"

    if not writers and rel:
        refs = _writer_refs_from_band_catalog(
            db, band_id, title, skip_rel_id=rel.rel_id
        )
        if refs:
            writers = _parse_writer_refs(db, refs)
            if writers:
                source = "release"

    if not writers:
        writers = _cover_writers_from_title(title)
        if writers:
            source = "title"

    if not writers:
        writers = _era_lead_vocalist(db, band, media_root, release_year)
        if writers:
            source = "lineup"

    return {
        "title": title,
        "writers": writers,
        "composers": composers,
        "lyricists": lyricists,
        "source": source,
    }
