"""Build artist overview page payload from DB + local gallery."""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import match_top_tracks, scan_audio_library
from app.config import settings
from app.gallery import (
    EraBrand,
    GalleryPhoto,
    _artist_dir,
    _gallery_subdir,
    _list_era_brands,
    _list_photos,
    _media_url,
)
from app.models import Artist, ArtistParticipation, ArtistType, Band, Country, Subgenre
from app.music_dashboard import _parse_country_id, _resolve_subgenre_name
from app.music_filters import _parse_ids, is_catalog_label

LINK_CATEGORIES: dict[str, tuple[str, ...]] = {
    "databases": (
        "discogs",
        "wikidata",
        "allmusic",
        "musicbrainz",
        "metal-archives",
        "rateyourmusic",
        "secondhandsongs",
        "other databases",
        "imdb",
        "viaf",
        "worldcat",
        "bbc music",
    ),
    "social": (
        "facebook",
        "twitter",
        "instagram",
        "social network",
        "myspace",
        "youtube",
        "reddit",
        "songkick",
        "bandsintown",
        "soundcloud",
    ),
    "stores": (
        "purchase for download",
        "purchase for mail-order",
        "bandcamp",
        "itunes",
        "apple music",
        "official store",
        "streaming",
        "free streaming",
    ),
    "lyrics": ("lyrics", "genius", "az", "musixmatch", "muzikum"),
    "downloads": ("rutracker", "the pirate bay", "download"),
    "other": (),
}


def _display_name(name: str | None) -> str:
    if not name:
        return "Unknown"
    return name.replace("■", ",").replace("█", "'").strip()


def _normalize_bio(text: str) -> str:
    """Unescape legacy stored escapes (\\", \\n) for display."""
    return text.replace("\\n", "\n").replace('\\"', '"')


def _parse_origin(origin: str | None) -> tuple[str | None, str | None]:
    if not origin:
        return None, None
    city = origin.split("[")[0].strip()
    return city or None, city or None


def _parse_activity_periods(
    starts: str | None, ends: str | None
) -> list[dict[str, str | None]]:
    start_parts = [p.strip() for p in (starts or "").split(";") if p.strip()]
    end_parts = [p.strip() for p in (ends or "").split(";") if p.strip()]
    if not start_parts and not end_parts:
        return []
    periods: list[dict[str, str | None]] = []
    count = max(len(start_parts), len(end_parts), 1)
    for i in range(count):
        s = start_parts[i] if i < len(start_parts) else start_parts[-1] if start_parts else None
        e = end_parts[i] if i < len(end_parts) else None
        if e:
            label_end = e[:4] if len(e) >= 4 else e
        else:
            label_end = "present"
        label_start = (s or "")[:4] if s else "?"
        periods.append(
            {
                "start": s,
                "end": e,
                "label": f"{label_start}–{label_end}" if s else str(label_end),
            }
        )
    return periods


def _parse_websites(raw: str | None) -> list[dict[str, str]]:
    if not raw:
        return []
    out: list[dict[str, str]] = []
    for chunk in raw.split("];"):
        chunk = chunk.strip().strip("]")
        if not chunk.startswith("["):
            continue
        chunk = chunk[1:]
        if "■" not in chunk:
            continue
        typ, url = chunk.split("■", 1)
        out.append({"type": typ.strip(), "url": url.strip()})
    return out


def _categorize_links(links: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    buckets: dict[str, list[dict[str, str]]] = {
        k: [] for k in ("databases", "social", "stores", "lyrics", "downloads", "other")
    }
    for link in links:
        typ = link["type"].lower()
        placed = False
        for cat, keys in LINK_CATEGORIES.items():
            if cat == "other":
                continue
            if any(k in typ for k in keys):
                buckets[cat].append(link)
                placed = True
                break
        if not placed:
            buckets["other"].append(link)
    return {k: v for k, v in buckets.items() if v}


def _photo_for_orientation(photos: list[GalleryPhoto], year: int, want: str) -> GalleryPhoto | None:
    pool = [p for p in photos if p.year == year and p.orientation == want]
    if pool:
        return sorted(pool, key=lambda p: p.path.name.lower())[0]
    pool = [p for p in photos if p.year == year]
    return sorted(pool, key=lambda p: p.path.name.lower())[0] if pool else None


def _pick_brand_for_year_deterministic(
    brands: list[EraBrand], year: int, kind: str
) -> EraBrand | None:
    matches = [b for b in brands if b.kind == kind and b.start <= year <= b.end]
    if not matches:
        return None
    return sorted(matches, key=lambda b: (-b.end, b.path.name.lower()))[0]


def list_era_slides(artist_name: str | None, media_root: Path) -> list[dict]:
    artist_dir = _artist_dir(media_root, artist_name)
    if not artist_dir:
        return []
    photos = _list_photos(_gallery_subdir(artist_dir, "Photos"))
    brands = _list_era_brands(_gallery_subdir(artist_dir, "Logos"))
    if not photos:
        return []

    slides: list[dict] = []
    sorted_photos = sorted(photos, key=lambda p: (-p.year, p.path.name.lower()))
    for photo in sorted_photos:
        year = photo.year
        portrait = (
            photo
            if photo.orientation == "portrait"
            else _photo_for_orientation(photos, year, "portrait")
        )
        landscape = (
            photo
            if photo.orientation == "landscape"
            else _photo_for_orientation(photos, year, "landscape")
        )
        icon = _pick_brand_for_year_deterministic(brands, year, "icon")
        logo = _pick_brand_for_year_deterministic(brands, year, "logo")
        slides.append(
            {
                "id": photo.path.as_posix(),
                "year": year,
                "orientation": photo.orientation,
                "slide_url": _media_url(photo.path, media_root),
                "portrait_url": _media_url(portrait.path, media_root) if portrait else None,
                "landscape_url": _media_url(landscape.path, media_root)
                if landscape
                else (_media_url(photo.path, media_root) if photo else None),
                "icon_url": _media_url(icon.path, media_root) if icon else None,
                "logo_url": _media_url(logo.path, media_root) if logo else None,
            }
        )
    return slides


def _member_photo_url(artist: Artist, media_root: Path) -> str | None:
    if not artist.art_code:
        return None
    name = _display_name(artist.art_stage_name or artist.art_name)
    letter = name[0].upper() if name and name[0].isalpha() else "#"
    people = media_root / "People" / letter
    if not people.is_dir():
        people = media_root / "Music" / "People" / letter
    if not people.is_dir():
        return None
    code = artist.art_code.lower()
    for p in people.iterdir():
        if p.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        if code in p.stem.lower():
            return _media_url(p, media_root)
    return None


def _build_lineup(db: Session, band: Band, media_root: Path) -> dict[str, list[dict]]:
    rows = db.scalars(
        select(ArtistParticipation).where(ArtistParticipation.arp_fk_bands == band.bnd_id)
    ).all()
    band_start = (band.bnd_starting_dates or "").split(";")[0].strip()[:4]
    founding_year = int(band_start) if band_start.isdigit() else None

    current: list[dict] = []
    founding: list[dict] = []
    former: list[dict] = []

    for arp in rows:
        artist = db.get(Artist, arp.arp_fk_artists) if arp.arp_fk_artists else None
        if not artist:
            continue
        name = _display_name(artist.art_stage_name or artist.art_name)
        start = (arp.arp_start_dates or "").strip()
        end = (arp.arp_end_dates or "").strip()
        entry = {
            "id": artist.art_id,
            "name": name,
            "photo_url": _member_photo_url(artist, media_root),
            "start": start or None,
            "end": end or None,
        }
        if not end:
            current.append(entry)
        elif founding_year and start[:4].isdigit() and int(start[:4]) <= founding_year + 2:
            founding.append(entry)
        else:
            former.append(entry)

    return {"current": current, "founding": founding, "former": former}


def _similar_artists(db: Session, band: Band) -> list[dict]:
    ids = _parse_ids(band.bnd_fk_artists)
    out: list[dict] = []
    for bid in ids:
        if bid == band.bnd_id:
            continue
        b = db.get(Band, bid)
        if b and b.bnd_name:
            out.append({"id": b.bnd_id, "name": _display_name(b.bnd_name)})
    return out


def _related_projects(db: Session, band: Band) -> list[dict]:
    member_ids = {
        arp.arp_fk_artists
        for arp in db.scalars(
            select(ArtistParticipation).where(
                ArtistParticipation.arp_fk_bands == band.bnd_id
            )
        ).all()
        if arp.arp_fk_artists
    }
    seen: set[int] = {band.bnd_id}
    out: list[dict] = []
    for mid in member_ids:
        for arp in db.scalars(
            select(ArtistParticipation).where(ArtistParticipation.arp_fk_artists == mid)
        ).all():
            if not arp.arp_fk_bands or arp.arp_fk_bands in seen:
                continue
            b = db.get(Band, arp.arp_fk_bands)
            if b and b.bnd_name:
                seen.add(b.bnd_id)
                out.append({"id": b.bnd_id, "name": _display_name(b.bnd_name)})
    return out


def _resolve_country(db: Session, band: Band) -> dict | None:
    cid = _parse_country_id(band.bnd_fk_countries)
    if not cid:
        return None
    row = db.get(Country, cid)
    if not row:
        return None
    return {
        "id": cid,
        "name": row.cou_name,
        "iso": (row.cou_iso or "").lower() or None,
    }


def _resolve_subgenres(db: Session, band: Band) -> list[dict]:
    out: list[dict] = []
    for sid in _parse_ids(band.bnd_fk_subgenres):
        name = _resolve_subgenre_name(db, sid)
        if name:
            out.append({"id": sid, "name": name})
    return out


def _resolve_labels(db: Session, band_id: int) -> list[str]:
    from app.models import Release

    labels: set[str] = set()
    needle = str(band_id)
    for rel in db.scalars(select(Release)).all():
        fk = rel.rel_fk_bands or ""
        if fk != needle and needle not in fk.split(";"):
            continue
        lab = (rel.rel_fk_companies or "").strip()
        if lab and is_catalog_label(lab):
            labels.add(lab)
    return sorted(labels, key=str.lower)


def _is_solo(db: Session, band: Band) -> bool:
    if not band.bnd_fk_artisttypes:
        return False
    for tid in _parse_ids(band.bnd_fk_artisttypes):
        t = db.get(ArtistType, tid)
        if t and t.aty_name and t.aty_name.lower() in ("person", "solo"):
            return True
    return False


def build_band_overview(db: Session, band_id: int) -> dict | None:
    band = db.get(Band, band_id)
    if not band:
        return None

    media_root = Path(settings.media_root) if settings.media_root else None
    root = media_root if media_root and media_root.is_dir() else None

    city, _ = _parse_origin(band.bnd_origin_place)
    country = _resolve_country(db, band)
    bio_raw = band.bnd_fk_images or ""
    bio = (
        _normalize_bio(bio_raw.replace("■", ".").replace("█", "'"))
        if bio_raw
        else None
    )

    top_tracks: list[dict] = []
    audio_library: dict[str, list[dict]] = {k: [] for k in (
        "albums", "extended_plays", "compilations", "soundtracks", "live_albums", "singles"
    )}
    eras: list[dict] = []

    if root:
        eras = list_era_slides(band.bnd_name, root)
        top_tracks = match_top_tracks(
            band.bnd_name,
            root,
            top_paths=band.bnd_top_tracks,
            top_titles=band.bnd_top_100,
            limit=5,
        )
        audio_library = scan_audio_library(band.bnd_name, root)

    links = _parse_websites(band.bnd_websites)
    lineup = _build_lineup(db, band, root) if root else {"current": [], "founding": [], "former": []}
    solo = _is_solo(db, band)
    show_lineup = not solo and (
        bool(lineup["current"]) or bool(lineup["founding"]) or bool(lineup["former"])
    )

    aliases = [
        a.strip()
        for a in (band.bnd_other_names or "").replace("█", "'").split(";")
        if a.strip()
    ]

    return {
        "id": band.bnd_id,
        "name": _display_name(band.bnd_name),
        "code": band.bnd_code,
        "bio": bio,
        "bio_manual": bool(band.bnd_bio_manual or 0),
        "bio_source": band.bnd_bio_source,
        "city": city,
        "country": country,
        "aliases": aliases,
        "activity_periods": _parse_activity_periods(
            band.bnd_starting_dates, band.bnd_ending_dates
        ),
        "subgenres": _resolve_subgenres(db, band),
        "labels": _resolve_labels(db, band.bnd_id),
        "eras": eras,
        "top_tracks": top_tracks,
        "links": _categorize_links(links),
        "lineup": lineup,
        "show_lineup": show_lineup,
        "similar_artists": _similar_artists(db, band),
        "related_projects": _related_projects(db, band),
        "audio": audio_library,
        "metadata_refreshed_at": band.bnd_metadata_refreshed_at,
        "library_scanned_at": band.bnd_library_scanned_at,
    }
