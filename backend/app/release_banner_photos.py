"""Allocate unique era banner photos to artist release/media cards."""
from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.gallery import (
    GalleryPhoto,
    _artist_dir,
    _gallery_subdir,
    _list_era_brands,
    _list_photos,
    _media_url,
    _pick_brand_for_year,
)
from app.models import Band
from app.release_overview import _normalize_release_match, _release_year

_TITLE_STRIP_RE = re.compile(r"^\d{4}(?:\.\d{2})?(?:\.\d{2})?\.\s*")


def _photo_display_stem(photo: GalleryPhoto) -> str:
    stem = photo.path.stem.strip()
    return _TITLE_STRIP_RE.sub("", stem, count=1)


def _banner_pool(photos: list[GalleryPhoto]) -> list[GalleryPhoto]:
    banners = [p for p in photos if p.orientation == "banner"]
    if banners:
        return banners
    return [p for p in photos if p.orientation == "landscape"]


def enrich_items_with_banners(
    db: Session,
    band_id: int,
    items: list[dict],
    *,
    title_key: str = "title",
    date_key: str = "date_iso",
) -> None:
    """Mutate items in place: banner_url, era_logo_url, era_icon_url."""
    empty = {str(it.get("id") or ""): None for it in items}
    for it in items:
        it.setdefault("banner_url", None)
        it.setdefault("era_logo_url", None)
        it.setdefault("era_icon_url", None)

    band = db.get(Band, band_id)
    if not band or not settings.media_root or not items:
        return
    root = Path(settings.media_root)
    artist_dir = _artist_dir(root, band.bnd_name)
    if not artist_dir:
        return

    photos = _banner_pool(_list_photos(_gallery_subdir(artist_dir, "Photos")))
    brands = _list_era_brands(_gallery_subdir(artist_dir, "Logos"))
    if not photos and not brands:
        return

    by_year: dict[int, list[GalleryPhoto]] = {}
    for p in photos:
        by_year.setdefault(p.year, []).append(p)

    used: set[str] = set()

    def pick(candidates: list[GalleryPhoto], *, allow_reuse: bool) -> GalleryPhoto | None:
        unused = [p for p in candidates if p.path.as_posix().casefold() not in used]
        pool = unused if unused else (candidates if allow_reuse else [])
        if not pool:
            return None
        pool = sorted(pool, key=lambda p: p.path.name.casefold())
        chosen = pool[0]
        used.add(chosen.path.as_posix().casefold())
        return chosen

    for it in items:
        title = (it.get(title_key) or "").strip()
        year = _release_year(it.get(date_key))
        title_key_norm = _normalize_release_match(title)
        year_photos = list(by_year.get(year, [])) if year is not None else []

        chosen: GalleryPhoto | None = None
        if title_key_norm and year_photos:
            titled = [
                p
                for p in year_photos
                if title_key_norm in _normalize_release_match(_photo_display_stem(p))
            ]
            chosen = pick(titled, allow_reuse=False)
        if chosen is None and year_photos:
            chosen = pick(year_photos, allow_reuse=False)
        if chosen is None and year_photos:
            chosen = pick(year_photos, allow_reuse=True)
        if chosen is None and photos:
            chosen = pick(photos, allow_reuse=False) or pick(photos, allow_reuse=True)

        era_year = chosen.year if chosen else year
        logo = _pick_brand_for_year(brands, era_year, "logo") if era_year else None
        icon = _pick_brand_for_year(brands, era_year, "icon") if era_year else None

        it["banner_url"] = _media_url(chosen.path, root) if chosen else None
        it["era_logo_url"] = _media_url(logo.path, root) if logo else None
        it["era_icon_url"] = _media_url(icon.path, root) if icon else None

    _ = empty  # keep signature symmetry / silence unused if items empty early
