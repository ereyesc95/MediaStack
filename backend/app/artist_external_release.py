"""Link external Music releases into an artist's Audio category via .lnk."""

from __future__ import annotations

from pathlib import Path

from app.band_library import AUDIO_CATEGORIES, _audio_root
from app.gallery import _artist_dir
from app.leaf_audio_link import (
    _lnk_exists,
    create_windows_lnk,
    parse_music_release,
)


def _resolve_or_create_category(artist_dir: Path, category_folder: str) -> Path:
    """Place category under the artist's Audio root (root or Audio/), creating as needed."""
    audio = _audio_root(artist_dir)
    try:
        want = category_folder.casefold()
        for child in audio.iterdir():
            if child.is_dir() and child.name.casefold() == want:
                return child
    except OSError:
        pass
    dest = audio / category_folder
    dest.mkdir(parents=True, exist_ok=True)
    return dest


def shortcut_display_name_always_by(release_dir: Path, source_artist: str) -> str:
    """Always include [By Artist], including Various Artists."""
    return f"{release_dir.name} [By {source_artist}]"


def link_external_releases_to_artist(
    *,
    host_artist_name: str,
    category_key: str,
    selected_folders: list[Path],
    media_root: Path,
) -> dict:
    """Create .lnk under host artist's current category for external releases only.

    Destination category is ``category_key`` (UI tab), not the source folder's category.
    """
    created = 0
    skipped = 0
    cat_folder = AUDIO_CATEGORIES.get(category_key)
    if not cat_folder:
        return {"created": 0, "skipped": 0}

    artist_dir = _artist_dir(media_root, host_artist_name)
    if not artist_dir or not artist_dir.is_dir():
        return {"created": 0, "skipped": 0}

    host_cf = host_artist_name.strip().casefold()
    cat_dir = _resolve_or_create_category(artist_dir, cat_folder)

    for raw in selected_folders:
        try:
            selected = Path(raw)
        except (TypeError, ValueError):
            skipped += 1
            continue
        parsed = parse_music_release(selected, media_root=media_root)
        if not parsed:
            skipped += 1
            continue
        source_artist, _src_cat, release_dir = parsed
        if source_artist.strip().casefold() == host_cf:
            skipped += 1
            continue
        display = shortcut_display_name_always_by(release_dir, source_artist)
        if _lnk_exists(cat_dir, display):
            skipped += 1
            continue
        lnk_path = cat_dir / f"{display}.lnk"
        try:
            create_windows_lnk(lnk_path, release_dir)
        except OSError:
            skipped += 1
            continue
        created += 1

    return {"created": created, "skipped": skipped}
