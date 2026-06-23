"""Appears-on and taken-from context for single release overview."""
from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Band
from app.band_library import _album_title_from_folder, _collect_audio_files, _track_title_from_filename
from app.media_index import entry_display_name, get_audio_index, parse_bracket_tags
from app.media_paths_util import safe_relative
from app.release_overview import (
    _normalize_release_match,
    resolve_release_content,
)
from app.release_track_extras import (
    _split_bracket_parts,
    _of_title_from_parts,
    find_track_versions,
)

ALLOWED_APPEARS_ON_CATEGORIES = frozenset(
    {
        "albums",
        "extended_plays",
        "compilations",
        "soundtracks",
        "singles",
    }
)

CATEGORY_PRIORITY = {
    "albums": 0,
    "extended_plays": 1,
    "compilations": 2,
    "soundtracks": 3,
    "singles": 4,
}

BRACKET_SUFFIX_RE = re.compile(r"\s*\[[^\]]+\]\s*")


def _strip_bracket_suffix(text: str) -> str:
    return BRACKET_SUFFIX_RE.sub(" ", text).strip()


def _release_card_payload(card: dict) -> dict:
    return {
        "id": card.get("id") or card.get("folder_path"),
        "title": card.get("title") or "",
        "folder_path": card.get("folder_path") or "",
        "cover_url": card.get("cover_url"),
        "date_iso": card.get("date_iso"),
        "display_date": card.get("display_date"),
        "navigate_release_id": card.get("navigate_release_id") or card.get("id"),
    }


def _release_index_maps(releases: list[dict]) -> dict[str, dict]:
    by_nav: dict[str, dict] = {}
    for row in releases:
        nav = row.get("navigate_release_id") or row.get("id")
        if nav:
            by_nav[nav] = row
    return by_nav


def _first_track_on_single(content: Path, media_root: Path) -> tuple[str | None, str]:
    files = sorted(_collect_audio_files(content), key=lambda p: p.name.casefold())
    for audio in files:
        rel = safe_relative(audio, media_root)
        if rel:
            return rel, _track_title_from_filename(audio)
    return None, ""


def _seed_title(title: str, content: Path, media_root: Path) -> str:
    _, track_title = _first_track_on_single(content, media_root)
    base = track_title or title
    main, parts = _split_bracket_parts(base)
    of_title = _of_title_from_parts(parts)
    return of_title or main or title


def _track_versions_for_single(
    db: Session,
    band_id: int,
    release_id: str,
    card: dict,
    content: Path,
    media_root: Path,
) -> list[dict]:
    play_path, file_title = _first_track_on_single(content, media_root)
    title = _seed_title(card.get("title") or file_title, content, media_root)
    if not title.strip():
        return []
    return find_track_versions(
        db,
        band_id,
        title=title,
        play_path=play_path or f"__missing__:{release_id}",
        release_id=release_id,
        limit=50,
    )


def _version_album_label(version: dict) -> str | None:
    edition_title = _strip_bracket_suffix((version.get("edition_title") or "").strip())
    release_title = _strip_bracket_suffix((version.get("album_title") or "").strip())
    if edition_title and edition_title.casefold() != release_title.casefold():
        if release_title:
            return f"{release_title}: {edition_title}"
        return edition_title or None
    return release_title or None


def _taken_from_payload(
    version: dict,
    card: dict,
    band_id: int,
) -> dict:
    label = card.get("title") or _version_album_label(version) or ""
    return {
        "album_title": label,
        "navigate_release_id": version.get("navigate_release_id")
        or card.get("navigate_release_id")
        or card.get("id"),
        "navigate_band_id": version.get("navigate_band_id") or band_id,
        "is_single": card.get("category") == "singles",
    }


def _taken_from_folder_parent(
    db: Session,
    band_id: int,
    card: dict,
    content: Path,
    media_root: Path,
) -> dict | None:
    release_title = card.get("title") or ""
    rel = safe_relative(content, media_root)
    if not rel:
        return None
    parts = rel.replace("\\", "/").split("/")
    singles_idx = next((i for i, p in enumerate(parts) if p.casefold() == "singles"), -1)
    if singles_idx < 0 or singles_idx + 2 >= len(parts):
        return None

    parent_dir = media_root.joinpath(*parts[: singles_idx + 2])
    if not parent_dir.is_dir():
        return None
    parent_display, _ = parse_bracket_tags(entry_display_name(parent_dir))
    parent_norm = _normalize_release_match(parent_display)
    release_norm = _normalize_release_match(release_title)
    if not parent_norm or parent_norm == release_norm:
        return None

    band = db.get(Band, band_id)
    if not band:
        return None
    audio_data = get_audio_index(db, band, force=False)
    matches: list[tuple[int, str, dict]] = []
    for row in audio_data.get("releases") or []:
        cat = row.get("category") or ""
        if cat == "live_albums" or cat not in ALLOWED_APPEARS_ON_CATEGORIES:
            continue
        if _normalize_release_match(row.get("title") or "") != parent_norm:
            continue
        matches.append(
            (
                CATEGORY_PRIORITY.get(cat, 99),
                row.get("date_iso") or "9999-99-99",
                row,
            )
        )
    if not matches:
        return None
    matches.sort()
    row = matches[0][2]
    return {
        "album_title": row.get("title") or _album_title_from_folder(parent_display),
        "navigate_release_id": row.get("navigate_release_id") or row.get("id"),
        "navigate_band_id": row.get("navigate_band_id") or band_id,
        "is_single": row.get("category") == "singles",
    }


def find_appears_on_releases(
    db: Session,
    band_id: int,
    release_id: str,
    *,
    limit: int = 5,
) -> list[dict]:
    resolved = resolve_release_content(db, band_id, release_id)
    if not resolved:
        return []
    band, card, media_root, content = resolved
    if card.get("category") != "singles":
        return []

    current_id = card.get("navigate_release_id") or card.get("id") or release_id
    by_nav = _release_index_maps(get_audio_index(db, band, force=False).get("releases") or [])

    versions = _track_versions_for_single(
        db, band_id, release_id, card, content, media_root
    )

    best_by_title: dict[str, dict] = {}

    for version in versions:
        nav_id = version.get("navigate_release_id")
        if not nav_id or nav_id == current_id:
            continue
        rel_card = by_nav.get(nav_id)
        if not rel_card:
            continue
        cat = rel_card.get("category") or ""
        if cat not in ALLOWED_APPEARS_ON_CATEGORIES:
            continue
        title_key = _normalize_release_match(rel_card.get("title") or "")
        if not title_key:
            continue
        existing = best_by_title.get(title_key)
        if existing:
            existing_pri = CATEGORY_PRIORITY.get(existing.get("category") or "", 99)
            new_pri = CATEGORY_PRIORITY.get(cat, 99)
            if new_pri >= existing_pri:
                continue
        best_by_title[title_key] = rel_card

    matches = list(best_by_title.values())

    matches.sort(key=lambda r: (r.get("date_iso") or "9999-99-99", r.get("title") or ""))
    return [_release_card_payload(r) for r in matches[:limit]]


def find_taken_from_release(
    db: Session,
    band_id: int,
    release_id: str,
) -> dict | None:
    resolved = resolve_release_content(db, band_id, release_id)
    if not resolved:
        return None
    band, card, media_root, content = resolved
    if card.get("category") != "singles":
        return None

    current_id = card.get("navigate_release_id") or card.get("id") or release_id
    by_nav = _release_index_maps(get_audio_index(db, band, force=False).get("releases") or [])

    versions = _track_versions_for_single(
        db, band_id, release_id, card, content, media_root
    )

    candidates: list[tuple[int, str, dict, dict]] = []
    for version in versions:
        nav_id = version.get("navigate_release_id")
        if not nav_id or nav_id == current_id:
            continue
        rel_card = by_nav.get(nav_id)
        if not rel_card:
            continue
        cat = rel_card.get("category") or ""
        if cat == "live_albums" or cat not in ALLOWED_APPEARS_ON_CATEGORIES:
            continue
        candidates.append(
            (
                CATEGORY_PRIORITY.get(cat, 99),
                version.get("date_iso") or rel_card.get("date_iso") or "9999-99-99",
                version,
                rel_card,
            )
        )

    if candidates:
        candidates.sort()
        version, rel_card = candidates[0][2], candidates[0][3]
        label = _version_album_label(version)
        if label:
            return _taken_from_payload(version, rel_card, band_id)

    return _taken_from_folder_parent(db, band_id, card, content, media_root)
