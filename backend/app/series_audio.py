"""Scan Series/{Letter}/{Franchise}/…/[Audio]/{Category}/ shortcuts into release cards.

Layout (under franchise and/or each subseries):

    Series/D/Dragon Ball/1986.02.26. Dragon Ball/[Audio]/Albums/
      1995.11.21. Some Album [By Masashi Kishimoto].lnk
      2000.01.01. Soundtrack.lnk   ← no [By …] → Various Artists

Entries are typically Windows .lnk (or .path) files pointing at Music/… release
folders. Bracket tags follow the music convention; missing ``[By Artist]``
defaults to Various Artists.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import AUDIO_CATEGORIES, _resolve_child_dir
from app.config import settings
from app.media_index import (
    VARIOUS_ARTISTS_DEFAULT_ID,
    _build_release_card,
    _iter_category_release_entries,
    entry_display_name,
)
from app.media_paths_util import resolve_media_entry, safe_relative
from app.series_index import _list_subseries, find_franchise_dir

AUDIO_BUCKETS = ("[audio]", "audio")
DEFAULT_SOURCE_ARTIST = "Various Artists"


def _find_audio_bucket(folder: Path) -> Path | None:
    if not folder.is_dir():
        return None
    try:
        for child in folder.iterdir():
            if child.is_dir() and child.name.casefold() in AUDIO_BUCKETS:
                return child
    except OSError:
        return None
    return None


def _scan_audio_bucket(
    db: Session,
    *,
    media_root: Path,
    bucket: Path,
    scope: dict,
) -> list[dict]:
    cards: list[dict] = []
    owner_id = VARIOUS_ARTISTS_DEFAULT_ID
    scanned_dirs: set[Path] = set()

    def add_from_category(category_key: str, category_folder: str, cat_dir: Path) -> None:
        if not cat_dir.is_dir() or cat_dir in scanned_dirs:
            return
        scanned_dirs.add(cat_dir)
        for entry in _iter_category_release_entries(cat_dir):
            name = entry_display_name(entry)
            resolved = resolve_media_entry(entry, media_root=media_root)
            card = _build_release_card(
                db,
                media_root=media_root,
                owner_band_id=owner_id,
                category_key=category_key,
                category_folder=category_folder,
                display_entry=entry,
                content_root=resolved,
                bracket_name=name,
                default_source_artist=DEFAULT_SOURCE_ARTIST,
            )
            if not card:
                continue
            card = {
                **card,
                "series_scope": scope.get("scope"),
                "subseries_id": scope.get("subseries_id"),
                "subseries_title": scope.get("subseries_title"),
                "subseries_path": scope.get("subseries_path"),
            }
            cards.append(card)

    for category_key, category_folder in AUDIO_CATEGORIES.items():
        cat_dir = _resolve_child_dir(bucket, category_folder)
        add_from_category(category_key, category_folder, cat_dir)

    # Loose shortcuts directly under Audio/ → treat as Albums
    try:
        loose = [
            p
            for p in bucket.iterdir()
            if p.is_file() and p.suffix.casefold() in {".lnk", ".path", ".url"}
        ]
    except OSError:
        loose = []
    if loose:
        add_from_category("albums", "Albums", bucket)

    # Any other child folders (custom categories) under Audio/
    try:
        children = sorted(
            (p for p in bucket.iterdir() if p.is_dir()),
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        children = []
    for child in children:
        if child in scanned_dirs:
            continue
        key = child.name.casefold().replace(" ", "_")
        add_from_category(key, child.name, child)

    return cards


def scan_folder_audio(db: Session, folder_path: str) -> dict:
    """Scan ``[Audio]`` under an arbitrary media-relative folder (film/subseries/work)."""
    media_root = Path(settings.media_root or "")
    if not media_root.is_dir() or not folder_path:
        return {"releases": [], "categories": [], "band_id": None, "source": "folder"}
    folder = media_root / folder_path.replace("\\", "/")
    bucket = _find_audio_bucket(folder)
    if not bucket:
        return {"releases": [], "categories": [], "band_id": None, "source": "folder"}
    releases = _scan_audio_bucket(
        db,
        media_root=media_root,
        bucket=bucket,
        scope={
            "scope": "folder",
            "subseries_path": folder_path.replace("\\", "/"),
        },
    )
    cats = sorted({(r.get("category") or "") for r in releases if r.get("category")})
    return {
        "releases": releases,
        "categories": cats,
        "band_id": None,
        "source": "folder",
    }


def scan_series_audio(db: Session, franchise_id: str) -> dict:
    """Return audio release cards from ``[Audio]`` buckets under a franchise."""
    empty = {
        "releases": [],
        "categories": [],
        "band_id": None,
        "source": "series",
    }
    if not settings.media_root:
        return empty
    media_root = Path(settings.media_root)
    if not media_root.is_dir():
        return empty
    found = find_franchise_dir(franchise_id, media_root)
    if not found:
        return empty
    franchise_dir, _letter = found
    franchise_rel = safe_relative(franchise_dir, media_root) or franchise_dir.name

    scopes: list[tuple[Path, dict]] = [
        (
            franchise_dir,
            {
                "scope": "franchise",
                "subseries_id": None,
                "subseries_title": None,
                "subseries_path": franchise_rel,
            },
        )
    ]
    for sub in _list_subseries(franchise_dir, media_root):
        rel = (sub.get("folder_path") or "").replace("\\", "/").strip("/")
        if not rel:
            continue
        sub_dir = media_root / rel
        scopes.append(
            (
                sub_dir,
                {
                    "scope": "subseries",
                    "subseries_id": sub.get("id"),
                    "subseries_title": sub.get("title"),
                    "subseries_path": rel,
                },
            )
        )

    releases: list[dict] = []
    seen: set[str] = set()
    for folder, scope in scopes:
        bucket = _find_audio_bucket(folder)
        if not bucket:
            continue
        for card in _scan_audio_bucket(
            db, media_root=media_root, bucket=bucket, scope=scope
        ):
            key = (card.get("folder_path") or card.get("id") or "").casefold()
            if not key or key in seen:
                continue
            seen.add(key)
            releases.append(card)

    categories = sorted(
        {c for c in (r.get("category") for r in releases) if c},
        key=lambda k: list(AUDIO_CATEGORIES.keys()).index(k)
        if k in AUDIO_CATEGORIES
        else 99,
    )
    return {
        "releases": releases,
        "categories": categories,
        "band_id": None,
        "source": "series",
    }
