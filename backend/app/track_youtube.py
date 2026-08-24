"""Resolve, save, and attach per-track YouTube URLs for release tracklists."""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

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
    youtube_videos_by_title,
)
from app.youtube_storage import find_youtube_url_for_audio


def merge_videos_with_local(
    videos: list[dict],
    *,
    title: str,
    local_index: dict[str, list[dict]],
) -> list[dict]:
    """Attach local paths to saved videos, or synthesize rows from the collection."""
    if videos:
        return enrich_videos_with_local(videos, title=title, local_index=local_index)
    from app.artist_video_collection import local_video_dicts_for_title

    return local_video_dicts_for_title(local_index, title)


def enrich_videos_with_local(
    videos: list[dict],
    *,
    title: str,
    local_index: dict[str, list[dict]],
) -> list[dict]:
    if not videos:
        return videos
    from app.artist_video_collection import match_local_video

    out: list[dict] = []
    for raw in videos:
        row = dict(raw)
        if not row.get("local_path"):
            release_date = str(row.get("release_date") or row.get("release_year") or "")
            local = match_local_video(
                local_index,
                title=title,
                release_date=release_date or None,
            )
            if local and local.get("play_path"):
                row["local_path"] = str(local["play_path"])
                if not row.get("release_date") and local.get("date_iso"):
                    row["release_date"] = str(local["date_iso"])
        out.append(row)
    return out


def _canonical_song_title(title: str) -> str:
    from app.release_track_extras import _split_bracket_parts

    main, _ = _split_bracket_parts((title or "").strip())
    return main.strip() or (title or "").strip()


_GENERIC_VIDEO_LABELS = frozenset(
    {"official video", "video", "alternate video", "music video"}
)


def _pick_video_label(existing: str | None, incoming: str | None) -> str | None:
    ex = (existing or "").strip()
    inc = (incoming or "").strip()
    if not inc:
        return ex or None
    if not ex:
        return inc
    ex_generic = ex.casefold() in _GENERIC_VIDEO_LABELS
    inc_generic = inc.casefold() in _GENERIC_VIDEO_LABELS
    if ex_generic and not inc_generic:
        return inc
    return ex


def _local_open_url(local_path: str) -> str:
    path = local_path.strip().replace("\\", "/")
    if path.startswith("/api/"):
        return path
    return f"/api/media/file?path={quote(path, safe='/')}"


def _video_open_url(video: dict) -> str | None:
    local_path = str(video.get("local_path") or "").strip()
    if local_path:
        return _local_open_url(local_path)
    url = str(video.get("url") or "").strip()
    return url or None


def _primary_video_open_url(videos: list[dict]) -> str | None:
    if not videos:
        return None
    ordered = sorted(videos, key=lambda v: (not v.get("primary"),))
    for video in ordered:
        open_url = _video_open_url(video)
        if open_url:
            return open_url
    return None


def _merge_music_video_row(existing: dict, incoming: dict) -> dict:
    out = dict(existing)
    for key, value in incoming.items():
        if value in (None, "", [], {}):
            continue
        if key == "video_label":
            picked = _pick_video_label(
                str(out.get(key) or "") or None,
                str(value),
            )
            out[key] = _display_video_label(picked)
            continue
        if not out.get(key):
            out[key] = value
    return out


def _video_row_has_substance(video: dict) -> bool:
    if str(video.get("url") or "").strip():
        return True
    if str(video.get("local_path") or "").strip():
        return True
    if str(video.get("director") or "").strip():
        return True
    if str(video.get("release_date") or video.get("release_year") or "").strip():
        return True
    return False


def _default_video_director(
    db: Session,
    band,
    media_root: Path,
    release_date: str | None,
) -> str | None:
    from app.release_track_credits import _era_lead_vocalist

    year: int | None = None
    if release_date and len(release_date) >= 4 and release_date[:4].isdigit():
        year = int(release_date[:4])
    leads = _era_lead_vocalist(db, band, media_root, year)
    return leads[0] if leads else None


def _playlist_context_for_song_title(
    db: Session,
    band,
    media_root: Path,
    display_title: str,
) -> dict:
    from app.extended_system_playlists import _find_main_release_track
    from app.media_paths_util import safe_relative
    from app.playlist_tracks import enrich_playlist_track

    audio = _find_main_release_track(band, media_root, display_title)
    if audio:
        rel = safe_relative(audio, media_root)
        if rel:
            return enrich_playlist_track(
                {"title": display_title, "play_path": rel.replace("\\", "/")},
                media_root,
                db=db,
            )
    return {"title": display_title}


def _display_video_label(label: str | None) -> str | None:
    text = (label or "").strip()
    if not text or text.casefold() in _GENERIC_VIDEO_LABELS:
        return None
    return text


def _local_video_version_label(local_index: dict[str, list[dict]], title: str, path: str) -> str:
    from app.artist_video_collection import local_videos_for_title

    rows = local_videos_for_title(local_index, title)
    if len(rows) <= 1:
        return ""
    for index, row in enumerate(rows):
        if (row.get("play_path") or "").strip() == path:
            return f"Version {index + 1}"
    return ""


def _apply_music_video_defaults(
    candidate: dict,
    *,
    db: Session,
    band,
    media_root: Path,
    display_title: str,
    release_date: str | None,
    video_label: str | None,
) -> dict:
    ctx = _playlist_context_for_song_title(db, band, media_root, display_title)
    for key in (
        "album_title",
        "album_folder",
        "navigate_release_id",
        "navigate_band_id",
        "cover_url",
        "play_path",
    ):
        if ctx.get(key) not in (None, ""):
            candidate[key] = ctx[key]
    album_title = (candidate.get("album_title") or ctx.get("album_title") or "").strip()
    candidate["album_title"] = album_title or display_title
    if not candidate.get("navigate_band_id"):
        candidate["navigate_band_id"] = band.bnd_id
    director = (candidate.get("video_director") or "").strip()
    if not director:
        default_director = _default_video_director(db, band, media_root, release_date)
        if default_director:
            candidate["video_director"] = default_director
    candidate["video_label"] = _display_video_label(video_label)
    return candidate


def _prune_sparse_music_videos(rows: list[dict]) -> list[dict]:
    by_title: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        title_key = (row.get("title") or "").casefold()
        if title_key:
            by_title[title_key].append(row)

    out: list[dict] = []
    for group in by_title.values():
        rich = [
            r
            for r in group
            if (r.get("video_director") or "").strip()
            and (r.get("video_release_date") or r.get("video_release_year") or "").strip()
        ]
        local_only = [
            r for r in group if (r.get("local_video_path") or "").strip()
        ]
        if rich:
            out.extend(rich)
            out.extend(r for r in local_only if r not in rich)
        elif local_only:
            out.extend(local_only)
        else:
            out.extend(group)
    return out


def collect_band_official_videos(db: Session, band, media_root: Path) -> list[dict]:
    """Playlist rows: one per unique song + video (deduped across edition paths)."""
    from sqlalchemy import select

    from app.artist_video_collection import local_videos_index_for_band
    from app.models import TrackOverride
    from app.playlist_tracks import _audio_file_for_play_path, enrich_playlist_track
    from app.release_track_extras import _youtube_title_keys
    from app.release_tracklist import _track_number
    from app.track_overrides import _video_dedupe_key, read_track_videos_from_row

    band_id = band.bnd_id
    local_index = local_videos_index_for_band(band.bnd_name or "", media_root)
    merged: dict[str, dict] = {}

    for row in db.scalars(select(TrackOverride)).all():
        if row.tro_band_id is not None and row.tro_band_id != band_id:
            continue
        play_path = (row.tro_play_path or "").strip()
        if not play_path:
            continue
        videos = read_track_videos_from_row(row)
        if not videos:
            continue

        audio_file = _audio_file_for_play_path(play_path, media_root)
        raw_title = (row.tro_title or "").strip()
        if not raw_title and audio_file:
            from app.band_library import display_track_title_from_path

            raw_title = display_track_title_from_path(audio_file)
        if not raw_title:
            continue
        display_title = _canonical_song_title(raw_title)
        title_keys = _youtube_title_keys(display_title)
        if not title_keys:
            continue
        canonical_title = title_keys[0]

        track_num = _track_number(audio_file.name, 9999) if audio_file else 9999
        base = enrich_playlist_track(
            {"title": display_title, "play_path": play_path},
            media_root,
            db=db,
        )

        for video in merge_videos_with_local(videos, title=display_title, local_index=local_index):
            if not _video_row_has_substance(video):
                continue
            vkey = _video_dedupe_key(video)
            if not vkey:
                continue
            dedupe_key = f"{canonical_title}|{vkey}"
            url = str(video.get("url") or "").strip() or None
            local_path = str(video.get("local_path") or "").strip() or None
            release_date = str(video.get("release_date") or video.get("release_year") or "").strip() or None
            label = str(video.get("label") or "Video").strip() or "Video"
            director = str(video.get("director") or "").strip() or None
            open_url = _local_open_url(local_path) if local_path else url
            candidate = {
                **base,
                "title": display_title,
                "video_label": label,
                "video_url": open_url,
                "youtube_url": url,
                "local_video_path": local_path,
                "video_director": director,
                "video_release_date": release_date,
                "video_release_year": release_date[:4] if release_date and len(release_date) >= 4 else release_date,
                "track_number": track_num,
                "is_music_video": True,
            }
            candidate = _apply_music_video_defaults(
                candidate,
                db=db,
                band=band,
                media_root=media_root,
                display_title=display_title,
                release_date=release_date,
                video_label=label,
            )
            if dedupe_key in merged:
                merged[dedupe_key] = _merge_music_video_row(merged[dedupe_key], candidate)
                continue
            merged[dedupe_key] = candidate

    covered_local = {
        str(r.get("local_video_path") or "").strip()
        for r in merged.values()
        if (r.get("local_video_path") or "").strip()
    }
    all_local: dict[str, dict] = {}
    for rows in local_index.values():
        for row in rows:
            path = (row.get("play_path") or "").strip()
            if path:
                all_local[path] = row
    for path, row in all_local.items():
        if path in covered_local:
            continue
        raw_title = (row.get("title") or "").strip()
        if not raw_title:
            continue
        display_title = _canonical_song_title(raw_title)
        title_keys = _youtube_title_keys(display_title)
        if not title_keys:
            continue
        canonical_title = title_keys[0]
        date_iso = (row.get("date_iso") or "").strip() or None
        dedupe_key = f"{canonical_title}|local:{path.casefold()}"
        if dedupe_key in merged:
            continue
        version_label = _local_video_version_label(local_index, display_title, path)
        candidate = {
            "title": display_title,
            "video_label": _display_video_label(version_label or None),
            "video_url": _local_open_url(path),
            "youtube_url": None,
            "local_video_path": path,
            "video_director": None,
            "video_release_date": date_iso,
            "video_release_year": date_iso[:4] if date_iso and len(date_iso) >= 4 else date_iso,
            "track_number": 9999,
            "is_music_video": True,
        }
        candidate = _apply_music_video_defaults(
            candidate,
            db=db,
            band=band,
            media_root=media_root,
            display_title=display_title,
            release_date=date_iso,
            video_label=version_label or None,
        )
        merged[dedupe_key] = candidate

    out = _prune_sparse_music_videos(list(merged.values()))
    out.sort(
        key=lambda t: (
            (t.get("video_release_date") or t.get("release_date") or "9999"),
            (t.get("album_title") or "").casefold(),
            t.get("track_number") or 9999,
            (t.get("title") or "").casefold(),
            (t.get("video_label") or "").casefold(),
        )
    )
    return out


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

    from app.artist_video_collection import local_videos_index_for_band

    local_index = local_videos_index_for_band(band_name, media_root)

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
                videos = merge_videos_with_local(
                    videos, title=title, local_index=local_index
                )
                track["youtube_url"] = _primary_video_open_url(videos) or url
                track["youtube_videos"] = videos


def attach_playlist_youtube_urls(
    db: Session,
    tracks: list[dict],
    *,
    band_id: int | None = None,
    media_root: Path | None = None,
) -> None:
    """Attach youtube_url / youtube_videos onto playlist track dicts by play_path."""
    if not tracks:
        return
    path_overrides = youtube_overrides_map(db)
    youtube_map: dict[str, str] = {}
    local_index: dict[str, list[dict]] = {}
    if band_id is not None:
        youtube_map = _youtube_map_for_band(db, band_id)
        if media_root is not None:
            from app.models import Band
            from app.artist_video_collection import local_videos_index_for_band

            band = db.get(Band, band_id)
            if band:
                local_index = local_videos_index_for_band(band.bnd_name or "", media_root)
    title_videos = youtube_videos_by_title(db, band_id=band_id)
    for track in tracks:
        if not isinstance(track, dict):
            continue
        play_path = (track.get("play_path") or "").strip() or None
        art_path = (track.get("art_play_path") or "").strip() or None
        title = (track.get("title") or "").strip()
        candidates = [p for p in (play_path, art_path) if p]
        url: str | None = None
        videos: list[dict[str, str | bool]] = []
        for path in candidates:
            stored = read_track_videos(db, path)
            if stored:
                videos = stored
                url = _primary_video_open_url(stored) or next(
                    (str(v["url"]) for v in stored if v.get("url")),
                    None,
                )
                break
            path_url = path_overrides.get(path) or read_youtube_url(db, path)
            if not path_url:
                audio_file = path_to_local_file(path)
                if audio_file and audio_file.is_file():
                    path_url = find_youtube_url_for_audio(audio_file)
            if path_url and not url:
                url = path_url
        if not videos and title:
            for key in _youtube_title_keys(title):
                inherited = title_videos.get(key)
                if inherited:
                    videos = list(inherited)
                    url = next(
                        (
                            str(v["url"])
                            for v in videos
                            if v.get("primary")
                        ),
                        str(videos[0]["url"]) if videos else url,
                    )
                    break
        if not url and title and youtube_map:
            url = _lookup_youtube(youtube_map, title)
        if not videos and url:
            videos = [{"url": url, "label": "Official video", "primary": True}]
        if title and local_index:
            videos = merge_videos_with_local(videos, title=title, local_index=local_index)
        track["youtube_url"] = _primary_video_open_url(videos) or url
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
