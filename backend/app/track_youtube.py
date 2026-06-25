"""Resolve, save, and attach per-track YouTube URLs for release tracklists."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import AUDIO_EXTS, _track_title_from_filename
from app.media_paths import path_to_local_file
from app.release_playback_art import _single_edition_for_album_track
from app.release_track_extras import (
    _lookup_youtube,
    _normalize_youtube,
    _youtube_map_for_band,
    _youtube_title_keys,
)
from app.track_overrides import (
    read_track_videos,
    read_youtube_url,
    save_youtube_url,
    youtube_overrides_map,
)
from app.youtube_storage import find_youtube_url_for_audio


def _videos_for_play_path(
    db: Session,
    play_path: str | None,
    *,
    primary_url: str | None,
) -> list[dict[str, str | bool]]:
    if play_path:
        stored = read_track_videos(db, play_path)
        if stored:
            return stored
    if primary_url:
        return [{"url": primary_url, "label": "Official video", "primary": True}]
    return []


def _resolve_for_play_path(
    db: Session,
    play_path: str | None,
    *,
    title: str,
    youtube_map: dict[str, str],
    path_overrides: dict[str, str],
    audio_file: Path | None = None,
) -> str | None:
    if play_path:
        url = path_overrides.get(play_path) or read_youtube_url(db, play_path)
        if url:
            return url
    if audio_file and audio_file.is_file():
        legacy = find_youtube_url_for_audio(audio_file)
        if legacy:
            return legacy
    return _lookup_youtube(youtube_map, title)


def _collect_single_paths_by_title(
    editions: list[dict],
    media_root: Path,
) -> dict[str, str]:
    out: dict[str, str] = {}
    for edition in editions:
        kind = (edition.get("kind") or "").casefold()
        if kind not in ("single", "bside"):
            continue
        for group in edition.get("groups") or []:
            group_kind = (group.get("kind") or "").casefold()
            if group_kind != "single" and kind != "single":
                continue
            for track in group.get("tracks") or []:
                play_path = (track.get("play_path") or "").strip()
                title = (track.get("title") or "").strip()
                if not play_path or not title:
                    continue
                for key in _youtube_title_keys(title):
                    if key not in out:
                        out[key] = play_path
    return out


def _album_single_paths_by_title(
    *,
    editions: list[dict],
    media_root: Path,
    release_content: Path,
    release_title: str,
    band_name: str,
) -> dict[str, str]:
    out: dict[str, str] = {}
    seen_titles: set[str] = set()
    for edition in editions:
        if (edition.get("kind") or "").casefold() != "edition":
            continue
        for group in edition.get("groups") or []:
            for track in group.get("tracks") or []:
                play_path = (track.get("play_path") or "").strip()
                title = (track.get("title") or "").strip()
                if not play_path or not title:
                    continue
                audio_file = path_to_local_file(play_path)
                if not audio_file or not audio_file.is_file():
                    continue
                single_edition = _single_edition_for_album_track(
                    audio_file,
                    media_root,
                    release_content=release_content,
                    release_title=release_title,
                    band_name=band_name,
                )
                if not single_edition:
                    continue
                for audio in sorted(
                    single_edition.rglob("*"),
                    key=lambda p: p.name.casefold(),
                ):
                    if not audio.is_file() or audio.suffix.casefold() not in AUDIO_EXTS:
                        continue
                    single_title = _track_title_from_filename(audio)
                    for key in _youtube_title_keys(single_title):
                        if key in seen_titles:
                            continue
                        rel = audio.relative_to(media_root).as_posix()
                        out[key] = rel
                        seen_titles.add(key)
    return out


def _resolve_track_youtube(
    db: Session,
    *,
    play_path: str,
    title: str,
    youtube_map: dict[str, str],
    path_overrides: dict[str, str],
    single_paths_by_title: dict[str, str],
    path_cache: dict[str, str | None],
) -> tuple[str | None, list[dict[str, str | bool]]]:
    audio_file = path_to_local_file(play_path)
    url = _resolve_for_play_path(
        db,
        play_path,
        title=title,
        youtube_map=youtube_map,
        path_overrides=path_overrides,
        audio_file=audio_file,
    )
    videos = _videos_for_play_path(db, play_path, primary_url=url)
    if url:
        return url, videos

    for key in _youtube_title_keys(title):
        single_path = single_paths_by_title.get(key)
        if not single_path or single_path == play_path:
            continue
        if single_path not in path_cache:
            single_audio = path_to_local_file(single_path)
            path_cache[single_path] = _resolve_for_play_path(
                db,
                single_path,
                title=title,
                youtube_map=youtube_map,
                path_overrides=path_overrides,
                audio_file=single_audio,
            )
        inherited = path_cache.get(single_path)
        if inherited:
            inherited_videos = _videos_for_play_path(
                db, single_path, primary_url=inherited
            )
            return inherited, inherited_videos
    return None, videos


def attach_release_youtube_urls(
    db: Session,
    band_id: int,
    editions: list[dict],
    *,
    media_root: Path,
    release_content: Path,
    release_title: str,
    band_name: str,
) -> None:
    youtube_map = _youtube_map_for_band(db, band_id)
    path_overrides = youtube_overrides_map(db)
    single_paths = _collect_single_paths_by_title(editions, media_root)
    album_singles = _album_single_paths_by_title(
        editions=editions,
        media_root=media_root,
        release_content=release_content,
        release_title=release_title,
        band_name=band_name,
    )
    for key, path in album_singles.items():
        single_paths.setdefault(key, path)

    path_cache: dict[str, str | None] = {}
    for edition in editions:
        for group in edition.get("groups") or []:
            for track in group.get("tracks") or []:
                play_path = (track.get("play_path") or "").strip()
                title = (track.get("title") or "").strip()
                if not play_path:
                    track["youtube_url"] = None
                    track["youtube_videos"] = []
                    continue
                url, videos = _resolve_track_youtube(
                    db,
                    play_path=play_path,
                    title=title,
                    youtube_map=youtube_map,
                    path_overrides=path_overrides,
                    single_paths_by_title=single_paths,
                    path_cache=path_cache,
                )
                track["youtube_url"] = url
                track["youtube_videos"] = videos


def save_track_youtube(
    db: Session,
    *,
    band_id: int,
    title: str,
    play_path: str | None,
    youtube_url: str | None,
    youtube_videos: list[dict] | None = None,
) -> tuple[str | None, list[dict[str, str | bool]]]:
    if not play_path:
        raise ValueError("play_path is required")
    audio_file = path_to_local_file(play_path)
    if not audio_file or not audio_file.is_file():
        raise ValueError("Audio file not found for play_path")
    primary = save_youtube_url(
        db,
        play_path=play_path,
        band_id=band_id,
        title=title,
        youtube_url=youtube_url,
        youtube_videos=youtube_videos,
    )
    videos = read_track_videos(db, play_path)
    return primary, videos


def read_track_youtube(
    db: Session,
    *,
    band_id: int,
    title: str,
    play_path: str | None,
) -> tuple[str | None, list[dict[str, str | bool]], str]:
    youtube_map = _youtube_map_for_band(db, band_id)
    path_overrides = youtube_overrides_map(db)
    if play_path:
        audio_file = path_to_local_file(play_path)
        url = _resolve_for_play_path(
            db,
            play_path,
            title=title,
            youtube_map=youtube_map,
            path_overrides=path_overrides,
            audio_file=audio_file,
        )
        videos = _videos_for_play_path(db, play_path, primary_url=url)
        if url:
            source = (
                "db"
                if play_path in path_overrides or read_youtube_url(db, play_path)
                else "legacy"
            )
            return url, videos, source
    url = _lookup_youtube(youtube_map, title)
    videos = [{"url": url, "label": "Official video", "primary": True}] if url else []
    return url, videos, "db" if url else "none"
