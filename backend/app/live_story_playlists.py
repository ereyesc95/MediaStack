"""Live Story — one live performance per studio track across the discography."""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from app.band_library import (
    AUDIO_CATEGORIES,
    AUDIO_EXTS,
    _album_title_from_folder,
    _audio_root,
    _collect_audio_files,
    _normalize_title_for_match,
    _parse_folder_date,
    _release_date_for_track,
    _track_title_from_filename,
)
from app.extended_system_playlists import (
    _audio_files_in_dir,
    _iter_single_release_roots,
    _track_entry,
)
from app.gallery import _artist_dir
from app.media_index import format_display_date
from app.models import Band
from app.release_tracklist import _track_number
from app.system_playlists import playlist_cover_url

LIVE_STORY_SLUG = "live-story"

SOURCE_CATEGORIES = (
    "albums",
    "extended_plays",
    "compilations",
    "soundtracks",
    "singles",
    "live_albums",
)

LIVE_MATCH_CATEGORY_ORDER = {
    "live_albums": 0,
    "albums": 1,
    "extended_plays": 2,
    "compilations": 3,
    "soundtracks": 4,
    "singles": 5,
}

TRACK_BRACKET_RE = re.compile(r"\[([^\]]+)\]")


@dataclass
class _Reference:
    base_key: str
    header_title: str
    header_date_iso: str | None
    scan_index: int


def _category_key_for_path(file_path: Path, audio_root: Path) -> str:
    by_folder = {name.casefold(): key for key, name in AUDIO_CATEGORIES.items()}
    try:
        rel = file_path.relative_to(audio_root)
    except ValueError:
        return "unknown"
    for part in rel.parts:
        key = by_folder.get(part.casefold())
        if key:
            return key
    return "unknown"


def _release_header_meta(release_dir: Path) -> tuple[str, str | None]:
    title = _album_title_from_folder(release_dir.name)
    date_iso = _parse_folder_date(release_dir.name)
    return title, date_iso


def _single_parent_dir(single_dir: Path, singles_cat: Path) -> Path | None:
    try:
        rel = single_dir.relative_to(singles_cat)
    except ValueError:
        return None
    if len(rel.parts) >= 2:
        parent = singles_cat / rel.parts[0]
        if parent.is_dir():
            return parent
    return None


def _is_live_at_or_in_bracket(stem: str) -> bool:
    for match in TRACK_BRACKET_RE.finditer(stem):
        for part in match.group(1).split(";"):
            low = part.strip().casefold()
            if "live at" in low or "live in" in low:
                return True
    return False


def _live_match_sort_key(file_path: Path, audio_root: Path) -> tuple:
    cat = _category_key_for_path(file_path, audio_root)
    rank = LIVE_MATCH_CATEGORY_ORDER.get(cat, 99)
    date = _release_date_for_track(file_path) or "9999-99-99"
    return rank, date, file_path.as_posix().casefold()


def _build_live_match_index(
    audio_files: list[Path], audio_root: Path
) -> dict[str, Path]:
    buckets: dict[str, list[Path]] = defaultdict(list)
    for audio_file in audio_files:
        if not _is_live_at_or_in_bracket(audio_file.stem):
            continue
        key = _normalize_title_for_match(_track_title_from_filename(audio_file))
        if not key:
            continue
        buckets[key].append(audio_file)

    out: dict[str, Path] = {}
    for key, paths in buckets.items():
        paths.sort(key=lambda p: _live_match_sort_key(p, audio_root))
        out[key] = paths[0]
    return out


def _sorted_audio_in_release(release_dir: Path) -> list[Path]:
    files = _audio_files_in_dir(release_dir)
    return sorted(files, key=lambda p: (_track_number(p.name, 9999), p.name.casefold()))


def _collect_references(band: Band, media_root: Path) -> list[_Reference]:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return []

    audio_root = _audio_root(artist_dir)
    seen_titles: set[str] = set()
    references: list[_Reference] = []
    scan_index = 0

    def _scan_pass(*, venue_live_only: bool) -> None:
        nonlocal scan_index
        for cat in SOURCE_CATEGORIES:
            folder_name = AUDIO_CATEGORIES.get(cat)
            if not folder_name:
                continue
            cat_dir = audio_root / folder_name
            if not cat_dir.is_dir():
                continue

            if cat == "singles":
                release_roots = list(_iter_single_release_roots(cat_dir))
            else:
                release_roots = sorted(
                    (child for child in cat_dir.iterdir() if child.is_dir()),
                    key=lambda p: p.name.casefold(),
                )

            for release_dir in release_roots:
                if cat == "singles":
                    parent = _single_parent_dir(release_dir, cat_dir)
                    header_dir = parent if parent else release_dir
                else:
                    header_dir = release_dir

                header_title, header_date_iso = _release_header_meta(header_dir)

                for audio_file in _sorted_audio_in_release(release_dir):
                    is_venue_live = _is_live_at_or_in_bracket(audio_file.stem)
                    if venue_live_only:
                        if not is_venue_live:
                            continue
                    elif is_venue_live:
                        continue

                    base_key = _normalize_title_for_match(
                        _track_title_from_filename(audio_file)
                    )
                    if not base_key or base_key in seen_titles:
                        continue
                    seen_titles.add(base_key)
                    references.append(
                        _Reference(
                            base_key=base_key,
                            header_title=header_title,
                            header_date_iso=header_date_iso,
                            scan_index=scan_index,
                        )
                    )
                    scan_index += 1

    _scan_pass(venue_live_only=False)
    _scan_pass(venue_live_only=True)

    references.sort(
        key=lambda r: (
            r.header_date_iso or "9999-99-99",
            r.header_title.casefold(),
            r.scan_index,
        )
    )
    return references


def scan_live_story(band: Band, media_root: Path) -> dict:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return {"tracks": [], "sections": []}

    audio_root = _audio_root(artist_dir)
    references = _collect_references(band, media_root)
    if not references:
        return {"tracks": [], "sections": []}

    all_audio = _collect_audio_files(artist_dir)
    live_by_title = _build_live_match_index(all_audio, audio_root)

    section_order: list[tuple[str, str | None]] = []
    section_tracks: dict[tuple[str, str | None], list[dict]] = {}
    flat_tracks: list[dict] = []

    for ref in references:
        live_file = live_by_title.get(ref.base_key)
        if not live_file:
            continue
        entry = _track_entry(live_file, media_root)
        if not entry:
            continue
        entry["source_release_title"] = ref.header_title
        entry["source_release_date"] = ref.header_date_iso
        entry["source_display_date"] = (
            format_display_date(ref.header_date_iso) if ref.header_date_iso else None
        )

        section_key = (ref.header_title, ref.header_date_iso)
        if section_key not in section_tracks:
            section_order.append(section_key)
            section_tracks[section_key] = []
        flat_tracks.append(entry)
        section_tracks[section_key].append(entry)

    sections: list[dict] = []
    for index, (title, date_iso) in enumerate(section_order):
        tracks = section_tracks.get((title, date_iso)) or []
        if not tracks:
            continue
        sections.append(
            {
                "id": f"live-story-{index}",
                "title": title,
                "date_iso": date_iso,
                "display_date": format_display_date(date_iso) if date_iso else None,
                "tracks": tracks,
            }
        )

    return {"tracks": flat_tracks, "sections": sections}


def build_live_story_card(band: Band, media_root: Path) -> dict | None:
    result = scan_live_story(band, media_root)
    tracks = result.get("tracks") or []
    if not tracks:
        return None
    return {
        "slug": LIVE_STORY_SLUG,
        "name": "Live Story",
        "track_count": len(tracks),
        "cover_url": playlist_cover_url(LIVE_STORY_SLUG),
    }


def build_live_story_detail(band: Band, media_root: Path) -> dict | None:
    result = scan_live_story(band, media_root)
    tracks = result.get("tracks") or []
    if not tracks:
        return None
    artist_name = (band.bnd_name or "").strip()
    description = (
        f"Live versions of {artist_name}'s records."
        if artist_name
        else "Live versions of the artist's records."
    )
    return {
        "slug": LIVE_STORY_SLUG,
        "name": "Live Story",
        "description": description,
        "tracks": tracks,
        "sections": result.get("sections") or [],
    }
