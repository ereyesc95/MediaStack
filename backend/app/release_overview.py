"""Build release overview payload from disk layout + optional DB enrichment."""
from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import AUDIO_CATEGORIES, _find_artwork_subdir
from app.band_overview import (
    _build_lineup,
    _display_name,
    _is_solo,
    _normalize_bio,
    _pick_brand_for_year_deterministic,
    _solo_performer,
)
from app.config import settings
from app.label_assets import label_logo_url
from app.gallery import (
    EraBrand,
    GalleryPhoto,
    IMAGE_EXTS,
    _artist_dir,
    _gallery_subdir,
    _list_era_brands,
    _list_photos,
    _media_url,
)
from app.media_index import (
    COVER_FRONT_STEM,
    DISC_DIR_RE,
    STANDARD_EDITION,
    _artwork_file,
    _child_release_folders,
    _disc_sort_key,
    format_display_date,
    get_audio_index,
    parse_bracket_tags,
)
from app.media_paths_util import entry_display_name, resolve_media_entry, safe_relative
from app.models import Artist, Band, Release, Subgenre
from app.music_filters import _parse_ids

COVER_INNER_STEM = "cover - inner"
COVER_BACK_STEM = "cover - back"
COVER_ANIMATION_STEM = "cover - animation"
LOGO_STEM = "logo"
TAPE_RE = re.compile(r"^\d+\.\s*(Tape|Cassette)\s+", re.I)

PHOTOCARD_STEMS = {
    "portrait_front": "photocard - portrait front",
    "portrait_back": "photocard - portrait back",
    "landscape_front": "photocard - landscape front",
    "landscape_back": "photocard - landscape back",
}

CATEGORY_TYPE_LABELS: dict[str, str] = {
    "albums": "Album",
    "extended_plays": "EP",
    "compilations": "Compilation",
    "soundtracks": "Soundtrack",
    "live_albums": "Live album",
    "singles": "Single",
}


def _release_year(date_iso: str | None) -> int | None:
    if not date_iso or len(date_iso) < 4:
        return None
    y = date_iso[:4]
    return int(y) if y.isdigit() else None


def find_release_card(releases: list[dict], release_id: str) -> dict | None:
    for r in releases:
        if r.get("id") == release_id or r.get("navigate_release_id") == release_id:
            return r
    return None


def resolve_release_content(
    db: Session,
    band_id: int,
    release_id: str,
) -> tuple[Band, dict, Path, Path] | None:
    """Return (band, audio_index_card, media_root, content_dir) or None."""
    band = db.get(Band, band_id)
    if not band or not settings.media_root:
        return None
    media_root = Path(settings.media_root)
    if not media_root.is_dir():
        return None
    audio_data = get_audio_index(db, band, force=False)
    card = find_release_card(audio_data.get("releases") or [], release_id)
    if not card or not card.get("folder_path"):
        return None
    display_entry = media_root / Path(card["folder_path"])
    content = resolve_media_entry(display_entry)
    if not content or not content.is_dir():
        return None
    return band, card, media_root, content


def _resolve_standard_edition(content: Path) -> Path:
    for child in sorted(content.iterdir(), key=lambda p: p.name.casefold()):
        if child.is_dir() and child.name.casefold() == STANDARD_EDITION:
            return child
    for child in sorted(content.iterdir(), key=lambda p: p.name.casefold()):
        if child.is_dir() and DISC_DIR_RE.match(child.name):
            return child
    return content


def _standard_artwork_dir(edition: Path) -> Path | None:
    art = _find_artwork_subdir(edition)
    if art:
        return art
    for child in edition.iterdir():
        if child.is_dir():
            art = _find_artwork_subdir(child)
            if art:
                return art
    return None


def _disc_image_url(artwork: Path, media_root: Path) -> str | None:
    candidates: list[Path] = []
    for p in artwork.iterdir():
        if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
            continue
        stem = p.stem.casefold()
        if "disc" in stem or "vinyl" in stem or "cd" in stem:
            candidates.append(p)
    if not candidates:
        return None
    candidates.sort(key=lambda p: (0 if p.stem.casefold().startswith("disc 1") else 1, p.name.casefold()))
    return _media_url(candidates[0], media_root)


def _artwork_urls(artwork: Path | None, media_root: Path) -> dict[str, str | None]:
    if not artwork:
        return {
            "cover_front_url": None,
            "cover_back_url": None,
            "cover_inner_url": None,
            "cover_animation_url": None,
            "logo_url": None,
            "disc_url": None,
            "spotify_url": None,
            "qr_url": None,
        }
    cover_front = _artwork_file(artwork, COVER_FRONT_STEM)
    cover_back = _artwork_file(artwork, COVER_BACK_STEM)
    cover_inner = _artwork_file(artwork, COVER_INNER_STEM)
    cover_animation = _artwork_file(artwork, COVER_ANIMATION_STEM)
    logo = _artwork_file(artwork, LOGO_STEM)
    spotify = _artwork_file(artwork, "spotify")
    qr = _artwork_file(artwork, "qr")
    return {
        "cover_front_url": _media_url(cover_front, media_root) if cover_front else None,
        "cover_back_url": _media_url(cover_back, media_root) if cover_back else None,
        "cover_inner_url": _media_url(cover_inner, media_root) if cover_inner else None,
        "cover_animation_url": _media_url(cover_animation, media_root)
        if cover_animation
        else None,
        "logo_url": _media_url(logo, media_root) if logo else None,
        "disc_url": _disc_image_url(artwork, media_root),
        "spotify_url": _media_url(spotify, media_root) if spotify else None,
        "qr_url": _media_url(qr, media_root) if qr else None,
    }


def _detect_playback_kind(content: Path) -> str:
    for child in content.rglob("*"):
        if not child.is_dir():
            continue
        name = child.name
        if TAPE_RE.match(name):
            return "tape"
        if DISC_DIR_RE.match(name):
            stem = name.casefold()
            if "vinyl" in stem:
                return "vinyl"
            return "disc"
    return "disc"


def _photocards(artwork: Path | None, media_root: Path) -> dict[str, str | None]:
    out: dict[str, str | None] = {k: None for k in PHOTOCARD_STEMS}
    if not artwork:
        return out
    for key, stem in PHOTOCARD_STEMS.items():
        f = _artwork_file(artwork, stem)
        if f:
            out[key] = _media_url(f, media_root)
    return out


def _is_box_set(content: Path) -> bool:
    if not content.is_dir():
        return False
    lnk = sum(1 for c in content.iterdir() if c.suffix.casefold() == ".lnk")
    dirs = sum(1 for c in content.iterdir() if c.is_dir())
    return lnk > 0 and lnk >= max(dirs, 1)


def _release_type_label(category: str, content: Path) -> str:
    if category == "compilations" and _is_box_set(content):
        return "Box set"
    return CATEGORY_TYPE_LABELS.get(category, "Release")


def _closest_gallery_photo(photos: list[GalleryPhoto], year: int | None) -> GalleryPhoto | None:
    if not photos:
        return None
    if year is None:
        return sorted(photos, key=lambda p: (p.year, p.path.name.lower()))[0]
    return min(photos, key=lambda p: (abs(p.year - year), p.year, p.path.name.lower()))


def _member_active_at_year(member: dict, year: int | None) -> bool:
    if year is None:
        return True
    start = member.get("start")
    end = member.get("end")
    sy = int(start[:4]) if start and len(start) >= 4 and start[:4].isdigit() else None
    ey = int(end[:4]) if end and len(end) >= 4 and end[:4].isdigit() else None
    if sy is not None and sy > year:
        return False
    if ey is not None and ey < year:
        return False
    return True


def _filter_lineup(lineup: dict, year: int | None) -> list[dict]:
    return [m for m in lineup.get("all") or [] if _member_active_at_year(m, year)]


def _singles_for_release(content: Path, media_root: Path) -> list[dict]:
    out: list[dict] = []
    for child in _child_release_folders(content):
        rel = safe_relative(child, media_root)
        if not rel:
            continue
        edition = _resolve_standard_edition(child)
        artwork = _standard_artwork_dir(edition)
        urls = _artwork_urls(artwork, media_root)
        name = entry_display_name(child)
        clean, _ = parse_bracket_tags(name)
        out.append(
            {
                "id": rel,
                "title": clean.split(" ", 1)[-1] if re.match(r"^\d{4}", clean) else clean,
                "folder_path": rel,
                "cover_url": urls.get("cover_front_url"),
            }
        )
    return out


def _prev_next_neighbors(
    releases: list[dict],
    card: dict,
) -> tuple[dict | None, dict | None]:
    category = card.get("category")
    official = card.get("official", True)
    pool = [
        r
        for r in releases
        if r.get("category") == category and r.get("official") == official
    ]
    pool.sort(key=lambda r: (r.get("date_iso") or "9999-12-31", r.get("title") or ""))
    if len(pool) < 2:
        return None, None
    rid = card.get("id")
    idx = next(
        (i for i, r in enumerate(pool) if r.get("id") == rid or r.get("navigate_release_id") == rid),
        None,
    )
    if idx is None:
        return None, None
    prev_r = pool[(idx - 1) % len(pool)]
    next_r = pool[(idx + 1) % len(pool)]
    return (
        {"id": prev_r["id"], "title": prev_r["title"], "cover_url": prev_r.get("cover_url")},
        {"id": next_r["id"], "title": next_r["title"], "cover_url": next_r.get("cover_url")},
    )


def _match_db_release(db: Session, band_id: int, title: str) -> Release | None:
    norm = title.casefold().strip()
    for rel in db.scalars(select(Release)).all():
        fk = rel.rel_fk_bands or ""
        if str(band_id) not in _parse_ids(fk):
            continue
        rt = (rel.rel_title or "").casefold().strip()
        if rt == norm:
            return rel
    return None


def _resolve_subgenres(db: Session, raw: str | None) -> list[dict]:
    ids = _parse_ids(raw or "")
    out: list[dict] = []
    for sid in ids:
        sg = db.get(Subgenre, sid)
        if sg and sg.sgn_name:
            out.append({"id": sg.sgn_id, "name": sg.sgn_name})
    return out


def _resolve_producer(db: Session, raw: str | None) -> str | None:
    ids = _parse_ids(raw or "")
    names: list[str] = []
    for aid in ids:
        artist = db.get(Artist, aid)
        if artist:
            names.append(_display_name(artist.art_stage_name or artist.art_name))
    return "; ".join(names) if names else None


def _enrich_from_db(
    db: Session,
    band_id: int,
    title: str,
    disk: dict,
) -> dict:
    rel = _match_db_release(db, band_id, title)
    if not rel:
        return disk
    desc_raw = (rel.rel_fk_desc or "").strip()
    if desc_raw and not disk.get("description"):
        disk["description"] = _normalize_bio(desc_raw.replace("■", ".").replace("█", "'"))
        disk["description_source"] = "database"
    if not disk.get("subgenres"):
        disk["subgenres"] = _resolve_subgenres(db, rel.rel_fk_subgenres)
    if not disk.get("producer"):
        disk["producer"] = _resolve_producer(db, rel.rel_fk_artists)
    if not disk.get("label"):
        label = (rel.rel_fk_companies or "").strip()
        if label:
            disk["label"] = label
    if rel.rel_release_code and not disk.get("release_code"):
        disk["release_code"] = rel.rel_release_code
    return disk


def build_release_overview(
    db: Session,
    band_id: int,
    release_id: str,
    *,
    card_orientation: str = "landscape",
) -> dict | None:
    band = db.get(Band, band_id)
    if not band:
        return None

    if not settings.media_root:
        return None
    media_root = Path(settings.media_root)
    if not media_root.is_dir():
        return None

    audio_data = get_audio_index(db, band, force=False)
    card = find_release_card(audio_data.get("releases") or [], release_id)
    if not card:
        return None

    folder_rel = card.get("folder_path")
    if not folder_rel:
        return None
    display_entry = media_root / Path(folder_rel)
    content = resolve_media_entry(display_entry)
    if not content or not content.is_dir():
        return None

    edition = _resolve_standard_edition(content)
    artwork = _standard_artwork_dir(edition)
    urls = _artwork_urls(artwork, media_root)
    photocards = _photocards(artwork, media_root)

    bg_layers = [
        u
        for u in (
            urls.get("cover_inner_url"),
            urls.get("cover_back_url"),
            urls.get("cover_front_url"),
        )
        if u
    ]

    release_year = _release_year(card.get("date_iso"))
    artist_dir = _artist_dir(media_root, band.bnd_name)
    era_icon_url: str | None = None
    era_logo_url: str | None = None
    gallery_photo_url: str | None = None

    if artist_dir:
        logos_dir = _gallery_subdir(artist_dir, "Logos")
        brands: list[EraBrand] = _list_era_brands(logos_dir)
        if release_year:
            icon = _pick_brand_for_year_deterministic(brands, release_year, "icon")
            logo = _pick_brand_for_year_deterministic(brands, release_year, "logo")
            if icon:
                era_icon_url = _media_url(icon.path, media_root)
            if logo:
                era_logo_url = _media_url(logo.path, media_root)
        photos_dir = _gallery_subdir(artist_dir, "Photos")
        photos = _list_photos(photos_dir)
        closest = _closest_gallery_photo(photos, release_year)
        if closest:
            gallery_photo_url = _media_url(closest.path, media_root)

    lineup_full = _build_lineup(db, band, media_root)
    solo = _is_solo(db, band)
    show_lineup = not solo
    solo_performer = _solo_performer(db, band, media_root) if solo else None
    lineup_members = (
        [solo_performer]
        if solo and solo_performer
        else _filter_lineup(lineup_full, release_year)
    )

    prev_r, next_r = _prev_next_neighbors(audio_data.get("releases") or [], card)
    type_label = _release_type_label(card.get("category") or "", content)
    artist_name = _display_name(band.bnd_name)

    source_artist: str | None = None
    folder_name = entry_display_name(display_entry)
    _, tags = parse_bracket_tags(folder_name)
    if tags.get("source_artist"):
        source_artist = tags["source_artist"]

    payload: dict = {
        "id": card["id"],
        "band_id": band_id,
        "artist_name": artist_name,
        "title": card.get("title") or "",
        "category": card.get("category"),
        "release_type": type_label,
        "release_type_line": f"{type_label} by {artist_name}",
        "date_iso": card.get("date_iso"),
        "display_date": card.get("display_date") or format_display_date(card.get("date_iso")),
        "official": card.get("official", True),
        "folder_path": folder_rel,
        "source_artist": source_artist,
        "description": None,
        "description_manual": False,
        "description_source": None,
        "subgenres": [],
        "producer": None,
        "label": None,
        "label_logo_url": None,
        "release_code": None,
        "reviews": [],
        "cover_url": urls.get("cover_front_url") or card.get("cover_url"),
        "cover_animation_url": urls.get("cover_animation_url"),
        "disc_url": urls.get("disc_url"),
        "playback_kind": _detect_playback_kind(content),
        "background_layers": bg_layers,
        "era_icon_url": era_icon_url,
        "era_logo_url": era_logo_url,
        "logo_url": urls.get("logo_url") or card.get("logo_url"),
        "spotify_url": urls.get("spotify_url"),
        "qr_url": urls.get("qr_url"),
        "photocards": photocards,
        "gallery_photo_url": gallery_photo_url,
        "lineup": lineup_members,
        "show_lineup": show_lineup,
        "is_solo": solo,
        "singles": _singles_for_release(content, media_root),
        "prev": prev_r,
        "next": next_r,
        "navigate_band_id": card.get("navigate_band_id") or band_id,
        "navigate_release_id": card.get("navigate_release_id") or card["id"],
    }

    payload = _enrich_from_db(db, band_id, payload["title"], payload)
    if payload.get("label"):
        payload["label_logo_url"] = label_logo_url(payload["label"])
    from app.release_metadata_refresh import apply_mb_cache
    from app.release_admin import apply_release_overrides

    payload = apply_mb_cache(payload, band_id, release_id)
    return apply_release_overrides(payload, band_id, release_id)
