"""Track versions scan and YouTube links for release tracklist."""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import (
    _album_title_from_folder,
    _collect_audio_files,
    _find_cover_front_artwork,
    _parse_folder_date,
    _track_title_from_filename,
)
from app.config import settings
from app.gallery import _artist_dir, _display_name
from app.media_paths_util import safe_relative
from app.models import Band, Track
from app.media_index import (
    VARIOUS_ARTISTS_DEFAULT_ID,
    _band_id_from_content_path,
    _is_edition_dir,
    _is_group_subdir_name,
    _release_dir_from_content_folder,
    format_display_date,
    parse_bracket_tags,
    release_id_from_path,
)
from app.music_filters import _parse_ids

YOUTUBE_HOSTS = ("youtube.com", "youtu.be", "music.youtube.com")
BRACKET_SUFFIX_RE = re.compile(r"\s*\[([^\]]+)\]\s*$")
OF_TAG_RE = re.compile(r"^of\s+(.+)$", re.I)

LANGUAGE_NAMES = frozenset(
    {
        "spanish",
        "french",
        "german",
        "italian",
        "portuguese",
        "japanese",
        "korean",
        "chinese",
        "mandarin",
        "cantonese",
        "russian",
        "finnish",
        "swedish",
        "norwegian",
        "danish",
        "dutch",
        "polish",
        "hungarian",
        "czech",
        "greek",
        "turkish",
        "arabic",
        "hebrew",
        "hindi",
        "english",
    }
)


def _normalize_title(title: str) -> str:
    return re.sub(r"\s*\[.*\]\s*$", "", title.strip()).casefold()


def _split_bracket_parts(title: str) -> tuple[str, list[str]]:
    text = title.strip()
    match = BRACKET_SUFFIX_RE.search(text)
    if not match:
        return text, []
    main = text[: match.start()].strip()
    parts = [piece.strip() for piece in match.group(1).split(";") if piece.strip()]
    return main, parts


def _of_title_from_parts(parts: list[str]) -> str | None:
    for part in parts:
        match = OF_TAG_RE.match(part.strip())
        if not match:
            continue
        norm = _normalize_title(match.group(1))
        if norm:
            return norm
    return None


def _version_label_from_parts(parts: list[str]) -> str | None:
    labels: list[str] = []
    for part in parts:
        stripped = part.strip()
        low = stripped.casefold()
        match = OF_TAG_RE.match(stripped)
        if match:
            labels.append(f"Adaptation of {match.group(1).strip()}")
            continue
        if low in LANGUAGE_NAMES:
            labels.append(f"{low.title()} version")
            continue
        version_match = re.fullmatch(r"(.+)\s+version", low)
        if version_match and version_match.group(1) in LANGUAGE_NAMES:
            labels.append(f"{version_match.group(1).title()} version")
    return "; ".join(labels) if labels else None


def _youtube_title_keys(title: str) -> list[str]:
    raw = title.strip()
    if not raw:
        return []
    keys: list[str] = []
    for candidate in (
        raw,
        re.sub(r"\s*\([^)]*\)\s*$", "", raw).strip(),
        re.sub(r"\s*\[[^\]]*\]\s*$", "", raw).strip(),
    ):
        key = _normalize_title(candidate)
        if key and key not in keys:
            keys.append(key)
    return keys


def _lookup_youtube(youtube_map: dict[str, str], title: str) -> str | None:
    for key in _youtube_title_keys(title):
        url = youtube_map.get(key)
        if url:
            return url
    return None


def _normalize_youtube(url: str) -> str | None:
    raw = url.strip()
    if not raw:
        return None
    if raw.startswith("http"):
        if not any(host in raw.casefold() for host in YOUTUBE_HOSTS):
            return raw if "youtube" in raw.casefold() else None
        return raw
    if re.match(r"^[A-Za-z0-9_-]{6,}$", raw):
        return f"https://www.youtube.com/watch?v={raw}"
    return None


def _youtube_map_for_band(db: Session, band_id: int) -> dict[str, str]:
    needle = str(band_id)
    out: dict[str, str] = {}
    for row in db.scalars(select(Track)).all():
        bid = row.tra_band_id or ""
        if bid != needle and needle not in _parse_ids(bid):
            continue
        name = (row.tra_name or "").strip()
        if not name:
            continue
        video = _normalize_youtube(row.tra_video or "")
        if not video:
            continue
        for label in (name, (row.tra_alt_name or "").strip()):
            if not label:
                continue
            for key in _youtube_title_keys(label):
                if key not in out:
                    out[key] = video
    return out


def _db_title_alias_adjacency(db: Session, band_id: int) -> dict[str, set[str]]:
    needle = str(band_id)
    adjacency: dict[str, set[str]] = defaultdict(set)
    for row in db.scalars(select(Track)).all():
        bid = row.tra_band_id or ""
        if bid != needle and needle not in _parse_ids(bid):
            continue
        primary = _normalize_title(row.tra_name or "")
        alternate = _normalize_title(row.tra_alt_name or "")
        if not primary or not alternate or primary == alternate:
            continue
        adjacency[primary].add(alternate)
        adjacency[alternate].add(primary)
    return adjacency


def _expand_title_aliases(keys: set[str], adjacency: dict[str, set[str]]) -> set[str]:
    expanded = set(keys)
    pending = list(keys)
    while pending:
        key = pending.pop()
        for alias in adjacency.get(key, ()):
            if alias not in expanded:
                expanded.add(alias)
                pending.append(alias)
    return expanded


@dataclass(frozen=True)
class _IndexedTrack:
    audio_file: Path
    file_title: str
    norm_title: str
    of_norm: str | None
    bracket_parts: tuple[str, ...]


def _index_artist_tracks(artist_dir: Path) -> list[_IndexedTrack]:
    indexed: list[_IndexedTrack] = []
    for audio_file in _collect_audio_files(artist_dir):
        file_title = _track_title_from_filename(audio_file)
        _, parts = _split_bracket_parts(file_title)
        indexed.append(
            _IndexedTrack(
                audio_file=audio_file,
                file_title=file_title,
                norm_title=_normalize_title(file_title),
                of_norm=_of_title_from_parts(parts),
                bracket_parts=tuple(parts),
            )
        )
    return indexed


def _resolve_work_keys(
    seed_keys: set[str],
    indexed: list[_IndexedTrack],
    alias_adjacency: dict[str, set[str]],
) -> set[str]:
    keys = _expand_title_aliases(seed_keys, alias_adjacency)
    changed = True
    while changed:
        changed = False
        for entry in indexed:
            if entry.norm_title in keys and entry.of_norm and entry.of_norm not in keys:
                keys.add(entry.of_norm)
                changed = True
            if entry.of_norm and entry.of_norm in keys and entry.norm_title not in keys:
                keys.add(entry.norm_title)
                changed = True
        expanded = _expand_title_aliases(keys, alias_adjacency)
        if expanded != keys:
            keys = expanded
            changed = True
    return keys


def _version_source_context(
    audio_file, media_root
) -> tuple[str | None, str | None, str | None, str | None, str | None]:
    """Release title, edition title, release folder rel, cover url, date iso."""
    file_dir = audio_file.parent

    after_groups = file_dir
    while _is_group_subdir_name(after_groups.name):
        parent = after_groups.parent
        if parent == after_groups:
            break
        after_groups = parent

    edition_dir = after_groups if _is_edition_dir(after_groups) else None

    release_dir = _release_dir_from_content_folder(after_groups)
    if edition_dir and edition_dir.resolve() == release_dir.resolve():
        edition_dir = None

    release_rel = safe_relative(release_dir, media_root)
    clean_folder, _ = parse_bracket_tags(release_dir.name)
    release_title = _album_title_from_folder(clean_folder)
    edition_title = None
    if edition_dir:
        clean_edition, _ = parse_bracket_tags(edition_dir.name)
        edition_title = _album_title_from_folder(clean_edition)
        if (
            edition_title
            and release_title
            and edition_title.casefold() == release_title.casefold()
        ):
            edition_title = None
    cover = _find_cover_front_artwork(audio_file.parent, media_root)
    if not cover:
        cover = _find_cover_front_artwork(release_dir, media_root)
    date_iso = _parse_folder_date(clean_folder) or _parse_folder_date(release_dir.name)
    return release_title, edition_title, release_rel, cover, date_iso


def _album_context(
    audio_file, media_root
) -> tuple[str | None, str | None, str | None, str | None]:
    release_title, _edition_title, release_rel, cover, date_iso = _version_source_context(
        audio_file, media_root
    )
    return release_title, release_rel, cover, date_iso


def _artist_cover_tag(band_name: str) -> str:
    return f"{_display_name(band_name)} cover".casefold()


def _matches_artist_cover(parts: tuple[str, ...], band_name: str) -> bool:
    return any(part.casefold() == _artist_cover_tag(band_name) for part in parts)


def find_track_versions(
    db: Session,
    band_id: int,
    *,
    title: str,
    play_path: str,
    release_id: str | None = None,
    limit: int = 25,
) -> list[dict]:
    band = db.get(Band, band_id)
    if not band or not settings.media_root:
        return []

    media_root = Path(settings.media_root)
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return []

    want = _normalize_title(title)
    if not want:
        return []

    from app.release_tracklist import (
        _db_duration_map,
        _duration_from_file,
        _format_duration,
        _normalize_title as _track_norm_title,
    )

    db_durations = _db_duration_map(db)
    art_ctx = None
    if release_id:
        from app.release_overview import resolve_release_content
        from app.release_playback_art import PlaybackArtContext

        resolved = resolve_release_content(db, band_id, release_id)
        if resolved:
            band_row, card, _, content = resolved
            art_ctx = PlaybackArtContext(
                release_content=content,
                release_title=card.get("title"),
                band_name=band_row.bnd_name,
            )

    indexed = _index_artist_tracks(artist_dir)
    alias_adjacency = _db_title_alias_adjacency(db, band_id)

    seed_keys = {want}
    _, source_parts = _split_bracket_parts(title)
    source_of = _of_title_from_parts(source_parts)
    if source_of:
        seed_keys.add(source_of)
    work_keys = _resolve_work_keys(seed_keys, indexed, alias_adjacency)

    out: list[dict] = []
    seen: set[str] = set()
    for entry in indexed:
        if entry.norm_title not in work_keys:
            continue
        path = safe_relative(entry.audio_file, media_root)
        if not path or path == play_path or path in seen:
            continue
        seen.add(path)
        album_title, edition_title, album_path, cover_url, date_iso = _version_source_context(
            entry.audio_file, media_root
        )
        from app.release_playback_art import playback_art_for_audio_file

        playback = playback_art_for_audio_file(
            entry.audio_file, media_root, ctx=art_ctx
        )
        duration_sec = _duration_from_file(entry.audio_file)
        if duration_sec is None:
            duration_sec = db_durations.get(_track_norm_title(entry.file_title))
        navigate_release_id = (
            release_id_from_path(album_path) if album_path else None
        )
        navigate_band_id = band_id
        if album_path:
            alt_band_id = _band_id_from_content_path(
                db, media_root, media_root / album_path
            )
            if alt_band_id:
                navigate_band_id = alt_band_id
        out.append(
            {
                "title": entry.file_title,
                "play_path": path,
                "album_title": album_title,
                "edition_title": edition_title,
                "album_folder": album_path,
                "navigate_release_id": navigate_release_id,
                "navigate_band_id": navigate_band_id,
                "cover_url": playback.get("cover_url") or cover_url,
                "cover_animation_url": playback.get("cover_animation_url"),
                "canvas_url": playback.get("canvas_url"),
                "disc_url": playback.get("disc_url"),
                "background_layers": playback.get("background_layers") or [],
                "date_iso": date_iso,
                "display_date": format_display_date(date_iso),
                "duration": _format_duration(duration_sec),
                "version_label": _version_label_from_parts(list(entry.bracket_parts)),
            }
        )

    va_band = db.get(Band, VARIOUS_ARTISTS_DEFAULT_ID)
    va_dir = _artist_dir(media_root, va_band.bnd_name) if va_band else None
    if va_dir and va_dir.resolve() != artist_dir.resolve():
        va_indexed = _index_artist_tracks(va_dir)
        band_name = band.bnd_name or ""
        for entry in va_indexed:
            if entry.norm_title not in work_keys:
                continue
            if not _matches_artist_cover(entry.bracket_parts, band_name):
                continue
            path = safe_relative(entry.audio_file, media_root)
            if not path or path == play_path or path in seen:
                continue
            seen.add(path)
            album_title, edition_title, album_path, cover_url, date_iso = _version_source_context(
                entry.audio_file, media_root
            )
            from app.release_playback_art import playback_art_for_audio_file

            playback = playback_art_for_audio_file(
                entry.audio_file, media_root, ctx=art_ctx
            )
            duration_sec = _duration_from_file(entry.audio_file)
            if duration_sec is None:
                duration_sec = db_durations.get(_track_norm_title(entry.file_title))
            navigate_release_id = (
                release_id_from_path(album_path) if album_path else None
            )
            navigate_band_id = VARIOUS_ARTISTS_DEFAULT_ID
            if album_path:
                alt_band_id = _band_id_from_content_path(
                    db, media_root, media_root / album_path
                )
                if alt_band_id:
                    navigate_band_id = alt_band_id
            out.append(
                {
                    "title": entry.file_title,
                    "play_path": path,
                    "album_title": album_title,
                    "edition_title": edition_title,
                    "album_folder": album_path,
                    "navigate_release_id": navigate_release_id,
                    "navigate_band_id": navigate_band_id,
                    "cover_url": playback.get("cover_url") or cover_url,
                    "cover_animation_url": playback.get("cover_animation_url"),
                    "canvas_url": playback.get("canvas_url"),
                    "disc_url": playback.get("disc_url"),
                    "background_layers": playback.get("background_layers") or [],
                    "date_iso": date_iso,
                    "display_date": format_display_date(date_iso),
                    "duration": _format_duration(duration_sec),
                    "version_label": _version_label_from_parts(list(entry.bracket_parts)),
                }
            )
    out.sort(
        key=lambda v: (
            v.get("date_iso") or "9999-12-31",
            v.get("album_title") or "",
        )
    )
    return out[:limit]
