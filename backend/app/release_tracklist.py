"""Scan release folder layout into edition / disc / track payloads."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import (
    AUDIO_EXTS,
    DATE_PREFIX_RE,
    TRACK_PREFIX_RE,
    _album_title_from_folder,
    _parse_folder_date,
    display_track_title_from_path,
    _track_title_from_filename,
)
from app.config import settings
from app.media_index import DISC_DIR_RE, _disc_sort_key, _is_edition_folder, _is_edition_content_dir, _is_group_subdir_name, format_display_date, parse_bracket_tags, release_id_from_path
from app.media_paths_util import entry_display_name, resolve_media_entry, safe_relative
from app.models import Track
from app.gallery import IMAGE_EXTS, _media_url
from app.release_overview import (
    _artwork_urls,
    _find_artwork_subdir,
    _find_singles_parent_folder,
    _resolve_standard_edition,
    _singles_category_dir,
    _single_title_from_folder,
    _standard_artwork_dir,
    resolve_release_content,
)
from app.lyrics_storage import has_stored_lyrics
from app.release_playback_art import PlaybackArtContext, resolve_disc_url_for_group
from app.release_track_extras import find_track_versions
from app.track_youtube import attach_release_youtube_urls

ARTWORK_DIR = "[artwork]"
TRACK_NUM_RE = re.compile(r"^(\d+)\.")
VINYL_SIDE_STEM_RE = re.compile(r"^([A-Z])(\d+)", re.I)
SIDE_RE = re.compile(r"^\d+\.\s*Side\s+", re.I)
TAPE_RE = re.compile(r"^\d+\.\s*(Tape|Cassette)\s+", re.I)
DISC_LOOSE_RE = re.compile(r"^Disc\s+(\d+)", re.I)
SIDE_LOOSE_RE = re.compile(r"^Side\s+[A-Z]\b", re.I)
TAPE_LOOSE_RE = re.compile(r"^Tape\s+[A-Z]\b", re.I)
CASSETTE_LOOSE_RE = re.compile(r"^Cassette\s+[A-Z]\b", re.I)


def _group_sort_key(folder: Path) -> tuple[int, str]:
    loose = DISC_LOOSE_RE.match(folder.name)
    if loose:
        return (int(loose.group(1)), folder.name.casefold())
    return _disc_sort_key(folder)


def _track_id(play_path: str) -> str:
    digest = hashlib.sha256(play_path.casefold().encode("utf-8")).hexdigest()[:12]
    return f"trk_{digest}"


def _edition_id(rel_path: str) -> str:
    digest = hashlib.sha256(rel_path.casefold().encode("utf-8")).hexdigest()[:12]
    return f"ed_{digest}"


def _normalize_title(title: str) -> str:
    t = title.strip()
    t = re.sub(r"\s*\[.*\]\s*$", "", t)
    return t.casefold()


def _format_duration(seconds: float | None) -> str | None:
    if seconds is None or seconds <= 0:
        return None
    total = int(round(seconds))
    return f"{total // 60}:{total % 60:02d}"


def _duration_from_file(path: Path) -> float | None:
    try:
        from mutagen import File as MutagenFile

        audio = MutagenFile(path)
        if audio is not None and getattr(audio, "info", None) is not None:
            length = getattr(audio.info, "length", None)
            if length and length > 0:
                return float(length)
    except Exception:
        pass
    return None


def _parse_db_duration(raw: str | None) -> float | None:
    if not raw:
        return None
    text = raw.strip()
    if ":" in text:
        parts = text.split(":")
        try:
            if len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
            if len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        except ValueError:
            return None
    try:
        return float(text)
    except ValueError:
        return None


def _db_duration_map(db: Session) -> dict[str, float]:
    out: dict[str, float] = {}
    for row in db.scalars(select(Track)).all():
        name = (row.tra_name or "").strip()
        if not name:
            continue
        sec = _parse_db_duration(row.tra_duration)
        if sec:
            out[_normalize_title(name)] = sec
    return out


def _is_audio_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in AUDIO_EXTS


def _has_direct_audio(folder: Path) -> bool:
    if not folder.is_dir():
        return False
    for child in folder.iterdir():
        if _is_audio_file(child):
            return True
    return False


def _audio_group_subdirs(folder: Path) -> list[Path]:
    return [
        c
        for c in sorted(folder.iterdir(), key=lambda p: p.name.casefold())
        if c.is_dir()
        and c.name.casefold() != ARTWORK_DIR
        and _has_direct_audio(c)
    ]


def _group_subdirs(folder: Path) -> list[Path]:
    named = [
        c
        for c in folder.iterdir()
        if c.is_dir()
        and c.name.casefold() != ARTWORK_DIR
        and _is_group_subdir_name(c.name)
    ]
    if named:
        return sorted(named, key=_group_sort_key)
    audio_groups = _audio_group_subdirs(folder)
    if len(audio_groups) >= 2:
        return audio_groups
    return []


def _has_group_subdirs(folder: Path) -> bool:
    if not folder.is_dir():
        return False
    return bool(_group_subdirs(folder))


def _group_kind(name: str) -> str:
    if SIDE_RE.match(name) or SIDE_LOOSE_RE.match(name):
        return "side"
    if (
        TAPE_RE.match(name)
        or TAPE_LOOSE_RE.match(name)
        or CASSETTE_LOOSE_RE.match(name)
    ):
        return "tape"
    if DISC_DIR_RE.match(name) or DISC_LOOSE_RE.match(name):
        return "disc"
    return "disc"


def _synced_lrc_for_path(db: Session, play_path: str) -> str | None:
    from app.release_lyrics_shared import synced_lrc_for_path

    return synced_lrc_for_path(db, play_path)


def _attach_has_lrc(db: Session, editions: list[dict]) -> None:
    from app.media_paths import path_to_local_file

    synced_keys: set[str] = set()
    entries: list[tuple[dict, str]] = []

    for edition in editions:
        for group in edition.get("groups") or []:
            for track in group.get("tracks") or []:
                play_path = (track.get("play_path") or "").strip()
                title = (track.get("title") or "").strip()
                main_key = _normalize_title(title)
                local = path_to_local_file(play_path) if play_path else None
                track["has_lrc"] = bool(local and has_stored_lyrics(db, local))
                entries.append((track, main_key))
                if play_path and _synced_lrc_for_path(db, play_path):
                    synced_keys.add(main_key)

    for track, main_key in entries:
        track["has_synced_lrc"] = main_key in synced_keys


def _track_number(filename: str, fallback: int) -> int:
    stem = Path(filename).stem.strip()
    after_prefix = TRACK_PREFIX_RE.sub("", stem).strip()
    vinyl = VINYL_SIDE_STEM_RE.match(after_prefix)
    if vinyl:
        try:
            return int(vinyl.group(2))
        except ValueError:
            pass
    m = TRACK_NUM_RE.match(filename)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass
    return fallback


def _vinyl_side_letter(filename: str) -> str | None:
    stem = Path(filename).stem.strip()
    after_prefix = TRACK_PREFIX_RE.sub("", stem).strip()
    m = VINYL_SIDE_STEM_RE.match(after_prefix)
    if not m:
        return None
    return m.group(1).upper()


def _vinyl_side_label(letter: str) -> str:
    return f"Side {letter}"


def _vinyl_side_groups_from_dir(
    directory: Path,
    media_root: Path,
    *,
    db_durations: dict[str, float],
    edition_artwork: Path | None = None,
    art_ctx: PlaybackArtContext | None = None,
) -> list[dict] | None:
    side_tracks: dict[str, list[dict]] = {}
    other_count = 0
    entries = sorted(directory.iterdir(), key=lambda p: p.name.casefold())
    index = 0
    for entry in entries:
        audio_file: Path | None = None
        if _is_audio_file(entry):
            audio_file = entry
        elif entry.suffix.casefold() == ".lnk":
            target = resolve_media_entry(entry)
            if target and _is_audio_file(target):
                audio_file = target
        if not audio_file:
            continue
        index += 1
        side = _vinyl_side_letter(audio_file.name)
        track = _build_track(
            audio_file,
            media_root,
            db_durations=db_durations,
            index=index,
            art_ctx=art_ctx,
        )
        if not track:
            continue
        if side:
            side_tracks.setdefault(side, []).append(track)
        else:
            other_count += 1

    if len(side_tracks) < 2:
        return None
    total = sum(len(v) for v in side_tracks.values()) + other_count
    if other_count and other_count > total / 2:
        return None

    groups: list[dict] = []
    for letter in sorted(side_tracks.keys()):
        label = _vinyl_side_label(letter)
        tracks = sorted(
            side_tracks[letter],
            key=lambda t: (t.get("number") or 0, (t.get("title") or "").casefold()),
        )
        groups.append(
            {
                "id": _edition_id(
                    f"{safe_relative(directory, media_root) or directory.name}:{label}"
                ),
                "kind": "side",
                "label": label,
                "disc_url": _disc_url_for_group(
                    edition_artwork,
                    None,
                    media_root,
                    label,
                    art_ctx=art_ctx,
                ),
                "tracks": tracks,
            }
        )
    return groups


def _track_playback_art(
    audio_file: Path,
    media_root: Path,
    *,
    ctx: PlaybackArtContext | None = None,
) -> dict[str, str | list[str] | None]:
    from app.release_playback_art import playback_art_for_audio_file

    return playback_art_for_audio_file(audio_file, media_root, ctx=ctx)


def _build_track(
    audio_file: Path,
    media_root: Path,
    *,
    db_durations: dict[str, float],
    index: int,
    art_ctx: PlaybackArtContext | None = None,
) -> dict | None:
    play_path = safe_relative(audio_file, media_root)
    if not play_path:
        return None
    title = display_track_title_from_path(audio_file)
    norm = _normalize_title(title)
    duration_sec = _duration_from_file(audio_file)
    if duration_sec is None:
        duration_sec = db_durations.get(norm)
    art = _track_playback_art(audio_file, media_root, ctx=art_ctx)
    return {
        "id": _track_id(play_path),
        "number": _track_number(audio_file.name, index),
        "title": title,
        "play_path": play_path,
        "duration_sec": duration_sec,
        "duration": _format_duration(duration_sec),
        "has_lrc": False,
        "has_synced_lrc": False,
        "is_link": False,
        "cover_url": art.get("cover_url"),
        "cover_animation_url": art.get("cover_animation_url"),
        "canvas_url": art.get("canvas_url"),
        "disc_url": art.get("disc_url"),
        "background_layers": art.get("background_layers") or [],
    }


def _scan_tracks_in_dir(
    directory: Path,
    media_root: Path,
    *,
    db_durations: dict[str, float],
    art_ctx: PlaybackArtContext | None = None,
) -> list[dict]:
    tracks: list[dict] = []
    entries = sorted(directory.iterdir(), key=lambda p: p.name.casefold())
    index = 0
    for entry in entries:
        audio_file: Path | None = None
        if _is_audio_file(entry):
            audio_file = entry
        elif entry.suffix.casefold() == ".lnk":
            target = resolve_media_entry(entry)
            if target and _is_audio_file(target):
                audio_file = target
        if not audio_file:
            continue
        index += 1
        track = _build_track(
            audio_file, media_root, db_durations=db_durations, index=index, art_ctx=art_ctx
        )
        if track:
            tracks.append(track)
    return tracks


def _disc_url_for_group(
    edition_artwork: Path | None,
    group_dir: Path | None,
    media_root: Path,
    group_label: str | None,
    *,
    art_ctx: PlaybackArtContext | None = None,
) -> str | None:
    return resolve_disc_url_for_group(
        edition_artwork,
        group_dir,
        media_root,
        group_label,
        release_content=art_ctx.release_content if art_ctx else None,
    )


def _scan_resolved_folder(
    folder: Path,
    media_root: Path,
    *,
    db_durations: dict[str, float],
    label: str,
    kind: str,
    edition_artwork: Path | None = None,
    art_ctx: PlaybackArtContext | None = None,
) -> dict:
    if _has_group_subdirs(folder):
        groups: list[dict] = []
        subdirs = _group_subdirs(folder)
        for sub in subdirs:
            tracks = _scan_tracks_in_dir(
                sub, media_root, db_durations=db_durations, art_ctx=art_ctx
            )
            if tracks:
                groups.append(
                    {
                        "id": _edition_id(safe_relative(sub, media_root) or sub.name),
                        "kind": _group_kind(sub.name),
                        "label": sub.name,
                        "disc_url": _disc_url_for_group(
                            edition_artwork,
                            sub,
                            media_root,
                            sub.name,
                            art_ctx=art_ctx,
                        ),
                        "tracks": tracks,
                    }
                )
        return {"kind": kind, "label": label, "groups": groups}

    vinyl_groups = _vinyl_side_groups_from_dir(
        folder,
        media_root,
        db_durations=db_durations,
        edition_artwork=edition_artwork,
        art_ctx=art_ctx,
    )
    if vinyl_groups:
        return {"kind": kind, "label": label, "groups": vinyl_groups}

    tracks = _scan_tracks_in_dir(
        folder, media_root, db_durations=db_durations, art_ctx=art_ctx
    )
    if tracks:
        return {
            "kind": kind,
            "label": label,
            "groups": [
                {
                    "id": _edition_id(safe_relative(folder, media_root) or label),
                    "kind": "flat",
                    "label": None,
                    "tracks": tracks,
                }
            ],
        }
    return {"kind": kind, "label": label, "groups": []}


def _scan_lnk_group(lnk: Path, media_root: Path, *, db_durations: dict[str, float]) -> dict | None:
    target = resolve_media_entry(lnk)
    label = entry_display_name(lnk)
    if not target or not target.is_dir():
        return None
    inner = _scan_resolved_folder(
        target, media_root, db_durations=db_durations, label=label, kind="link"
    )
    if not inner["groups"]:
        return None
    for group in inner["groups"]:
        for track in group.get("tracks") or []:
            track["is_link"] = True
    return inner


def _edition_label(folder: Path) -> str:
    name = folder.name
    m = DATE_PREFIX_RE.match(name.strip())
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        date_part = y
        if mo:
            date_part += f".{mo}"
        if d:
            date_part += f".{d}"
        rest = name[m.end() :].lstrip(". ").strip()
        if rest:
            return f"{date_part}. {rest}"
        return date_part
    return name


def _list_edition_dirs(content: Path) -> list[Path]:
    editions: list[Path] = []
    for child in sorted(content.iterdir(), key=lambda p: p.name.casefold()):
        if child.suffix.casefold() == ".lnk":
            resolved = resolve_media_entry(child)
            if resolved and resolved.is_dir():
                editions.append(resolved)
            continue
        if not child.is_dir() or child.name.casefold() == ARTWORK_DIR:
            continue
        if _is_edition_content_dir(child):
            editions.append(child)
    if not editions and (_has_direct_audio(content) or _has_group_subdirs(content)):
        return [content]
    return editions


def _dedupe_tracks(groups: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out_groups: list[dict] = []
    for group in groups:
        tracks: list[dict] = []
        for track in group.get("tracks") or []:
            key = (track.get("play_path") or "").casefold()
            if not key or key in seen:
                continue
            seen.add(key)
            tracks.append(track)
        if tracks:
            out_groups.append({**group, "tracks": tracks})
    return out_groups


def _scan_single_release_groups(
    single_dir: Path,
    media_root: Path,
    *,
    db_durations: dict[str, float],
) -> tuple[list[dict], Path | None]:
    edition_dirs = _list_edition_dirs(single_dir)
    if not edition_dirs:
        edition_dirs = [_resolve_standard_edition(single_dir)]
    art_edition = _resolve_standard_edition(single_dir)
    edition_artwork = _standard_artwork_dir(art_edition)
    groups: list[dict] = []
    for ed_dir in edition_dirs:
        scanned = _scan_resolved_folder(
            ed_dir,
            media_root,
            db_durations=db_durations,
            label=_edition_label(ed_dir),
            kind="flat",
            edition_artwork=edition_artwork,
        )
        for group in scanned.get("groups") or []:
            if group.get("tracks"):
                groups.append(group)
    return groups, edition_artwork


def _bside_source_title(single_dir: Path, edition_dir: Path) -> str:
    single_title = _single_title_from_folder(single_dir, entry_display_name(single_dir))
    if edition_dir.resolve() == single_dir.resolve():
        return single_title
    edition_part = _edition_label(edition_dir)
    m = DATE_PREFIX_RE.match(edition_part.strip())
    if m:
        edition_part = edition_part[m.end() :].lstrip(". ").strip()
    if not edition_part or edition_part.casefold() == single_title.casefold():
        return single_title
    return f"{single_title}: {edition_part}"


def _edition_date_iso(edition_dir: Path, fallback_dir: Path) -> str | None:
    return _parse_folder_date(edition_dir.name) or _parse_folder_date(fallback_dir.name)


def _append_bside_groups(
    db: Session,
    band,
    content: Path,
    media_root: Path,
    *,
    db_durations: dict[str, float],
    release_title: str,
    editions_out: list[dict],
) -> None:
    from app.gallery import _artist_dir

    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return
    singles_cat = _singles_category_dir(artist_dir)
    if not singles_cat:
        return
    parent = _find_singles_parent_folder(
        singles_cat, release_title=release_title, content=content
    )
    if not parent:
        return

    seen_paths: set[str] = set()
    for edition in editions_out:
        for group in edition.get("groups") or []:
            for track in group.get("tracks") or []:
                seen_paths.add(track.get("play_path") or "")

    bside_groups: list[dict] = []
    bside_artwork: Path | None = None
    bside_urls: dict[str, str | None] = {}

    for child in sorted(parent.iterdir(), key=lambda p: p.name.casefold()):
        if not child.is_dir() or child.name.casefold() == ARTWORK_DIR:
            continue
        single_dir = child
        single_rel = safe_relative(single_dir, media_root)
        if not single_rel:
            continue
        navigate_id = release_id_from_path(single_rel)
        edition_dirs = _list_edition_dirs(single_dir)
        if not edition_dirs:
            edition_dirs = [single_dir]
        art_edition = _resolve_standard_edition(single_dir)
        edition_artwork = _standard_artwork_dir(art_edition)
        if edition_artwork and not bside_artwork:
            bside_artwork = edition_artwork
            bside_urls = _artwork_urls(edition_artwork, media_root)

        for ed_dir in edition_dirs:
            scanned = _scan_resolved_folder(
                ed_dir,
                media_root,
                db_durations=db_durations,
                label=_edition_label(ed_dir),
                kind="flat",
                edition_artwork=edition_artwork,
            )
            tracks: list[dict] = []
            for group in scanned.get("groups") or []:
                for track in group.get("tracks") or []:
                    path = track.get("play_path") or ""
                    if not path or path in seen_paths:
                        continue
                    seen_paths.add(path)
                    tracks.append(track)
            if not tracks:
                continue
            for i, track in enumerate(tracks, 1):
                track["number"] = i
            date_iso = _edition_date_iso(ed_dir, single_dir)
            single_title = _single_title_from_folder(
                single_dir, entry_display_name(single_dir)
            )
            group_label = (
                _edition_label(ed_dir) if ed_dir != single_dir else _edition_label(single_dir)
            )
            bside_groups.append(
                {
                    "id": _edition_id(f"{single_rel}:{ed_dir.name}"),
                    "kind": "single",
                    "label": group_label,
                    "single_title": single_title,
                    "date_iso": date_iso,
                    "display_date": format_display_date(date_iso),
                    "source_single_title": _bside_source_title(single_dir, ed_dir),
                    "navigate_release_id": navigate_id,
                    "disc_url": bside_urls.get("disc_url"),
                    "tracks": tracks,
                }
            )

    for child in sorted(content.iterdir(), key=lambda p: p.name.casefold()):
        if not child.is_dir() or child.name.casefold() == ARTWORK_DIR:
            continue
        low = child.name.casefold()
        if not re.search(r"\bb[- ]?sides?\b|\bbonus\b", low):
            continue
        edition_artwork = _find_artwork_subdir(child)
        scanned = _scan_resolved_folder(
            child,
            media_root,
            db_durations=db_durations,
            label=child.name,
            kind="bside",
            edition_artwork=edition_artwork,
        )
        tracks: list[dict] = []
        for group in scanned.get("groups") or []:
            for track in group.get("tracks") or []:
                path = track.get("play_path") or ""
                if not path or path in seen_paths:
                    continue
                seen_paths.add(path)
                tracks.append(track)
        if tracks:
            for i, track in enumerate(tracks, 1):
                track["number"] = i
            bside_groups.append(
                {
                    "id": _edition_id(safe_relative(child, media_root) or child.name),
                    "kind": "folder",
                    "label": child.name,
                    "date_iso": _parse_folder_date(child.name),
                    "disc_url": _artwork_urls(edition_artwork, media_root).get("disc_url")
                    if edition_artwork
                    else None,
                    "tracks": tracks,
                }
            )

    if bside_groups:
        if not bside_urls and bside_artwork:
            bside_urls = _artwork_urls(bside_artwork, media_root)
        bg_layers = [
            u
            for u in (
                bside_urls.get("cover_inner_url"),
                bside_urls.get("cover_back_url"),
                bside_urls.get("cover_front_url"),
            )
            if u
        ]
        editions_out.append(
            {
                "id": _edition_id(f"bsides:{safe_relative(parent, media_root) or parent.name}"),
                "label": "B-sides",
                "kind": "bside",
                "date_iso": None,
                "cover_url": bside_urls.get("cover_front_url"),
                "cover_animation_url": bside_urls.get("cover_animation_url"),
                "canvas_url": bside_urls.get("canvas_url"),
                "disc_url": bside_urls.get("disc_url"),
                "background_layers": bg_layers,
                "groups": bside_groups,
            }
        )


def build_release_tracklist(
    db: Session,
    band_id: int,
    release_id: str,
) -> dict | None:
    resolved = resolve_release_content(db, band_id, release_id)
    if not resolved:
        return None
    band, card, media_root, content = resolved
    db_durations = _db_duration_map(db)
    release_title = card.get("title") or _album_title_from_folder(content.name)
    art_ctx = PlaybackArtContext(
        release_content=content,
        release_title=release_title,
        band_name=band.bnd_name,
    )

    editions_out: list[dict] = []
    edition_dirs = _list_edition_dirs(content)

    for edition_dir in edition_dirs:
        rel = safe_relative(edition_dir, media_root) or edition_dir.name
        label = _edition_label(edition_dir)
        edition_artwork = _find_artwork_subdir(edition_dir)
        urls = _artwork_urls(edition_artwork, media_root) if edition_artwork else {}
        scanned = _scan_resolved_folder(
            edition_dir,
            media_root,
            db_durations=db_durations,
            label=label,
            kind="edition",
            edition_artwork=edition_artwork,
            art_ctx=art_ctx,
        )
        groups = _dedupe_tracks(scanned.get("groups") or [])
        if groups:
            bg_layers = [
                u
                for u in (
                    urls.get("cover_inner_url"),
                    urls.get("cover_back_url"),
                    urls.get("cover_front_url"),
                )
                if u
            ]
            editions_out.append(
                {
                    "id": _edition_id(rel),
                    "label": label,
                    "kind": "edition",
                    "date_iso": _parse_folder_date(edition_dir.name),
                    "display_date": format_display_date(_parse_folder_date(edition_dir.name)),
                    "cover_url": urls.get("cover_front_url"),
                    "cover_animation_url": urls.get("cover_animation_url"),
                    "canvas_url": urls.get("canvas_url"),
                    "disc_url": urls.get("disc_url"),
                    "background_layers": bg_layers,
                    "groups": groups,
                }
            )

    _append_bside_groups(
        db,
        band,
        content,
        media_root,
        db_durations=db_durations,
        release_title=release_title,
        editions_out=editions_out,
    )

    for child in sorted(content.iterdir(), key=lambda p: p.name.casefold()):
        if child.suffix.casefold() != ".lnk":
            continue
        lnk_group = _scan_lnk_group(child, media_root, db_durations=db_durations)
        if not lnk_group:
            continue
        groups = _dedupe_tracks(lnk_group.get("groups") or [])
        if groups:
            lnk_name = entry_display_name(child)
            lnk_label, _ = parse_bracket_tags(lnk_name)
            editions_out.append(
                {
                    "id": _edition_id(lnk_name),
                    "label": lnk_label,
                    "date_iso": None,
                    "groups": groups,
                    "is_link": True,
                }
            )

    if not editions_out:
        return None

    attach_release_youtube_urls(
        db,
        band_id,
        editions_out,
        media_root=media_root,
        release_content=content,
        release_title=release_title,
        band_name=band.bnd_name,
    )
    _attach_has_lrc(db, editions_out)

    return {
        "release_id": card.get("id") or release_id,
        "title": card.get("title") or _album_title_from_folder(content.name),
        "artist_name": band.bnd_name,
        "editions": editions_out,
    }
