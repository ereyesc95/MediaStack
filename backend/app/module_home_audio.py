"""Module home audio pools — up to 10 random linked Soundtrack tracks.

Series / Movies / Books / Games store Music releases as ``Audio/`` ``.lnk``
shortcuts. The home bubble samples one track per release across distinct
owners so browsing stays light: inventory is cached by listing signature and
only Audio buckets are walked (not whole trees).
"""

from __future__ import annotations

import random
import time
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.media_paths_util import safe_relative
from app.module_catalog_cache import get_or_build_catalog, _listing_sig_cached
from app.paths import DATA_DIR
from app.series_extras import collect_audio_tracks_from_folders
from app.series_paths import find_audio_bucket

POOL_LIMIT = 10
_INVENTORY_TTL_SEC = 90.0
# module -> (listing_sig, expires_mono, owner_folders: list[Path as posix rel])
_inventory_mem: dict[str, tuple[str, float, list[str]]] = {}


def _media_root() -> Path | None:
    root = Path(settings.media_root) if settings.media_root else None
    if not root or not root.is_dir():
        return None
    return root


def _owner_folders_series(db: Session, *, nsfw_unlocked: bool) -> list[Path]:
    from app.adult_content import adult_subgenre_names_from_db, filter_adult_cards
    from app.series_catalog_meta import (
        enrich_catalog_metadata,
        filter_franchise_subseries_lists,
    )
    from app.series_index import build_series_catalog

    root = _media_root()
    if not root:
        return []
    catalog = get_or_build_catalog(
        "series", media_root=root, builder=lambda: build_series_catalog(root)
    )
    catalog = enrich_catalog_metadata(db, catalog)
    adult_subs = adult_subgenre_names_from_db(db)
    franchises = filter_adult_cards(
        catalog.get("franchises") or [],
        nsfw_unlocked=nsfw_unlocked,
        extra_adult_subgenres=adult_subs,
    )
    franchises = filter_franchise_subseries_lists(
        franchises,
        nsfw_unlocked=nsfw_unlocked,
        extra_adult_subgenres=adult_subs,
    )
    out: list[Path] = []
    for fr in franchises:
        fp = (fr.get("folder_path") or "").replace("\\", "/").strip("/")
        if fp:
            out.append(root / fp)
        for sub in fr.get("subseries") or []:
            sp = (sub.get("folder_path") or "").replace("\\", "/").strip("/")
            if sp:
                out.append(root / sp)
    return out


def _owner_folders_from_flat(
    db: Session,
    *,
    module: str,
    builder,
    leaf_key: str,
    nsfw_unlocked: bool,
) -> list[Path]:
    from app.adult_content import adult_subgenre_names_from_db, filter_adult_cards

    root = _media_root()
    if not root:
        return []
    catalog = get_or_build_catalog(
        module, media_root=root, builder=lambda: builder(root)
    )
    adult_subs = adult_subgenre_names_from_db(db)
    leaves = filter_adult_cards(
        catalog.get(leaf_key) or [],
        nsfw_unlocked=nsfw_unlocked,
        extra_adult_subgenres=adult_subs,
    )
    out: list[Path] = []
    for leaf in leaves:
        fp = (leaf.get("folder_path") or "").replace("\\", "/").strip("/")
        if fp:
            out.append(root / fp)
    return out


def _owner_folders_movies(db: Session, *, nsfw_unlocked: bool) -> list[Path]:
    from app.movies_index import build_movies_catalog

    return _owner_folders_from_flat(
        db,
        module="movies",
        builder=build_movies_catalog,
        leaf_key="films",
        nsfw_unlocked=nsfw_unlocked,
    )


def _owner_folders_books(db: Session, *, nsfw_unlocked: bool) -> list[Path]:
    from app.books_index import build_books_catalog

    return _owner_folders_from_flat(
        db,
        module="books",
        builder=build_books_catalog,
        leaf_key="books",
        nsfw_unlocked=nsfw_unlocked,
    )


def _owner_folders_games(db: Session, *, nsfw_unlocked: bool) -> list[Path]:
    from app.games_index import build_games_catalog

    return _owner_folders_from_flat(
        db,
        module="games",
        builder=build_games_catalog,
        leaf_key="games",
        nsfw_unlocked=nsfw_unlocked,
    )


def _folders_with_audio_shortcuts(folders: list[Path]) -> list[Path]:
    """Keep only owners that have at least one Audio/ shortcut entry."""
    hit: list[Path] = []
    for folder in folders:
        if not folder.is_dir():
            continue
        bucket = find_audio_bucket(folder)
        if not bucket:
            continue
        # Cheap presence check — avoid resolving every lnk until sample time.
        try:
            for child in bucket.iterdir():
                if child.is_dir():
                    for entry in child.iterdir():
                        low = entry.suffix.casefold()
                        if (
                            entry.is_symlink()
                            or low in {".lnk", ".path"}
                            or entry.is_dir()
                        ):
                            hit.append(folder)
                            raise StopIteration
                low = child.suffix.casefold()
                if child.is_symlink() or low in {".lnk", ".path"}:
                    hit.append(folder)
                    raise StopIteration
        except StopIteration:
            continue
        except OSError:
            continue
    return hit


def _owner_folders(
    module: str, db: Session, *, nsfw_unlocked: bool
) -> list[Path]:
    mod = module.casefold()
    if mod == "series":
        return _owner_folders_series(db, nsfw_unlocked=nsfw_unlocked)
    if mod == "movies":
        return _owner_folders_movies(db, nsfw_unlocked=nsfw_unlocked)
    if mod == "books":
        return _owner_folders_books(db, nsfw_unlocked=nsfw_unlocked)
    if mod == "games":
        return _owner_folders_games(db, nsfw_unlocked=nsfw_unlocked)
    return []


def _cached_audio_owners(
    module: str, db: Session, *, nsfw_unlocked: bool
) -> list[Path]:
    root = _media_root()
    if not root:
        return []
    mod = module.casefold()
    listing = _listing_sig_cached(root, mod)
    gate = "1" if nsfw_unlocked else "0"
    key = f"{mod}:{gate}"
    now = time.monotonic()
    hit = _inventory_mem.get(key)
    if hit and hit[0] == listing and hit[1] > now:
        return [root / rel for rel in hit[2] if (root / rel).is_dir()]

    folders = _folders_with_audio_shortcuts(
        _owner_folders(mod, db, nsfw_unlocked=nsfw_unlocked)
    )
    rels: list[str] = []
    for p in folders:
        rel = safe_relative(p, root)
        if rel:
            rels.append(rel.replace("\\", "/"))
    _inventory_mem[key] = (listing, now + _INVENTORY_TTL_SEC, rels)
    # Touch cache dir so ops tooling can see we ran (optional).
    try:
        (DATA_DIR / "catalog_cache").mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return folders


def build_module_home_audio_pool(
    module: str,
    db: Session,
    *,
    nsfw_unlocked: bool = False,
    limit: int = POOL_LIMIT,
) -> list[dict]:
    """Return up to ``limit`` playable tracks (≈1 per distinct Audio/ owner)."""
    root = _media_root()
    if not root:
        return []
    owners = _cached_audio_owners(module, db, nsfw_unlocked=nsfw_unlocked)
    if not owners:
        return []
    random.shuffle(owners)
    out: list[dict] = []
    seen_paths: set[str] = set()
    for folder in owners:
        if len(out) >= max(1, int(limit)):
            break
        # One random track from this owner's Audio/ shortcuts only.
        tracks = collect_audio_tracks_from_folders(
            db,
            [folder],
            root,
            shortcuts_only=True,
        )
        if not tracks:
            continue
        pick = random.choice(tracks)
        path = (pick.get("play_path") or "").strip()
        if not path or path in seen_paths:
            continue
        seen_paths.add(path)
        out.append(pick)
    return out
