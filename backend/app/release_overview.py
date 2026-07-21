"""Build release overview payload from disk layout + optional DB enrichment."""
from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import (
    AUDIO_CATEGORIES,
    AUDIO_EXTS,
    DATE_PREFIX_RE,
    _audio_root,
    _collect_audio_files,
    _find_artwork_subdir,
    _parse_folder_date,
    _track_title_from_filename,
)
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
    _band_id_for_artist_name,
    _child_release_folders,
    _disc_sort_key,
    _is_edition_content_dir,
    _is_edition_folder,
    format_display_date,
    get_audio_index,
    is_box_set_name,
    parse_bracket_tags,
    release_id_from_path,
)
from app.media_paths_util import entry_display_name, resolve_media_entry, safe_relative
from app.models import Artist, Band, Release, Subgenre
from app.music_filters import _parse_ids

from app.artwork_stems import (
    COVER_BACK_STEM,
    COVER_INNER_STEM,
    VIDEO_EXTS,
    resolve_animation_album_file,
    resolve_canvas_album_file,
    resolve_cover_front_file,
)

LOGO_STEM = "logo"
ICON_STEM = "icon"
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
    content = resolve_media_entry(display_entry, media_root=media_root)
    if not content or not content.is_dir():
        return None
    return band, card, media_root, content


def _resolve_standard_edition(content: Path) -> Path:
    for child in sorted(content.iterdir(), key=lambda p: p.name.casefold()):
        if child.is_dir() and child.name.casefold() == STANDARD_EDITION:
            return child
    for child in sorted(content.iterdir(), key=lambda p: p.name.casefold()):
        if not child.is_dir():
            continue
        low = child.name.casefold()
        if low.endswith(f". {STANDARD_EDITION}") or low.endswith(STANDARD_EDITION):
            return child
    dated_editions: list[Path] = []
    for child in sorted(content.iterdir(), key=lambda p: p.name.casefold()):
        if child.is_dir() and _is_edition_content_dir(child):
            if DATE_PREFIX_RE.match(entry_display_name(child).strip()):
                dated_editions.append(child)
    if dated_editions:
        dated_editions.sort(
            key=lambda p: _parse_folder_date(p.name) or "9999-99-99"
        )
        return dated_editions[0]
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
        return "/api/assets/default/disc.png"
    candidates.sort(key=lambda p: (0 if p.stem.casefold().startswith("disc 1") else 1, p.name.casefold()))
    return _media_url(candidates[0], media_root)


def _artwork_media_file(
    artwork: Path, stem: str, *, allow_video: bool = False
) -> Path | None:
    want = stem.casefold()
    exts = set(IMAGE_EXTS)
    if allow_video:
        exts |= VIDEO_EXTS
    for p in artwork.iterdir():
        if p.is_file() and p.suffix.lower() in exts and p.stem.casefold() == want:
            return p
    return None


def _artwork_urls(artwork: Path | None, media_root: Path) -> dict[str, str | None]:
    if not artwork:
        return {
            "cover_front_url": None,
            "cover_back_url": None,
            "cover_inner_url": None,
            "cover_animation_url": None,
            "canvas_url": None,
            "icon_url": None,
            "logo_url": None,
            "disc_url": "/api/assets/default/disc.png",
            "spotify_url": None,
            "qr_url": None,
        }
    cover_front = resolve_cover_front_file(artwork)
    cover_back = _artwork_file(artwork, COVER_BACK_STEM)
    cover_inner = _artwork_file(artwork, COVER_INNER_STEM)
    cover_animation = resolve_animation_album_file(artwork)
    canvas = resolve_canvas_album_file(artwork)
    logo = _artwork_file(artwork, LOGO_STEM)
    icon = _artwork_file(artwork, ICON_STEM)
    spotify = _artwork_file(artwork, "spotify")
    qr = _artwork_file(artwork, "qr")
    return {
        "cover_front_url": _media_url(cover_front, media_root) if cover_front else None,
        "cover_back_url": _media_url(cover_back, media_root) if cover_back else None,
        "cover_inner_url": _media_url(cover_inner, media_root) if cover_inner else None,
        "cover_animation_url": _media_url(cover_animation, media_root)
        if cover_animation
        else None,
        "canvas_url": _media_url(canvas, media_root) if canvas else None,
        "icon_url": _media_url(icon, media_root) if icon else None,
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
    return is_box_set_name(entry_display_name(content))


def _release_type_label(category: str, content: Path) -> str:
    if category == "compilations" and _is_box_set(content):
        return "Box set"
    return CATEGORY_TYPE_LABELS.get(category, "Release")


def _closest_gallery_photo(photos: list[GalleryPhoto], year: int | None) -> GalleryPhoto | None:
    """Prefer banner then landscape for year; otherwise closest past year only."""
    if not photos:
        return None

    def prefer_ori(pool: list[GalleryPhoto]) -> GalleryPhoto | None:
        if not pool:
            return None
        banners = [p for p in pool if p.orientation == "banner"]
        landscapes = [p for p in pool if p.orientation == "landscape"]
        ordered = banners or landscapes or pool
        return sorted(ordered, key=lambda p: p.path.name.lower())[0]

    if year is None:
        return prefer_ori(photos) or sorted(
            photos, key=lambda p: (p.year, p.path.name.lower())
        )[0]

    exact = [p for p in photos if p.year == year]
    hit = prefer_ori(exact)
    if hit:
        return hit

    past_years = sorted({p.year for p in photos if p.year < year}, reverse=True)
    for y in past_years:
        hit = prefer_ori([p for p in photos if p.year == y])
        if hit:
            return hit
    return None


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


def _normalize_release_match(name: str) -> str:
    clean, _ = parse_bracket_tags(name)
    m = re.match(r"^(\d{4})(?:\.(\d{2})(?:\.(\d{2}))?)?", clean.strip())
    if m:
        clean = clean[m.end() :].lstrip(". ").strip()
    return clean.casefold().strip()


def _singles_category_dir(artist_dir: Path) -> Path | None:
    audio = _audio_root(artist_dir)
    if not audio.is_dir():
        return None
    for child in audio.iterdir():
        if child.is_dir() and child.name.casefold() == "singles":
            return child
    return None


def _find_singles_parent_folder(
    singles_cat: Path, *, release_title: str, content: Path
) -> Path | None:
    targets = {
        _normalize_release_match(release_title),
        _normalize_release_match(entry_display_name(content)),
    }
    targets.discard("")
    for child in sorted(singles_cat.iterdir(), key=lambda p: p.name.casefold()):
        if not child.is_dir():
            continue
        key = _normalize_release_match(entry_display_name(child))
        if key in targets:
            return child
    return None


def _single_title_from_folder(single_dir: Path, folder_name: str) -> str:
    clean, _ = parse_bracket_tags(folder_name)
    title = clean
    if re.match(r"^\d{4}", clean):
        title = clean.split(" ", 1)[-1] if " " in clean else clean
    title = title.strip()
    low = title.casefold()
    if low in {STANDARD_EDITION, "deluxe edition"} or low.endswith(" edition"):
        for path in sorted(single_dir.rglob("*")):
            if path.is_file() and path.suffix.lower() in AUDIO_EXTS:
                return _track_title_from_filename(path)
    return title


def _single_card_from_folder(single_dir: Path, media_root: Path) -> dict | None:
    rel = safe_relative(single_dir, media_root)
    if not rel:
        return None
    edition = _resolve_standard_edition(single_dir)
    artwork = _standard_artwork_dir(edition)
    urls = _artwork_urls(artwork, media_root)
    name = entry_display_name(single_dir)
    title = _single_title_from_folder(single_dir, name)
    date_iso = None
    m = re.match(r"^(\d{4})(?:\.(\d{2})(?:\.(\d{2}))?)?", name.strip())
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        date_iso = y
        if mo:
            date_iso += f"-{mo}"
        if d:
            date_iso += f"-{d}"
    return {
        "id": rel,
        "title": title.strip(),
        "folder_path": rel,
        "cover_url": urls.get("cover_front_url"),
        "date_iso": date_iso,
        "display_date": format_display_date(date_iso) if date_iso else None,
        "navigate_release_id": release_id_from_path(rel),
    }


def _singles_from_parent(parent: Path, media_root: Path) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()

    dated = _child_release_folders(parent)
    if dated:
        for single_dir in dated:
            card = _single_card_from_folder(single_dir, media_root)
            if card and card["id"] not in seen:
                seen.add(card["id"])
                out.append(card)
        return out

    for child in sorted(parent.iterdir(), key=lambda p: p.name.casefold()):
        if not child.is_dir() or child.name.casefold() == "[artwork]":
            continue
        if _is_edition_folder(child.name):
            for card in _singles_from_parent(child, media_root):
                if card["id"] not in seen:
                    seen.add(card["id"])
                    out.append(card)
            continue
        card = _single_card_from_folder(child, media_root)
        if card and card["id"] not in seen:
            seen.add(card["id"])
            out.append(card)
    return out


def _collect_release_audio_files(root: Path) -> list[Path]:
    """Collect audio files under a release folder tree (not artist Audio root)."""
    files: list[Path] = []
    if not root.is_dir():
        return files
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in AUDIO_EXTS:
            files.append(path)
    return files


def _featured_artists_for_release(
    db: Session,
    media_root: Path,
    content: Path,
    *,
    orientation: str = "landscape",
) -> list[dict]:
    from app.artist_details import _band_in_library
    from app.gallery import resolve_artist_card
    from app.various_artists_hub import _cached_va_photo, _load_va_photo_cache

    edition = _resolve_standard_edition(content)
    audio_files = _collect_release_audio_files(edition)
    if not audio_files:
        audio_files = _collect_release_audio_files(content)

    by_name: dict[str, dict] = {}
    va_photo_cache = _load_va_photo_cache()

    for audio_file in sorted(audio_files, key=lambda p: p.name.casefold()):
        _clean, tags = parse_bracket_tags(audio_file.stem)
        source_name = tags.get("source_artist")
        if not source_name:
            continue
        key = source_name.casefold()
        if key in by_name:
            by_name[key]["track_count"] += 1
            continue
        band_id = _band_id_for_artist_name(db, source_name)
        src = db.get(Band, band_id) if band_id else None
        display_name = (
            src.bnd_name.replace("█", "'") if src and src.bnd_name else source_name
        )
        card = resolve_artist_card(display_name, orientation=orientation)
        photo_url = card.photo_url or _cached_va_photo(band_id, va_photo_cache)
        in_library = bool(src and _band_in_library(db, src, media_root))
        by_name[key] = {
            "band_id": band_id,
            "name": display_name,
            "photo_url": photo_url,
            "icon_url": card.icon_url,
            "logo_url": card.logo_url,
            "in_library": in_library,
            "track_count": 1,
        }

    artists = sorted(
        by_name.values(),
        key=lambda a: (-a["track_count"], a["name"].casefold()),
    )
    return artists


def _singles_for_release(
    band: Band,
    content: Path,
    media_root: Path,
    release_title: str,
) -> list[dict]:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return []
    singles_cat = _singles_category_dir(artist_dir)
    if not singles_cat:
        return []

    parent = _find_singles_parent_folder(
        singles_cat, release_title=release_title, content=content
    )
    if not parent:
        return []

    return _singles_from_parent(parent, media_root)


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
        if band_id not in _parse_ids(fk):
            continue
        rt = (rel.rel_title or "").casefold().strip()
        if rt == norm:
            return rel
    return None


def _lookup_subgenre(db: Session, name: str) -> Subgenre | None:
    trimmed = name.strip()
    if not trimmed:
        return None
    sg = (
        db.query(Subgenre)
        .filter(Subgenre.sgn_name.ilike(trimmed))
        .first()
    )
    if sg:
        return sg
    lowered = trimmed.casefold()
    for row in db.query(Subgenre).filter(Subgenre.sgn_name.isnot(None)).all():
        if (row.sgn_name or "").casefold() == lowered:
            return row
    return None


def _resolve_subgenres(db: Session, raw: str | None) -> list[dict]:
    ids = _parse_ids(raw or "")
    out: list[dict] = []
    seen: set[int] = set()
    for sid in ids:
        sg = db.get(Subgenre, sid)
        if sg and sg.sgn_name and sg.sgn_id not in seen:
            seen.add(sg.sgn_id)
            out.append({"id": sg.sgn_id, "name": sg.sgn_name})
    if out:
        return out
    names = [part.strip() for part in re.split(r"[;,]", raw or "") if part.strip()]
    for name in names:
        sg = _lookup_subgenre(db, name)
        if sg and sg.sgn_name and sg.sgn_id not in seen:
            seen.add(sg.sgn_id)
            out.append({"id": sg.sgn_id, "name": sg.sgn_name})
    return out


def _resolve_producer(db: Session, raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    ids = _parse_ids(text)
    names: list[str] = []
    for aid in ids:
        artist = db.get(Artist, aid)
        if artist:
            names.append(_display_name(artist.art_stage_name or artist.art_name))
    if names:
        return "; ".join(names)
    return text


def release_has_metadata(payload: dict) -> bool:
    return bool(
        payload.get("description")
        or payload.get("subgenres")
        or payload.get("producer")
        or payload.get("label")
    )


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
    disk["metadata_from_database"] = release_has_metadata(disk)
    return disk


def _nearest_brand(
    brands: list[EraBrand], year: int, kind: str
) -> EraBrand | None:
    from app.gallery import _brands_of_kind

    pool = _brands_of_kind(brands, kind, collapsed=False)
    if not pool:
        return None

    def distance(b: EraBrand) -> int:
        if b.start <= year <= b.end:
            return 0
        return min(abs(b.start - year), abs(b.end - year))

    return min(pool, key=lambda b: (distance(b), b.path.name.lower()))


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

    from app.various_artists_hub import is_various_artists_release

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
    content = resolve_media_entry(display_entry, media_root=media_root)
    if not content or not content.is_dir():
        return None

    folder_name = entry_display_name(display_entry)
    _, folder_tags = parse_bracket_tags(folder_name)
    is_various_artists = is_various_artists_release(
        band_id,
        source_artist_name=card.get("source_artist_name"),
        folder_source_artist=folder_tags.get("source_artist"),
    )

    edition = _resolve_standard_edition(content)
    artwork = _standard_artwork_dir(edition)
    urls = _artwork_urls(artwork, media_root)
    from app.release_photocards import resolve_overview_photocards

    photocards = resolve_overview_photocards(
        db,
        band_id,
        release_id,
        band_name=band.bnd_name,
        category=card.get("category"),
        date_iso=card.get("date_iso"),
        content=content,
        media_root=media_root,
        is_various_artists=is_various_artists,
    )

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
            if icon and not logo:
                logo = _nearest_brand(brands, release_year, "logo")
            if logo and not icon:
                icon = _nearest_brand(brands, release_year, "icon")
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
    show_lineup = not solo and not is_various_artists
    solo_performer = _solo_performer(db, band, media_root) if solo else None
    lineup_members = (
        [solo_performer]
        if solo and solo_performer
        else _filter_lineup(lineup_full, release_year)
    )

    featured_artists: list[dict] = []
    if is_various_artists:
        featured_artists = _featured_artists_for_release(
            db,
            media_root,
            content,
            orientation=card_orientation,
        )

    prev_r, next_r = _prev_next_neighbors(audio_data.get("releases") or [], card)
    type_label = _release_type_label(card.get("category") or "", content)
    artist_name = _display_name(band.bnd_name)

    source_artist: str | None = folder_tags.get("source_artist")

    release_title = card.get("title") or ""

    from app.release_single_overview import (
        find_appears_on_releases,
        find_taken_from_release,
    )

    appears_on: list[dict] = []
    taken_from: dict | None = None
    if card.get("category") == "singles":
        try:
            appears_on = find_appears_on_releases(db, band_id, release_id, limit=5)
            taken_from = find_taken_from_release(db, band_id, release_id)
        except Exception:
            appears_on = []
            taken_from = None

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
        "canvas_url": urls.get("canvas_url"),
        "icon_url": urls.get("icon_url"),
        "logo_url": urls.get("logo_url") or card.get("logo_url"),
        "disc_url": urls.get("disc_url"),
        "playback_kind": _detect_playback_kind(content),
        "background_layers": bg_layers,
        "era_icon_url": era_icon_url,
        "era_logo_url": era_logo_url,
        "spotify_url": urls.get("spotify_url"),
        "qr_url": urls.get("qr_url"),
        "photocards": photocards,
        "gallery_photo_url": gallery_photo_url,
        "lineup": lineup_members,
        "show_lineup": show_lineup,
        "is_solo": solo,
        "is_various_artists": is_various_artists,
        "featured_artists": featured_artists,
        "singles": _singles_for_release(band, content, media_root, release_title),
        "appears_on": appears_on,
        "taken_from": taken_from,
        "prev": prev_r,
        "next": next_r,
        "navigate_band_id": card.get("navigate_band_id") or band_id,
        "navigate_release_id": card.get("navigate_release_id") or card["id"],
    }

    payload = _enrich_from_db(db, band_id, payload["title"], payload)
    from app.release_admin import apply_release_overrides
    from app.release_metadata_refresh import apply_mb_cache

    payload = apply_mb_cache(payload, band_id, release_id)
    payload = apply_release_overrides(payload, band_id, release_id)
    if payload.get("label"):
        payload["label_logo_url"] = label_logo_url(payload["label"])
    payload["needs_metadata_fetch"] = bool(
        not payload.get("description_manual")
        and not release_has_metadata(payload)
        and not payload.get("metadata_refreshed_at")
    )
    payload["needs_description_fetch"] = payload["needs_metadata_fetch"]
    return payload
