"""Single Games franchise ``[Artwork]`` on the earliest game's platform folder."""
from __future__ import annotations

import shutil
from pathlib import Path

from app.config import settings
from app.franchise_index import normalize_franchise_slug, parse_dated_folder_name
from app.series_paths import find_artwork_legacy


def _root(media_root: Path | None = None) -> Path | None:
    root = Path(media_root or settings.media_root or "")
    return root if root.is_dir() else None


def _names_match(a: str, b: str) -> bool:
    return normalize_franchise_slug(a) == normalize_franchise_slug(b)


def iter_games_franchise_dirs(
    franchise_name: str, media_root: Path | None = None
) -> list[tuple[Path, str]]:
    """Return ``(franchise_dir, platform)`` for every platform copy of the work."""
    from app.games_index import iter_franchise_dirs

    root = _root(media_root)
    safe = (franchise_name or "").strip()
    if not root or not safe:
        return []
    out: list[tuple[Path, str]] = []
    for work_dir, platform, _letter in iter_franchise_dirs(root):
        if _names_match(work_dir.name, safe):
            out.append((work_dir, platform))
    return out


def _game_sort_key(game_dir: Path, platform: str) -> tuple:
    date_iso, title = parse_dated_folder_name(game_dir.name)
    # Missing date sorts last; then title; then platform.
    return (
        date_iso is None,
        date_iso or "9999-99-99",
        (title or game_dir.name).casefold(),
        (platform or "").casefold(),
        game_dir.as_posix().casefold(),
    )


def _is_game_leaf(child: Path) -> bool:
    if not child.is_dir():
        return False
    low = child.name.casefold()
    if low in {"[artwork]", "artwork", "gallery", "audio", "[audio]"}:
        return False
    if child.name.startswith("."):
        return False
    return True


def earliest_games_franchise_dir(
    franchise_name: str, media_root: Path | None = None
) -> Path | None:
    """Franchise folder on the platform that holds the earliest dated game leaf."""
    best: tuple | None = None
    best_dir: Path | None = None
    for work_dir, platform in iter_games_franchise_dirs(franchise_name, media_root):
        try:
            children = list(work_dir.iterdir())
        except OSError:
            continue
        leaves = [c for c in children if _is_game_leaf(c)]
        if not leaves:
            # Empty franchise scaffold — still a candidate, after real dated leaves.
            key = (True, "9999-99-99", work_dir.name.casefold(), platform.casefold(), work_dir.as_posix().casefold())
            if best is None or key < best:
                best = key
                best_dir = work_dir
            continue
        for leaf in leaves:
            key = _game_sort_key(leaf, platform)
            if best is None or key < best:
                best = key
                best_dir = work_dir
    return best_dir


def find_games_artwork_dir(
    franchise_name: str, media_root: Path | None = None
) -> Path | None:
    """Franchise folder that currently owns ``[Artwork]``, preferring earliest."""
    with_art: list[Path] = []
    for work_dir, _platform in iter_games_franchise_dirs(franchise_name, media_root):
        art = find_artwork_legacy(work_dir)
        if art and art.is_dir():
            with_art.append(work_dir)
    if not with_art:
        return None
    earliest = earliest_games_franchise_dir(franchise_name, media_root)
    if earliest and earliest in with_art:
        return earliest
    # Prefer the artwork folder that sits on the earliest platform among those that have it.
    ranked = sorted(
        with_art,
        key=lambda d: (
            earliest_games_franchise_dir(d.name, media_root) != d,
            d.as_posix().casefold(),
        ),
    )
    return ranked[0]


def _artwork_nonempty(art: Path) -> bool:
    try:
        return any(art.iterdir())
    except OSError:
        return False


def ensure_games_franchise_artwork(
    franchise_name: str, media_root: Path | None = None
) -> Path | None:
    """Ensure exactly one franchise ``[Artwork]`` under the earliest game's platform.

    - Target: ``Games/{Platform}/{Letter}/{Franchise}/[Artwork]/`` for the
      platform of the earliest dated game leaf (tie-break: title, then platform).
    - If ``[Artwork]`` exists elsewhere under the same franchise, move it to the
      target. If the target already has ``[Artwork]``, replace (overwrite) it.
    - If none exists, create an empty ``[Artwork]`` at the target.
    """
    root = _root(media_root)
    safe = (franchise_name or "").strip()
    if not root or not safe:
        return None
    target_fd = earliest_games_franchise_dir(safe, root)
    if not target_fd:
        return None
    target_art = target_fd / "[Artwork]"

    sources: list[Path] = []
    for work_dir, _platform in iter_games_franchise_dirs(safe, root):
        art = find_artwork_legacy(work_dir)
        if art and art.is_dir():
            sources.append(art)

    from app.folder_icons import cleanup_franchise_artwork_dir, decorate_folder

    if not sources:
        target_fd.mkdir(parents=True, exist_ok=True)
        target_art.mkdir(parents=True, exist_ok=True)
        cleanup_franchise_artwork_dir(target_art)
        decorate_folder(target_art)
        decorate_folder(target_fd)
        return target_art

    # Prefer a non-empty donor; among those, prefer one already at the target.
    def donor_key(art: Path) -> tuple:
        at_target = False
        try:
            at_target = art.parent.resolve() == target_fd.resolve()
        except OSError:
            at_target = art.parent == target_fd
        return (not _artwork_nonempty(art), not at_target, art.as_posix().casefold())

    donor = sorted(sources, key=donor_key)[0]
    try:
        donor_is_target = donor.resolve() == target_art.resolve()
    except OSError:
        donor_is_target = donor == target_art

    if not donor_is_target:
        if target_art.exists():
            shutil.rmtree(target_art, ignore_errors=True)
        target_fd.mkdir(parents=True, exist_ok=True)
        shutil.move(str(donor), str(target_art))

    # Remove any leftover duplicate [Artwork] folders for this franchise.
    for art in sources:
        try:
            if not art.exists():
                continue
            if art.resolve() == target_art.resolve():
                continue
        except OSError:
            if art == target_art:
                continue
        shutil.rmtree(art, ignore_errors=True)

    cleanup_franchise_artwork_dir(target_art)
    decorate_folder(target_art)
    decorate_folder(target_fd)
    return target_art if target_art.is_dir() else None
