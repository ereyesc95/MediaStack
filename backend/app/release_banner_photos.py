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
    pick_brand_closest_to_year,
)
from app.models import Band
from app.release_overview import _normalize_release_match, _release_year

_TITLE_STRIP_RE = re.compile(r"^\d{4}(?:\.\d{2})?(?:\.\d{2})?\.\s*")


def _photo_display_stem(photo: GalleryPhoto) -> str:
    stem = photo.path.stem.strip()
    return _TITLE_STRIP_RE.sub("", stem, count=1)


def _banner_candidate_groups(
    photos: list[GalleryPhoto], year: int
) -> list[list[GalleryPhoto]]:
    """Preference order for a release year (never future eras):

    1. Banner photo from that exact year
    2. Landscape photo from that exact year
    3. For each past year (newest first): banner, then landscape
    """
    by_year_ori: dict[tuple[int, str], list[GalleryPhoto]] = {}
    for p in photos:
        if p.orientation not in ("banner", "landscape"):
            continue
        by_year_ori.setdefault((p.year, p.orientation), []).append(p)

    for key in by_year_ori:
        by_year_ori[key].sort(key=lambda p: p.path.name.casefold())

    groups: list[list[GalleryPhoto]] = []

    def add(y: int, ori: str) -> None:
        g = by_year_ori.get((y, ori))
        if g:
            groups.append(g)

    add(year, "banner")
    add(year, "landscape")
    for past in sorted(
        {y for (y, _ori) in by_year_ori if y < year},
        reverse=True,
    ):
        add(past, "banner")
        add(past, "landscape")
    return groups


def enrich_items_with_banners(
    db: Session,
    band_id: int,
    items: list[dict],
    *,
    title_key: str = "title",
    date_key: str = "date_iso",
) -> None:
    """Mutate items in place: banner_url, era_logo_url, era_icon_url."""
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

    photos = _list_photos(_gallery_subdir(artist_dir, "Photos"))
    brands = _list_era_brands(_gallery_subdir(artist_dir, "Logos"))
    if not photos and not brands:
        return

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

    def pick_from_groups(
        groups: list[list[GalleryPhoto]],
        *,
        title_key_norm: str,
        allow_reuse: bool,
    ) -> GalleryPhoto | None:
        if title_key_norm:
            for group in groups:
                titled = [
                    p
                    for p in group
                    if title_key_norm
                    in _normalize_release_match(_photo_display_stem(p))
                ]
                chosen = pick(titled, allow_reuse=allow_reuse)
                if chosen:
                    return chosen
        for group in groups:
            chosen = pick(group, allow_reuse=allow_reuse)
            if chosen:
                return chosen
        return None

    usable = [p for p in photos if p.orientation in ("banner", "landscape")]

    for it in items:
        title = (it.get(title_key) or "").strip()
        year = _release_year(it.get(date_key))
        title_key_norm = _normalize_release_match(title)

        chosen: GalleryPhoto | None = None
        if year is not None and usable:
            groups = _banner_candidate_groups(usable, year)
            chosen = pick_from_groups(
                groups, title_key_norm=title_key_norm, allow_reuse=False
            )
            if chosen is None:
                chosen = pick_from_groups(
                    groups, title_key_norm=title_key_norm, allow_reuse=True
                )
        elif usable:
            # No date: prefer banners then landscapes, unique then reuse
            fallback_groups = [
                sorted(
                    [p for p in usable if p.orientation == "banner"],
                    key=lambda p: (p.year, p.path.name.casefold()),
                ),
                sorted(
                    [p for p in usable if p.orientation == "landscape"],
                    key=lambda p: (p.year, p.path.name.casefold()),
                ),
            ]
            fallback_groups = [g for g in fallback_groups if g]
            chosen = pick_from_groups(
                fallback_groups, title_key_norm=title_key_norm, allow_reuse=False
            ) or pick_from_groups(
                fallback_groups, title_key_norm=title_key_norm, allow_reuse=True
            )

        brand_year = year if year is not None else (chosen.year if chosen else None)
        logo = (
            pick_brand_closest_to_year(
                brands, brand_year, "logo", prefer_collapsed=True
            )
            if brand_year is not None
            else None
        )
        icon = (
            pick_brand_closest_to_year(
                brands, brand_year, "icon", prefer_collapsed=False
            )
            if brand_year is not None
            else None
        )

        it["banner_url"] = _media_url(chosen.path, root) if chosen else None
        it["era_logo_url"] = _media_url(logo.path, root) if logo else None
        it["era_icon_url"] = _media_url(icon.path, root) if icon else None
