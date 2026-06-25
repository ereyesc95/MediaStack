"""Edition-based and library-wide system playlists (bonus, b-sides, standalones, …)."""
from __future__ import annotations

from collections import Counter
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import (
    AUDIO_CATEGORIES,
    AUDIO_EXTS,
    _album_title_from_folder,
    _audio_root,
    _collect_audio_files,
    _find_cover_front_artwork,
    _normalize_title_for_match,
    _release_date_for_track,
    _track_title_from_filename,
)
from app.gallery import _artist_dir
from app.media_paths_util import safe_relative
from app.models import Band, Reproduction
from app.release_tracklist import _track_number

MAIN_RELEASE_CATEGORIES = (
    "albums",
    "extended_plays",
    "compilations",
    "soundtracks",
    "live_albums",
)

BONUS_TRACKS_SLUG = "bonus-tracks"
B_SIDES_SLUG = "b-sides"
STANDALONES_SLUG = "standalones"
MOST_PLAYED_SLUG = "most-played"
COLLABORATIONS_SLUG = "collaborations"

EXTENDED_PLAYLIST_LABELS: dict[str, str] = {
    BONUS_TRACKS_SLUG: "Bonus Tracks",
    B_SIDES_SLUG: "B-Sides",
    STANDALONES_SLUG: "Standalones",
    MOST_PLAYED_SLUG: "Most Played",
    COLLABORATIONS_SLUG: "Collaborations",
}


def _audio_files_in_dir(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return [
        p
        for p in directory.rglob("*")
        if p.is_file() and p.suffix.lower() in AUDIO_EXTS
    ]


def _iter_single_release_roots(singles_cat: Path):
    from app.media_index import DATE_PREFIX_RE, _is_edition_dir

    for child in sorted(singles_cat.iterdir(), key=lambda p: p.name.casefold()):
        if not child.is_dir():
            continue
        nested = [
            entry
            for entry in child.iterdir()
            if entry.is_dir()
            and DATE_PREFIX_RE.match(entry.name.strip())
            and not _is_edition_dir(entry)
        ]
        if nested:
            for single in sorted(nested, key=lambda p: p.name.casefold()):
                yield single
        else:
            yield child


def _lead_track_key(single_dir: Path) -> str | None:
    standard = _resolve_standard_edition(single_dir)
    files = sorted(
        _audio_files_in_dir(standard),
        key=lambda p: (_track_number(p.name, 9999), p.name.casefold()),
    )
    if not files:
        return None
    return _normalize_title_for_match(_track_title_from_filename(files[0]))


def _track_entry(
    audio_file: Path,
    media_root: Path,
    *,
    album_title: str | None = None,
    play_count: int | None = None,
) -> dict | None:
    play_path = safe_relative(audio_file, media_root)
    if not play_path:
        return None
    album_dir = audio_file.parent
    while album_dir.name.casefold() in ("standard edition", "deluxe edition", "bonus"):
        album_dir = album_dir.parent
    entry = {
        "title": _track_title_from_filename(audio_file),
        "play_path": play_path,
        "album_title": album_title or _album_title_from_folder(album_dir.name),
        "cover_url": _find_cover_front_artwork(audio_file.parent, media_root),
        "release_date": _release_date_for_track(audio_file),
    }
    if play_count is not None:
        entry["play_count"] = play_count
    return entry


def _list_edition_dirs(release_dir: Path) -> list[Path]:
    from app.media_index import _is_edition_dir

    editions = [
        child
        for child in sorted(release_dir.iterdir(), key=lambda p: p.name.casefold())
        if child.is_dir() and _is_edition_dir(child)
    ]
    return editions


def _resolve_standard_edition(content: Path) -> Path:
    from app.release_overview import _resolve_standard_edition

    return _resolve_standard_edition(content)


def _main_release_title_keys(band: Band, media_root: Path) -> set[str]:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return set()
    audio_root = _audio_root(artist_dir)
    keys: set[str] = set()
    for cat in MAIN_RELEASE_CATEGORIES:
        folder_name = AUDIO_CATEGORIES.get(cat)
        if not folder_name:
            continue
        cat_dir = audio_root / folder_name
        if not cat_dir.is_dir():
            continue
        for release_dir in cat_dir.iterdir():
            if not release_dir.is_dir():
                continue
            target = _resolve_standard_edition(release_dir)
            for audio_file in _audio_files_in_dir(target):
                keys.add(_normalize_title_for_match(_track_title_from_filename(audio_file)))
    return keys


def scan_bonus_tracks(band: Band, media_root: Path) -> list[dict]:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return []
    audio_root = _audio_root(artist_dir)
    out: list[dict] = []
    seen_paths: set[str] = set()

    for cat in MAIN_RELEASE_CATEGORIES:
        folder_name = AUDIO_CATEGORIES.get(cat)
        if not folder_name:
            continue
        cat_dir = audio_root / folder_name
        if not cat_dir.is_dir():
            continue
        for release_dir in sorted(cat_dir.iterdir(), key=lambda p: p.name.casefold()):
            if not release_dir.is_dir():
                continue
            standard_ed = _resolve_standard_edition(release_dir)
            standard_titles = {
                _normalize_title_for_match(_track_title_from_filename(f))
                for f in _audio_files_in_dir(standard_ed)
            }
            edition_dirs = _list_edition_dirs(release_dir) or [release_dir]
            for edition in edition_dirs:
                if edition.resolve() == standard_ed.resolve():
                    continue
                for audio_file in _audio_files_in_dir(edition):
                    title_key = _normalize_title_for_match(
                        _track_title_from_filename(audio_file)
                    )
                    if title_key in standard_titles:
                        continue
                    entry = _track_entry(audio_file, media_root)
                    if not entry or entry["play_path"] in seen_paths:
                        continue
                    seen_paths.add(entry["play_path"])
                    out.append(entry)

    out.sort(key=lambda t: (t.get("album_title") or "", t.get("title") or ""))
    return out


def scan_b_sides(band: Band, media_root: Path) -> list[dict]:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return []
    singles_dir = _audio_root(artist_dir) / AUDIO_CATEGORIES["singles"]
    if not singles_dir.is_dir():
        return []

    out: list[dict] = []
    seen_paths: set[str] = set()

    for single_dir in _iter_single_release_roots(singles_dir):
        lead_key = _lead_track_key(single_dir)
        edition_dirs = _list_edition_dirs(single_dir) or [single_dir]
        for edition in edition_dirs:
            files = sorted(
                _audio_files_in_dir(edition),
                key=lambda p: (_track_number(p.name, 9999), p.name.casefold()),
            )
            for index, audio_file in enumerate(files):
                title_key = _normalize_title_for_match(
                    _track_title_from_filename(audio_file)
                )
                track_num = _track_number(audio_file.name, index + 1)
                if lead_key and title_key == lead_key and track_num <= 1:
                    continue
                if lead_key and title_key == lead_key:
                    continue
                entry = _track_entry(audio_file, media_root)
                if not entry or entry["play_path"] in seen_paths:
                    continue
                seen_paths.add(entry["play_path"])
                out.append(entry)

    out.sort(key=lambda t: (t.get("album_title") or "", t.get("title") or ""))
    return out


def scan_standalones(band: Band, media_root: Path) -> list[dict]:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return []
    singles_dir = _audio_root(artist_dir) / AUDIO_CATEGORIES["singles"]
    if not singles_dir.is_dir():
        return []

    on_main = _main_release_title_keys(band, media_root)
    out: list[dict] = []
    seen_titles: set[str] = set()

    for single_dir in _iter_single_release_roots(singles_dir):
        edition = _resolve_standard_edition(single_dir)
        files = sorted(
            _audio_files_in_dir(edition),
            key=lambda p: (_track_number(p.name, 9999), p.name.casefold()),
        )
        if not files:
            continue
        lead = files[0]
        title_key = _normalize_title_for_match(_track_title_from_filename(lead))
        if not title_key or title_key in on_main or title_key in seen_titles:
            continue
        entry = _track_entry(lead, media_root)
        if not entry:
            continue
        seen_titles.add(title_key)
        out.append(entry)

    out.sort(key=lambda t: (t.get("title") or "").casefold())
    return out


def scan_most_played(
    db: Session, band: Band, media_root: Path, *, user_id: int
) -> list[dict]:
    from app.play_stats import is_quiz_play_title
    from app.profile_scope import rep_user_filter

    path_counts: Counter[str] = Counter()
    for row in db.scalars(
        select(Reproduction).where(
            Reproduction.rep_artist_id == band.bnd_id,
            Reproduction.rep_media_type == 200,
            rep_user_filter(user_id),
        )
    ).all():
        path = (row.rep_path or "").strip().replace("\\", "/")
        if not path or is_quiz_play_title(row.rep_title):
            continue
        try:
            count = int(row.rep_reproductions or "0")
        except ValueError:
            count = 1
        if count > 0:
            path_counts[path] += count

    if not path_counts:
        return []

    artist_dir = _artist_dir(media_root, band.bnd_name)
    local_by_path: dict[str, Path] = {}
    if artist_dir:
        for audio_file in _collect_audio_files(artist_dir):
            rel = safe_relative(audio_file, media_root)
            if rel:
                local_by_path[rel.replace("\\", "/")] = audio_file

    out: list[dict] = []
    for path, count in path_counts.most_common():
        audio_file = local_by_path.get(path)
        if not audio_file:
            candidate = media_root / Path(path)
            if candidate.is_file():
                audio_file = candidate
        if not audio_file:
            continue
        entry = _track_entry(audio_file, media_root, play_count=count)
        if entry:
            out.append(entry)
    return out


def scan_collaborations(band: Band, media_root: Path) -> list[dict]:
    from app.cross_artist_playlists import scan_appearances
    from app.system_playlists import _track_tags

    names = []
    if band.bnd_name:
        names.append(band.bnd_name.strip())
    for part in (band.bnd_other_names or "").replace("█", "'").replace(";", ",").split(","):
        piece = part.strip()
        if piece and piece not in names:
            names.append(piece)
    name_cf = [n.casefold() for n in names if n]

    out: list[dict] = []
    seen: set[str] = set()
    for entry in scan_appearances(band, media_root):
        play_path = entry.get("play_path")
        if not play_path:
            continue
        audio_file = media_root / Path(play_path.replace("/", "\\"))
        if not audio_file.is_file():
            audio_file = media_root / Path(play_path)
        if not audio_file.is_file():
            continue
        tags = _track_tags(audio_file.stem)
        has_feat = any("feat" in tag for tag in tags)
        if not has_feat:
            continue
        if not any(name in " ".join(tags) for name in name_cf):
            continue
        key = entry.get("play_path") or entry.get("title")
        if key in seen:
            continue
        seen.add(key)
        out.append(entry)
    return out


def scan_extended_playlists(
    db: Session, band: Band, media_root: Path, *, user_id: int = 1
) -> dict[str, list[dict]]:
    return {
        BONUS_TRACKS_SLUG: scan_bonus_tracks(band, media_root),
        B_SIDES_SLUG: scan_b_sides(band, media_root),
        STANDALONES_SLUG: scan_standalones(band, media_root),
        MOST_PLAYED_SLUG: scan_most_played(db, band, media_root, user_id=user_id),
        COLLABORATIONS_SLUG: scan_collaborations(band, media_root),
    }
