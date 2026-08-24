"""Scan artist Series video compilations (The Video Collection / Music Videos)."""
from __future__ import annotations

import re
from pathlib import Path

from app.band_library import DATE_PREFIX_RE
from app.franchise_identity import franchise_letter_dir
from app.franchise_index import parse_dated_folder_name
from app.media_item_overview import VIDEO_EXTS, _file_url, _stem_meta
from app.media_paths_util import safe_relative
from app.release_track_extras import _youtube_title_keys
from app.series_index import _list_seasons
from app.series_paths import find_content_root

_VIDEO_COLLECTION_RE = re.compile(
    r"(?:\bthe\s+)?video\s+collection\b|\bmusic\s+videos?\b|\bvideo\s+anthology\b",
    re.I,
)


def is_video_collection_folder(name: str) -> bool:
    _, title = parse_dated_folder_name(name.strip())
    return bool(_VIDEO_COLLECTION_RE.search(title or name))


def find_artist_series_franchise(media_root: Path, artist_name: str) -> Path | None:
    return franchise_letter_dir(media_root, "Series", artist_name)


def iter_video_collection_dirs(franchise_dir: Path) -> list[Path]:
    if not franchise_dir.is_dir():
        return []
    out: list[Path] = []
    for child in sorted(franchise_dir.iterdir(), key=lambda p: p.name.casefold()):
        if child.is_dir() and is_video_collection_folder(child.name):
            out.append(child)
    return out


def _video_rows_in_dir(folder: Path, media_root: Path) -> list[dict]:
    rows: list[dict] = []
    try:
        children = sorted(folder.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return rows
    for child in children:
        if child.is_file() and child.suffix.lower() in VIDEO_EXTS:
            rel = safe_relative(child, media_root)
            if not rel:
                continue
            title, date_iso, display_date = _stem_meta(child.name)
            rows.append(
                {
                    "title": title,
                    "date_iso": date_iso,
                    "display_date": display_date,
                    "play_path": rel.replace("\\", "/"),
                    "open_url": _file_url(child, media_root),
                }
            )
        elif child.is_dir():
            rows.extend(_video_rows_in_dir(child, media_root))
    return rows


def scan_video_collection_release(release_dir: Path, media_root: Path) -> list[dict]:
    _, collection_title = parse_dated_folder_name(release_dir.name)
    content = find_content_root(release_dir)
    rows: list[dict] = []
    if content != release_dir:
        rows.extend(_video_rows_in_dir(content, media_root))
    seasons = _list_seasons(release_dir, media_root)
    if seasons:
        for season in seasons:
            folder_path = (season.get("folder_path") or "").strip()
            if not folder_path:
                continue
            season_dir = media_root / Path(folder_path.replace("/", "\\"))
            if not season_dir.is_dir():
                season_dir = media_root / Path(folder_path)
            if season_dir.is_dir():
                rows.extend(_video_rows_in_dir(season_dir, media_root))
    if not rows:
        rows.extend(_video_rows_in_dir(release_dir, media_root))
    out: list[dict] = []
    seen: set[str] = set()
    for row in rows:
        play_path = (row.get("play_path") or "").strip()
        if not play_path or play_path in seen:
            continue
        seen.add(play_path)
        title = (row.get("title") or "").strip()
        if not title:
            continue
        date_iso = row.get("date_iso")
        if not date_iso:
            stem = Path(play_path).name
            _, date_iso, display_date = _stem_meta(stem)
            row["date_iso"] = date_iso
            row["display_date"] = display_date
        out.append(
            {
                **row,
                "collection_title": collection_title,
                "collection_path": safe_relative(release_dir, media_root),
            }
        )
    return out


def local_videos_index_for_band(band_name: str, media_root: Path) -> dict[str, list[dict]]:
    """Map ``title_key|date_iso`` → local video rows (multiple dates per title allowed)."""
    franchise = find_artist_series_franchise(media_root, band_name)
    if not franchise:
        return {}
    index: dict[str, list[dict]] = {}
    for release_dir in iter_video_collection_dirs(franchise):
        for row in scan_video_collection_release(release_dir, media_root):
            title = (row.get("title") or "").strip()
            keys = _youtube_title_keys(title)
            if not keys:
                continue
            date_iso = (row.get("date_iso") or "").strip()
            for key in keys:
                bucket_key = f"{key}|{date_iso}"
                index.setdefault(bucket_key, []).append(row)
    return index


def _dated_videos_for_key(index: dict[str, list[dict]], key: str) -> list[tuple[str, dict]]:
    out: list[tuple[str, dict]] = []
    for bucket_key, rows in index.items():
        if not bucket_key.startswith(f"{key}|") or not rows:
            continue
        date_part = bucket_key.split("|", 1)[1]
        if not date_part:
            continue
        out.append((date_part, rows[0]))
    out.sort(key=lambda item: item[0])
    return out


def local_videos_for_title(
    index: dict[str, list[dict]],
    title: str,
) -> list[dict]:
    """All local collection videos whose filename title matches the track."""
    keys = _youtube_title_keys(title)
    if not keys:
        return []
    seen: set[str] = set()
    out: list[dict] = []
    for key in keys:
        for bucket_key, rows in index.items():
            if not bucket_key.startswith(f"{key}|") or not rows:
                continue
            date_part = bucket_key.split("|", 1)[1]
            if not date_part:
                continue
            for row in rows:
                play_path = (row.get("play_path") or "").strip()
                if not play_path or play_path in seen:
                    continue
                seen.add(play_path)
                out.append(row)
    out.sort(key=lambda row: (row.get("date_iso") or "", row.get("title") or ""))
    return out


def local_video_dicts_for_title(
    index: dict[str, list[dict]],
    title: str,
) -> list[dict[str, str | bool]]:
    """TrackOverride-style video rows from local files only."""
    rows = local_videos_for_title(index, title)
    if not rows:
        return []
    out: list[dict[str, str | bool]] = []
    for i, row in enumerate(rows):
        play_path = (row.get("play_path") or "").strip()
        if not play_path:
            continue
        date_iso = (row.get("date_iso") or "").strip()
        label = "Official video" if len(rows) == 1 else f"Version {i + 1}"
        item: dict[str, str | bool] = {
            "url": "",
            "label": "" if len(rows) == 1 else label,
            "primary": i == 0,
            "local_path": play_path,
        }
        if date_iso:
            item["release_date"] = date_iso
        out.append(item)
    return out


def match_local_video(
    index: dict[str, list[dict]],
    *,
    title: str,
    release_date: str | None = None,
) -> dict | None:
    keys = _youtube_title_keys(title)
    if not keys:
        return None
    date_iso = (release_date or "").strip()
    if len(date_iso) >= 10:
        date_iso = date_iso[:10]
    elif len(date_iso) == 4 and date_iso.isdigit():
        date_iso = f"{date_iso}-01-01"

    for key in keys:
        if date_iso:
            hits = index.get(f"{key}|{date_iso}")
            if hits:
                return hits[0]
            year = date_iso[:4]
            if year.isdigit():
                in_year = [
                    row for row_date, row in _dated_videos_for_key(index, key)
                    if row_date.startswith(year)
                ]
                if len(in_year) == 1:
                    return in_year[0]
        dated = _dated_videos_for_key(index, key)
        if len(dated) == 1:
            return dated[0][1]
    return None
