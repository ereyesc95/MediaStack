"""Build Various Artists hub payload from local audio library."""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from pathlib import Path

from sqlalchemy.orm import Session

from app.artist_details import _band_in_library, _external_urls_for_band

from app.band_library import (
    TRACK_PREFIX_RE,
    VINYL_TRACK_PREFIX_RE,
    _album_dir_for_track,
    _collect_audio_files,
    _find_cover_front_artwork,
    _release_date_for_track,
)
from app.gallery import _artist_dir, resolve_artist_card
from app.media_index import (
    VARIOUS_ARTISTS_DEFAULT_ID,
    _band_id_for_artist_name,
    parse_bracket_tags,
    scan_audio_releases,
)
from app.models import Band
from app.release_overview import _match_db_release, _resolve_subgenres


def _va_photo_cache_path() -> Path:
    from app.band_overview_cache import CACHE_DIR

    return CACHE_DIR / "va_contributor_photos.json"


def _load_va_photo_cache() -> dict[str, str]:
    path = _va_photo_cache_path()
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            return {str(k): str(v) for k, v in raw.items() if v}
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        pass
    return {}


def _save_va_photo_cache(data: dict[str, str]) -> None:
    path = _va_photo_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=0), encoding="utf-8")


def _cached_va_photo(band_id: int | None, cache: dict[str, str]) -> str | None:
    if not band_id:
        return None
    return cache.get(str(band_id))


def is_various_artists_band(band_id: int) -> bool:
    return band_id == VARIOUS_ARTISTS_DEFAULT_ID


def is_various_artists_release(
    band_id: int,
    *,
    source_artist_name: str | None = None,
    folder_source_artist: str | None = None,
) -> bool:
    if is_various_artists_band(band_id):
        return True
    for name in (source_artist_name, folder_source_artist):
        if name and name.casefold() == "various artists":
            return True
    return False


VARIOUS_ARTISTS_PHOTO_URL = "/api/assets/default/artists.png"
DEFAULT_ARTIST_PHOTO_URL = VARIOUS_ARTISTS_PHOTO_URL

FEATURED_TRACK_LIMIT = 5


def _featured_track_title(path: Path) -> str:
    clean_stem, _ = parse_bracket_tags(path.stem)
    after_num = TRACK_PREFIX_RE.sub("", clean_stem).strip()
    vinyl = VINYL_TRACK_PREFIX_RE.match(after_num)
    if vinyl:
        rest = after_num[vinyl.end() :].lstrip(". ").strip()
        if rest:
            return rest
    return after_num.strip() or clean_stem.strip()


VARIOUS_ARTISTS_BIO = (
    "Various Artists is the crossroads of your library—a dedicated home for "
    "compilations, tribute albums, soundtrack excerpts, split appearances, and "
    "one-off tracks that do not live under a single band folder. Instead of "
    "scattering these releases across your collection, MediaStack gathers them "
    "here so you can browse them with the same care you give any artist "
    "discography.\n\n"
    "Every entry reflects a different kind of listening. Some are label samplers "
    "and era-defining anthologies; others are fan-curated tributes, anime "
    "tie-ins, holiday collections, or regional compilations that capture a "
    "moment in time. Tracks may credit a different performer on every song, "
    "linked through local metadata and [by Artist] tags so you can jump "
    "straight to the original act whenever they exist in your library.\n\n"
    "Use the Audio tab to explore compilations and categories the same way you "
    "would for any artist. Featured tracks on this page highlight standout "
    "songs with identifiable performers, while the Artists tab surfaces "
    "everyone who appears across these releases on your disk—sorted by how "
    "often they show up, with quick paths to their own pages.\n\n"
    "This is not a single band with a country, a lineup, or a unified genre. "
    "It is a curated map of everything in your collection that thrives on "
    "variety: unexpected collaborations, rarities that never made a studio "
    "album, covers that outshine the original, and gems that only make sense "
    "when you hear them beside everything else.\n\n"
    "Whether you are revisiting a childhood soundtrack, tracing a tribute "
    "record back to its source acts, or discovering a track you forgot was "
    "filed under a compilation, Various Artists is where those threads come "
    "together."
)
def build_various_artists_hub(
    db: Session,
    band: Band,
    media_root: Path,
    *,
    orientation: str = "landscape",
) -> dict | None:
    if not is_various_artists_band(band.bnd_id):
        return None

    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return None

    releases = scan_audio_releases(db, band, media_root)
    compilations = [r for r in releases if r.get("category") == "compilations"]
    if not compilations:
        compilations = list(releases)

    compilations.sort(
        key=lambda r: (r.get("date_iso") or "9999-12-31", r.get("title") or ""),
        reverse=True,
    )

    release_titles_by_id = {r["id"]: r.get("title") or "" for r in releases}

    contributor_stats: dict[str, dict] = {}

    def note_contributor(
        source_name: str,
        *,
        release_id: str | None = None,
        track: bool = False,
    ) -> None:
        key = source_name.casefold()
        band_id = _band_id_for_artist_name(db, source_name)
        row = contributor_stats.setdefault(
            key,
            {
                "name": source_name,
                "band_id": band_id,
                "track_count": 0,
                "compilation_ids": set(),
            },
        )
        if band_id and not row["band_id"]:
            row["band_id"] = band_id
        if track:
            row["track_count"] += 1
        if release_id:
            row["compilation_ids"].add(release_id)

    for release in releases:
        rid = release.get("id") or ""
        source_id = release.get("source_band_id")
        if source_id and source_id != VARIOUS_ARTISTS_DEFAULT_ID:
            src = db.get(Band, source_id)
            if src and src.bnd_name:
                note_contributor(src.bnd_name.replace("█", "'"), release_id=rid)
        source_name = release.get("source_artist_name")
        if source_name:
            note_contributor(source_name, release_id=rid)

    track_candidates: list[dict] = []
    track_count = 0
    seen_track_paths: set[str] = set()

    for audio_file in _collect_audio_files(artist_dir):
        track_count += 1
        try:
            play_path = audio_file.relative_to(media_root).as_posix()
        except ValueError:
            play_path = audio_file.as_posix()
        if play_path in seen_track_paths:
            continue

        _clean, tags = parse_bracket_tags(audio_file.stem)
        source_name = tags.get("source_artist")
        source_band_id = None
        if source_name:
            source_band_id = _band_id_for_artist_name(db, source_name)

        album_dir = _album_dir_for_track(audio_file)
        album_folder = None
        try:
            album_folder = album_dir.relative_to(media_root).as_posix()
        except ValueError:
            pass

        compilation_release_id = None
        for release in releases:
            folder = release.get("folder_path") or ""
            if folder and album_folder and album_folder.startswith(folder):
                compilation_release_id = release.get("id")
                break

        if source_name:
            source_in_library = False
            if source_band_id:
                src_band = db.get(Band, source_band_id)
                source_in_library = bool(
                    src_band and _band_in_library(db, src_band, media_root)
                )
            note_contributor(
                source_name,
                release_id=compilation_release_id or "",
                track=True,
            )
            seen_track_paths.add(play_path)
            track_candidates.append(
                {
                    "title": _featured_track_title(audio_file),
                    "artist_name": source_name,
                    "source_band_id": source_band_id,
                    "source_in_library": source_in_library,
                    "play_path": play_path,
                    "cover_url": _find_cover_front_artwork(audio_file.parent, media_root),
                    "release_date": _release_date_for_track(audio_file),
                    "album_title": release_titles_by_id.get(compilation_release_id or "", ""),
                    "navigate_band_id": VARIOUS_ARTISTS_DEFAULT_ID,
                    "navigate_release_id": compilation_release_id,
                }
            )

    track_candidates.sort(
        key=lambda t: (
            t.get("release_date") or "",
            t["title"].casefold(),
        ),
        reverse=True,
    )

    featured_tracks: list[dict] = []
    seen_featured_artists: set[str] = set()
    for candidate in track_candidates:
        if len(featured_tracks) >= FEATURED_TRACK_LIMIT:
            break
        artist_key = candidate["artist_name"].casefold()
        if artist_key in seen_featured_artists:
            continue
        seen_featured_artists.add(artist_key)
        featured_tracks.append(candidate)
    if len(featured_tracks) < FEATURED_TRACK_LIMIT:
        picked_paths = {t["play_path"] for t in featured_tracks}
        for candidate in track_candidates:
            if len(featured_tracks) >= FEATURED_TRACK_LIMIT:
                break
            if candidate["play_path"] in picked_paths:
                continue
            featured_tracks.append(candidate)
            picked_paths.add(candidate["play_path"])

    theme_counts: dict[tuple[int | None, str], dict] = {}
    release_themes: dict[str, list[dict]] = defaultdict(list)

    for release in compilations:
        rid = release.get("id") or ""
        title = release.get("title") or ""
        db_rel = _match_db_release(db, VARIOUS_ARTISTS_DEFAULT_ID, title)
        subgenres: list[dict] = []
        if db_rel:
            subgenres = _resolve_subgenres(db, db_rel.rel_fk_subgenres)
        for sg in subgenres:
            key = (sg.get("id"), sg.get("name") or "")
            if not key[1]:
                continue
            bucket = theme_counts.setdefault(
                key,
                {"id": sg.get("id"), "name": sg["name"], "compilation_count": 0},
            )
            bucket["compilation_count"] += 1
            release_themes[rid].append({"id": sg.get("id"), "name": sg["name"]})

    themes = sorted(
        theme_counts.values(),
        key=lambda t: (-t["compilation_count"], t["name"].casefold()),
    )

    timeline_by_year: dict[int, dict] = {}
    for release in compilations:
        date_iso = release.get("date_iso") or ""
        year = int(date_iso[:4]) if len(date_iso) >= 4 and date_iso[:4].isdigit() else None
        if year is None:
            continue
        bucket = timeline_by_year.setdefault(
            year,
            {"year": year, "compilation_count": 0, "release_ids": []},
        )
        bucket["compilation_count"] += 1
        rid = release.get("id")
        if rid:
            bucket["release_ids"].append(rid)

    timeline = sorted(timeline_by_year.values(), key=lambda t: t["year"], reverse=True)

    contributing_artists: list[dict] = []
    va_photo_cache = _load_va_photo_cache()
    for stats in contributor_stats.values():
        band_id = stats.get("band_id") or _band_id_for_artist_name(db, stats["name"])
        src = db.get(Band, band_id) if band_id else None
        display_name = (
            src.bnd_name.replace("█", "'") if src and src.bnd_name else stats["name"]
        )
        card = resolve_artist_card(display_name, orientation=orientation)
        photo_url = card.photo_url or _cached_va_photo(band_id, va_photo_cache)
        in_library = bool(src and _band_in_library(db, src, media_root))
        external_urls = _external_urls_for_band(src) if src else {}
        if src and src.bnd_code and "musicbrainz" not in external_urls:
            external_urls.setdefault(
                "musicbrainz", f"https://musicbrainz.org/artist/{src.bnd_code}"
            )
        comp_ids = sorted(stats["compilation_ids"])
        comp_titles = [
            release_titles_by_id[cid]
            for cid in comp_ids
            if release_titles_by_id.get(cid)
        ]
        contributing_artists.append(
            {
                "band_id": band_id,
                "name": display_name,
                "code": src.bnd_code if src else None,
                "in_library": in_library,
                "external_urls": external_urls,
                "photo_url": photo_url,
                "icon_url": card.icon_url,
                "logo_url": card.logo_url,
                "era_year": card.era_year,
                "show_name_on_hover": card.show_name_on_hover or not photo_url,
                "track_count": stats["track_count"],
                "compilation_count": len(comp_ids),
                "compilation_titles": comp_titles[:6],
            }
        )

    contributing_artists.sort(
        key=lambda a: (
            -a["track_count"],
            -a["compilation_count"],
            a["name"].casefold(),
        )
    )

    cover_urls = [
        r["cover_url"]
        for r in compilations
        if r.get("cover_url")
    ][:6]

    featured_compilations = []
    for release in compilations[:8]:
        rid = release.get("id") or ""
        featured_compilations.append(
            {
                **release,
                "themes": release_themes.get(rid, []),
            }
        )

    return {
        "stats": {
            "compilation_count": len(compilations),
            "track_count": track_count,
            "artist_count": len(contributing_artists),
        },
        "cover_urls": cover_urls,
        "featured_compilations": featured_compilations,
        "featured_tracks": featured_tracks[:FEATURED_TRACK_LIMIT],
        "contributing_artists": contributing_artists,
        "themes": themes,
        "timeline": timeline,
    }


async def resolve_va_contributor_photos(
    db: Session,
    band: Band,
    media_root: Path | None,
    *,
    orientation: str = "landscape",
    limit: int = 24,
) -> dict:
    from app.entity_related import _resolve_remote_photo_and_urls

    if not is_various_artists_band(band.bnd_id):
        return {"ok": True, "resolved": 0}

    hub = build_various_artists_hub(
        db, band, media_root, orientation=orientation
    )
    if not hub:
        return {"ok": True, "resolved": 0}

    cache = _load_va_photo_cache()
    resolved = 0
    for artist in hub.get("contributing_artists") or []:
        if resolved >= limit:
            break
        if artist.get("photo_url") or artist.get("logo_url") or artist.get("icon_url"):
            continue
        band_id = artist.get("band_id")
        if not band_id or str(band_id) in cache:
            continue
        src = db.get(Band, band_id)
        if not src or not src.bnd_code:
            continue
        if media_root and media_root.is_dir() and src.bnd_name:
            card = resolve_artist_card(src.bnd_name, orientation=orientation)
            if card.photo_url or card.logo_url or card.icon_url:
                continue
        photo, _urls = await _resolve_remote_photo_and_urls(src.bnd_code)
        if photo:
            cache[str(band_id)] = photo
            resolved += 1
        await asyncio.sleep(0.15)

    if resolved:
        _save_va_photo_cache(cache)

    return {"ok": True, "resolved": resolved}
