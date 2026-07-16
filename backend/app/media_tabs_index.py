"""Scan artist Video and Library folders into card grids."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import DATE_PREFIX_RE, _parse_folder_date
from app.config import settings
from app.franchise_index import MUSIC_LIBRARY_CATEGORIES, MUSIC_VIDEO_CATEGORIES
from app.gallery import IMAGE_EXTS, _artist_dir, _media_url, _resolve_child_dir
from app.media_paths_util import entry_display_name, resolve_media_entry, safe_relative
from app.models import Band
from app.paths import DATA_DIR

VIDEO_ROOT = "Video"
LIBRARY_ROOT = "Library"
# Bump when scan semantics change so disk caches refresh.
MEDIA_TAB_SCAN_VERSION = 2

_SKIP_NAMES = frozenset({"desktop.ini", "thumbs.db", ".ds_store"})
_SKIP_ITEM_NAMES = frozenset({"[artwork]", "artwork"})


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cache_path(band_id: int, kind: str) -> Path:
    cache_dir = DATA_DIR / "media_index"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{band_id}_{kind}.json"


def _card_id(kind: str, rel_path: str) -> str:
    digest = hashlib.sha256(f"{kind}:{rel_path.casefold()}".encode()).hexdigest()[:12]
    return f"{kind[:3]}_{digest}"


def _known_categories(kind: str) -> set[str]:
    names = MUSIC_VIDEO_CATEGORIES if kind == "video" else MUSIC_LIBRARY_CATEGORIES
    return {n.casefold() for n in names}


def _folder_cover(folder: Path, media_root: Path) -> str | None:
    search_dirs: list[Path] = []
    try:
        for child in folder.iterdir():
            if child.is_dir() and child.name.casefold() in _SKIP_ITEM_NAMES:
                search_dirs.append(child)
                break
    except OSError:
        pass
    search_dirs.append(folder)

    preferred = (
        "Cover - Front*",
        "Cover - Album*",
        "Poster*",
        "cover*",
        "folder*",
        "front*",
    )
    for directory in search_dirs:
        if not directory.is_dir():
            continue
        for pattern in preferred:
            try:
                matches = sorted(directory.glob(pattern), key=lambda p: p.name.casefold())
            except OSError:
                continue
            for p in matches:
                if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
                    return _media_url(p, media_root)
        try:
            for child in sorted(directory.iterdir(), key=lambda p: p.name.casefold()):
                if child.is_file() and child.suffix.lower() in IMAGE_EXTS:
                    return _media_url(child, media_root)
        except OSError:
            continue
    return None


def _title_from_folder(name: str) -> str:
    m = DATE_PREFIX_RE.match(name.strip())
    if m:
        rest = name[m.end() :].lstrip(". ").strip()
        return rest or name
    return name


def _item_card(
    kind: str,
    *,
    display_entry: Path,
    resolved: Path,
    media_root: Path,
) -> dict | None:
    display_name = entry_display_name(display_entry)
    if display_name.casefold() in _SKIP_ITEM_NAMES or display_name.startswith("."):
        return None
    rel = safe_relative(resolved, media_root)
    if not rel:
        rel = safe_relative(display_entry, media_root)
    if not rel:
        return None
    rel = rel.replace("\\", "/")
    return {
        "id": _card_id(kind, rel),
        "title": _title_from_folder(display_name),
        "date_iso": _parse_folder_date(display_name),
        "cover_url": _folder_cover(resolved, media_root),
        "folder_path": rel,
    }


def _scan_items_in_container(
    container: Path, media_root: Path, kind: str
) -> list[dict]:
    items: list[dict] = []
    try:
        children = sorted(container.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return items
    for entry in children:
        if entry.name.casefold() in _SKIP_NAMES or entry.name.startswith("."):
            continue
        resolved = resolve_media_entry(entry, media_root=media_root)
        if not resolved:
            continue
        card = _item_card(
            kind, display_entry=entry, resolved=resolved, media_root=media_root
        )
        if card:
            items.append(card)
    return items


def _scan_section_root(section: Path, media_root: Path, kind: str) -> list[dict]:
    """Scan Video/ or Library/.

    Pattern A: known category folders (Documentaries/, Articles/, …) each become a
    sub-tab with item cards inside.

    Flat layout (HIM today): dated folders and .lnk/.path shortcuts sit directly
    under Video/Library and each becomes a portrait card — no fake category sub-bar.
    """
    if not section.is_dir():
        return []

    known = _known_categories(kind)
    category_dirs: list[Path] = []
    root_entries: list[tuple[Path, Path]] = []

    try:
        children = sorted(section.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return []

    for entry in children:
        if entry.name.casefold() in _SKIP_NAMES or entry.name.startswith("."):
            continue
        if entry.is_dir() and entry.name.casefold() in known:
            category_dirs.append(entry)
            continue
        resolved = resolve_media_entry(entry, media_root=media_root)
        if resolved:
            root_entries.append((entry, resolved))

    categories: list[dict] = []
    for cat_dir in category_dirs:
        items = _scan_items_in_container(cat_dir, media_root, kind)
        if not items:
            continue
        categories.append(
            {
                "key": cat_dir.name.casefold().replace(" ", "_"),
                "label": cat_dir.name,
                "items": items,
            }
        )

    if root_entries:
        items: list[dict] = []
        for entry, resolved in root_entries:
            card = _item_card(
                kind, display_entry=entry, resolved=resolved, media_root=media_root
            )
            if card:
                items.append(card)
        if items:
            if categories:
                categories.append(
                    {"key": "other", "label": "Other", "items": items}
                )
            else:
                # Single group — frontend hides the sub-tab row when len == 1.
                categories.append({"key": "all", "label": "All", "items": items})

    return categories


def iter_resolved_media_items(
    band: Band,
    media_root: Path,
    *,
    kind: str,
) -> list[tuple[dict, Path, Path]]:
    """Return (card, display_entry, resolved_folder) for every Video/Library item."""
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return []
    root_name = VIDEO_ROOT if kind == "video" else LIBRARY_ROOT
    section = _resolve_child_dir(artist_dir, root_name)
    if not section.is_dir():
        return []

    known = _known_categories(kind)
    out: list[tuple[dict, Path, Path]] = []

    try:
        children = sorted(section.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return []

    for entry in children:
        if entry.name.casefold() in _SKIP_NAMES or entry.name.startswith("."):
            continue
        if entry.is_dir() and entry.name.casefold() in known:
            try:
                nested = sorted(entry.iterdir(), key=lambda p: p.name.casefold())
            except OSError:
                continue
            for child in nested:
                if child.name.casefold() in _SKIP_NAMES or child.name.startswith("."):
                    continue
                resolved = resolve_media_entry(child, media_root=media_root)
                if not resolved:
                    continue
                card = _item_card(
                    kind,
                    display_entry=child,
                    resolved=resolved,
                    media_root=media_root,
                )
                if card:
                    out.append((card, child, resolved))
            continue
        resolved = resolve_media_entry(entry, media_root=media_root)
        if not resolved:
            continue
        card = _item_card(
            kind, display_entry=entry, resolved=resolved, media_root=media_root
        )
        if card:
            out.append((card, entry, resolved))
    return out


def find_resolved_media_item(
    band: Band,
    media_root: Path,
    *,
    kind: str,
    item_id: str,
) -> tuple[dict, Path, Path] | None:
    for card, display_entry, resolved in iter_resolved_media_items(
        band, media_root, kind=kind
    ):
        if card.get("id") == item_id:
            return card, display_entry, resolved
    return None


def build_media_tab_index(
    band: Band,
    media_root: Path,
    *,
    kind: str,
) -> dict:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return {
            "band_id": band.bnd_id,
            "kind": kind,
            "categories": [],
            "scanned_at": _now(),
            "scan_version": MEDIA_TAB_SCAN_VERSION,
        }
    root_name = VIDEO_ROOT if kind == "video" else LIBRARY_ROOT
    section = _resolve_child_dir(artist_dir, root_name)
    return {
        "band_id": band.bnd_id,
        "kind": kind,
        "categories": _scan_section_root(section, media_root, kind),
        "scanned_at": _now(),
        "scan_version": MEDIA_TAB_SCAN_VERSION,
    }


def get_media_tab_index(
    db: Session,
    band_id: int,
    *,
    kind: str,
    force: bool = False,
) -> dict | None:
    band = db.get(Band, band_id)
    if not band or not settings.media_root:
        return None
    media_root = Path(settings.media_root)
    if not media_root.is_dir():
        return None

    cache_file = _cache_path(band_id, kind)
    if not force and cache_file.is_file():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if (
                cached.get("categories") is not None
                and cached.get("scan_version") == MEDIA_TAB_SCAN_VERSION
            ):
                cached["cached"] = True
                return cached
        except (json.JSONDecodeError, OSError):
            pass

    payload = build_media_tab_index(band, media_root, kind=kind)
    payload["cached"] = False
    try:
        cache_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError:
        pass
    return payload
