"""Setlist.fm playlist helpers — year/show catalog and matched tracklists."""
from __future__ import annotations

import json
import re
import time
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import (
    _collect_audio_files,
    _find_audio_by_title,
    display_track_title_from_path,
)
from app.extended_system_playlists import _track_entry
from app.models import Band
from app.paths import DATA_DIR
from app.playlist_index import _artist_dir
from app.services.setlistfm import fetch_artist_setlist_summaries, fetch_setlist_detail

CACHE_DIR = DATA_DIR / "setlist_cache"
CACHE_TTL_SEC = 24 * 60 * 60
SETLIST_SUFFIX_RE = re.compile(r"\s*\([^)]*\)\s*$")


def _career_start_year(band: Band) -> int:
    raw = (band.bnd_starting_dates or "").split(";")[0].strip()[:4]
    try:
        year = int(raw)
        if 1900 <= year <= datetime.now().year:
            return year
    except ValueError:
        pass
    return datetime.now().year - 30


def _career_end_year(band: Band) -> int:
    raw = (band.bnd_ending_dates or "").split(";")[-1].strip()[:4]
    try:
        year = int(raw)
        if 1900 <= year <= datetime.now().year:
            return year
    except ValueError:
        pass
    return datetime.now().year


def career_year_options(band: Band) -> list[str]:
    start = _career_start_year(band)
    end = _career_end_year(band)
    if end < start:
        end = start
    return [str(y) for y in range(end, start - 1, -1)]


def _cache_path(band_id: int) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{band_id}.json"


def _load_cached_summaries(band_id: int) -> list[dict] | None:
    path = _cache_path(band_id)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if time.time() - float(data.get("fetched_at") or 0) > CACHE_TTL_SEC:
            return None
        summaries = data.get("summaries")
        if not isinstance(summaries, list) or not summaries:
            return None
        total = int(data.get("total") or 0)
        if total and len(summaries) < total:
            return None
        return summaries
    except (json.JSONDecodeError, OSError, TypeError, ValueError):
        return None


def _save_cached_summaries(
    band_id: int, mbid: str, summaries: list[dict], *, total: int = 0
) -> None:
    path = _cache_path(band_id)
    path.write_text(
        json.dumps(
            {
                "mbid": mbid,
                "fetched_at": time.time(),
                "total": total or len(summaries),
                "summaries": summaries,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def _year_cache_path(band_id: int, year: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{band_id}_{year}.json"


def _load_cached_year_summaries(band_id: int, year: str) -> list[dict] | None:
    path = _year_cache_path(band_id, year)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if time.time() - float(data.get("fetched_at") or 0) > CACHE_TTL_SEC:
            return None
        summaries = data.get("summaries")
        if isinstance(summaries, list):
            if not summaries:
                return None
            return summaries
        return None
    except (json.JSONDecodeError, OSError, TypeError, ValueError):
        return None


def _save_cached_year_summaries(
    band_id: int, year: str, mbid: str, summaries: list[dict]
) -> None:
    path = _year_cache_path(band_id, year)
    path.write_text(
        json.dumps(
            {"mbid": mbid, "year": year, "fetched_at": time.time(), "summaries": summaries},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def load_shows_for_year(
    band: Band,
    year: str,
    *,
    api_key: str,
    force: bool = False,
) -> list[dict]:
    """Return show summaries for a calendar year from the cached full index."""
    year = str(year).strip()
    if len(year) != 4:
        return []
    summaries = load_artist_setlist_summaries(band, api_key=api_key, force=force)
    return shows_for_year(summaries, year)


def years_with_activity(
    band: Band,
    *,
    api_key: str,
    force: bool = False,
) -> list[str]:
    """Years that have at least one setlist.fm show for this artist."""
    summaries = load_artist_setlist_summaries(band, api_key=api_key, force=force)
    years: set[str] = set()
    for summary in summaries:
        event_date = (summary.get("eventDate") or "").strip()
        if len(event_date) >= 4:
            years.add(event_date[-4:])
    if years:
        return sorted(years, reverse=True)
    return career_year_options(band)


def load_artist_setlist_summaries(
    band: Band,
    *,
    api_key: str,
    force: bool = False,
) -> list[dict]:
    mbid = (band.bnd_code or "").strip()
    if not mbid or not api_key:
        return []
    if not force:
        cached = _load_cached_summaries(band.bnd_id)
        if cached is not None:
            return cached
    try:
        summaries, total = fetch_artist_setlist_summaries(
            mbid, api_key=api_key, max_pages=80
        )
    except Exception:
        cached = _load_cached_summaries(band.bnd_id)
        return cached or []
    if summaries:
        _save_cached_summaries(band.bnd_id, mbid, summaries, total=total)
    return summaries


def _parse_event_date_iso(event_date: str) -> str | None:
    event_date = (event_date or "").strip()
    if not event_date:
        return None
    try:
        return datetime.strptime(event_date, "%d-%m-%Y").strftime("%Y-%m-%d")
    except ValueError:
        if len(event_date) >= 4:
            return f"{event_date[-4:]}-01-01"
        return None


def _format_display_date(event_date: str) -> str:
    iso = _parse_event_date_iso(event_date)
    if not iso:
        return event_date
    try:
        dt = datetime.strptime(iso, "%Y-%m-%d")
        return dt.strftime("%d %B %Y")
    except ValueError:
        return event_date


def _ordinal_suffix(day: int) -> str:
    if 11 <= day % 100 <= 13:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")


def _format_show_date_short(event_date: str) -> str:
    iso = _parse_event_date_iso(event_date)
    if not iso:
        return event_date
    try:
        dt = datetime.strptime(iso, "%Y-%m-%d")
        return f"{dt.strftime('%B')} {dt.day}{_ordinal_suffix(dt.day)}"
    except ValueError:
        return event_date


def parse_show_summary(summary: dict) -> dict | None:
    setlist_id = (summary.get("id") or "").strip()
    if not setlist_id:
        return None
    event_date = (summary.get("eventDate") or "").strip()
    year = event_date[-4:] if len(event_date) >= 4 else ""
    venue = summary.get("venue") or {}
    city = venue.get("city") or {}
    country = city.get("country") or {}
    venue_name = (venue.get("name") or "").strip()
    city_name = (city.get("name") or "").strip()
    country_name = (country.get("name") or "").strip()
    country_iso = (country.get("code") or "").strip().lower()
    tour = summary.get("tour") or {}
    tour_name = (tour.get("name") or "").strip() or None
    display_date = _format_display_date(event_date)
    show_date = _format_show_date_short(event_date)
    location_bits: list[str] = []
    if venue_name:
        location_bits.append(venue_name)
    if city_name and country_name:
        location_bits.append(f"{city_name}, {country_name}")
    elif city_name:
        location_bits.append(city_name)
    elif country_name:
        location_bits.append(country_name)
    label = " · ".join([show_date, *location_bits]) if location_bits else show_date
    return {
        "id": setlist_id,
        "event_date": event_date,
        "date_iso": _parse_event_date_iso(event_date),
        "display_date": display_date,
        "year": year,
        "venue": venue_name,
        "city": city_name,
        "country": country_name,
        "country_iso": country_iso,
        "tour_name": tour_name,
        "label": label,
    }


def shows_for_year(summaries: list[dict], year: str) -> list[dict]:
    year = str(year).strip()
    out: list[dict] = []
    seen: set[str] = set()
    for summary in summaries:
        show = parse_show_summary(summary)
        if not show or show["year"] != year:
            continue
        if show["id"] in seen:
            continue
        seen.add(show["id"])
        out.append(show)
    out.sort(key=lambda s: s.get("date_iso") or "", reverse=True)
    return out


def _normalize_setlist_song_title(name: str) -> str:
    title = SETLIST_SUFFIX_RE.sub("", (name or "").strip()).strip()
    title = re.sub(r"^intro\s*:\s*", "", title, flags=re.I).strip()
    return title


def _set_group_label(block: dict, index: int, total: int) -> str:
    name = (block.get("name") or "").strip()
    if name:
        return name
    encore = block.get("encore")
    if encore:
        try:
            n = int(encore)
            return "Encore" if n <= 1 else f"Encore {n}"
        except (TypeError, ValueError):
            return "Encore"
    if total <= 1:
        return "Set"
    if index == 0:
        return "Main Set"
    return f"Set {index + 1}"


def _setlist_track_meta(
    *,
    track_id: str,
    title: str,
    event_date: str,
    is_tape: bool,
    number: int | None,
) -> dict:
    return {
        "id": track_id,
        "setlist_title": title,
        "is_tape": is_tape,
        "number": number,
        "source_date_iso": _parse_event_date_iso(event_date),
        "has_lrc": False,
        "is_link": False,
    }


def _unavailable_setlist_track(
    *,
    track_id: str,
    title: str,
    event_date: str,
    is_tape: bool,
    number: int | None,
    band_name: str,
) -> dict:
    return {
        **_setlist_track_meta(
            track_id=track_id,
            title=title,
            event_date=event_date,
            is_tape=is_tape,
            number=number,
        ),
        "title": title,
        "play_path": None,
        "cover_url": None,
        "duration_sec": None,
        "duration": None,
        "unavailable": True,
        "youtube_query": f"{band_name} {title}",
    }


def build_setlist_tracklist(
    db: Session,
    band: Band,
    media_root: Path,
    setlist_id: str,
    *,
    api_key: str,
) -> dict | None:
    del db  # reserved for future enrichment
    detail = fetch_setlist_detail(setlist_id, api_key=api_key)
    if not detail:
        return None

    artist_dir = _artist_dir(media_root, band.bnd_name)
    local_files = _collect_audio_files(artist_dir) if artist_dir else []

    venue = detail.get("venue") or {}
    city = venue.get("city") or {}
    country = city.get("country") or {}
    tour = detail.get("tour") or {}
    event_date = (detail.get("eventDate") or "").strip()

    sets_raw = detail.get("sets", {}).get("set") or []
    if isinstance(sets_raw, dict):
        sets_raw = [sets_raw]

    groups: list[dict] = []
    track_num = 0

    for set_idx, block in enumerate(sets_raw):
        if not isinstance(block, dict):
            continue
        songs = block.get("song") or []
        if isinstance(songs, dict):
            songs = [songs]
        tracks: list[dict] = []
        group_label = _set_group_label(block, set_idx, len(sets_raw))

        for song in songs:
            if not isinstance(song, dict):
                continue
            raw_name = (song.get("name") or "").strip()
            if not raw_name:
                continue
            is_tape = bool(song.get("tape"))
            match_title = _normalize_setlist_song_title(raw_name)
            display_title = match_title or raw_name

            matched_path = None
            entry: dict | None = None
            if match_title and local_files:
                matched_path = _find_audio_by_title(local_files, match_title)
                if matched_path:
                    entry = _track_entry(matched_path, media_root)

            if not is_tape:
                track_num += 1

            track_id = f"{setlist_id}-{set_idx}-{len(tracks)}"
            if entry:
                from app.playlist_tracks import enrich_playlist_track

                track = enrich_playlist_track(entry, media_root)
                track.update(
                    _setlist_track_meta(
                        track_id=track_id,
                        title=display_title,
                        event_date=event_date,
                        is_tape=is_tape,
                        number=None if is_tape else track_num,
                    )
                )
                track["title"] = (
                    display_track_title_from_path(matched_path)
                    if matched_path
                    else display_title
                )
                track["unavailable"] = False
            else:
                track = _unavailable_setlist_track(
                    track_id=track_id,
                    title=display_title,
                    event_date=event_date,
                    is_tape=is_tape,
                    number=None if is_tape else track_num,
                    band_name=band.bnd_name,
                )
            tracks.append(track)

        if tracks:
            groups.append(
                {
                    "id": f"set-{set_idx}",
                    "kind": "disc",
                    "label": group_label,
                    "tracks": tracks,
                }
            )

    return {
        "setlist_id": setlist_id,
        "tour_name": (tour.get("name") or "").strip() or None,
        "show_date": _parse_event_date_iso(event_date),
        "display_date": _format_display_date(event_date),
        "venue": (venue.get("name") or "").strip(),
        "city": (city.get("name") or "").strip(),
        "country": (country.get("name") or "").strip(),
        "country_iso": (country.get("code") or "").strip().lower(),
        "editions": [
            {
                "id": "setlist",
                "label": "Setlist",
                "kind": "edition",
                "date_iso": _parse_event_date_iso(event_date),
                "display_date": _format_display_date(event_date),
                "groups": groups,
            }
        ],
    }


def build_setlists_playlist_detail(band: Band, *, years: list[str] | None = None) -> dict:
    return {
        "slug": "setlists",
        "name": "Setlists",
        "career_start_year": _career_start_year(band),
        "years": years or career_year_options(band),
        "tracks": [],
    }
