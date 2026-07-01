"""Suffix-based system playlists scanned from artist audio tree."""
from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

from app.band_library import (
    AUDIO_CATEGORIES,
    _album_title_from_folder,
    _collect_audio_files,
    display_track_title_from_path,
    _find_cover_front_artwork,
    _normalize_title_for_match,
    _track_title_from_filename,
)
from app.gallery import _artist_dir
from app.media_index import parse_bracket_tags
from app.media_paths_util import safe_relative
from app.models import Band
from app.release_track_extras import (
    LANGUAGE_NAMES,
    _of_title_from_parts,
    _split_bracket_parts,
)

TRACK_BRACKET_RE = re.compile(r"\[([^\]]+)\]")

COVER_CATEGORY_PRIORITY: dict[str, int] = {
    "albums": 0,
    "extended_plays": 1,
    "soundtracks": 2,
    "compilations": 3,
    "singles": 4,
    "live_albums": 5,
}


def playlist_cover_url(slug: str) -> str:
    return f"/api/assets/system/playlists/{slug}"

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


def _name_pool(raw: str | None) -> set[str]:
    if not raw:
        return set()
    out: set[str] = set()
    for part in raw.replace(";", ",").split(","):
        for sub in part.split("/"):
            text = sub.strip()
            if text:
                out.add(text.casefold())
    return out


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


def _matches_remix(tags: list[str]) -> bool:
    for tag in tags:
        if "remix" in tag:
            return True
        if " mix" in tag or tag.endswith("mix"):
            return True
    return False


def _is_original_track(stem: str) -> bool:
    tags = _track_tags(stem)
    for tag in tags:
        if any(ex in tag for ex in EXCLUDE_ORIGINALS):
            return False
    return True


def _category_key_from_play_path(play_path: str) -> str:
    parts = Path(play_path.replace("\\", "/")).parts
    by_folder = {name.casefold(): key for key, name in AUDIO_CATEGORIES.items()}
    for part in parts:
        key = by_folder.get(part.casefold())
        if key:
            return key
    return "unknown"


def _is_language_adaptation_from_stem(stem: str) -> bool:
    _, parts = _split_bracket_parts(stem)
    for part in parts:
        low = part.casefold().strip()
        if low in LANGUAGE_NAMES:
            return True
        for lang in LANGUAGE_NAMES:
            if low.startswith(f"{lang} of "):
                return True
    return False


def _adaptation_of_key_from_stem(stem: str) -> str | None:
    _, parts = _split_bracket_parts(stem)
    return _of_title_from_parts(parts)


def _cover_version_penalty(tags: list[str]) -> int:
    penalty = 0
    for tag in tags:
        if "radio edit" in tag or "radio mix" in tag:
            penalty += 100
        elif " edit" in tag or tag.endswith("edit"):
            penalty += 80
        if "live at" in tag:
            penalty += 90
        elif tag == "live" or tag.endswith(" live"):
            penalty += 70
        if "remastered" in tag:
            penalty += 10
    return penalty


def _cover_track_sort_key(entry: dict, audio_file: Path) -> tuple[int, int, str]:
    tags = _track_tags(audio_file.stem)
    category = _category_key_from_play_path(entry["play_path"])
    return (
        COVER_CATEGORY_PRIORITY.get(category, 99),
        _cover_version_penalty(tags),
        entry.get("title") or audio_file.name,
    )


def _pick_best_version_tracks(candidates: list[tuple[dict, Path]]) -> list[dict]:
    """One track per underlying song — prefer studio album, then EP, …; skip language adaptations."""
    grouped: dict[str, list[tuple[dict, Path, bool]]] = defaultdict(list)
    for entry, audio_file in candidates:
        stem = audio_file.stem
        main_key = _normalize_title_for_match(entry["title"])
        adapt_of = _adaptation_of_key_from_stem(stem)
        group_key = adapt_of or main_key
        is_adaptation = _is_language_adaptation_from_stem(stem)
        grouped[group_key].append((entry, audio_file, is_adaptation))

    out: list[dict] = []
    for items in grouped.values():
        non_adapt = [(entry, audio_file) for entry, audio_file, is_adapt in items if not is_adapt]
        pool = non_adapt if non_adapt else [(entry, audio_file) for entry, audio_file, _ in items]
        best_entry, _best_file = min(pool, key=lambda item: _cover_track_sort_key(item[0], item[1]))
        out.append(best_entry)
    out.sort(key=lambda entry: (entry.get("title") or "").casefold())
    return out


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
    cover_candidates: list[tuple[dict, Path]] = []
    feature_candidates: list[tuple[dict, Path]] = []

    for audio_file in _collect_audio_files(artist_dir):
        stem = audio_file.stem
        tags = _track_tags(stem)
        play_path = safe_relative(audio_file, media_root)
        if not play_path:
            continue
        title = display_track_title_from_path(audio_file)
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
            if slug == "remixes":
                matched = _matches_remix(combined_tags)
            elif slug == "features":
                matched = _matches_rule(combined_tags, needles)
            else:
                matched = _matches_rule(combined_tags, needles)
            if not matched:
                continue
            if slug == "covers":
                cover_candidates.append((entry, audio_file))
                continue
            if slug == "features":
                feature_candidates.append((entry, audio_file))
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

    if cover_candidates:
        buckets["covers"] = _pick_best_version_tracks(cover_candidates)

    if feature_candidates:
        from app.cross_artist_playlists import scan_feature_guests

        for entry in scan_feature_guests(band, media_root):
            play_path = entry.get("play_path")
            if not play_path:
                continue
            audio_file = media_root / Path(play_path.replace("/", "\\"))
            if not audio_file.is_file():
                audio_file = media_root / Path(play_path)
            if audio_file.is_file():
                feature_candidates.append((entry, audio_file))
        buckets["features"] = _pick_best_version_tracks(feature_candidates)

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
    seen_slugs: set[str] = set()
    for slug, label in all_slugs:
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        tracks = buckets.get(slug) or []
        if not tracks:
            continue
        cover = playlist_cover_url(slug)
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
