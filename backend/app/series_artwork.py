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


def artwork_dir(franchise_dir: Path) -> Path:
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
    """Only files under [Artwork]/Artwork whose stem contains portrait|landscape."""
    needle = _PORTRAIT_RE if want == "portrait" else _LANDSCAPE_RE
    out: list[Path] = []
    for sub in ("[Artwork]", "Artwork"):
        d = franchise_dir / sub
        if not d.is_dir():
            continue
        try:
            files = sorted(d.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            continue
        for f in files:
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            # Require the orientation word in the filename — booklets/logos never qualify
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
) -> dict:
    """
    If no local portrait/landscape files exist in [Artwork], download TMDb
    images and save them with Portrait / Landscape in the filename.
    """
    art = artwork_dir(franchise_dir)
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
    For animated shows, pull character portraits from Jikan (MAL) when local
    People/Characters photos are missing — used for cast card hover flip.
    """
    if not cast_members:
        return cast_members
    need = [
        m
        for m in cast_members
        if m.get("character")
        and not find_character_photo(
            m["character"], franchise_dir=franchise_dir, media_root=media_root
        )
        and not m.get("character_photo_url")
    ]
    if not need:
        return cast_members

    char_map: dict[str, str] = {}
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
                if any(want in _norm_key(t) or _norm_key(t) in want for t in titles if t):
                    anime_id = a.get("mal_id")
                    break
            if anime_id is None and results:
                anime_id = results[0].get("mal_id")
            if not anime_id:
                return cast_members
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
                    # MAL uses "Last, First" sometimes
                    if "," in cname:
                        parts = [p.strip() for p in cname.split(",", 1)]
                        if len(parts) == 2:
                            char_map[_norm_key(f"{parts[1]} {parts[0]}")] = url
    except Exception:
        return cast_members

    out: list[dict] = []
    for m in cast_members:
        character = m.get("character") or ""
        if not character:
            out.append(m)
            continue
        local = find_character_photo(
            character, franchise_dir=franchise_dir, media_root=media_root
        )
        if local:
            out.append({**m, "character_photo_url": local})
            continue
        ck = _norm_key(re.sub(r"\(.*?\)", "", character))
        remote = None
        for k, url in char_map.items():
            if ck and (ck in k or k in ck):
                remote = url
                break
        if remote:
            cached = cache_character_photo(
                franchise_dir, media_root, character, remote
            )
            out.append({**m, "character_photo_url": cached or remote})
        else:
            out.append(m)
    return out
