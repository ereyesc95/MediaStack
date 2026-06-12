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
    _find_artwork_subdir,
    _parse_folder_date,
    _track_title_from_filename,
)
from app.config import settings
from app.media_index import DISC_DIR_RE, _disc_sort_key, _is_edition_folder
from app.media_paths_util import entry_display_name, resolve_media_entry, safe_relative
from app.models import Track
from app.gallery import IMAGE_EXTS, _media_url
from app.release_overview import _artwork_urls, resolve_release_content
from app.lyrics_storage import find_lrc_path
from app.release_track_extras import _youtube_map_for_band

ARTWORK_DIR = "[artwork]"
TRACK_NUM_RE = re.compile(r"^(\d+)\.")
SIDE_RE = re.compile(r"^\d+\.\s*Side\s+", re.I)
TAPE_RE = re.compile(r"^\d+\.\s*(Tape|Cassette)\s+", re.I)


def _track_id(play_path: str) -> str:
    digest = hashlib.sha256(play_path.casefold().encode("utf-8")).hexdigest()[:12]
    return f"trk_{digest}"


def _edition_id(rel_path: str) -> str:
    digest = hashlib.sha256(rel_path.casefold().encode("utf-8")).hexdigest()[:12]
    return f"ed_{digest}"


def _normalize_title(title: str) -> str:
    return re.sub(r"\s*\[.*\]\s*$", "", title.strip()).casefold()


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


def _has_group_subdirs(folder: Path) -> bool:
    if not folder.is_dir():
        return False
    for child in folder.iterdir():
        if not child.is_dir() or child.name.casefold() == ARTWORK_DIR:
            continue
        if DISC_DIR_RE.match(child.name) or SIDE_RE.match(child.name) or TAPE_RE.match(child.name):
            return True
    return False


def _group_kind(name: str) -> str:
    if SIDE_RE.match(name):
        return "side"
    if TAPE_RE.match(name):
        return "tape"
    if DISC_DIR_RE.match(name):
        return "disc"
    return "flat"


def _find_lrc(audio_file: Path) -> str | None:
    path = find_lrc_path(audio_file)
    return path.name if path else None


def _track_number(filename: str, fallback: int) -> int:
    m = TRACK_NUM_RE.match(filename)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass
    return fallback


def _build_track(
    audio_file: Path,
    media_root: Path,
    *,
    db_durations: dict[str, float],
    index: int,
) -> dict | None:
    play_path = safe_relative(audio_file, media_root)
    if not play_path:
        return None
    title = _track_title_from_filename(audio_file)
    norm = _normalize_title(title)
    duration_sec = _duration_from_file(audio_file)
    if duration_sec is None:
        duration_sec = db_durations.get(norm)
    return {
        "id": _track_id(play_path),
        "number": _track_number(audio_file.name, index),
        "title": title,
        "play_path": play_path,
        "duration_sec": duration_sec,
        "duration": _format_duration(duration_sec),
        "has_lrc": _find_lrc(audio_file) is not None,
        "is_link": False,
    }


def _scan_tracks_in_dir(
    directory: Path,
    media_root: Path,
    *,
    db_durations: dict[str, float],
) -> list[dict]:
    tracks: list[dict] = []
    files = [f for f in directory.iterdir() if _is_audio_file(f)]
    for i, audio_file in enumerate(sorted(files, key=lambda p: p.name.casefold()), start=1):
        track = _build_track(audio_file, media_root, db_durations=db_durations, index=i)
        if track:
            tracks.append(track)
    return tracks


def _disc_url_for_group(
    edition_artwork: Path | None,
    group_dir: Path | None,
    media_root: Path,
    group_label: str | None,
) -> str | None:
    search_dirs: list[Path] = []
    if group_dir:
        art = _find_artwork_subdir(group_dir)
        if art:
            search_dirs.append(art)
    if edition_artwork:
        search_dirs.append(edition_artwork)

    candidates: list[Path] = []
    for art in search_dirs:
        if not art.is_dir():
            continue
        for p in art.iterdir():
            if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
                continue
            stem = p.stem.casefold()
            if "disc" in stem or "vinyl" in stem or "cd" in stem:
                candidates.append(p)
    if not candidates:
        return None
    if group_label:
        gl = group_label.casefold()
        for p in candidates:
            if p.stem.casefold() in gl or gl.replace(" ", "") in p.stem.casefold().replace(" ", ""):
                return _media_url(p, media_root)
    candidates.sort(
        key=lambda p: (0 if p.stem.casefold().startswith("disc 1") else 1, p.name.casefold())
    )
    return _media_url(candidates[0], media_root)


def _scan_resolved_folder(
    folder: Path,
    media_root: Path,
    *,
    db_durations: dict[str, float],
    label: str,
    kind: str,
    edition_artwork: Path | None = None,
) -> dict:
    if _has_group_subdirs(folder):
        groups: list[dict] = []
        subdirs = [
            c
            for c in folder.iterdir()
            if c.is_dir() and c.name.casefold() != ARTWORK_DIR
            and (
                DISC_DIR_RE.match(c.name)
                or SIDE_RE.match(c.name)
                or TAPE_RE.match(c.name)
            )
        ]
        for sub in sorted(subdirs, key=lambda p: _disc_sort_key(p)):
            tracks = _scan_tracks_in_dir(sub, media_root, db_durations=db_durations)
            if tracks:
                groups.append(
                    {
                        "id": _edition_id(safe_relative(sub, media_root) or sub.name),
                        "kind": _group_kind(sub.name),
                        "label": sub.name,
                        "disc_url": _disc_url_for_group(
                            edition_artwork, sub, media_root, sub.name
                        ),
                        "tracks": tracks,
                    }
                )
        return {"kind": kind, "label": label, "groups": groups}

    tracks = _scan_tracks_in_dir(folder, media_root, db_durations=db_durations)
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
    m = DATE_PREFIX_RE.match(name)
    if m:
        rest = name[m.end() :].lstrip(". ").strip()
        return rest or name
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
        if (
            _is_edition_folder(child.name)
            or _has_direct_audio(child)
            or _has_group_subdirs(child)
        ):
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
            key = _normalize_title(track.get("title") or "")
            if not key or key in seen:
                continue
            seen.add(key)
            tracks.append(track)
        if tracks:
            out_groups.append({**group, "tracks": tracks})
    return out_groups


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
                    "date_iso": _parse_folder_date(edition_dir.name),
                    "cover_url": urls.get("cover_front_url"),
                    "cover_animation_url": urls.get("cover_animation_url"),
                    "disc_url": urls.get("disc_url"),
                    "background_layers": bg_layers,
                    "groups": groups,
                }
            )

    for child in sorted(content.iterdir(), key=lambda p: p.name.casefold()):
        if child.suffix.casefold() != ".lnk":
            continue
        lnk_group = _scan_lnk_group(child, media_root, db_durations=db_durations)
        if not lnk_group:
            continue
        groups = _dedupe_tracks(lnk_group.get("groups") or [])
        if groups:
            editions_out.append(
                {
                    "id": _edition_id(entry_display_name(child)),
                    "label": entry_display_name(child),
                    "date_iso": None,
                    "groups": groups,
                    "is_link": True,
                }
            )

    if not editions_out:
        return None

    youtube_map = _youtube_map_for_band(db, band_id)
    for edition in editions_out:
        for group in edition.get("groups") or []:
            for track in group.get("tracks") or []:
                key = _normalize_title(track.get("title") or "")
                track["youtube_url"] = youtube_map.get(key)

    return {
        "release_id": card.get("id") or release_id,
        "title": card.get("title") or _album_title_from_folder(content.name),
        "artist_name": band.bnd_name,
        "editions": editions_out,
    }
