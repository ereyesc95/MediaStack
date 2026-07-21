"""Resolve artist gallery photos and era-matched logos/icons from Media/Music layout.

Expected layout (under MEDIASTACK_MEDIA_ROOT):

    Music/{Letter}/{ArtistName}/Gallery/Photos/   — year-prefixed photos
    Music/{Letter}/{ArtistName}/Gallery/Logos/    — era Icon/Logo PNGs
    Music/{Letter}/{ArtistName}/Gallery/Covers/   — optional playlist covers

Example: Music/H/HIM/Gallery/Photos/1997.00. Era, Landscape.jpg
"""
from __future__ import annotations

import hashlib
import random
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

from app.config import settings

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
PHOTO_YEAR_RE = re.compile(r"^(\d{4})")
ERA_RE = re.compile(
    r"^(Icon|Logo)\s+(?:\[(\d{4})\s*[-–]\s*(\d{4})\]|(\d{4})\s*[-–]\s*(\d{4}))"
    r"(?:\s+Current)?(?:\s+Collapsed)?$",
    re.IGNORECASE,
)
ORIENTATION_RE = re.compile(r"(landscape|portrait|banner)", re.IGNORECASE)
CARD_ORIENTATIONS = frozenset({"landscape", "portrait", "banner", "icons"})


def normalize_card_orientation(orientation: str | None) -> str:
    want = (orientation or "landscape").lower()
    return want if want in CARD_ORIENTATIONS else "landscape"


@dataclass
class GalleryPhoto:
    path: Path
    year: int
    orientation: str  # landscape | portrait | banner | unknown


@dataclass
class EraBrand:
    kind: str  # icon | logo
    path: Path
    start: int
    end: int
    collapsed: bool = False


@dataclass
class ArtistCardAssets:
    photo_url: str | None
    logo_url: str | None
    icon_url: str | None
    era_year: int | None
    show_name_on_hover: bool
    logo_collapsed_url: str | None = None


def _brand_url(brand: EraBrand | None, root: Path) -> str | None:
    return _media_url(brand.path, root) if brand else None


def _collapsed_twin(
    brands: list[EraBrand], normal: EraBrand | None, kind: str = "logo"
) -> EraBrand | None:
    if not normal:
        return None
    for b in _brands_of_kind(brands, kind, collapsed=True):
        if b.start == normal.start and b.end == normal.end:
            return b
    return None


def _display_name(name: str | None) -> str:
    if not name:
        return "Unknown"
    return name.replace("■", ",").replace("█", "'").strip()


def _letter_folder(name: str | None) -> str:
    n = _display_name(name)
    if not n:
        return "#"
    ch = n[0].upper()
    return ch if ch.isalpha() else "#"


def _resolve_child_dir(parent: Path, name: str) -> Path:
    direct = parent / name
    if direct.is_dir():
        return direct
    if parent.is_dir():
        fold = name.casefold()
        for child in parent.iterdir():
            if child.is_dir() and child.name.casefold() == fold:
                return child
    return direct


def _artist_dir(media_root: Path, artist_name: str | None) -> Path | None:
    letter = _letter_folder(artist_name)
    safe = _display_name(artist_name)
    music_dir = _resolve_child_dir(media_root, "Music")
    letter_path = _resolve_child_dir(music_dir, letter)
    artist_path = letter_path / safe
    if artist_path.is_dir():
        return artist_path
    if letter_path.is_dir():
        target = safe.casefold()
        for child in letter_path.iterdir():
            if child.is_dir() and child.name.casefold() == target:
                return child
    return letter_path if letter_path.is_dir() else None


def _gallery_dir(artist_dir: Path) -> Path:
    return _resolve_child_dir(artist_dir, "Gallery")


def _gallery_subdir(artist_dir: Path, sub: str) -> Path:
    return _resolve_child_dir(_gallery_dir(artist_dir), sub)


def _parse_photo(path: Path) -> GalleryPhoto | None:
    name = path.stem
    m = PHOTO_YEAR_RE.match(name)
    if not m:
        return None
    year = int(m.group(1))
    om = ORIENTATION_RE.search(name)
    orientation = om.group(1).lower() if om else "unknown"
    return GalleryPhoto(path=path, year=year, orientation=orientation)


def _list_photos(photos_dir: Path) -> list[GalleryPhoto]:
    if not photos_dir.is_dir():
        return []
    out: list[GalleryPhoto] = []
    for p in photos_dir.iterdir():
        if p.suffix.lower() in IMAGE_EXTS:
            parsed = _parse_photo(p)
            if parsed:
                out.append(parsed)
    return out


def _list_era_brands(logos_dir: Path) -> list[EraBrand]:
    if not logos_dir.is_dir():
        return []
    out: list[EraBrand] = []
    for p in logos_dir.iterdir():
        if p.suffix.lower() not in IMAGE_EXTS:
            continue
        m = ERA_RE.match(p.stem)
        if not m:
            continue
        start = m.group(2) or m.group(4)
        end = m.group(3) or m.group(5)
        if not start or not end:
            continue
        out.append(
            EraBrand(
                kind=m.group(1).lower(),
                path=p,
                start=int(start),
                end=int(end),
                collapsed=bool(re.search(r"\bcollapsed\b", p.stem, re.I)),
            )
        )
    return out


def _brands_of_kind(
    brands: list[EraBrand],
    kind: str,
    *,
    collapsed: bool | None = False,
) -> list[EraBrand]:
    """Filter brands by kind. collapsed=False excludes Collapsed; True only those; None=all."""
    out = [b for b in brands if b.kind == kind]
    if collapsed is True:
        return [b for b in out if b.collapsed]
    if collapsed is False:
        return [b for b in out if not b.collapsed]
    return out


def _pick_brand_for_year(
    brands: list[EraBrand],
    year: int,
    kind: str,
    *,
    prefer_collapsed: bool = False,
) -> EraBrand | None:
    """Pick a brand covering ``year``. Collapsed only when that same era has one."""
    normal_matches = [
        b
        for b in _brands_of_kind(brands, kind, collapsed=False)
        if b.start <= year <= b.end
    ]
    if prefer_collapsed and normal_matches:
        # Prefer collapsed twin of an in-range normal logo
        ranges = {(b.start, b.end) for b in normal_matches}
        collapsed = [
            b
            for b in _brands_of_kind(brands, kind, collapsed=True)
            if (b.start, b.end) in ranges
        ]
        if collapsed:
            return random.choice(collapsed)
    if normal_matches:
        return random.choice(normal_matches)
    if prefer_collapsed:
        collapsed_only = [
            b
            for b in _brands_of_kind(brands, kind, collapsed=True)
            if b.start <= year <= b.end
        ]
        if collapsed_only:
            return random.choice(collapsed_only)
    return None


def pick_brand_closest_to_year(
    brands: list[EraBrand],
    year: int,
    kind: str,
    *,
    prefer_collapsed: bool = False,
) -> EraBrand | None:
    """Prefer an era brand covering ``year``; otherwise the nearest range.

    When ``prefer_collapsed``, use the Collapsed file for that same era range if
    it exists — never substitute a Collapsed logo from a different era.
    """

    def _pick(pool: list[EraBrand]) -> EraBrand | None:
        if not pool:
            return None
        in_range = [b for b in pool if b.start <= year <= b.end]
        if in_range:
            in_range.sort(key=lambda b: (b.end - b.start, b.path.name.casefold()))
            return in_range[0]

        def dist_key(b: EraBrand) -> tuple[int, int, str]:
            if year < b.start:
                d = b.start - year
            else:
                d = year - b.end
            return (d, b.end - b.start, b.path.name.casefold())

        return min(pool, key=dist_key)

    normal = _pick(_brands_of_kind(brands, kind, collapsed=False))
    if prefer_collapsed and normal:
        for b in _brands_of_kind(brands, kind, collapsed=True):
            if b.start == normal.start and b.end == normal.end:
                return b
    if normal:
        return normal
    # No normal logo for this kind — only use collapsed if it covers the year
    if prefer_collapsed:
        return _pick(_brands_of_kind(brands, kind, collapsed=True))
    return None


def _media_url(rel_path: Path, media_root: Path) -> str:
    rel = rel_path.relative_to(media_root).as_posix()
    return f"/api/media/file?path={quote(rel, safe='/')}"


def _photo_pool(photos: list[GalleryPhoto], orientation: str) -> list[GalleryPhoto]:
    want = orientation.lower()
    if want == "icons":
        return []
    pool = [p for p in photos if p.orientation == want]
    # Banner cards fall back to landscape photos (cropped in the UI)
    if want == "banner" and not pool:
        pool = [p for p in photos if p.orientation == "landscape"]
    if not pool:
        pool = [p for p in photos if p.orientation == "unknown"]
    if not pool:
        pool = photos
    return pool


def _pick_era_photo(pool: list[GalleryPhoto]) -> GalleryPhoto:
    """Pick a random photo; when multiple eras exist, choose era first then photo."""
    by_year: dict[int, list[GalleryPhoto]] = defaultdict(list)
    for p in pool:
        by_year[p.year].append(p)
    year = random.choice(list(by_year.keys()))
    return random.choice(by_year[year])


def resolve_artist_card(
    artist_name: str | None,
    *,
    orientation: str = "landscape",
) -> ArtistCardAssets:
    root = Path(settings.media_root) if settings.media_root else None
    if not root or not root.is_dir():
        return ArtistCardAssets(None, None, None, None, True)

    artist_dir = _artist_dir(root, artist_name)
    if not artist_dir:
        return ArtistCardAssets(None, None, None, None, True)

    photos_dir = _gallery_subdir(artist_dir, "Photos")
    logos_dir = _gallery_subdir(artist_dir, "Logos")
    photos = _list_photos(photos_dir)
    brands = _list_era_brands(logos_dir)

    want = normalize_card_orientation(orientation)
    # Collapsed twin is returned separately; UI chooses it for banner (non–mobile-portrait).
    want_collapsed_twin = want == "banner"

    def _pack(
        *,
        photo_url: str | None,
        year: int | None,
        logo: EraBrand | None,
        icon: EraBrand | None,
    ) -> ArtistCardAssets:
        collapsed = (
            _collapsed_twin(brands, logo) if want_collapsed_twin and logo else None
        )
        return ArtistCardAssets(
            photo_url=photo_url,
            logo_url=_media_url(logo.path, root) if logo else None,
            icon_url=_media_url(icon.path, root) if icon else None,
            era_year=year,
            show_name_on_hover=not (logo or icon),
            logo_collapsed_url=_media_url(collapsed.path, root) if collapsed else None,
        )

    # Icons mode: branding only (no photo background)
    if want == "icons":
        eras = sorted({b.start for b in brands} | {b.end for b in brands})
        if not eras and photos:
            eras = sorted({p.year for p in photos})
        fallback_year = random.choice(eras) if eras else 2000
        return _pack(
            photo_url=None,
            year=fallback_year,
            logo=_pick_brand_for_year(
                brands, fallback_year, "logo", prefer_collapsed=False
            ),
            icon=_pick_brand_for_year(
                brands, fallback_year, "icon", prefer_collapsed=False
            ),
        )

    pool = _photo_pool(photos, want)
    if not pool:
        eras = sorted({b.start for b in brands} | {b.end for b in brands})
        fallback_year = random.choice(eras) if eras else 2000
        return _pack(
            photo_url=None,
            year=fallback_year,
            logo=_pick_brand_for_year(
                brands, fallback_year, "logo", prefer_collapsed=False
            ),
            icon=_pick_brand_for_year(
                brands, fallback_year, "icon", prefer_collapsed=False
            ),
        )

    photo = _pick_era_photo(pool)
    era_year = photo.year
    return _pack(
        photo_url=_media_url(photo.path, root),
        year=era_year,
        logo=_pick_brand_for_year(brands, era_year, "logo", prefer_collapsed=False),
        icon=_pick_brand_for_year(brands, era_year, "icon", prefer_collapsed=False),
    )


def _gallery_item_id(rel_path: str) -> str:
    digest = hashlib.sha256(rel_path.casefold().encode("utf-8")).hexdigest()[:12]
    return f"gal_{digest}"


def _photo_title(path: Path) -> str:
    stem = path.stem.strip()
    m = re.match(r"^\d{4}(?:\.\d{2})?(?:\.\d{2})?\.\s*(.+)$", stem)
    if not m:
        return stem
    title = ORIENTATION_RE.sub("", m.group(1)).strip(" ,")
    return title or stem


def _brand_sort_key(brand: EraBrand) -> tuple:
    kind_order = 0 if brand.kind == "icon" else 1
    return (brand.start, kind_order, brand.end, brand.path.name.casefold())


def build_gallery_index(artist_name: str | None, media_root: Path) -> dict:
    """List gallery photos and era logos/icons for the artist Gallery tab."""
    empty = {"photos": [], "branding": [], "logos": [], "icons": []}
    if not artist_name or not media_root.is_dir():
        return empty

    artist_dir = _artist_dir(media_root, artist_name)
    if not artist_dir:
        return empty

    photos_out: list[dict] = []
    for photo in sorted(
        _list_photos(_gallery_subdir(artist_dir, "Photos")),
        key=lambda p: (p.year, p.path.name.casefold()),
    ):
        rel = photo.path.relative_to(media_root).as_posix()
        photos_out.append(
            {
                "id": _gallery_item_id(rel),
                "url": _media_url(photo.path, media_root),
                "year": photo.year,
                "orientation": photo.orientation,
                "title": _photo_title(photo.path),
                "folder_path": rel,
            }
        )

    branding_out: list[dict] = []
    for brand in sorted(
        _list_era_brands(_gallery_subdir(artist_dir, "Logos")),
        key=_brand_sort_key,
    ):
        rel = brand.path.relative_to(media_root).as_posix()
        label = f"{brand.start}–{brand.end}"
        if brand.collapsed:
            label = f"{label} Collapsed"
        branding_out.append(
            {
                "id": _gallery_item_id(rel),
                "url": _media_url(brand.path, media_root),
                "kind": brand.kind,
                "start": brand.start,
                "end": brand.end,
                "collapsed": brand.collapsed,
                "label": label,
                "folder_path": rel,
            }
        )

    logos_out = [b for b in branding_out if b["kind"] == "logo"]
    icons_out = [b for b in branding_out if b["kind"] == "icon"]

    return {
        "photos": photos_out,
        "branding": branding_out,
        "logos": logos_out,
        "icons": icons_out,
    }


def pick_playlist_cover(artist_name: str | None, release_hint: str | None) -> str | None:
    """Best-effort cover from gallery or release folder name."""
    root = Path(settings.media_root) if settings.media_root else None
    if not root:
        return None
    artist_dir = _artist_dir(root, artist_name)
    if not artist_dir:
        return None
    covers = _gallery_subdir(artist_dir, "Covers")
    if covers.is_dir():
        images = [p for p in covers.iterdir() if p.suffix.lower() in IMAGE_EXTS]
        if images:
            return _media_url(random.choice(images), root)
    photos = _list_photos(_gallery_subdir(artist_dir, "Photos"))
    if photos:
        return _media_url(random.choice(photos).path, root)
    return None
