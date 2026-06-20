"""Scan artist media folders: audio releases, visibility flags, cached index."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import (
    AUDIO_CATEGORIES,
    AUDIO_EXTS,
    DATE_PREFIX_RE,
    _album_title_from_folder,
    _audio_root,
    _find_artwork_subdir,
    _parse_folder_date,
)
from app.config import settings
from app.paths import DATA_DIR
from app.gallery import IMAGE_EXTS, _artist_dir, _display_name, _media_url, _resolve_child_dir
from app.media_paths_util import (
    entry_display_name,
    is_under_root,
    resolve_media_entry,
    safe_relative,
)
from app.models import Band

ARTWORK_DIR = "[artwork]"
COVER_FRONT_STEM = "cover - front"
LOGO_STEM = "logo"
DISC_DIR_RE = re.compile(r"^\d+\.\s*Disc\s+\d+", re.I)
DISC_LOOSE_RE = re.compile(r"^Disc\s+(\d+)", re.I)
SIDE_RE = re.compile(r"^\d+\.\s*Side\s+", re.I)
SIDE_LOOSE_RE = re.compile(r"^Side\s+[A-Z]\b", re.I)
TAPE_RE = re.compile(r"^\d+\.\s*(Tape|Cassette)\s+", re.I)
TAPE_LOOSE_RE = re.compile(r"^Tape\s+[A-Z]\b", re.I)
CASSETTE_LOOSE_RE = re.compile(r"^Cassette\s+[A-Z]\b", re.I)
BRACKET_SUFFIX_RE = re.compile(r"\s*\[([^\]]+)\]\s*$")
STANDARD_EDITION = "standard edition"
VARIOUS_ARTISTS_DEFAULT_ID = 120

AUDIO_INDEX_VERSION = 3

CATEGORY_ORDER = list(AUDIO_CATEGORIES.keys())

_MONTHS = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ordinal(day: int) -> str:
    if 11 <= day % 100 <= 13:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix}"


def format_display_date(date_iso: str | None) -> str | None:
    if not date_iso:
        return None
    parts = date_iso.split("-")
    if len(parts) == 1:
        return parts[0]
    year = int(parts[0])
    if len(parts) == 2:
        month = int(parts[1])
        return f"{_MONTHS[month - 1]} {year}"
    month = int(parts[1])
    day = int(parts[2])
    return f"{_MONTHS[month - 1]} {_ordinal(day)}, {year}"


def parse_bracket_tags(name: str) -> tuple[str, dict]:
    m = BRACKET_SUFFIX_RE.search(name.strip())
    if not m:
        return name.strip(), {}
    clean = name[: m.start()].strip()
    tags: dict = {"unofficial": False}
    for part in m.group(1).split(";"):
        piece = part.strip()
        if not piece:
            continue
        low = piece.casefold()
        if low == "unofficial":
            tags["unofficial"] = True
        elif low.startswith("by "):
            tags["source_artist"] = piece[3:].strip()
        elif low.startswith("with "):
            tags["with_artist"] = piece[5:].strip()
        elif low.startswith("of "):
            tags["of_title"] = piece[3:].strip()
    return clean, tags


def release_id_from_path(rel_path: str) -> str:
    normalized = rel_path.replace("\\", "/").strip("/").casefold()
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:12]
    return f"rel_{digest}"


def _artwork_file(artwork: Path, stem: str) -> Path | None:
    want = stem.casefold()
    for p in artwork.iterdir():
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS and p.stem.casefold() == want:
            return p
    return None


def _disc_sort_key(folder: Path) -> tuple[int, str]:
    m = re.match(r"^(\d+)", folder.name)
    return (int(m.group(1)) if m else 999, folder.name.casefold())


def _find_release_artwork(root: Path) -> tuple[Path | None, Path | None]:
    """Return (cover_path, logo_path) under a release folder tree."""
    artwork_dirs: list[Path] = []

    def walk(directory: Path) -> None:
        if not directory.is_dir():
            return
        art = _find_artwork_subdir(directory)
        if art:
            artwork_dirs.append(art)
        for child in directory.iterdir():
            if child.is_dir() and child.name.casefold() != ARTWORK_DIR:
                if DISC_DIR_RE.match(child.name) or not _is_audio_file(child):
                    walk(child)

    walk(root)
    if not artwork_dirs:
        return None, None

    disc_art = [a for a in artwork_dirs if DISC_DIR_RE.match(a.parent.name)]
    pick_from = sorted(disc_art, key=lambda a: _disc_sort_key(a.parent))[0:1]
    if not pick_from:
        pick_from = [sorted(artwork_dirs, key=lambda a: len(a.parts))[0]]

    art = pick_from[0]
    cover = _artwork_file(art, COVER_FRONT_STEM)
    logo = _artwork_file(art, LOGO_STEM)
    return cover, logo


def _is_audio_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in AUDIO_EXTS


def _has_direct_audio(folder: Path) -> bool:
    for child in folder.iterdir():
        if _is_audio_file(child):
            return True
    return False


def _is_group_subdir_name(name: str) -> bool:
    return bool(
        DISC_DIR_RE.match(name)
        or DISC_LOOSE_RE.match(name)
        or SIDE_RE.match(name)
        or SIDE_LOOSE_RE.match(name)
        or TAPE_RE.match(name)
        or TAPE_LOOSE_RE.match(name)
        or CASSETTE_LOOSE_RE.match(name)
    )


def _has_group_subdirs(folder: Path) -> bool:
    if not folder.is_dir():
        return False
    for child in folder.iterdir():
        if (
            child.is_dir()
            and child.name.casefold() != ARTWORK_DIR
            and _is_group_subdir_name(child.name)
            and _has_direct_audio(child)
        ):
            return True
    return False


def _is_edition_folder(name: str) -> bool:
    """Name-based heuristics for edition folders (no path inspection)."""
    low = name.casefold()
    if low == STANDARD_EDITION:
        return True
    if DATE_PREFIX_RE.match(name.strip()):
        return True
    if DISC_DIR_RE.match(name):
        return False
    if name.casefold() == ARTWORK_DIR:
        return False
    if _parse_folder_date(name):
        return True
    if low.endswith("edition"):
        return True
    return False


def _is_edition_content_dir(folder: Path) -> bool:
    """Whether a folder holds edition-level audio/artwork (name, tracks, groups, or [Artwork])."""
    if not folder.is_dir() or folder.name.casefold() == ARTWORK_DIR:
        return False
    if _is_edition_folder(folder.name):
        return True
    if _find_artwork_subdir(folder):
        return True
    if _has_direct_audio(folder):
        return True
    if _has_group_subdirs(folder):
        return True
    return False


def _is_edition_dir(folder: Path) -> bool:
    """True when folder is an edition inside a release, not the release root itself."""
    if not _is_edition_content_dir(folder):
        return False
    parent = folder.parent
    if parent == folder:
        return False
    if _is_audio_category_dir(parent):
        return False
    parent_name = entry_display_name(parent).strip()
    if DATE_PREFIX_RE.match(parent_name):
        return True
    peers = [
        c
        for c in parent.iterdir()
        if c.is_dir()
        and c.name.casefold() != ARTWORK_DIR
        and _is_edition_content_dir(c)
    ]
    return len(peers) >= 2


def _is_audio_category_dir(folder: Path) -> bool:
    """True when folder is Albums, Singles, etc. under Audio/."""
    low = entry_display_name(folder).casefold()
    return any(cat.casefold() == low for cat in AUDIO_CATEGORIES.values())


def _release_dir_from_content_folder(folder: Path) -> Path:
    """Walk up from edition/disc/content folder to the release root (not the category folder)."""
    current = folder
    for _ in range(15):
        parent = current.parent
        if parent == current:
            return current
        if _is_audio_category_dir(parent):
            return current
        if not _is_edition_dir(current):
            return current
        current = parent
    return folder


def _child_release_folders(folder: Path) -> list[Path]:
    """Dated subfolders that are nested releases (e.g. singles under a parent album)."""
    out: list[Path] = []
    for child in sorted(folder.iterdir(), key=lambda p: p.name.casefold()):
        if not child.is_dir():
            continue
        if DATE_PREFIX_RE.match(entry_display_name(child)):
            out.append(child)
    return out


def _resolve_source_artist_dir(
    db: Session,
    media_root: Path,
    source_artist: str,
) -> tuple[int | None, Path | None]:
    band_id = _band_id_for_artist_name(db, source_artist)
    if not band_id:
        return None, None
    band = db.get(Band, band_id)
    if not band:
        return band_id, None
    artist_dir = _artist_dir(media_root, band.bnd_name)
    return band_id, artist_dir


def _band_id_for_artist_name(db: Session, name: str) -> int | None:
    norm = _display_name(name).casefold()
    if norm == "various artists":
        row = db.get(Band, VARIOUS_ARTISTS_DEFAULT_ID)
        if row and _display_name(row.bnd_name or "").casefold() == norm:
            return VARIOUS_ARTISTS_DEFAULT_ID
    for band in db.scalars(select(Band)).all():
        if band.bnd_name and _display_name(band.bnd_name).casefold() == norm:
            return band.bnd_id
    return None


def _band_id_from_content_path(db: Session, media_root: Path, content: Path) -> int | None:
    rel = safe_relative(content, media_root)
    if not rel:
        return None
    parts = Path(rel).parts
    if len(parts) < 3 or parts[0].casefold() != "music":
        return None
    return _band_id_for_artist_name(db, parts[2])


def _find_release_under_artist(
    artist_dir: Path,
    release_folder_name: str,
    *,
    media_root: Path,
) -> Path | None:
    """Locate a release folder anywhere under an artist's audio tree."""
    audio = _audio_root(artist_dir)
    if not audio.is_dir():
        return None
    fold = release_folder_name.casefold()
    for category_folder in AUDIO_CATEGORIES.values():
        cat_dir = _resolve_child_dir(audio, category_folder)
        if not cat_dir.is_dir():
            continue
        target = cat_dir / release_folder_name
        if target.exists():
            resolved = resolve_media_entry(target, media_root=media_root)
            if resolved:
                return resolved
        for child in cat_dir.iterdir():
            if entry_display_name(child).casefold() == fold:
                resolved = resolve_media_entry(child, media_root=media_root)
                if resolved:
                    return resolved
    return None


def _mirror_path_under_artist(
    artist_dir: Path | None,
    category_folder: str,
    release_folder_name: str,
    *,
    media_root: Path | None = None,
) -> Path | None:
    if not artist_dir:
        return None
    audio = _audio_root(artist_dir)
    cat_dir = _resolve_child_dir(audio, category_folder)
    if not cat_dir.is_dir():
        return None
    target = cat_dir / release_folder_name
    resolved = resolve_media_entry(target, media_root=media_root) if target.exists() else None
    if resolved:
        return resolved
    fold = release_folder_name.casefold()
    for child in cat_dir.iterdir():
        if entry_display_name(child).casefold() == fold:
            return resolve_media_entry(child, media_root=media_root)
    return None


def _build_release_card(
    db: Session,
    *,
    media_root: Path,
    owner_band_id: int,
    category_key: str,
    category_folder: str,
    display_entry: Path,
    content_root: Path | None = None,
    bracket_name: str | None = None,
) -> dict | None:
    name = bracket_name or entry_display_name(display_entry)
    clean_name, tags = parse_bracket_tags(name)
    date_iso = _parse_folder_date(clean_name)
    title = _album_title_from_folder(clean_name)

    content = content_root
    if content is None:
        content = resolve_media_entry(display_entry, media_root=media_root)
    if content is None and tags.get("source_artist"):
        _source_id, source_dir = _resolve_source_artist_dir(
            db, media_root, tags["source_artist"]
        )
        if source_dir:
            content = _find_release_under_artist(
                source_dir, clean_name, media_root=media_root
            )
    if content is None or not content.is_dir():
        return None

    source_band_id: int | None = None
    navigate_band_id = owner_band_id
    artwork_root = content

    owner_band = db.get(Band, owner_band_id)
    owner_artist_dir = (
        _artist_dir(media_root, owner_band.bnd_name) if owner_band else None
    )
    resolved_outside_owner = bool(
        owner_artist_dir and not is_under_root(content, owner_artist_dir)
    )

    if resolved_outside_owner:
        content_band_id = _band_id_from_content_path(db, media_root, content)
        if content_band_id:
            navigate_band_id = content_band_id
            source_band_id = content_band_id
        artwork_root = content
    elif tags.get("source_artist"):
        source_band_id, source_dir = _resolve_source_artist_dir(
            db, media_root, tags["source_artist"]
        )
        if source_band_id:
            navigate_band_id = source_band_id
        if source_dir:
            mirrored = _find_release_under_artist(
                source_dir, clean_name, media_root=media_root
            )
            if mirrored:
                artwork_root = mirrored
                navigate_band_id = source_band_id or navigate_band_id

    rel_path = safe_relative(display_entry, media_root)
    if not rel_path:
        return None

    cover_path, logo_path = _find_release_artwork(artwork_root)
    navigate_rel_path = safe_relative(artwork_root, media_root) or rel_path
    release_id = release_id_from_path(rel_path)
    navigate_release_id = release_id_from_path(navigate_rel_path)

    source_artist_name: str | None = tags.get("source_artist")
    if not source_artist_name and source_band_id:
        src_band = db.get(Band, source_band_id)
        if src_band and src_band.bnd_name:
            source_artist_name = src_band.bnd_name

    return {
        "id": release_id,
        "category": category_key,
        "title": title,
        "date_iso": date_iso,
        "display_date": format_display_date(date_iso),
        "official": not tags.get("unofficial"),
        "cover_url": _media_url(cover_path, media_root) if cover_path else None,
        "logo_url": _media_url(logo_path, media_root) if logo_path else None,
        "folder_path": rel_path,
        "navigate_band_id": navigate_band_id,
        "navigate_release_id": navigate_release_id,
        "source_band_id": source_band_id,
        "source_artist_name": source_artist_name,
    }


def _iter_category_release_entries(cat_dir: Path) -> list[Path]:
    entries: list[Path] = []
    for child in sorted(cat_dir.iterdir(), key=lambda p: p.name.casefold()):
        if child.name.casefold() in ("desktop.ini", "thumbs.db"):
            continue
        suffix = child.suffix.casefold()
        try:
            is_link = child.is_symlink() or getattr(child, "is_junction", lambda: False)()
        except OSError:
            is_link = False
        if suffix == ".path" and child.with_suffix(".lnk").exists():
            continue
        if child.is_dir() or suffix in (".lnk", ".path") or is_link:
            entries.append(child)
    return entries


def _scan_category_releases(
    db: Session,
    *,
    media_root: Path,
    owner_band_id: int,
    category_key: str,
    category_folder: str,
    cat_dir: Path,
) -> list[dict]:
    cards: list[dict] = []
    seen_paths: set[str] = set()

    for entry in _iter_category_release_entries(cat_dir):
        name = entry_display_name(entry)
        resolved = resolve_media_entry(entry, media_root=media_root)

        if category_key == "singles" and resolved and resolved.is_dir():
            nested = _child_release_folders(resolved)
            if nested:
                for single_dir in nested:
                    rel = safe_relative(single_dir, media_root)
                    if not rel or rel in seen_paths:
                        continue
                    card = _build_release_card(
                        db,
                        media_root=media_root,
                        owner_band_id=owner_band_id,
                        category_key=category_key,
                        category_folder=category_folder,
                        display_entry=single_dir,
                        content_root=resolve_media_entry(single_dir, media_root=media_root),
                        bracket_name=single_dir.name,
                    )
                    if card:
                        seen_paths.add(rel)
                        cards.append(card)
                continue

        rel = safe_relative(entry, media_root)
        if not rel or rel in seen_paths:
            continue
        card = _build_release_card(
            db,
            media_root=media_root,
            owner_band_id=owner_band_id,
            category_key=category_key,
            category_folder=category_folder,
            display_entry=entry,
            content_root=resolved,
            bracket_name=name,
        )
        if card:
            seen_paths.add(rel)
            cards.append(card)

    return cards


def scan_audio_releases(db: Session, band: Band, media_root: Path) -> list[dict]:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return []
    audio = _audio_root(artist_dir)
    if not audio.is_dir():
        return []

    all_cards: list[dict] = []
    for key, folder_name in AUDIO_CATEGORIES.items():
        cat_dir = _resolve_child_dir(audio, folder_name)
        if not cat_dir.is_dir():
            continue
        all_cards.extend(
            _scan_category_releases(
                db,
                media_root=media_root,
                owner_band_id=band.bnd_id,
                category_key=key,
                category_folder=folder_name,
                cat_dir=cat_dir,
            )
        )
    return all_cards


def _dir_has_entries(path: Path) -> bool:
    if not path.is_dir():
        return False
    for child in path.iterdir():
        if child.name.casefold() in ("desktop.ini", "thumbs.db"):
            continue
        if child.is_dir() or child.suffix.casefold() == ".lnk":
            return True
    return False


def _dir_has_gallery_entries(path: Path) -> bool:
    if not path.is_dir():
        return False
    for child in path.iterdir():
        if child.name.casefold() in ("desktop.ini", "thumbs.db"):
            continue
        if child.is_dir() or child.suffix.casefold() == ".lnk":
            return True
        if child.is_file() and child.suffix.lower() in IMAGE_EXTS:
            return True
    return False


def media_visibility_flags(
    band_name: str | None,
    media_root: Path,
    *,
    db: Session | None = None,
    band: Band | None = None,
) -> dict:
    flags = {
        "has_audio": False,
        "has_video": False,
        "has_library": False,
        "has_gallery": False,
        "has_playlists": False,
        "audio_categories": [],
    }
    artist_dir = _artist_dir(media_root, band_name)
    if not artist_dir:
        return flags

    audio = _audio_root(artist_dir)
    if audio.is_dir():
        for key, folder_name in AUDIO_CATEGORIES.items():
            cat = _resolve_child_dir(audio, folder_name)
            if _dir_has_entries(cat):
                flags["audio_categories"].append(key)
        flags["has_audio"] = bool(flags["audio_categories"])

    video = _resolve_child_dir(artist_dir, "Video")
    flags["has_video"] = _dir_has_entries(video)

    library = _resolve_child_dir(artist_dir, "Library")
    flags["has_library"] = _dir_has_entries(library)

    gallery = _resolve_child_dir(artist_dir, "Gallery")
    if gallery.is_dir():
        photos = _resolve_child_dir(gallery, "Photos")
        logos = _resolve_child_dir(gallery, "Logos")
        covers = _resolve_child_dir(gallery, "Covers")
        flags["has_gallery"] = (
            _dir_has_gallery_entries(photos)
            or _dir_has_gallery_entries(logos)
            or _dir_has_gallery_entries(covers)
        )

    if flags["has_audio"] and db is not None and band is not None:
        from app.playlist_index import has_playlists_quick

        flags["has_playlists"] = has_playlists_quick(db, band, media_root)

    return flags


def _cache_path(band_id: int) -> Path:
    cache_dir = DATA_DIR / "media_index"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{band_id}.json"


def _audio_mtime(artist_dir: Path) -> float:
    audio = _audio_root(artist_dir)
    if not audio.is_dir():
        return 0.0
    try:
        return audio.stat().st_mtime
    except OSError:
        return 0.0


def invalidate_media_cache(band_id: int) -> None:
    path = _cache_path(band_id)
    if path.is_file():
        try:
            path.unlink()
        except OSError:
            pass
    from app.playlist_index import invalidate_playlist_cache

    invalidate_playlist_cache(band_id)


def _audio_index_from_releases(releases: list[dict]) -> tuple[list[str], dict[str, bool]]:
    unofficial: dict[str, bool] = {}
    by_cat: dict[str, list[dict]] = {k: [] for k in CATEGORY_ORDER}
    for r in releases:
        by_cat.setdefault(r["category"], []).append(r)
        if not r.get("official"):
            unofficial[r["category"]] = True
    categories = [key for key in CATEGORY_ORDER if by_cat.get(key)]
    return categories, unofficial


def _build_and_cache_audio_index(db: Session, band: Band, media_root: Path) -> dict:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    mtime = _audio_mtime(artist_dir) if artist_dir else 0.0
    releases = scan_audio_releases(db, band, media_root)
    categories, unofficial = _audio_index_from_releases(releases)
    payload = {
        "band_id": band.bnd_id,
        "index_version": AUDIO_INDEX_VERSION,
        "audio_mtime": mtime,
        "scanned_at": _now(),
        "releases": releases,
        "categories": categories,
        "unofficial_by_category": unofficial,
    }
    try:
        _cache_path(band.bnd_id).write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        pass
    return {
        "releases": releases,
        "categories": categories,
        "unofficial_by_category": unofficial,
        "scanned_at": payload["scanned_at"],
        "cached": False,
        "stale": False,
    }


def _cached_audio_response(cached: dict, *, stale: bool) -> dict:
    unofficial = cached.get("unofficial_by_category")
    if unofficial is None:
        unofficial = {}
        for r in cached.get("releases") or []:
            if not r.get("official"):
                unofficial[r["category"]] = True
    return {
        "releases": cached.get("releases") or [],
        "categories": cached.get("categories") or [],
        "unofficial_by_category": unofficial,
        "scanned_at": cached.get("scanned_at"),
        "cached": True,
        "stale": stale,
    }


def refresh_audio_index_cache(db: Session, band_id: int) -> None:
    if not settings.media_root:
        return
    media_root = Path(settings.media_root)
    if not media_root.is_dir():
        return
    band = db.get(Band, band_id)
    if band:
        _build_and_cache_audio_index(db, band, media_root)


def get_audio_index(
    db: Session,
    band: Band,
    *,
    force: bool = False,
) -> dict:
    if not settings.media_root:
        return {
            "releases": [],
            "categories": [],
            "unofficial_by_category": {},
            "scanned_at": None,
            "cached": False,
            "stale": False,
        }

    media_root = Path(settings.media_root)
    if not media_root.is_dir():
        return {
            "releases": [],
            "categories": [],
            "unofficial_by_category": {},
            "scanned_at": None,
            "cached": False,
            "stale": False,
        }

    cache_file = _cache_path(band.bnd_id)
    artist_dir = _artist_dir(media_root, band.bnd_name)
    mtime = _audio_mtime(artist_dir) if artist_dir else 0.0
    stale_cache: dict | None = None

    if cache_file.is_file():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if cached.get("releases") is not None:
                if (
                    not force
                    and cached.get("audio_mtime") == mtime
                    and cached.get("index_version") == AUDIO_INDEX_VERSION
                ):
                    return _cached_audio_response(cached, stale=False)
                if not force:
                    stale_cache = cached
        except (json.JSONDecodeError, OSError):
            pass

    if stale_cache is not None:
        return _cached_audio_response(stale_cache, stale=True)

    return _build_and_cache_audio_index(db, band, media_root)
