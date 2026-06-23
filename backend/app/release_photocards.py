"""Photocard resolution with release-level and per-track fallbacks."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import COVER_FRONT_STEM
from app.band_overview import _photo_for_orientation
from app.gallery import _artist_dir, _gallery_subdir, _list_photos, _media_url
from app.release_overview import (
    COVER_BACK_STEM,
    PHOTOCARD_STEMS,
    _artwork_file,
    _release_year,
    _resolve_standard_edition,
    _standard_artwork_dir,
    resolve_release_content,
)
from app.release_playback_art import PlaybackArtContext, _artwork_root_for_audio

WALLPAPER_STEMS = {
    "portrait_back": "wallpaper - portrait",
    "landscape_back": "wallpaper - landscape",
}

ARTWORK_PHOTO_STEMS = {
    "portrait_front": "photo - portrait",
    "landscape_front": "photo - landscape",
}


def _photocards_empty(cards: dict[str, str | None]) -> bool:
    return not (cards.get("portrait_front") or cards.get("landscape_front"))


def scan_wallpapers(artwork: Path | None, media_root: Path) -> dict[str, str | None]:
    out: dict[str, str | None] = {k: None for k in WALLPAPER_STEMS}
    if not artwork or not artwork.is_dir():
        return out
    for key, stem in WALLPAPER_STEMS.items():
        f = _artwork_file(artwork, stem)
        if f:
            out[key] = _media_url(f, media_root)
    return out


def _artwork_photo_photocards(
    artwork: Path | None, media_root: Path
) -> dict[str, str | None]:
    """VA fallback: Photo stems for fronts, Wallpaper stems for backs.

    When Photo stems are missing, use wallpapers for both sides (flip shows the
    same wallpaper again).
    """
    cards: dict[str, str | None] = {k: None for k in PHOTOCARD_STEMS}
    if not artwork or not artwork.is_dir():
        return cards

    photo_portrait = _artwork_file(artwork, ARTWORK_PHOTO_STEMS["portrait_front"])
    photo_landscape = _artwork_file(artwork, ARTWORK_PHOTO_STEMS["landscape_front"])
    wp = scan_wallpapers(artwork, media_root)
    portrait_wp = wp.get("portrait_back")
    landscape_wp = wp.get("landscape_back")

    if photo_portrait:
        cards["portrait_front"] = _media_url(photo_portrait, media_root)
        cards["portrait_back"] = portrait_wp or cards["portrait_front"]
    elif portrait_wp:
        cards["portrait_front"] = portrait_wp
        cards["portrait_back"] = portrait_wp

    if photo_landscape:
        cards["landscape_front"] = _media_url(photo_landscape, media_root)
        cards["landscape_back"] = landscape_wp or cards["landscape_front"]
    elif landscape_wp:
        cards["landscape_front"] = landscape_wp
        cards["landscape_back"] = landscape_wp

    return cards


def _artwork_has_wallpaper_or_photo(artwork: Path | None) -> bool:
    if not artwork or not artwork.is_dir():
        return False
    for stem in (*WALLPAPER_STEMS.values(), *ARTWORK_PHOTO_STEMS.values()):
        if _artwork_file(artwork, stem):
            return True
    return False


def _cover_only_photocards(artwork: Path | None, media_root: Path) -> dict:
    """Last resort: Cover - Front / Cover - Back with square corners."""
    cards: dict = {k: None for k in PHOTOCARD_STEMS}
    if not artwork or not artwork.is_dir():
        return cards
    cover_front = _artwork_file(artwork, COVER_FRONT_STEM)
    if not cover_front:
        return cards
    cover_back = _artwork_file(artwork, COVER_BACK_STEM)
    front_url = _media_url(cover_front, media_root)
    back_url = _media_url(cover_back, media_root) if cover_back else front_url
    cards["portrait_front"] = front_url
    cards["portrait_back"] = back_url
    cards["landscape_front"] = front_url
    cards["landscape_back"] = back_url
    cards["cover_only"] = True
    return cards


def _apply_wallpaper_backs(
    cards: dict[str, str | None],
    artwork_dirs: list[Path | None],
    media_root: Path,
) -> None:
    portrait_wp: str | None = None
    landscape_wp: str | None = None
    for art in artwork_dirs:
        if not art:
            continue
        wp = scan_wallpapers(art, media_root)
        portrait_wp = portrait_wp or wp.get("portrait_back")
        landscape_wp = landscape_wp or wp.get("landscape_back")
        if portrait_wp and landscape_wp:
            break
    if cards.get("portrait_front") and not cards.get("portrait_back") and portrait_wp:
        cards["portrait_back"] = portrait_wp
    if cards.get("landscape_front") and not cards.get("landscape_back") and landscape_wp:
        cards["landscape_back"] = landscape_wp


def _apply_cover_front_backs(
    cards: dict[str, str | None],
    artwork: Path | None,
    media_root: Path,
) -> None:
    """When no wallpaper back exists, flip to cover front at the same card size."""
    if not artwork or not artwork.is_dir():
        return
    cover = _artwork_file(artwork, COVER_FRONT_STEM)
    if not cover:
        return
    cover_url = _media_url(cover, media_root)

    if cards.get("portrait_front") and not cards.get("portrait_back") and cover_url:
        cards["portrait_back"] = cover_url
    if cards.get("landscape_front") and not cards.get("landscape_back") and cover_url:
        cards["landscape_back"] = cover_url


def _ensure_flip_backs(cards: dict[str, str | None]) -> None:
    for front_key, back_key in (
        ("portrait_front", "portrait_back"),
        ("landscape_front", "landscape_back"),
    ):
        if cards.get(front_key) and not cards.get(back_key):
            cards[back_key] = cards[front_key]


def scan_photocards(artwork: Path | None, media_root: Path) -> dict[str, str | None]:
    out: dict[str, str | None] = {k: None for k in PHOTOCARD_STEMS}
    if not artwork or not artwork.is_dir():
        return out
    for key, stem in PHOTOCARD_STEMS.items():
        f = _artwork_file(artwork, stem)
        if f:
            out[key] = _media_url(f, media_root)
    return out


def _era_photocards(
    artist_dir: Path, media_root: Path, year: int | None
) -> dict[str, str | None]:
    out: dict[str, str | None] = {k: None for k in PHOTOCARD_STEMS}
    if year is None:
        return out
    photos = _list_photos(_gallery_subdir(artist_dir, "Photos"))
    if not photos:
        return out
    years = {p.year for p in photos}
    era_year = min(years, key=lambda y: (abs(y - year), y))
    portrait = _photo_for_orientation(photos, era_year, "portrait")
    landscape = _photo_for_orientation(photos, era_year, "landscape")
    if portrait:
        out["portrait_front"] = _media_url(portrait.path, media_root)
    if landscape:
        out["landscape_front"] = _media_url(landscape.path, media_root)
    return out


def _parent_album_artwork_dir(
    db: Session, band_id: int, release_id: str
) -> Path | None:
    from app.release_single_overview import find_taken_from_release

    taken = find_taken_from_release(db, band_id, release_id)
    if not taken:
        return None
    nav_id = taken.get("navigate_release_id")
    nav_band = taken.get("navigate_band_id") or band_id
    if not nav_id:
        return None
    resolved = resolve_release_content(db, nav_band, nav_id)
    if not resolved:
        return None
    _band, _card, _media_root, parent_content = resolved
    edition = _resolve_standard_edition(parent_content)
    return _standard_artwork_dir(edition)


def _finalize_photocard_backs(
    cards: dict[str, str | None],
    artwork: Path | None,
    artwork_dirs: list[Path | None],
    media_root: Path,
    *,
    use_wallpaper_backs: bool = False,
    use_cover_backs: bool = False,
) -> None:
    if use_wallpaper_backs:
        _apply_wallpaper_backs(cards, artwork_dirs, media_root)
    if use_cover_backs:
        _apply_cover_front_backs(cards, artwork, media_root)
    _ensure_flip_backs(cards)


def resolve_overview_photocards(
    db: Session,
    band_id: int,
    release_id: str,
    *,
    band_name: str | None,
    category: str | None,
    date_iso: str | None,
    content: Path,
    media_root: Path,
    is_various_artists: bool = False,
) -> dict[str, str | None]:
    edition = _resolve_standard_edition(content)
    artwork = _standard_artwork_dir(edition)
    artwork_dirs: list[Path | None] = [artwork]
    cards = scan_photocards(artwork, media_root)
    cards_source = "dedicated" if not _photocards_empty(cards) else "none"

    if _photocards_empty(cards) and category == "singles":
        parent_art = _parent_album_artwork_dir(db, band_id, release_id)
        if parent_art:
            artwork_dirs.append(parent_art)
        parent_cards = scan_photocards(parent_art, media_root)
        if not _photocards_empty(parent_cards):
            cards = parent_cards
            cards_source = "dedicated"

    if _photocards_empty(cards) and is_various_artists:
        cards = _artwork_photo_photocards(artwork, media_root)
        if not _photocards_empty(cards):
            cards_source = "artwork"

    if _photocards_empty(cards) and not is_various_artists:
        artist_dir = _artist_dir(media_root, band_name)
        if artist_dir:
            cards = _era_photocards(artist_dir, media_root, _release_year(date_iso))
            if not _photocards_empty(cards):
                cards_source = "era"

    if _photocards_empty(cards) and not _artwork_has_wallpaper_or_photo(artwork):
        cover_cards = _cover_only_photocards(artwork, media_root)
        if not _photocards_empty(cover_cards):
            cards = cover_cards
            cards_source = "cover_only"

    if cards_source != "cover_only":
        use_wallpaper_backs = cards_source == "era"
        use_cover_backs = cards_source == "era"
        _finalize_photocard_backs(
            cards,
            artwork,
            artwork_dirs,
            media_root,
            use_wallpaper_backs=use_wallpaper_backs,
            use_cover_backs=use_cover_backs,
        )
    return cards


def photocards_for_play_path(
    media_root: Path,
    play_path: str,
    *,
    ctx: PlaybackArtContext | None = None,
    is_various_artists: bool = False,
) -> dict[str, str | None] | None:
    if not play_path:
        return None
    audio_file = media_root / Path(play_path)
    if not audio_file.is_file():
        return None
    edition_folder = _artwork_root_for_audio(audio_file, media_root, ctx)
    artwork = _standard_artwork_dir(edition_folder)
    cards = scan_photocards(artwork, media_root)
    if not _photocards_empty(cards):
        _finalize_photocard_backs(
            cards,
            artwork,
            [artwork],
            media_root,
            use_wallpaper_backs=False,
            use_cover_backs=False,
        )
        return cards
    if is_various_artists:
        cards = _artwork_photo_photocards(artwork, media_root)
        if not _photocards_empty(cards):
            _ensure_flip_backs(cards)
            return cards
    if _photocards_empty(cards) and not _artwork_has_wallpaper_or_photo(artwork):
        cards = _cover_only_photocards(artwork, media_root)
        if not _photocards_empty(cards):
            return cards
    return None
