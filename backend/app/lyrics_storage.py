"""Local synced lyrics (.lrc) — database overrides with legacy file fallback."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import (
    _find_artwork_subdir,
    _strip_bracket_suffix,
    _title_from_filename_stem,
)
from app.config import settings
from app.media_paths_util import safe_relative

LYRICS_SUBDIR = "Lyrics"


def play_path_for_audio(audio_file: Path) -> str | None:
    if not settings.media_root:
        return None
    return safe_relative(audio_file, Path(settings.media_root))


def track_title_from_stem(stem: str) -> str:
    """Title for LRCLIB: strip track number prefix, keep bracket suffixes."""
    return _title_from_filename_stem(stem)


def lrclib_title_variants(track_title: str) -> list[str]:
    """Search order: with bracket suffixes, then without."""
    with_suffix = track_title.strip()
    without_suffix = _strip_bracket_suffix(with_suffix)
    variants: list[str] = []
    if with_suffix:
        variants.append(with_suffix)
    if (
        without_suffix
        and without_suffix.casefold() != with_suffix.casefold()
        and without_suffix not in variants
    ):
        variants.append(without_suffix)
    return variants


def resolve_artwork_for_audio(audio_file: Path) -> Path | None:
    cur = audio_file.parent
    for _ in range(10):
        art = _find_artwork_subdir(cur)
        if art:
            return art
        if cur.parent == cur:
            break
        cur = cur.parent
    return None


def artwork_lyrics_path(audio_file: Path) -> Path | None:
    art = resolve_artwork_for_audio(audio_file)
    if not art:
        return None
    return art / LYRICS_SUBDIR / f"{audio_file.stem}.lrc"


def find_lrc_path(audio_file: Path) -> Path | None:
    if not audio_file.is_file():
        return None
    for candidate in (
        audio_file.with_suffix(".lrc"),
        audio_file.parent / f"{audio_file.stem}.lrc",
    ):
        if candidate.is_file():
            return candidate
    stored = artwork_lyrics_path(audio_file)
    if stored and stored.is_file():
        return stored
    return None


def has_stored_lyrics(db: Session | None, audio_file: Path) -> bool:
    if db is not None:
        from app.track_overrides import read_lyrics_lrc, read_lyrics_plain

        rel = play_path_for_audio(audio_file)
        if rel and (read_lyrics_lrc(db, rel) or read_lyrics_plain(db, rel)):
            return True
    return find_lrc_path(audio_file) is not None
