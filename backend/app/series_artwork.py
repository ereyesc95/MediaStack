"""Cache TMDb images into Series/[Artwork] and resolve local cast photos."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

import httpx

from app.gallery import IMAGE_EXTS, _media_url
from app.paths import people_dir

_PORTRAIT_RE = re.compile(r"portrait", re.I)
_LANDSCAPE_RE = re.compile(r"landscape", re.I)


def artwork_dir(franchise_dir: Path, *, film: bool = False) -> Path:
    """Return folder for TMDb-downloaded posters/backdrops.

    - Franchise / work folders → ``[Artwork]`` (create if missing).
    - Individual film folders → ``Gallery/Covers`` (never create ``[Artwork]``).
    """
    if film:
        from app.series_paths import find_covers_dir

        existing = find_covers_dir(franchise_dir)
        if existing and existing.name.casefold() == "covers":
            return existing
        covers = franchise_dir / "Gallery" / "Covers"
        covers.mkdir(parents=True, exist_ok=True)
        return covers

    preferred = franchise_dir / "[Artwork]"
    if preferred.is_dir():
        return preferred
    alt = franchise_dir / "Artwork"
    if alt.is_dir():
        return alt
    preferred.mkdir(parents=True, exist_ok=True)
    return preferred


def _list_named(
    franchise_dir: Path, *, want: str
) -> list[Path]:
    """Files under Gallery/Covers or [Artwork] whose stem contains portrait|landscape."""
    from app.series_paths import cover_search_dirs

    needle = _PORTRAIT_RE if want == "portrait" else _LANDSCAPE_RE
    out: list[Path] = []
    dirs = list(cover_search_dirs(franchise_dir))
    covers = franchise_dir / "Gallery" / "Covers"
    if covers.is_dir() and covers not in dirs:
        dirs.append(covers)
    if not dirs:
        for name in ("[Artwork]", "Artwork"):
            d = franchise_dir / name
            if d.is_dir():
                dirs.append(d)
    for d in dirs:
        if not d.is_dir():
            continue
        try:
            files = sorted(d.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            continue
        for f in files:
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            if needle.search(f.stem):
                out.append(f)
    return out


def list_portrait_files(franchise_dir: Path) -> list[Path]:
    return _list_named(franchise_dir, want="portrait")


def list_landscape_files(franchise_dir: Path) -> list[Path]:
    return _list_named(franchise_dir, want="landscape")


def _download(url: str, dest: Path) -> bool:
    try:
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            r = client.get(url)
            r.raise_for_status()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(r.content)
        return True
    except Exception:
        return False


def _ext_from_url(url: str) -> str:
    path = urlparse(url).path
    suffix = Path(path).suffix.lower()
    if suffix in IMAGE_EXTS:
        return suffix
    return ".jpg"


def ensure_artwork_cached(
    franchise_dir: Path,
    media_root: Path,
    *,
    posters: list[str],
    backdrops: list[str],
    film: bool = False,
) -> dict:
    """
    If no local portrait/landscape files exist, download TMDb images.

    Franchise/work → ``[Artwork]``. Individual film → ``Gallery/Covers``.
    """
    art = artwork_dir(franchise_dir, film=film)
    saved_portraits: list[str] = []
    saved_landscapes: list[str] = []

    if not list_portrait_files(franchise_dir):
        for i, url in enumerate(posters[:8]):
            if not url:
                continue
            name = f"TMDb. Portrait{'' if i == 0 else f' {i + 1}'}{_ext_from_url(url)}"
            dest = art / name
            if dest.is_file() or _download(url, dest):
                saved_portraits.append(_media_url(dest, media_root) or "")

    if not list_landscape_files(franchise_dir):
        for i, url in enumerate(backdrops[:8]):
            if not url:
                continue
            name = f"TMDb. Landscape{'' if i == 0 else f' {i + 1}'}{_ext_from_url(url)}"
            dest = art / name
            if dest.is_file() or _download(url, dest):
                saved_landscapes.append(_media_url(dest, media_root) or "")

    return {
        "portraits": [u for u in saved_portraits if u],
        "landscapes": [u for u in saved_landscapes if u],
    }


def build_local_eras(franchise_dir: Path, media_root: Path) -> list[dict]:
    """Only portrait-named files for left carousel; landscape-named for bg pairing."""
    eras: list[dict] = []
    portraits = list_portrait_files(franchise_dir)
    landscapes = list_landscape_files(franchise_dir)
    # Pair by index when possible
    n = max(len(portraits), len(landscapes), 1 if portraits or landscapes else 0)
    for i in range(n):
        p = portraits[i] if i < len(portraits) else None
        l = landscapes[i] if i < len(landscapes) else None
        p_url = _media_url(p, media_root) if p else None
        l_url = _media_url(l, media_root) if l else None
        if not p_url and not l_url:
            continue
        eras.append(
            {
                "orientation": "portrait" if p_url else "landscape",
                "portrait_url": p_url,
                "landscape_url": l_url,
                "slide_url": p_url or l_url,
                "icon_url": None,
                "logo_url": None,
                "year": None,
            }
        )
    # Also emit pure landscape-only eras for background rotation when no portrait pair
    if not eras and landscapes:
        for l in landscapes:
            url = _media_url(l, media_root)
            if not url:
                continue
            eras.append(
                {
                    "orientation": "landscape",
                    "portrait_url": None,
                    "landscape_url": url,
                    "slide_url": url,
                    "icon_url": None,
                    "logo_url": None,
                    "year": None,
                }
            )
    return eras


def _artwork_subdir(folder: Path) -> Path | None:
    """Prefer Gallery/Covers for cover/photocard art, else [Artwork]/Artwork."""
    from app.series_paths import find_covers_dir

    covers = find_covers_dir(folder)
    if covers:
        return covers
    for name in ("[Artwork]", "Artwork"):
        d = folder / name
        if d.is_dir():
            return d
    return None


def _stem_file(artwork: Path | None, stem: str) -> Path | None:
    if not artwork or not artwork.is_dir():
        return None
    want = stem.casefold().strip()
    try:
        for f in artwork.iterdir():
            if (
                f.is_file()
                and f.suffix.lower() in IMAGE_EXTS
                and f.stem.casefold().strip() == want
            ):
                return f
    except OSError:
        return None
    return None


def _stem_contains(artwork: Path | None, *needles: str) -> list[Path]:
    if not artwork or not artwork.is_dir():
        return []
    wants = [n.casefold() for n in needles if n]
    out: list[Path] = []
    try:
        files = sorted(artwork.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return []
    for f in files:
        if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
            continue
        low = f.stem.casefold()
        if all(n in low for n in wants):
            out.append(f)
    return out


_SKIP_GENERIC_ART = re.compile(
    r"(?:^|[\s_-])(?:cover|logo|icon|wallpaper|season|photocard)(?:$|[\s_-])",
    re.I,
)


def resolve_series_photocards(
    folder: Path, media_root: Path
) -> dict[str, str | None]:
    """Photocard fronts/backs for a franchise or subseries [Artwork] folder.

    Order:
      1. Dedicated ``photocard - …`` stems
      2. ``Characters - Portrait/Landscape`` fronts + ``Wallpaper - …`` backs
      3. Any other portrait/landscape-named images (excluding cover/logo/season/…)
      4. Backs fall back to ``Cover - Front``, then the front image itself
    """
    from app.media_index import _artwork_file
    from app.release_overview import PHOTOCARD_STEMS
    from app.release_photocards import (
        scan_photocards,
        scan_wallpapers,
        _photocards_empty,
        _ensure_flip_backs,
    )
    from app.band_library import COVER_FRONT_STEM

    artwork = _artwork_subdir(folder)
    cards = scan_photocards(artwork, media_root)
    if not _photocards_empty(cards):
        from app.release_photocards import _apply_cover_front_backs

        wp = scan_wallpapers(artwork, media_root)
        if cards.get("portrait_front") and not cards.get("portrait_back"):
            cards["portrait_back"] = wp.get("portrait_back")
        if cards.get("landscape_front") and not cards.get("landscape_back"):
            cards["landscape_back"] = wp.get("landscape_back")
        cover = _artwork_file(artwork, COVER_FRONT_STEM) if artwork else None
        cover_url = _media_url(cover, media_root) if cover else None
        _apply_cover_front_backs(
            cards, artwork, media_root, cover_url=cover_url
        )
        _ensure_flip_backs(cards)
        return cards

    cards = {k: None for k in PHOTOCARD_STEMS}
    char_p = _stem_file(artwork, "characters - portrait")
    char_l = _stem_file(artwork, "characters - landscape")
    wp = scan_wallpapers(artwork, media_root)
    cover = _artwork_file(artwork, COVER_FRONT_STEM) if artwork else None
    cover_url = _media_url(cover, media_root) if cover else None

    if char_p:
        cards["portrait_front"] = _media_url(char_p, media_root)
    if char_l:
        cards["landscape_front"] = _media_url(char_l, media_root)

    if _photocards_empty(cards):
        for f in _stem_contains(artwork, "portrait"):
            if _SKIP_GENERIC_ART.search(f.stem):
                continue
            cards["portrait_front"] = _media_url(f, media_root)
            break
        for f in _stem_contains(artwork, "landscape"):
            if _SKIP_GENERIC_ART.search(f.stem):
                continue
            cards["landscape_front"] = _media_url(f, media_root)
            break

    if _photocards_empty(cards) and cover_url:
        cards["portrait_front"] = cover_url
        cards["landscape_front"] = cover_url
        cards["portrait_back"] = cover_url
        cards["landscape_back"] = cover_url
        cards["cover_only"] = True
        return cards

    if cards.get("portrait_front"):
        cards["portrait_back"] = (
            wp.get("portrait_back") or cover_url or cards["portrait_front"]
        )
    if cards.get("landscape_front"):
        from app.artwork_stems import (
            resolve_cover_banner_file,
            resolve_cover_landscape_file,
        )

        def _cover_url(path: Path | None) -> str | None:
            return _media_url(path, media_root) if path else None

        cover_l = (
            _cover_url(resolve_cover_landscape_file(artwork)) if artwork else None
        )
        cover_b = (
            _cover_url(resolve_cover_banner_file(artwork)) if artwork else None
        )
        cards["landscape_back"] = (
            wp.get("landscape_back")
            or cover_l
            or cover_b
            or cover_url
            or cards["landscape_front"]
        )
        if cards["landscape_back"] and cards["landscape_back"] != wp.get(
            "landscape_back"
        ):
            cards["landscape_back_cover"] = True
    _ensure_flip_backs(cards)
    return cards


def resolve_season_art(
    artwork: Path | None,
    labels: list[str],
    media_root: Path,
    *,
    render_dirs: list[Path] | None = None,
) -> tuple[str | None, str | None, str | None, str | None, str | None, str | None]:
    """Return (portrait, landscape, cover_front, cover_back, banner, logo) URLs.

    Prefers ``{Season} - Portrait`` for covers; ``{Season} - Banner`` then
    ``{Season} - Landscape`` for wide art; ``{Season} - Logo`` from renders.
    """
    from app.artwork_stems import COVER_BACK_STEM, COVER_FRONT_STEM

    empty = (None, None, None, None, None, None)
    if not artwork or not artwork.is_dir():
        # Still try logo from renders even without covers dir
        artwork_dirs: list[Path] = []
    else:
        artwork_dirs = [artwork]
    for d in render_dirs or []:
        if d and d.is_dir() and d not in artwork_dirs:
            artwork_dirs.append(d)
    if not artwork_dirs:
        return empty

    label_cfs = [lab.casefold().strip() for lab in labels if lab and lab.strip()]
    if not label_cfs:
        return empty

    def files_in(directory: Path) -> list[Path]:
        try:
            return [
                p
                for p in directory.iterdir()
                if p.is_file() and p.suffix.lower() in IMAGE_EXTS
            ]
        except OSError:
            return []

    all_files: list[Path] = []
    for d in artwork_dirs:
        all_files.extend(files_in(d))

    def match(*parts: str, in_dirs: list[Path] | None = None) -> str | None:
        want = " ".join(p for p in parts if p).casefold().strip()
        want_dash = " - ".join(p for p in parts if p).casefold().strip()
        pool = all_files
        if in_dirs is not None:
            pool = []
            for d in in_dirs:
                pool.extend(files_in(d))
        for path in pool:
            stem = path.stem.casefold().strip()
            if stem == want or stem == want_dash:
                url = _media_url(path, media_root)
                if not url:
                    return None
                try:
                    return f"{url}&v={int(path.stat().st_mtime)}"
                except OSError:
                    return url
        return None

    portrait = landscape = front = back = banner = logo = None
    cover_dirs = [artwork] if artwork and artwork.is_dir() else artwork_dirs
    logo_dirs = list(render_dirs or []) or artwork_dirs
    for label in label_cfs:
        banner = banner or match(label, "banner", in_dirs=cover_dirs)
        portrait = portrait or match(label, "portrait", in_dirs=cover_dirs)
        landscape = landscape or match(label, "landscape", in_dirs=cover_dirs)
        front = front or match(label, COVER_FRONT_STEM, in_dirs=cover_dirs)
        back = back or match(label, COVER_BACK_STEM, in_dirs=cover_dirs)
        logo = logo or match(label, "logo", in_dirs=logo_dirs)
        if not portrait and not landscape and not front and not banner:
            exact = match(label, in_dirs=cover_dirs)
            if exact:
                front = exact
    return portrait, landscape, front, back, banner, logo


def _norm_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (text or "").casefold())


def _file_url(path: Path, media_root: Path | None) -> str | None:
    from urllib.parse import quote

    if media_root and media_root.is_dir():
        try:
            path.resolve().relative_to(media_root.resolve())
            return _media_url(path, media_root)
        except ValueError:
            pass
    try:
        rel = path.relative_to(people_dir()).as_posix()
        return f"/api/data/file?path={quote(rel)}"
    except ValueError:
        if media_root:
            return _media_url(path, media_root)
    return None


def find_person_photo(
    name: str,
    *,
    franchise_dir: Path | None = None,
    media_root: Path | None = None,
    tmdb_id: int | None = None,
) -> str | None:
    """Look up cast photo under franchise People/ then data/people/{Letter}/."""
    if not name:
        return None
    from app.config import settings

    root = media_root or (
        Path(settings.media_root) if settings.media_root else None
    )
    key = _norm_key(name)
    tid = str(tmdb_id) if tmdb_id else None
    letter = name.strip()[:1].upper() if name.strip()[:1].isalpha() else "#"
    dirs: list[Path] = []
    if franchise_dir:
        for sub in ("People", "Cast", "Gallery/People"):
            d = franchise_dir / sub
            if d.is_dir():
                dirs.append(d)
    pd = people_dir() / letter
    if pd.is_dir():
        dirs.append(pd)

    for folder in dirs:
        try:
            files = list(folder.iterdir())
        except OSError:
            continue
        for f in files:
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            stem = f.stem
            if tid and tid in stem:
                return _file_url(f, root)
            if key and key in _norm_key(stem):
                return _file_url(f, root)
    return None


def find_character_photo(
    character: str,
    *,
    franchise_dir: Path | None = None,
    media_root: Path | None = None,
    actor_name: str | None = None,
) -> str | None:
    if not character:
        return None
    from app.config import settings

    root = media_root or (
        Path(settings.media_root) if settings.media_root else None
    )
    key = _norm_key(character)
    # Strip parenthetical aliases e.g. "Son Goku (voice)"
    key_short = _norm_key(re.sub(r"\(.*?\)", "", character))
    dirs: list[Path] = []
    if franchise_dir:
        for sub in ("People/Characters", "People", "Cast", "Gallery/People"):
            d = franchise_dir / sub
            if d.is_dir():
                dirs.append(d)
    letter = (actor_name or character).strip()[:1].upper()
    if not letter.isalpha():
        letter = "#"
    pd = people_dir() / letter
    if pd.is_dir():
        dirs.append(pd)

    for folder in dirs:
        try:
            files = list(folder.iterdir())
        except OSError:
            continue
        for f in files:
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            stem_key = _norm_key(f.stem)
            if key and key in stem_key:
                return _file_url(f, root)
            if key_short and key_short in stem_key:
                return _file_url(f, root)
    return None


def cache_character_photo(
    franchise_dir: Path,
    media_root: Path,
    character: str,
    image_url: str,
) -> str | None:
    """Download a character image into People/Characters/ with a stable name."""
    if not character or not image_url:
        return None
    existing = find_character_photo(
        character, franchise_dir=franchise_dir, media_root=media_root
    )
    if existing:
        return existing
    dest_dir = franchise_dir / "People" / "Characters"
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r'[<>:"/\\|?*]+', "", character).strip() or "Character"
    dest = dest_dir / f"{safe}{_ext_from_url(image_url)}"
    if dest.is_file() or _download(image_url, dest):
        return _media_url(dest, media_root)
    return None


def enrich_cast_character_photos_from_jikan(
    franchise_dir: Path,
    media_root: Path,
    franchise_name: str,
    cast_members: list[dict],
) -> list[dict]:
    """
    Character-centered cards: photo_url = character art (front),
    actor_photo_url / character_photo_url = actor portrait (hover flip).
    """
    if not cast_members:
        return cast_members

    need_remote = False
    for m in cast_members:
        character = m.get("character") or m.get("name") or ""
        if character and not find_character_photo(
            character, franchise_dir=franchise_dir, media_root=media_root
        ):
            # Only fetch Jikan if we don't already have a distinct character photo
            existing = m.get("photo_url")
            actor = m.get("actor_photo_url") or m.get("character_photo_url")
            if not existing or (actor and existing == actor):
                need_remote = True
                break

    char_map: dict[str, str] = {}
    if need_remote:
        try:
            with httpx.Client(timeout=30.0, follow_redirects=True) as client:
                r = client.get(
                    "https://api.jikan.moe/v4/anime",
                    params={"q": franchise_name, "limit": 5},
                )
                r.raise_for_status()
                results = (r.json() or {}).get("data") or []
                anime_id = None
                want = _norm_key(franchise_name)
                for a in results:
                    title = a.get("title") or ""
                    titles = [title] + [
                        t.get("title") or ""
                        for t in (a.get("titles") or [])
                        if isinstance(t, dict)
                    ]
                    if any(
                        want in _norm_key(t) or _norm_key(t) in want
                        for t in titles
                        if t
                    ):
                        anime_id = a.get("mal_id")
                        break
                if anime_id is None and results:
                    anime_id = results[0].get("mal_id")
                if anime_id:
                    r2 = client.get(
                        f"https://api.jikan.moe/v4/anime/{anime_id}/characters"
                    )
                    r2.raise_for_status()
                    for row in (r2.json() or {}).get("data") or []:
                        ch = row.get("character") or {}
                        cname = ch.get("name") or ""
                        imgs = (ch.get("images") or {}).get("jpg") or {}
                        url = imgs.get("image_url") or imgs.get("small_image_url")
                        if cname and url:
                            char_map[_norm_key(cname)] = url
                            if "," in cname:
                                parts = [p.strip() for p in cname.split(",", 1)]
                                if len(parts) == 2:
                                    char_map[
                                        _norm_key(f"{parts[1]} {parts[0]}")
                                    ] = url
        except Exception:
            char_map = {}

    out: list[dict] = []
    for m in cast_members:
        character = (m.get("character") or m.get("name") or "").strip()
        actors = m.get("actors") if isinstance(m.get("actors"), list) else []
        actor_photo = m.get("actor_photo_url") or None
        if not actor_photo and actors:
            actor_photo = (actors[0] or {}).get("photo_url")
        # Legacy: actor was stored as photo_url / character_photo_url
        if not actor_photo:
            legacy = m.get("character_photo_url") or m.get("photo_url")
            # Only treat as actor if we have roles/actors list
            if actors or m.get("roles"):
                actor_photo = legacy

        local = (
            find_character_photo(
                character, franchise_dir=franchise_dir, media_root=media_root
            )
            if character
            else None
        )
        char_photo = local
        if not char_photo:
            ck = _norm_key(re.sub(r"\(.*?\)", "", character))
            remote = None
            for k, url in char_map.items():
                if ck and (ck in k or k in ck):
                    remote = url
                    break
            if remote:
                char_photo = (
                    cache_character_photo(
                        franchise_dir, media_root, character, remote
                    )
                    or remote
                )
        # Keep an existing distinct photo_url if it isn't the actor shot
        if not char_photo:
            existing = m.get("photo_url")
            if existing and existing != actor_photo:
                char_photo = existing

        out.append(
            {
                **m,
                "name": character or m.get("name"),
                "character": character or m.get("character"),
                "photo_url": char_photo,
                "actor_photo_url": actor_photo,
                "character_photo_url": actor_photo,
                "actors": actors,
                "roles": m.get("roles")
                or [a.get("name") for a in actors if a.get("name")],
            }
        )
    return out
