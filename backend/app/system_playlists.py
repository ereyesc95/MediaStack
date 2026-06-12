"""Suffix-based system playlists scanned from artist audio tree."""
from __future__ import annotations

import re
from pathlib import Path

from app.band_library import (
    _album_title_from_folder,
    _collect_audio_files,
    _find_cover_front_artwork,
    _normalize_title_for_match,
    _track_title_from_filename,
)
from app.gallery import _artist_dir
from app.media_index import parse_bracket_tags
from app.media_paths_util import safe_relative
from app.models import Band
from app.playlist_index import playlist_cover_url

TRACK_BRACKET_RE = re.compile(r"\[([^\]]+)\]")

ORIGINALS_SLUG = "originals"

PLAYLIST_RULES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("remixes", "Remixes", ("remix",)),
    ("acoustic", "Acoustic", ("acoustic",)),
    ("demos", "Demos", ("demo",)),
    ("instrumentals", "Instrumentals", ("instrumental",)),
    ("covers", "Covers", ("cover",)),
    ("a-cappella", "A Cappella", ("a cappella", "acappella", "a capella")),
    ("b-sides", "B-Sides", ("b-side", "b side", "bside")),
    ("bonus-tracks", "Bonus Tracks", ("bonus",)),
    ("tributes", "Tributes", ("tribute",)),
    ("collaborations", "Collaborations", ("with ",)),
    ("features", "Features", ("feat", "featuring")),
)

EXCLUDE_ORIGINALS = (
    "remix",
    "live",
    "acoustic",
    "demo",
    "instrumental",
    "karaoke",
    "radio mix",
    "edit",
    "version",
)


def _track_tags(stem: str) -> list[str]:
    tags: list[str] = []
    for m in TRACK_BRACKET_RE.finditer(stem):
        for part in m.group(1).split(";"):
            piece = part.strip()
            if piece:
                tags.append(piece.casefold())
    return tags


def _matches_rule(tags: list[str], needles: tuple[str, ...]) -> bool:
    for tag in tags:
        for needle in needles:
            if needle in tag:
                return True
    return False


def _is_original_track(stem: str) -> bool:
    tags = _track_tags(stem)
    for tag in tags:
        if any(ex in tag for ex in EXCLUDE_ORIGINALS):
            return False
    return True


def scan_suffix_playlists(band: Band, media_root: Path) -> dict[str, list[dict]]:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    empty = {slug: [] for slug, _, _ in PLAYLIST_RULES}
    empty[ORIGINALS_SLUG] = []
    if not artist_dir:
        return empty

    buckets: dict[str, list[dict]] = {slug: [] for slug, _, _ in PLAYLIST_RULES}
    buckets[ORIGINALS_SLUG] = []
    seen: dict[str, set[str]] = {slug: set() for slug, _, _ in PLAYLIST_RULES}
    seen[ORIGINALS_SLUG] = set()

    for audio_file in _collect_audio_files(artist_dir):
        stem = audio_file.stem
        tags = _track_tags(stem)
        play_path = safe_relative(audio_file, media_root)
        if not play_path:
            continue
        title = _track_title_from_filename(audio_file)
        album_dir = audio_file.parent
        while album_dir.name.casefold() in (
            "standard edition",
            "deluxe edition",
            "bonus",
        ):
            album_dir = album_dir.parent
        _, folder_tags = parse_bracket_tags(album_dir.name)
        folder_tag_text = " ".join(
            t.casefold()
            for t in (
                [folder_tags.get("with_artist", "")] if folder_tags.get("with_artist") else []
            )
        )
        combined_tags = tags + ([folder_tag_text] if folder_tag_text else [])
        cover = _find_cover_front_artwork(audio_file.parent, media_root)
        entry = {
            "title": title,
            "play_path": play_path,
            "album_title": _album_title_from_folder(album_dir.name),
            "cover_url": cover,
        }
        for slug, _, needles in PLAYLIST_RULES:
            if not _matches_rule(combined_tags, needles):
                continue
            key = _normalize_title_for_match(title)
            if key in seen[slug]:
                continue
            seen[slug].add(key)
            buckets[slug].append(entry)

        if _is_original_track(stem):
            key = _normalize_title_for_match(title)
            if key not in seen[ORIGINALS_SLUG]:
                seen[ORIGINALS_SLUG].add(key)
                buckets[ORIGINALS_SLUG].append(entry)

    return buckets


def playlist_cards_from_buckets(
    buckets: dict[str, list[dict]],
    *,
    extra: tuple[tuple[str, str], ...] = (),
) -> list[dict]:
    cards: list[dict] = []
    all_slugs: list[tuple[str, str]] = [(s, l) for s, l, _ in PLAYLIST_RULES]
    all_slugs.append((ORIGINALS_SLUG, "Originals"))
    all_slugs.extend(extra)
    for slug, label in all_slugs:
        tracks = buckets.get(slug) or []
        if not tracks:
            continue
        cover = tracks[0].get("cover_url") or playlist_cover_url(slug)
        cards.append(
            {
                "slug": slug,
                "name": label,
                "track_count": len(tracks),
                "cover_url": cover,
            }
        )
    return cards


def tracks_for_slug(buckets: dict[str, list[dict]], slug: str) -> list[dict]:
    return list(buckets.get(slug) or [])
