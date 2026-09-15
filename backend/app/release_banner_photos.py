"""Allocate release banner / Photo - * art to catalog and audio cards."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.gallery import (
    _artist_dir,
    _collapsed_twin,
    _gallery_subdir,
    _list_era_brands,
    _media_url,
    pick_brand_closest_to_year,
)
from app.models import Band
from app.release_overview import _release_year
from app.release_photo_art import (
    resolve_folder_path_to_release,
    resolve_photo_for_release,
    resolve_standard_photo,
)


def _source_branding(
    root: Path,
    source_name: str | None,
    year: int | None,
) -> tuple[str | None, str | None]:
    """Logo/icon for an external source artist (e.g. Various Artists)."""
    if not source_name:
        return None, None
    artist_dir = _artist_dir(root, source_name)
    if not artist_dir:
        return None, None
    brands = _list_era_brands(_gallery_subdir(artist_dir, "Branding"))
    if not brands:
        return None, None
    y = year if year is not None else 2000
    logo = pick_brand_closest_to_year(brands, y, "logo", prefer_collapsed=False)
    icon = pick_brand_closest_to_year(brands, y, "icon", prefer_collapsed=False)
    return (
        _media_url(logo.path, root) if logo else None,
        _media_url(icon.path, root) if icon else None,
    )


def enrich_items_with_banners(
    db: Session,
    band_id: int,
    items: list[dict],
    *,
    title_key: str = "title",
    date_key: str = "date_iso",
) -> None:
    """Mutate items: banner_url from Standard release Photo - *, era logos."""
    for it in items:
        it.setdefault("banner_url", None)
        it.setdefault("era_logo_url", None)
        it.setdefault("era_logo_collapsed_url", None)
        it.setdefault("era_icon_url", None)
        it.setdefault("source_logo_url", None)
        it.setdefault("source_icon_url", None)

    band = db.get(Band, band_id)
    if not band or not settings.media_root or not items:
        return
    root = Path(settings.media_root)
    artist_dir = _artist_dir(root, band.bnd_name)
    if not artist_dir:
        return

    brands = _list_era_brands(_gallery_subdir(artist_dir, "Branding"))
    source_cache: dict[str, tuple[str | None, str | None]] = {}

    for it in items:
        year = _release_year(it.get(date_key))
        release_dir = resolve_folder_path_to_release(root, it.get("folder_path"))
        hit = None
        if release_dir is not None:
            hit = resolve_standard_photo(release_dir, "banner")
            if hit is None:
                hit = resolve_photo_for_release(
                    release_dir,
                    artist_dir,
                    "banner",
                    include_neighbors=True,
                )
        if hit:
            it["banner_url"] = _media_url(hit.path, root)
            if hit.date_iso and len(hit.date_iso) >= 4 and hit.date_iso[:4].isdigit():
                year = int(hit.date_iso[:4])

        y = year if year is not None else 2000
        logo = pick_brand_closest_to_year(brands, y, "logo", prefer_collapsed=False)
        icon = pick_brand_closest_to_year(brands, y, "icon", prefer_collapsed=False)
        collapsed = _collapsed_twin(brands, logo) if logo else None
        it["era_logo_url"] = _media_url(logo.path, root) if logo else None
        it["era_logo_collapsed_url"] = (
            _media_url(collapsed.path, root) if collapsed else None
        )
        it["era_icon_url"] = _media_url(icon.path, root) if icon else None

        source_name = (it.get("source_artist") or it.get("artist_name") or "").strip()
        if source_name and source_name.casefold() != (band.bnd_name or "").casefold():
            if source_name not in source_cache:
                source_cache[source_name] = _source_branding(root, source_name, year)
            src_logo, src_icon = source_cache[source_name]
            it["source_logo_url"] = src_logo
            it["source_icon_url"] = src_icon
