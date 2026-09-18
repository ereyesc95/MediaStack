"""Resolve Photo - * / Cover - * from release and edition [Artwork] folders.

Hard-cut contract (no artist [Artwork]/Photos, no Wallpaper - *, no Animation - Album):

  Photo - Banner | Landscape | Portrait | Square
  Cover - Front | Back | Banner | Landscape | Portrait | Animation | Canvas

Fallback (playing / known edition):
  edition → Standard → other editions → previous release (or next if first)

Singles under Singles/{Parent}/… also walk parent-album editions via track match.
Idle About carousel: one slide per edition (or release-root [Artwork]) with Photo - *.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from app.band_library import (
    AUDIO_CATEGORIES,
    DATE_PREFIX_RE,
    _album_title_from_folder,
    _audio_root,
    _find_artwork_subdir,
    _parse_folder_date,
)
from app.gallery import (
    IMAGE_EXTS,
    _artist_dir,
    _collapsed_twin,
    _gallery_subdir,
    _list_era_brands,
    _media_url,
    _pick_brand_for_year,
    _resolve_child_dir,
)
from app.media_index import DISC_DIR_RE, _is_edition_content_dir, _is_edition_dir
from app.media_paths_util import entry_display_name, safe_relative

PHOTO_ORIENTATIONS = ("banner", "landscape", "portrait", "square")

PHOTO_STEMS: dict[str, str] = {
    "banner": "photo - banner",
    "landscape": "photo - landscape",
    "portrait": "photo - portrait",
    "square": "photo - square",
}

# Scenic Photo - * only for catalog cards / About / home icons (no Cover packaging).
ORIENTATION_FALLBACK_CHAIN: dict[str, tuple[str, ...]] = {
    "banner": (
        "photo - banner",
        "photo - landscape",
        "photo - portrait",
        "photo - square",
    ),
    "landscape": (
        "photo - landscape",
        "photo - banner",
        "photo - portrait",
        "photo - square",
    ),
    "portrait": (
        "photo - portrait",
        "photo - square",
        "photo - landscape",
        "photo - banner",
    ),
    "square": (
        "photo - square",
        "photo - portrait",
        "photo - landscape",
        "photo - banner",
    ),
}

# Packaging Cover - * still used by release/now-playing UI.
COVER_FALLBACK_CHAIN: dict[str, tuple[str, ...]] = {
    "banner": (
        "cover - banner",
        "cover - landscape",
        "cover - portrait",
        "cover - front",
    ),
    "landscape": (
        "cover - landscape",
        "cover - banner",
        "cover - portrait",
        "cover - front",
    ),
    "portrait": (
        "cover - portrait",
        "cover - landscape",
        "cover - front",
    ),
    "square": ("cover - front",),
}

COVER_MOTION_STEMS = frozenset({"cover - animation", "cover - canvas"})
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v"}
GIF_EXT = {".gif"}
_SMALL_RE = re.compile(r"(?:_|\.)small(?:\b|_)", re.I)
STANDARD_LABELS = frozenset({"standard edition", "standard"})


@dataclass(frozen=True)
class ReleasePhotoHit:
    path: Path
    stem: str
    orientation: str | None
    release_dir: Path
    edition_dir: Path
    date_iso: str | None
    release_title: str


def _is_small_derivative(path: Path) -> bool:
    name = path.name.casefold()
    if "_small" in name or ".jpg_small" in name or name.endswith("_small.jpg"):
        return True
    # e.g. Cover - Front.jpg_small.jpg
    if "_small." in name:
        return True
    return bool(_SMALL_RE.search(path.stem))


def artwork_file_exact(artwork: Path | None, stem: str) -> Path | None:
    """Exact stem match only — never *_small derivatives."""
    if not artwork or not artwork.is_dir():
        return None
    want = stem.casefold().strip()
    try:
        for path in artwork.iterdir():
            if not path.is_file():
                continue
            if path.suffix.lower() not in IMAGE_EXTS and path.suffix.lower() not in VIDEO_EXTS:
                continue
            if _is_small_derivative(path):
                continue
            if path.stem.casefold() == want:
                return path
    except OSError:
        return None
    return None


def _edition_sort_key(folder: Path) -> tuple:
    date = _parse_folder_date(folder.name) or ""
    return (0 if _is_standard_edition(folder) else 1, date, folder.name.casefold())


def _is_standard_edition(folder: Path) -> bool:
    name = entry_display_name(folder).strip()
    # Strip leading date prefix for label check
    m = DATE_PREFIX_RE.match(name)
    core = name[m.end() :].lstrip(". ").strip() if m else name
    low = core.casefold()
    if low in STANDARD_LABELS:
        return True
    return folder.name.casefold() in STANDARD_LABELS


def list_edition_dirs(release_dir: Path) -> list[Path]:
    from app.media_index import _is_group_subdir_name
    from app.release_versions import list_version_dirs

    if not release_dir.is_dir():
        return []
    if list_version_dirs(release_dir):
        return [release_dir]
    # Disc/Side/Tape group folders hold audio, not scenic Photo - * editions.
    # Treating them as editions hid release-root [Artwork] (e.g. Razorblade Romance).
    editions = [
        child
        for child in release_dir.iterdir()
        if child.is_dir()
        and _is_edition_dir(child)
        and not _is_group_subdir_name(child.name)
    ]
    if not editions:
        return [release_dir]
    return sorted(editions, key=_edition_sort_key)


def resolve_standard_edition(release_dir: Path) -> Path:
    editions = list_edition_dirs(release_dir)
    for ed in editions:
        if _is_standard_edition(ed):
            return ed
    # Dated editions: earliest date ≈ original/standard preference
    dated = [e for e in editions if _parse_folder_date(e.name)]
    if dated:
        dated.sort(key=lambda p: _parse_folder_date(p.name) or "9999")
        return dated[0]
    return editions[0] if editions else release_dir


def _artwork_dirs_for_edition(edition: Path) -> list[Path]:
    from app.release_versions import list_version_dirs, preferred_version_dir

    dirs: list[Path] = []
    versions = list_version_dirs(edition)
    if versions:
        pick = preferred_version_dir(edition) or versions[0]
        for vdir in [pick, *[v for v in versions if v != pick]]:
            nested = _find_artwork_subdir(vdir)
            if nested:
                dirs.append(nested)
        return dirs

    art = _find_artwork_subdir(edition)
    if art:
        dirs.append(art)
    try:
        for child in edition.iterdir():
            if not child.is_dir():
                continue
            if DISC_DIR_RE.match(child.name) or _is_edition_content_dir(child):
                nested = _find_artwork_subdir(child)
                if nested:
                    dirs.append(nested)
    except OSError:
        pass
    return dirs


def _find_stem_in_edition(edition: Path, stem: str) -> Path | None:
    for art in _artwork_dirs_for_edition(edition):
        found = artwork_file_exact(art, stem)
        if found:
            return found
    return None


def _release_meta(release_dir: Path) -> tuple[str, str | None]:
    title = _album_title_from_folder(entry_display_name(release_dir))
    date_iso = _parse_folder_date(release_dir.name)
    return title, date_iso


def iter_artist_releases(artist_dir: Path) -> list[Path]:
    """All release folders under Audio categories, newest date first."""
    from app.media_index import (
        _child_release_folders,
        _iter_category_release_entries,
    )
    from app.media_paths_util import resolve_media_entry

    audio = _audio_root(artist_dir)
    releases: list[Path] = []
    if not audio.is_dir():
        return releases
    for cat_key, folder_name in AUDIO_CATEGORIES.items():
        cat = _resolve_child_dir(audio, folder_name)
        if not cat.is_dir():
            continue
        for entry in _iter_category_release_entries(cat):
            if not entry.is_dir() and entry.suffix.casefold() not in (".lnk", ".path"):
                continue
            resolved = resolve_media_entry(entry, media_root=None) or entry
            if not resolved.is_dir():
                continue
            if cat_key == "singles":
                nested = _child_release_folders(resolved)
                if nested:
                    releases.extend(nested)
                    continue
            releases.append(resolved)

    def sort_key(p: Path) -> tuple:
        d = _parse_folder_date(p.name) or ""
        return (d, p.name.casefold())

    releases.sort(key=sort_key, reverse=True)
    out: list[Path] = []
    seen: set[str] = set()
    for r in releases:
        try:
            key = str(r.resolve()).casefold()
        except OSError:
            key = str(r).casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def _edition_chain(
    release_dir: Path,
    *,
    preferred_edition: Path | None = None,
) -> list[Path]:
    """Preferred edition → Standard → other editions."""
    editions = list_edition_dirs(release_dir)
    standard = resolve_standard_edition(release_dir)
    ordered: list[Path] = []
    seen: set[str] = set()

    def add(p: Path | None) -> None:
        if not p or not p.is_dir():
            return
        key = str(p.resolve()).casefold()
        if key in seen:
            return
        seen.add(key)
        ordered.append(p)

    add(preferred_edition)
    add(standard)
    for ed in editions:
        add(ed)
    return ordered or [release_dir]


def _neighbor_releases(release_dir: Path, artist_dir: Path) -> tuple[list[Path], list[Path]]:
    """Returns (previous_releases newest-first toward older, next_releases older-first toward newer)."""
    all_rels = iter_artist_releases(artist_dir)
    try:
        idx = next(
            i
            for i, r in enumerate(all_rels)
            if r.resolve() == release_dir.resolve()
        )
    except StopIteration:
        return [], []
    # all_rels is newest-first: index+1 = older (previous), index-1 = newer (next)
    previous = all_rels[idx + 1 :]  # older
    next_newer = list(reversed(all_rels[:idx]))  # older→newer from first toward current
    return previous, next_newer


def resolve_photo_in_edition_chain(
    release_dir: Path,
    stem_chain: tuple[str, ...],
    *,
    preferred_edition: Path | None = None,
) -> ReleasePhotoHit | None:
    for edition in _edition_chain(release_dir, preferred_edition=preferred_edition):
        for stem in stem_chain:
            found = _find_stem_in_edition(edition, stem)
            if found:
                title, date_iso = _release_meta(release_dir)
                ori = None
                low = stem.casefold()
                for name, photo_stem in PHOTO_STEMS.items():
                    if low == photo_stem:
                        ori = name
                        break
                return ReleasePhotoHit(
                    path=found,
                    stem=stem,
                    orientation=ori,
                    release_dir=release_dir,
                    edition_dir=edition,
                    date_iso=date_iso,
                    release_title=title,
                )
    return None


def resolve_photo_for_release(
    release_dir: Path,
    artist_dir: Path,
    orientation: str,
    *,
    preferred_edition: Path | None = None,
    include_neighbors: bool = True,
) -> ReleasePhotoHit | None:
    want = (orientation or "landscape").casefold()
    if want not in ORIENTATION_FALLBACK_CHAIN:
        want = "landscape"
    chain = ORIENTATION_FALLBACK_CHAIN[want]
    hit = resolve_photo_in_edition_chain(
        release_dir, chain, preferred_edition=preferred_edition
    )
    if hit or not include_neighbors:
        return hit
    previous, next_newer = _neighbor_releases(release_dir, artist_dir)
    # Prefer previous (older); if this is the newest/first in discography sense
    # and nothing older exists, try next (newer) — for the chronologically first
    # release, "previous" is empty so we use next.
    for neighbor in previous or next_newer:
        hit = resolve_photo_in_edition_chain(neighbor, chain, preferred_edition=None)
        if hit:
            return hit
    return None


def resolve_standard_photo(
    release_dir: Path,
    orientation: str,
) -> ReleasePhotoHit | None:
    """Catalog enrichment: Standard edition only, then other editions of same release."""
    want = (orientation or "banner").casefold()
    if want not in ORIENTATION_FALLBACK_CHAIN:
        want = "banner"
    return resolve_photo_in_edition_chain(
        release_dir,
        ORIENTATION_FALLBACK_CHAIN[want],
        preferred_edition=resolve_standard_edition(release_dir),
    )


def resolve_photo_in_single_edition(
    release_dir: Path,
    edition: Path,
    stem_chain: tuple[str, ...],
) -> ReleasePhotoHit | None:
    """Resolve Photo - * from one edition only (no Standard/sibling fallback)."""
    for stem in stem_chain:
        found = _find_stem_in_edition(edition, stem)
        if found:
            title, date_iso = _release_meta(release_dir)
            ori = None
            low = stem.casefold()
            for name, photo_stem in PHOTO_STEMS.items():
                if low == photo_stem:
                    ori = name
                    break
            return ReleasePhotoHit(
                path=found,
                stem=stem,
                orientation=ori,
                release_dir=release_dir,
                edition_dir=edition,
                date_iso=date_iso,
                release_title=title,
            )
    return None


def list_release_photo_slides(artist_dir: Path, media_root: Path) -> list[dict]:
    """One slide per release edition with scenic Photo - *, newest first.

    Named editions (Standard / Deluxe / …) each get a slide when they contain
    Photo - * art. Release-root [Artwork] (no edition folders) is one slide.
    """
    brands = _list_era_brands(_gallery_subdir(artist_dir, "Branding"))
    slides: list[dict] = []
    seen_keys: set[str] = set()
    for release_dir in iter_artist_releases(artist_dir):
        title, date_iso = _release_meta(release_dir)
        year = int(date_iso[:4]) if date_iso and len(date_iso) >= 4 else None
        editions = list_edition_dirs(release_dir)

        for edition in editions:
            def url_for(ori: str) -> str | None:
                hit = resolve_photo_in_single_edition(
                    release_dir,
                    edition,
                    ORIENTATION_FALLBACK_CHAIN.get(
                        ori, ORIENTATION_FALLBACK_CHAIN["landscape"]
                    ),
                )
                if not hit:
                    return None
                return _media_url(hit.path, media_root)

            portrait_url = url_for("portrait")
            landscape_url = url_for("landscape")
            banner_url = url_for("banner")
            square_url = url_for("square")
            if not any((portrait_url, landscape_url, banner_url, square_url)):
                continue

            dedupe = "|".join(
                u or ""
                for u in (portrait_url, landscape_url, banner_url, square_url)
            )
            if dedupe in seen_keys:
                continue
            seen_keys.add(dedupe)

            primary_url = banner_url or landscape_url or portrait_url or square_url
            primary_ori = (
                "banner"
                if banner_url
                else "landscape"
                if landscape_url
                else "portrait"
                if portrait_url
                else "square"
            )
            ed_date = _parse_folder_date(edition.name) or date_iso
            y = year or 2000
            if ed_date and len(ed_date) >= 4 and ed_date[:4].isdigit():
                y = int(ed_date[:4])
            icon = _pick_brand_for_year(
                brands, y, "icon", prefer_collapsed=False, seed=title
            )
            logo = _pick_brand_for_year(
                brands, y, "logo", prefer_collapsed=False, seed=title
            )
            rel = safe_relative(release_dir, media_root) or release_dir.name
            ed_rel = safe_relative(edition, media_root) or edition.name
            ed_label = entry_display_name(edition)
            # Drop leading date from edition label when it's a nested edition folder
            slide_title = title
            if edition.resolve() != release_dir.resolve():
                core = ed_label
                m = DATE_PREFIX_RE.match(core.strip())
                if m:
                    core = core[m.end() :].lstrip(". ").strip() or core
                if core and core.casefold() != title.casefold():
                    slide_title = f"{title} · {core}"
            slides.append(
                {
                    "id": (
                        "relphoto_"
                        + hashlib.sha256(ed_rel.casefold().encode()).hexdigest()[:12]
                    ),
                    "year": y,
                    "date_iso": ed_date or date_iso,
                    "title": slide_title,
                    "orientation": primary_ori,
                    "slide_url": primary_url,
                    "portrait_url": portrait_url,
                    "landscape_url": landscape_url,
                    "banner_url": banner_url,
                    "square_url": square_url,
                    "icon_url": _media_url(icon.path, media_root) if icon else None,
                    "logo_url": _media_url(logo.path, media_root) if logo else None,
                    "folder_path": rel,
                }
            )
    return slides


def collect_promo_photos(artist_dir: Path, media_root: Path) -> list[dict]:
    """Flat deduped Photo - * from all release/edition [Artwork] folders."""
    items: list[dict] = []
    seen_bytes: set[str] = set()
    for release_dir in iter_artist_releases(artist_dir):
        title, date_iso = _release_meta(release_dir)
        for edition in list_edition_dirs(release_dir):
            for art in _artwork_dirs_for_edition(edition):
                try:
                    files = list(art.iterdir())
                except OSError:
                    continue
                for path in files:
                    if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
                        continue
                    if _is_small_derivative(path):
                        continue
                    stem = path.stem.casefold()
                    if stem not in PHOTO_STEMS.values():
                        continue
                    # Dedupe by size+name heuristic
                    try:
                        key = f"{path.stat().st_size}:{stem}:{path.suffix.casefold()}"
                    except OSError:
                        key = f"{stem}:{path.name.casefold()}"
                    if key in seen_bytes:
                        continue
                    seen_bytes.add(key)
                    rel = safe_relative(path, media_root) or path.name
                    ori = next(
                        (k for k, v in PHOTO_STEMS.items() if v == stem),
                        "unknown",
                    )
                    year = int(date_iso[:4]) if date_iso and len(date_iso) >= 4 else 0
                    items.append(
                        {
                            "id": f"promo_{hashlib.sha256(rel.casefold().encode()).hexdigest()[:12]}",
                            "url": _media_url(path, media_root),
                            "year": year,
                            "orientation": ori,
                            "title": f"{title} · {path.stem}",
                            "folder_path": rel,
                            "section": "promo",
                        }
                    )
    items.sort(
        key=lambda it: (
            -(it.get("year") or 0),
            (it.get("title") or "").casefold(),
            it.get("folder_path") or "",
        )
    )
    return items


def collect_gallery_dump(
    artist_dir: Path,
    media_root: Path,
    *,
    include_release_misc: bool = True,
) -> list[dict]:
    """Artist [Artwork]/Miscellaneous dump (+ legacy Gallery) + release misc media."""
    from app.gallery import _gallery_subdir

    items: list[dict] = []
    gallery_dir = _gallery_subdir(artist_dir, "Miscellaneous")
    if not gallery_dir.is_dir():
        gallery_dir = _gallery_subdir(artist_dir, "Misc")
    if not gallery_dir.is_dir():
        # Legacy folder name before Miscellaneous rename
        gallery_dir = _gallery_subdir(artist_dir, "Gallery")
    if gallery_dir.is_dir():
        try:
            for path in sorted(gallery_dir.rglob("*"), key=lambda p: p.as_posix().casefold()):
                if not path.is_file():
                    continue
                ext = path.suffix.lower()
                if ext not in IMAGE_EXTS and ext not in VIDEO_EXTS:
                    continue
                if _is_small_derivative(path):
                    continue
                rel = safe_relative(path, media_root) or path.name
                items.append(
                    {
                        "id": f"gal_{hashlib.sha256(rel.casefold().encode()).hexdigest()[:12]}",
                        "url": _media_url(path, media_root),
                        "year": 0,
                        "orientation": "unknown",
                        "title": path.stem,
                        "folder_path": rel,
                        "section": "gallery",
                        "kind": "video" if ext in VIDEO_EXTS else "image",
                    }
                )
        except OSError:
            pass

    if include_release_misc:
        for release_dir in iter_artist_releases(artist_dir):
            for edition in list_edition_dirs(release_dir):
                for art in _artwork_dirs_for_edition(edition):
                    try:
                        files = list(art.iterdir())
                    except OSError:
                        continue
                    for path in files:
                        if not path.is_file():
                            continue
                        ext = path.suffix.lower()
                        if ext not in VIDEO_EXTS and ext not in GIF_EXT:
                            continue
                        if _is_small_derivative(path):
                            continue
                        stem = path.stem.casefold()
                        # Cover motion stays on release UI / animations tab
                        if stem in COVER_MOTION_STEMS or stem.startswith("cover -"):
                            continue
                        if stem.startswith("animation -") or stem.startswith("canvas -"):
                            # Track-specific motion — leave for release UI
                            continue
                        rel = safe_relative(path, media_root) or path.name
                        items.append(
                            {
                                "id": f"gal_{hashlib.sha256(rel.casefold().encode()).hexdigest()[:12]}",
                                "url": _media_url(path, media_root),
                                "year": 0,
                                "orientation": "unknown",
                                "title": path.stem,
                                "folder_path": rel,
                                "section": "gallery",
                                "kind": "video" if ext in VIDEO_EXTS else "image",
                            }
                        )
    return items


def latest_release_with_photos(artist_dir: Path) -> Path | None:
    for release_dir in iter_artist_releases(artist_dir):
        hit = resolve_photo_in_edition_chain(
            release_dir,
            ORIENTATION_FALLBACK_CHAIN["landscape"],
            preferred_edition=resolve_standard_edition(release_dir),
        )
        if hit:
            return release_dir
    return None


def resolve_folder_path_to_release(
    media_root: Path, folder_path: str | None
) -> Path | None:
    if not folder_path:
        return None
    path = media_root / Path(folder_path)
    if path.is_dir():
        return path
    return None
