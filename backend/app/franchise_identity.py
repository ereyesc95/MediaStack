"""Cross-module franchise identity: music artist folders + shared [Artwork] home."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_index import normalize_franchise_slug
from app.gallery import (
    _artist_dir,
    _letter_folder,
    _resolve_child_dir,
    resolve_artist_card,
)
from app.models import Band
from app.series_paths import find_artwork_legacy

MODULE_ROOTS: tuple[tuple[str, str], ...] = (
    ("music", "Music"),
    ("series", "Series"),
    ("movies", "Movies"),
    ("books", "Books"),
)


def _media_root(media_root: Path | None = None) -> Path | None:
    root = Path(media_root or settings.media_root or "")
    return root if root.is_dir() else None


def _display_folder_name(name: str | None) -> str:
    return (name or "").strip()


def franchise_letter_dir(
    media_root: Path, module_folder: str, name: str
) -> Path | None:
    """Return ``{Module}/{Letter}/{Name}/`` when it exists on disk."""
    safe = _display_folder_name(name)
    if not safe:
        return None
    module_dir = _resolve_child_dir(media_root, module_folder)
    if not module_dir.is_dir():
        return None
    letter = _letter_folder(safe)
    letter_path = _resolve_child_dir(module_dir, letter)
    direct = letter_path / safe
    if direct.is_dir():
        return direct
    if letter_path.is_dir():
        target = safe.casefold()
        try:
            for child in letter_path.iterdir():
                if child.is_dir() and child.name.casefold() == target:
                    return child
        except OSError:
            pass
    return None


def find_music_artist_dir(
    name: str, media_root: Path | None = None
) -> Path | None:
    root = _media_root(media_root)
    if not root:
        return None
    return _artist_dir(root, name)


def find_music_band_for_franchise(
    db: Session, franchise_name: str, *, media_root: Path | None = None
) -> Band | None:
    """Band whose folder name matches the franchise and exists under Music/."""
    want = normalize_franchise_slug(franchise_name)
    if not want:
        return None
    root = _media_root(media_root)
    for band in db.scalars(select(Band)).all():
        name = band.bnd_name or ""
        if normalize_franchise_slug(name) != want:
            continue
        if root and not find_music_artist_dir(name, root):
            continue
        return band
    # Folder-only match (band not imported yet) — still treat as music identity
    # when a Music artist folder exists with that name.
    return None


def music_folder_exists_for_name(
    franchise_name: str, media_root: Path | None = None
) -> bool:
    return bool(find_music_artist_dir(franchise_name, media_root))


def find_artwork_home(
    franchise_name: str, media_root: Path | None = None
) -> tuple[str, Path] | None:
    """Locate the single franchise-level ``[Artwork]`` across media modules.

    The module that owns ``[Artwork]`` is the visual home for that franchise.
    """
    root = _media_root(media_root)
    safe = _display_folder_name(franchise_name)
    if not root or not safe:
        return None
    for module, folder in MODULE_ROOTS:
        if module == "music":
            d = find_music_artist_dir(safe, root)
        else:
            d = franchise_letter_dir(root, folder, safe)
        if not d:
            continue
        art = find_artwork_legacy(d)
        if art and art.is_dir():
            return module, d
    return None


def artwork_search_dirs_for_franchise(
    local_folder: Path,
    franchise_name: str,
    media_root: Path | None = None,
) -> list[Path]:
    """Local cover/render dirs first, then the cross-module artwork home."""
    from app.series_paths import cover_search_dirs, render_search_dirs

    out: list[Path] = []
    for d in cover_search_dirs(local_folder) + render_search_dirs(local_folder):
        if d not in out:
            out.append(d)
    home = find_artwork_home(franchise_name, media_root)
    if home:
        _module, home_dir = home
        if home_dir.resolve() != local_folder.resolve():
            for d in cover_search_dirs(home_dir) + render_search_dirs(home_dir):
                if d not in out:
                    out.append(d)
    return out


def apply_music_artist_card_images(
    card: dict,
    artist_name: str,
    *,
    orientation: str = "portrait",
) -> dict:
    """Overlay Music artist card photo/logo/icon onto a franchise catalog card."""
    assets = resolve_artist_card(artist_name, orientation=orientation)
    if assets.photo_url:
        card["cover_url"] = assets.photo_url
        card["portrait_url"] = assets.photo_url
        card["landscape_url"] = assets.photo_url
        card["banner_url"] = assets.photo_url
    if assets.logo_url:
        card["logo_url"] = assets.logo_url
    if assets.icon_url:
        card["icon_url"] = assets.icon_url
    if assets.logo_collapsed_url:
        card["logo_collapsed_url"] = assets.logo_collapsed_url
    card["show_name_on_hover"] = assets.show_name_on_hover
    card["is_music_franchise"] = True
    return card


def enrich_catalog_with_music_identity(
    db: Session,
    catalog: dict,
    *,
    orientation: str = "portrait",
    media_root: Path | None = None,
) -> dict:
    """Mark franchises that also exist as Music artists; reuse artist card images."""
    root = _media_root(media_root)
    franchises = catalog.get("franchises") or []
    for card in franchises:
        if not isinstance(card, dict):
            continue
        name = (card.get("name") or "").strip()
        if not name:
            continue
        if not music_folder_exists_for_name(name, root):
            continue
        band = find_music_band_for_franchise(db, name, media_root=root)
        if band:
            card["music_band_id"] = band.bnd_id
        else:
            # Folder exists but band not in DB yet — still flag for UI routing
            # via name lookup on the frontend/API.
            card["music_band_id"] = None
        card["is_music_franchise"] = True
        apply_music_artist_card_images(card, name, orientation=orientation)
    catalog["franchises"] = franchises
    return catalog


def apply_shared_artwork_to_card(
    card: dict,
    local_folder: Path,
    media_root: Path,
    *,
    franchise_name: str | None = None,
) -> dict:
    """If local franchise art is missing, pull Cover/Logo from the artwork home."""
    name = franchise_name or card.get("name") or local_folder.name
    if card.get("is_music_franchise"):
        return card
    home = find_artwork_home(name, media_root)
    if not home:
        return card
    module, home_dir = home
    if module == "music":
        # Music home uses artist gallery assets, not Cover - Front.
        apply_music_artist_card_images(card, name, orientation="portrait")
        return card
    try:
        if home_dir.resolve() == local_folder.resolve():
            return card
    except OSError:
        pass
    from app.series_index import (
        _series_folder_banner,
        _series_folder_cover,
        _series_folder_landscape,
    )
    from app.series_paths import find_badge_file, find_logo_file

    if not card.get("cover_url") and not card.get("portrait_url"):
        cover = _series_folder_cover(home_dir, media_root)
        if cover:
            card["cover_url"] = cover
            card["portrait_url"] = cover
    if not card.get("landscape_url"):
        card["landscape_url"] = _series_folder_landscape(home_dir, media_root)
    if not card.get("banner_url"):
        card["banner_url"] = _series_folder_banner(home_dir, media_root)
    if not card.get("logo_url") or not card.get("icon_url"):
        logo, icon = find_logo_file(home_dir, media_root)
        if logo and not card.get("logo_url"):
            card["logo_url"] = logo
        if icon and not card.get("icon_url"):
            card["icon_url"] = icon
    if not card.get("badge_url"):
        card["badge_url"] = find_badge_file(home_dir, media_root)
    card["artwork_home_module"] = module
    return card


def has_module_franchise_content(
    media_root: Path, module: str, artist_name: str
) -> bool:
    """True when Movies/Series/Books franchise folder has any non-meta children."""
    folder_name = {
        "movies": "Movies",
        "series": "Series",
        "books": "Books",
    }.get(module)
    if not folder_name:
        return False
    d = franchise_letter_dir(media_root, folder_name, artist_name)
    if not d or not d.is_dir():
        return False
    skip = {
        "[artwork]",
        "artwork",
        "gallery",
        "audio",
        "[audio]",
        "extras",
        "[extras]",
        "desktop.ini",
        "thumbs.db",
    }
    try:
        for child in d.iterdir():
            if child.name.startswith("."):
                continue
            if child.name.casefold() in skip:
                # Artwork alone still counts as "franchise exists" for tab? No —
                # need actual media content for Movies/Series/Books tabs.
                continue
            if child.is_dir() or child.is_file():
                return True
    except OSError:
        return False
    return False
