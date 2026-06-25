"""Resolve cover/disc/canvas/background and gallery scans from a track play path."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from app.artwork_stems import (
    track_animation_url,
    track_canvas_url,
    track_cover_url,
)
from app.band_library import (
    _find_artwork_subdir,
    _find_cover_front_artwork,
    _strip_bracket_suffix,
    _track_title_from_filename,
)
from app.gallery import IMAGE_EXTS, _artist_dir, _media_url
from app.media_index import _is_edition_dir, _is_edition_folder, _is_group_subdir_name
from app.media_paths_util import safe_relative
from app.release_overview import (
    _artwork_urls,
    _find_singles_parent_folder,
    _resolve_standard_edition,
    _single_title_from_folder,
    _singles_category_dir,
    _standard_artwork_dir,
)

ARTWORK_DIR = "[artwork]"
DEFAULT_DISC_MARKER = "default/disc.png"
DISC_LOOSE_RE = re.compile(r"^Disc\s+(\d+)", re.I)
SIDE_RE = re.compile(r"^\d+\.\s*Side\s+", re.I)
SIDE_LOOSE_RE = re.compile(r"^Side\s+[A-Z]\b", re.I)
VINYL_SIDE_STEM_RE = re.compile(r"^([A-Z])(\d+)", re.I)
TAPE_RE = re.compile(r"^\d+\.\s*(Tape|Cassette)\s+", re.I)
TAPE_LOOSE_RE = re.compile(r"^Tape\s+[A-Z]\b", re.I)
CASSETTE_LOOSE_RE = re.compile(r"^Cassette\s+[A-Z]\b", re.I)
EXCLUDED_ARTWORK_STEMS = {
    "logo",
    "spotify",
    "qr",
}


def _gallery_item_id(rel_path: str) -> str:
    digest = hashlib.sha256(rel_path.casefold().encode("utf-8")).hexdigest()[:12]
    return f"gal_{digest}"


def _is_photocard_stem(stem: str) -> bool:
    return stem.casefold().startswith("photocard")


def _is_excluded_artwork(stem: str) -> bool:
    low = stem.casefold()
    if low in EXCLUDED_ARTWORK_STEMS:
        return True
    return _is_photocard_stem(low)


def _scan_artwork_file(path: Path, media_root: Path) -> dict:
    rel = safe_relative(path, media_root) or path.name
    return {
        "id": _gallery_item_id(rel),
        "url": _media_url(path, media_root),
        "title": path.stem,
        "folder_path": rel,
        "section": "artwork",
    }


@dataclass(frozen=True)
class PlaybackArtContext:
    release_content: Path | None = None
    release_title: str | None = None
    band_name: str | None = None


def _normalize_title(title: str) -> str:
    t = re.sub(r"\s*\[.*\]\s*$", "", title.strip())
    t = re.sub(r"\s*\(.*\)\s*$", "", t).strip()
    return t.casefold()


def _edition_folder_for_audio(audio_file: Path) -> Path:
    folder = audio_file.parent
    visited: set[str] = set()
    for _ in range(15):
        key = str(folder)
        if key in visited:
            break
        visited.add(key)
        if _find_artwork_subdir(folder):
            return folder
        if _is_group_subdir_name(folder.name):
            parent = folder.parent
            if parent == folder:
                break
            folder = parent
            continue
        if _is_edition_folder(folder.name) or _is_edition_dir(folder):
            return folder
        parent = folder.parent
        if parent == folder:
            break
        folder = parent
    return audio_file.parent


def _single_root_for_audio(audio_file: Path, media_root: Path) -> Path | None:
    rel = (safe_relative(audio_file, media_root) or "").replace("\\", "/")
    parts = [p for p in rel.split("/") if p]
    singles_idx = next((i for i, p in enumerate(parts) if p.casefold() == "singles"), -1)
    if singles_idx < 0 or singles_idx + 2 >= len(parts):
        return None
    single_rel = "/".join(parts[: singles_idx + 3])
    single_root = media_root / Path(single_rel)
    return single_root if single_root.is_dir() else None


def _disc_number_from_label(name: str) -> int | None:
    m = re.search(r"disc\s*(\d+)", name, re.I)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _is_disc_group_name(name: str) -> bool:
    from app.media_index import DISC_DIR_RE

    return bool(DISC_DIR_RE.match(name) or DISC_LOOSE_RE.match(name))


def _is_playback_group_name(name: str) -> bool:
    return bool(
        _is_disc_group_name(name)
        or SIDE_RE.match(name)
        or SIDE_LOOSE_RE.match(name)
        or TAPE_RE.match(name)
        or TAPE_LOOSE_RE.match(name)
        or CASSETTE_LOOSE_RE.match(name)
    )


def _normalize_group_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def _disc_stem_matches_group(stem: str, group_label: str) -> bool:
    group_num = _disc_number_from_label(group_label)
    stem_num = _disc_number_from_label(stem)
    if group_num is not None:
        if stem_num is not None:
            return group_num == stem_num
        stem_cf = stem.casefold().strip()
        if stem_cf in {"disc", "cd", "vinyl"}:
            return group_num == 1
        return False
    if stem_num is not None:
        return False
    gn = _normalize_group_token(group_label)
    sn = _normalize_group_token(stem)
    if not gn or not sn:
        return False
    return gn == sn or sn in gn or gn in sn


def _is_group_artwork_stem(stem: str) -> bool:
    low = stem.casefold().strip()
    if low.startswith("cover"):
        return False
    if low in EXCLUDED_ARTWORK_STEMS:
        return False
    if _is_photocard_stem(low):
        return False
    if "logo" in low:
        return False
    return True


def disc_url_for_group(
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
            stem = p.stem
            if not _is_group_artwork_stem(stem):
                continue
            stem_cf = stem.casefold()
            if group_label:
                if _disc_stem_matches_group(stem, group_label):
                    candidates.append(p)
                continue
            if (
                "disc" in stem_cf
                or "vinyl" in stem_cf
                or "cd" in stem_cf
                or "side" in stem_cf
                or "tape" in stem_cf
                or "cassette" in stem_cf
            ):
                candidates.append(p)
    if not candidates:
        return None

    if group_label:
        for p in candidates:
            if _disc_stem_matches_group(p.stem, group_label):
                return _media_url(p, media_root)
        return None

    candidates.sort(
        key=lambda p: (0 if p.stem.casefold().startswith("disc 1") else 1, p.name.casefold())
    )
    return _media_url(candidates[0], media_root)


def resolve_disc_url_for_group(
    edition_artwork: Path | None,
    group_dir: Path | None,
    media_root: Path,
    group_label: str | None,
    *,
    release_content: Path | None = None,
) -> str | None:
    if group_label:
        disc_url = disc_url_for_group(edition_artwork, group_dir, media_root, group_label)
        if disc_url:
            return disc_url
        if release_content:
            return _release_standard_disc_url(release_content, media_root)
        return None
    disc_url = disc_url_for_group(edition_artwork, group_dir, media_root, None)
    return _apply_disc_fallback(
        disc_url,
        release_content=release_content,
        media_root=media_root,
    )


def _disc_group_for_audio(audio_file: Path) -> tuple[Path | None, str | None]:
    parent = audio_file.parent
    if _is_playback_group_name(parent.name):
        return parent, parent.name
    stem = Path(audio_file.name).stem.strip()
    stem = re.sub(r"^\d+\.\s*", "", stem).strip()
    vinyl = VINYL_SIDE_STEM_RE.match(stem)
    if vinyl:
        return parent, f"Side {vinyl.group(1).upper()}"
    return None, None


def _release_standard_disc_url(release_content: Path, media_root: Path) -> str | None:
    edition = _resolve_standard_edition(release_content)
    artwork = _standard_artwork_dir(edition)
    urls = _artwork_urls(artwork, media_root)
    disc = urls.get("disc_url")
    if disc and DEFAULT_DISC_MARKER not in disc:
        return disc
    return None


def _single_edition_for_album_track(
    audio_file: Path,
    media_root: Path,
    *,
    release_content: Path,
    release_title: str,
    band_name: str,
) -> Path | None:
    if _single_root_for_audio(audio_file, media_root):
        return None

    track_norm = _normalize_title(_track_title_from_filename(audio_file))
    if not track_norm:
        return None

    artist_dir = _artist_dir(media_root, band_name)
    if not artist_dir:
        return None
    singles_cat = _singles_category_dir(artist_dir)
    if not singles_cat:
        return None
    parent = _find_singles_parent_folder(
        singles_cat, release_title=release_title, content=release_content
    )

    if parent:
        for child in sorted(parent.iterdir(), key=lambda p: p.name.casefold()):
            matched = _match_single_folder(child, track_norm)
            if matched:
                return matched

    return _find_single_edition_by_title_scan(
        media_root, band_name, _track_title_from_filename(audio_file)
    )


def _match_single_folder(folder: Path, track_norm: str) -> Path | None:
    if not folder.is_dir() or folder.name.casefold() == ARTWORK_DIR:
        return None
    single_title = _single_title_from_folder(folder, folder.name)
    single_norm = _normalize_title(single_title)
    if not single_norm:
        return None
    if (
        track_norm == single_norm
        or track_norm.startswith(f"{single_norm} ")
        or single_norm in track_norm
    ):
        return _resolve_standard_edition(folder)
    return None


def _track_cover_stem(track_title: str) -> str:
    clean = _strip_bracket_suffix(track_title.strip())
    clean = re.sub(r"\s*\(.*\)\s*$", "", clean).strip()
    return f"Cover - {clean}"


def find_track_cover_in_artwork(
    artwork: Path | None,
    track_title: str,
    media_root: Path,
) -> str | None:
    return track_cover_url(artwork, track_title, media_root)


def apply_track_artwork_overrides(
    urls: dict[str, str | None],
    album_artwork: Path | None,
    track_title: str,
    media_root: Path,
) -> dict[str, str | None]:
    """Prefer track-specific cover/animation/canvas; suppress album motion when absent."""
    if not album_artwork or not album_artwork.is_dir():
        return urls
    out = dict(urls)
    track_cover = track_cover_url(album_artwork, track_title, media_root)
    track_animation = track_animation_url(album_artwork, track_title, media_root)
    track_canvas = track_canvas_url(album_artwork, track_title, media_root)

    if track_cover:
        out["cover_front_url"] = track_cover
    if track_animation:
        out["cover_animation_url"] = track_animation
    elif track_cover:
        out["cover_animation_url"] = None
    if track_canvas:
        out["canvas_url"] = track_canvas
    elif track_cover:
        out["canvas_url"] = None
    return out


def _find_single_edition_by_title_scan(
    media_root: Path,
    band_name: str,
    track_title: str,
) -> Path | None:
    track_norm = _normalize_title(track_title)
    if not track_norm:
        return None
    artist_dir = _artist_dir(media_root, band_name)
    if not artist_dir:
        return None
    singles_cat = _singles_category_dir(artist_dir)
    if not singles_cat:
        return None
    for parent in sorted(singles_cat.iterdir(), key=lambda p: p.name.casefold()):
        if not parent.is_dir():
            continue
        matched = _match_single_folder(parent, track_norm)
        if matched:
            return matched
        for child in sorted(parent.iterdir(), key=lambda p: p.name.casefold()):
            matched = _match_single_folder(child, track_norm)
            if matched:
                return matched
    return None


def _single_artwork_edition_for_audio(
    audio_file: Path,
    media_root: Path,
    *,
    band_name: str | None = None,
    track_title: str | None = None,
    release_content: Path | None = None,
    release_title: str | None = None,
) -> Path | None:
    single_root = _single_root_for_audio(audio_file, media_root)
    if single_root:
        return _resolve_standard_edition(single_root)
    title = track_title or _track_title_from_filename(audio_file)
    if (
        band_name
        and release_content
        and release_title
    ):
        single_edition = _single_edition_for_album_track(
            audio_file,
            media_root,
            release_content=release_content,
            release_title=release_title,
            band_name=band_name,
        )
        if single_edition:
            return single_edition
    if band_name:
        return _find_single_edition_by_title_scan(media_root, band_name, title)
    return None


def _collect_artwork_dirs_for_audio(audio_file: Path) -> list[Path]:
    dirs: list[Path] = []
    seen: set[str] = set()
    folder = audio_file.parent
    for _ in range(12):
        art = _find_artwork_subdir(folder)
        if art:
            key = str(art.resolve())
            if key not in seen:
                seen.add(key)
                dirs.append(art)
        if folder.parent == folder:
            break
        folder = folder.parent
    return dirs


def resolve_display_cover_for_audio(
    audio_file: Path,
    media_root: Path,
    *,
    band_name: str | None = None,
    track_title: str | None = None,
) -> str | None:
    """Thumbnail cover: single release → Cover - title → Cover - Front."""
    from app.artwork_stems import resolve_cover_front_file

    title = track_title or _track_title_from_filename(audio_file)
    single_edition = _single_artwork_edition_for_audio(
        audio_file,
        media_root,
        band_name=band_name,
        track_title=title,
    )
    if single_edition:
        artwork = _standard_artwork_dir(single_edition)
        if artwork:
            cover_file = resolve_cover_front_file(artwork)
            if cover_file:
                return _media_url(cover_file, media_root)

    for art_dir in _collect_artwork_dirs_for_audio(audio_file):
        track_cover = track_cover_url(art_dir, title, media_root)
        if track_cover:
            return track_cover

    return _find_cover_front_artwork(audio_file.parent, media_root)


def _artwork_root_for_audio(
    audio_file: Path,
    media_root: Path,
    ctx: PlaybackArtContext | None = None,
) -> Path:
    single_root = _single_root_for_audio(audio_file, media_root)
    if single_root:
        return _resolve_standard_edition(single_root)

    if (
        ctx
        and ctx.release_content
        and ctx.release_title
        and ctx.band_name
    ):
        single_edition = _single_edition_for_album_track(
            audio_file,
            media_root,
            release_content=ctx.release_content,
            release_title=ctx.release_title,
            band_name=ctx.band_name,
        )
        if single_edition:
            return single_edition

    if ctx and ctx.band_name:
        scanned = _find_single_edition_by_title_scan(
            media_root,
            ctx.band_name,
            _track_title_from_filename(audio_file),
        )
        if scanned:
            return scanned

    return _edition_folder_for_audio(audio_file)


def _apply_disc_fallback(
    disc_url: str | None,
    *,
    release_content: Path | None,
    media_root: Path,
) -> str | None:
    if disc_url and DEFAULT_DISC_MARKER not in disc_url:
        return disc_url
    if release_content:
        return _release_standard_disc_url(release_content, media_root) or disc_url
    return disc_url


def _playback_group_kind(group_label: str | None) -> str:
    if not group_label:
        return "disc"
    if SIDE_RE.match(group_label) or SIDE_LOOSE_RE.match(group_label):
        return "side"
    if (
        TAPE_RE.match(group_label)
        or TAPE_LOOSE_RE.match(group_label)
        or CASSETTE_LOOSE_RE.match(group_label)
    ):
        return "tape"
    return "disc"


def playback_art_for_audio_file(
    audio_file: Path,
    media_root: Path,
    *,
    ctx: PlaybackArtContext | None = None,
) -> dict[str, list[str] | str | None]:
    title = _track_title_from_filename(audio_file)
    single_edition = _single_artwork_edition_for_audio(
        audio_file,
        media_root,
        band_name=ctx.band_name if ctx else None,
        track_title=title,
        release_content=ctx.release_content if ctx else None,
        release_title=ctx.release_title if ctx else None,
    )
    edition_folder = _artwork_root_for_audio(audio_file, media_root, ctx)
    artwork = _standard_artwork_dir(edition_folder)
    urls = _artwork_urls(artwork, media_root)

    full_single_swap = bool(
        single_edition
        and _resolve_standard_edition(edition_folder).resolve()
        == _resolve_standard_edition(single_edition).resolve()
    )
    if not full_single_swap:
        album_artwork: Path | None = None
        if ctx and ctx.release_content:
            album_artwork = _standard_artwork_dir(
                _resolve_standard_edition(ctx.release_content)
            )
        if not album_artwork:
            album_artwork = _standard_artwork_dir(_edition_folder_for_audio(audio_file))
        urls = apply_track_artwork_overrides(urls, album_artwork, title, media_root)

    logo_url = urls.get("logo_url")
    if not logo_url and ctx and ctx.release_content:
        standard_artwork = _standard_artwork_dir(
            _resolve_standard_edition(ctx.release_content)
        )
        if standard_artwork:
            logo_url = _artwork_urls(standard_artwork, media_root).get("logo_url")
    bg_layers = [
        u
        for u in (
            urls.get("cover_inner_url"),
            urls.get("cover_back_url"),
            urls.get("cover_front_url"),
        )
        if u
    ]

    group_dir, group_label = _disc_group_for_audio(audio_file)
    edition_artwork = artwork
    disc_url = resolve_disc_url_for_group(
        edition_artwork,
        group_dir,
        media_root,
        group_label,
        release_content=ctx.release_content if ctx else None,
    )

    return {
        "cover_url": urls.get("cover_front_url"),
        "cover_animation_url": urls.get("cover_animation_url"),
        "canvas_url": urls.get("canvas_url"),
        "disc_url": disc_url,
        "logo_url": logo_url,
        "group_kind": _playback_group_kind(group_label),
        "background_layers": bg_layers,
    }


def playback_art_for_play_path(
    media_root: Path,
    play_path: str,
    *,
    ctx: PlaybackArtContext | None = None,
) -> dict[str, list[str] | str | None] | None:
    if not play_path:
        return None
    audio_file = media_root / Path(play_path)
    if not audio_file.is_file():
        return None
    return playback_art_for_audio_file(audio_file, media_root, ctx=ctx)


def artwork_gallery_for_play_path(
    media_root: Path,
    play_path: str,
    *,
    ctx: PlaybackArtContext | None = None,
) -> list[dict]:
    if not play_path:
        return []
    audio_file = media_root / Path(play_path)
    if not audio_file.is_file():
        return []
    edition_folder = _artwork_root_for_audio(audio_file, media_root, ctx)
    art_dir = _standard_artwork_dir(edition_folder)
    if not art_dir or not art_dir.is_dir():
        return []
    items: list[dict] = []
    for path in sorted(art_dir.iterdir(), key=lambda p: p.name.casefold()):
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
            continue
        stem = path.stem.casefold()
        if _is_photocard_stem(stem) or _is_excluded_artwork(stem):
            continue
        items.append(_scan_artwork_file(path, media_root))
    return items
