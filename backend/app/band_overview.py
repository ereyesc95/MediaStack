"""Build artist overview page payload from DB + local gallery."""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import match_top_tracks
from app.media_index import media_visibility_flags
from app.media_index import VARIOUS_ARTISTS_DEFAULT_ID
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
from app.label_assets import label_logo_url
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


def _member_photo_url(artist: Artist, media_root: Path | None) -> str | None:
    from app.artist_photo import member_photo_url

    return member_photo_url(artist, media_root)


def _format_years(start: str | None, end: str | None) -> str | None:
    s = (start or "").strip()
    e = (end or "").strip()
    if not s and not e:
        return None
    sy = s[:4] if len(s) >= 4 else s or "?"
    ey = e[:4] if len(e) >= 4 else ("present" if not e else e)
    return f"{sy}–{ey}"


def _participation_flags(
    arp: ArtistParticipation,
    founding_year: int | None,
) -> dict[str, bool]:
    start = (arp.arp_start_dates or "").strip()
    end = (arp.arp_end_dates or "").strip()
    type_ids = _parse_ids(arp.arp_fk_participation_types)
    is_active = not end
    is_founding = 1 in type_ids
    if not is_founding and founding_year and start[:4].isdigit():
        is_founding = int(start[:4]) <= founding_year + 2
    is_former = bool(end) or 3 in type_ids
    is_official = is_active or 0 in type_ids or (not type_ids and is_active)
    return {
        "is_active": is_active,
        "is_founding": is_founding,
        "is_former": is_former,
        "is_official": is_official,
    }


def _lineup_entry(
    db: Session,
    arp: ArtistParticipation,
    artist: Artist,
    media_root: Path | None,
    founding_year: int | None,
) -> dict:
    from app.lineup_instruments import instrument_label

    name = _display_name(artist.art_stage_name or artist.art_name)
    start = (arp.arp_start_dates or "").strip() or None
    end = (arp.arp_end_dates or "").strip() or None
    inst_raw = arp.arp_fk_instruments or ""
    inst_ids = _parse_ids(inst_raw)
    roles: list[str] = []
    if inst_ids:
        for iid in inst_ids:
            label = instrument_label(db, iid)
            if label:
                roles.append(label)
    flags = _participation_flags(arp, founding_year)
    deceased = bool((artist.art_death_date or "").strip())
    return {
        "id": artist.art_id,
        "participation_id": arp.arp_id,
        "name": name,
        "photo_url": _member_photo_url(artist, media_root),
        "start": start,
        "end": end,
        "years": _format_years(start, end),
        "roles": roles,
        "instrument_ids_raw": inst_raw,
        "is_deceased": deceased,
        **flags,
    }


def _build_lineup(db: Session, band: Band, media_root: Path | None) -> dict:
    from app.lineup_sort import sort_lineup_members

    rows = db.scalars(
        select(ArtistParticipation).where(ArtistParticipation.arp_fk_bands == band.bnd_id)
    ).all()
    band_start = (band.bnd_starting_dates or "").split(";")[0].strip()[:4]
    founding_year = int(band_start) if band_start.isdigit() else None

    all_entries: list[dict] = []
    for arp in rows:
        artist = db.get(Artist, arp.arp_fk_artists) if arp.arp_fk_artists else None
        if not artist:
            continue
        all_entries.append(_lineup_entry(db, arp, artist, media_root, founding_year))

    sorted_entries = sort_lineup_members(all_entries)
    official = [e for e in sorted_entries if e.get("is_official")]
    founding = [e for e in sorted_entries if e.get("is_founding")]
    former = [e for e in sorted_entries if e.get("is_former")]

    return {
        "all": sorted_entries,
        "current": official,
        "founding": founding,
        "former": former,
        "lineup_imported_at": band.bnd_lineup_imported_at,
        "importing": False,
    }


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


def _is_band_entity_artist(db: Session, artist: Artist, *, solo_band_id: int) -> bool:
    """True when the artist row mirrors another band (e.g. HIM), not a person."""
    code = (artist.art_code or "").strip()
    if not code:
        return False
    return (
        db.scalars(
            select(Band).where(
                Band.bnd_code == code,
                Band.bnd_id != solo_band_id,
            )
        ).first()
        is not None
    )


def _solo_performer(
    db: Session, band: Band, media_root: Path | None
) -> dict | None:
    if not _is_solo(db, band):
        return None
    artist: Artist | None = None
    arp: ArtistParticipation | None = None
    band_code = (band.bnd_code or "").strip()

    if band_code:
        artist = db.scalars(
            select(Artist).where(Artist.art_code == band.bnd_code)
        ).first()
        if artist:
            arp = db.scalars(
                select(ArtistParticipation).where(
                    ArtistParticipation.arp_fk_bands == band.bnd_id,
                    ArtistParticipation.arp_fk_artists == artist.art_id,
                )
            ).first()

    if not artist:
        for row in db.scalars(
            select(ArtistParticipation)
            .where(ArtistParticipation.arp_fk_bands == band.bnd_id)
            .order_by(ArtistParticipation.arp_id)
        ).all():
            if not row.arp_fk_artists:
                continue
            candidate = db.get(Artist, row.arp_fk_artists)
            if not candidate or _is_band_entity_artist(
                db, candidate, solo_band_id=band.bnd_id
            ):
                continue
            artist = candidate
            arp = row
            break

    if not artist:
        return None

    if arp:
        start = (arp.arp_start_dates or "").strip() or None
        end = (arp.arp_end_dates or "").strip() or None
    else:
        start = (band.bnd_starting_dates or "").split(";")[0].strip() or None
        end = (band.bnd_ending_dates or "").split(";")[0].strip() or None
    name = _display_name(artist.art_stage_name or artist.art_name)
    deceased = bool((artist.art_death_date or "").strip())
    return {
        "id": artist.art_id,
        "name": name,
        "photo_url": _member_photo_url(artist, media_root),
        "start": start,
        "end": end,
        "years": _format_years(start, end),
        "roles": [],
        "is_deceased": deceased,
    }


def _is_solo(db: Session, band: Band) -> bool:
    if not band.bnd_fk_artisttypes:
        return False
    for tid in _parse_ids(band.bnd_fk_artisttypes):
        t = db.get(ArtistType, tid)
        if t and t.aty_name and t.aty_name.lower() in ("person", "solo"):
            return True
    return False


def build_band_overview(
    db: Session,
    band_id: int,
    *,
    is_admin: bool = False,
    card_orientation: str = "landscape",
) -> dict | None:
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
    media: dict = {
        "has_audio": False,
        "has_video": False,
        "has_library": False,
        "has_gallery": False,
        "has_playlists": False,
        "audio_categories": [],
    }
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
        media = media_visibility_flags(band.bnd_name, root, db=db, band=band)

    lineup = _build_lineup(db, band, root)
    solo = _is_solo(db, band)
    is_various = band_id == VARIOUS_ARTISTS_DEFAULT_ID
    needs_lineup_import = bool(
        band.bnd_code and not band.bnd_lineup_imported_at and not solo and not is_various
    )
    show_lineup = not solo and not is_various and (
        bool(lineup.get("all")) or needs_lineup_import
    )
    solo_performer = _solo_performer(db, band, root) if solo else None

    from app.entity_links import links_payload_for_band
    from app.entity_related import related_payload

    solo_artist_id = solo_performer["id"] if solo_performer else None
    links = links_payload_for_band(
        db, band, is_admin=is_admin, solo_artist_id=solo_artist_id
    )
    related = related_payload(
        db,
        band=band,
        solo_artist_id=solo_artist_id,
        orientation=card_orientation,
    )

    various_artists_hub = None
    if is_various and root:
        from app.various_artists_hub import (
            VARIOUS_ARTISTS_BIO,
            build_various_artists_hub,
        )

        various_artists_hub = build_various_artists_hub(
            db, band, root, orientation=card_orientation
        )
        if not (band.bnd_bio_manual or 0):
            bio = VARIOUS_ARTISTS_BIO

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
        "labels": (
            label_names := _resolve_labels(db, band.bnd_id)
        ),
        "label_logos": {name: label_logo_url(name) for name in label_names},
        "eras": eras,
        "top_tracks": top_tracks,
        "links": links,
        "lineup": lineup,
        "show_lineup": show_lineup,
        "solo_performer": solo_performer,
        "is_solo": solo,
        "is_various_artists": is_various,
        "various_artists_hub": various_artists_hub,
        "related": related,
        "media": media,
        "metadata_refreshed_at": band.bnd_metadata_refreshed_at,
        "library_scanned_at": band.bnd_library_scanned_at,
        "needs_lineup_import": needs_lineup_import,
    }


def _overview_media_mtimes(band: Band, root: Path | None) -> tuple[float, float]:
    gallery_mtime = 0.0
    audio_mtime = 0.0
    if not root:
        return gallery_mtime, audio_mtime
    artist_dir = _artist_dir(root, band.bnd_name)
    if not artist_dir:
        return gallery_mtime, audio_mtime
    from app.media_index import _audio_mtime

    audio_mtime = _audio_mtime(artist_dir)
    photos = _gallery_subdir(artist_dir, "Photos")
    if photos.is_dir():
        try:
            gallery_mtime = photos.stat().st_mtime
        except OSError:
            pass
    return gallery_mtime, audio_mtime


def get_band_overview(
    db: Session,
    band_id: int,
    *,
    is_admin: bool = False,
    card_orientation: str = "landscape",
) -> dict | None:
    from app.band_overview_cache import (
        cache_fingerprint,
        load_cached_overview,
        save_cached_overview,
    )

    band = db.get(Band, band_id)
    if not band:
        return None

    media_root = Path(settings.media_root) if settings.media_root else None
    root = media_root if media_root and media_root.is_dir() else None
    gallery_mtime, audio_mtime = _overview_media_mtimes(band, root)
    fingerprint = cache_fingerprint(
        library_scanned_at=band.bnd_library_scanned_at,
        metadata_refreshed_at=band.bnd_metadata_refreshed_at,
        lineup_imported_at=band.bnd_lineup_imported_at,
        gallery_mtime=gallery_mtime,
        audio_mtime=audio_mtime,
    )

    cached = load_cached_overview(
        band_id, card_orientation, fingerprint=fingerprint
    )
    if cached is not None:
        cached = dict(cached)
        cached["cached"] = True
        return cached

    data = build_band_overview(
        db,
        band_id,
        is_admin=is_admin,
        card_orientation=card_orientation,
    )
    if data is None:
        return None
    data = dict(data)
    data["cached"] = False
    save_cached_overview(
        band_id,
        card_orientation,
        fingerprint=fingerprint,
        data=data,
    )
    return data
