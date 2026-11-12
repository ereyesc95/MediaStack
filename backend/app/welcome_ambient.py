"""Welcome-screen ambient photocard pool (SFW, dedicated stems only)."""
from __future__ import annotations

import hashlib
import random
import time
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.gallery import _media_url
from app.media_index import _artwork_file
from app.release_overview import PHOTOCARD_STEM_ALIASES

_CACHE_TTL_SEC = 120.0
# (mono_ts, listing_sig, portrait_pairs, landscape_pairs)
_cache: tuple[float, str, tuple[dict, ...], tuple[dict, ...]] | None = None

_ARTWORK_DIR_NAMES = frozenset({"[artwork]", "artwork"})
_SKIP_DIR_NAMES = frozenset(
    {
        "exclusive",
        "node_modules",
        ".git",
        "library",
        "episodes",
        "files",
    }
)


def invalidate_welcome_ambient_cache() -> None:
    global _cache
    _cache = None


def _listing_sig(root: Path) -> str:
    """Cheap media-root fingerprint so cache drops when folders change."""
    parts: list[str] = []
    try:
        for name in ("Music", "Series", "Movies", "Books", "Games"):
            p = root / name
            if not p.is_dir():
                parts.append(f"{name}:0")
                continue
            try:
                st = p.stat()
                parts.append(f"{name}:{int(st.st_mtime)}:{st.st_ino}")
            except OSError:
                parts.append(f"{name}:?")
    except OSError:
        return "0"
    return "|".join(parts)


def _find_stem_file(folder: Path, aliases: tuple[str, ...]) -> Path | None:
    for stem in aliases:
        found = _artwork_file(folder, stem)
        if found:
            return found
    return None


def _pair_from_folder(
    folder: Path,
    media_root: Path,
    *,
    module: str,
) -> list[dict]:
    """Return dedicated photocard pairs (front+back required)."""
    if not folder.is_dir():
        return []
    # Never pull from Exclusive trees.
    try:
        rel = folder.relative_to(media_root).as_posix()
    except ValueError:
        return []
    if "exclusive" in rel.casefold().split("/"):
        return []

    out: list[dict] = []
    for orientation, front_key, back_key in (
        ("portrait", "portrait_front", "portrait_back"),
        ("landscape", "landscape_front", "landscape_back"),
    ):
        front = _find_stem_file(folder, PHOTOCARD_STEM_ALIASES[front_key])
        back = _find_stem_file(folder, PHOTOCARD_STEM_ALIASES[back_key])
        if not front or not back:
            continue
        front_url = _media_url(front, media_root)
        back_url = _media_url(back, media_root)
        digest = hashlib.sha1(
            f"{rel}|{orientation}|{front.name}|{back.name}".encode("utf-8")
        ).hexdigest()[:16]
        out.append(
            {
                "id": f"pc_{digest}",
                "orientation": orientation,
                "module": module,
                "front_url": front_url,
                "back_url": back_url,
                "path": rel,
            }
        )
    return out


def _iter_artwork_dirs_music(artist_dir: Path) -> list[Path]:
    found: list[Path] = []

    def walk(dir_path: Path, depth: int) -> None:
        if depth > 8:
            return
        try:
            children = list(dir_path.iterdir())
        except OSError:
            return
        for child in children:
            if not child.is_dir():
                continue
            name_cf = child.name.casefold()
            if name_cf in _ARTWORK_DIR_NAMES:
                found.append(child)
                continue
            if name_cf in _SKIP_DIR_NAMES:
                continue
            walk(child, depth + 1)

    # Prefer common layout: Audio/**/[Artwork]
    audio = artist_dir / "Audio"
    if audio.is_dir():
        walk(audio, 0)
    else:
        walk(artist_dir, 0)
    # Also check artist-level [Artwork]
    for child in (artist_dir / "[Artwork]", artist_dir / "Artwork"):
        if child.is_dir() and child not in found:
            found.append(child)
    return found


def _scan_music(root: Path) -> list[dict]:
    music = root / "Music"
    if not music.is_dir():
        return []
    pairs: list[dict] = []
    try:
        letters = [p for p in music.iterdir() if p.is_dir()]
    except OSError:
        return []
    for letter in letters:
        try:
            artists = [p for p in letter.iterdir() if p.is_dir()]
        except OSError:
            continue
        for artist in artists:
            for artwork in _iter_artwork_dirs_music(artist):
                pairs.extend(
                    _pair_from_folder(artwork, root, module="music")
                )
    return pairs


def _scan_letter_franchise_leaves(
    module_root: Path,
    media_root: Path,
    *,
    module: str,
) -> list[dict]:
    """Series/Movies/Books: Module/{Letter}/{Franchise}/{Leaf}/Gallery/Covers."""
    if not module_root.is_dir():
        return []
    pairs: list[dict] = []
    try:
        letters = [p for p in module_root.iterdir() if p.is_dir()]
    except OSError:
        return []
    for letter in letters:
        try:
            franchises = [p for p in letter.iterdir() if p.is_dir()]
        except OSError:
            continue
        for franchise in franchises:
            # Leaf folders + optional franchise-level Gallery/Covers
            covers_dirs: list[Path] = []
            fran_covers = franchise / "Gallery" / "Covers"
            if fran_covers.is_dir():
                covers_dirs.append(fran_covers)
            try:
                leaves = [p for p in franchise.iterdir() if p.is_dir()]
            except OSError:
                leaves = []
            for leaf in leaves:
                name_cf = leaf.name.casefold()
                if name_cf in {"gallery", "[artwork]", "artwork", "exclusive"}:
                    continue
                covers = leaf / "Gallery" / "Covers"
                if covers.is_dir():
                    covers_dirs.append(covers)
                # Some leaves put photocards in [Artwork]
                for art_name in ("[Artwork]", "Artwork"):
                    art = leaf / art_name
                    if art.is_dir():
                        covers_dirs.append(art)
            for covers in covers_dirs:
                pairs.extend(
                    _pair_from_folder(covers, media_root, module=module)
                )
    return pairs


def _scan_games(root: Path) -> list[dict]:
    """Games/{Platform}/{Letter}/{Franchise}/{Game}/Gallery/Covers."""
    games = root / "Games"
    if not games.is_dir():
        return []
    pairs: list[dict] = []
    try:
        platforms = [p for p in games.iterdir() if p.is_dir()]
    except OSError:
        return []
    for platform in platforms:
        if platform.name.casefold() == "exclusive":
            continue
        try:
            letters = [p for p in platform.iterdir() if p.is_dir()]
        except OSError:
            continue
        for letter in letters:
            try:
                franchises = [p for p in letter.iterdir() if p.is_dir()]
            except OSError:
                continue
            for franchise in franchises:
                try:
                    leaves = [p for p in franchise.iterdir() if p.is_dir()]
                except OSError:
                    leaves = []
                for leaf in leaves:
                    name_cf = leaf.name.casefold()
                    if name_cf in {"gallery", "[artwork]", "artwork", "exclusive"}:
                        continue
                    for candidate in (
                        leaf / "Gallery" / "Covers",
                        leaf / "[Artwork]",
                        leaf / "Artwork",
                        franchise / "Gallery" / "Covers",
                    ):
                        if candidate.is_dir():
                            pairs.extend(
                                _pair_from_folder(
                                    candidate, root, module="games"
                                )
                            )
    return pairs


def _sfw_name_set(cards: list, *, id_keys: tuple[str, ...] = ("id", "name", "title")) -> set[str]:
    from app.franchise_index import normalize_franchise_slug

    out: set[str] = set()
    for card in cards:
        if not isinstance(card, dict):
            continue
        for key in id_keys:
            raw = (card.get(key) or "").strip()
            if not raw:
                continue
            out.add(raw.casefold())
            slug = normalize_franchise_slug(raw)
            if slug:
                out.add(slug)
    return out


def _path_parts(rel: str) -> list[str]:
    return [p for p in rel.replace("\\", "/").split("/") if p]


def _filter_sfw_pairs(db: Session, pairs: list[dict]) -> list[dict]:
    """Drop Exclusive paths (already skipped) and adult-tagged franchises/leaves."""
    from app.adult_content import (
        adult_subgenre_names_from_db,
        card_has_adult_genres,
        filter_adult_cards,
        filter_adult_movie_leaf_cards,
        movie_work_is_sfw,
        series_franchise_is_sfw,
        series_leaf_is_adult,
        sfw_movie_work_ids,
        sfw_series_franchise_ids,
    )

    extra = adult_subgenre_names_from_db(db)
    sfw_series = sfw_series_franchise_ids(db)
    sfw_movies = sfw_movie_work_ids(db)

    # Books / games allowlists. None = module filter failed → exclude module.
    # Music: blocklist of known-adult artist folder names (unknown artists stay).
    sfw_books: set[str] | None = None
    sfw_games: set[str] | None = None
    adult_music_artists: set[str] | None = None
    try:
        from app.books_catalog_meta import enrich_books_catalog
        from app.books_index import build_books_catalog
        from app.module_catalog_cache import get_or_build_catalog

        root = Path(settings.media_root) if settings.media_root else None
        if root and root.is_dir():
            books_cat = get_or_build_catalog(
                "books",
                media_root=root,
                builder=lambda: build_books_catalog(root),
            )
            books_cat = enrich_books_catalog(db, dict(books_cat))
            kept_books = filter_adult_cards(
                books_cat.get("franchises") or [],
                nsfw_unlocked=False,
                extra_adult_subgenres=extra,
            )
            sfw_books = _sfw_name_set(kept_books)
        else:
            sfw_books = set()
    except Exception:
        sfw_books = None

    try:
        from app.games_catalog_meta import enrich_games_catalog
        from app.games_index import build_games_catalog
        from app.module_catalog_cache import get_or_build_catalog

        root = Path(settings.media_root) if settings.media_root else None
        if root and root.is_dir():
            games_cat = get_or_build_catalog(
                "games",
                media_root=root,
                builder=lambda: build_games_catalog(root),
            )
            games_cat = enrich_games_catalog(db, dict(games_cat))
            kept_games = filter_adult_cards(
                games_cat.get("franchises") or [],
                nsfw_unlocked=False,
                extra_adult_subgenres=extra,
            )
            sfw_games = _sfw_name_set(kept_games)
        else:
            sfw_games = set()
    except Exception:
        sfw_games = None

    try:
        from app.models import Band

        bands = db.query(Band).all()
        items = []
        for b in bands:
            items.append(
                {
                    "id": str(b.bnd_id),
                    "name": b.bnd_name or "",
                    "genre_names": [
                        x.strip()
                        for x in (b.bnd_fk_subgenres or "").split(";")
                        if x.strip()
                    ]
                    or [
                        x.strip()
                        for x in (b.bnd_fk_genres or "").split(";")
                        if x.strip()
                    ],
                }
            )
        all_names = _sfw_name_set(items, id_keys=("name",))
        kept_bands = filter_adult_cards(
            items, nsfw_unlocked=False, extra_adult_subgenres=extra
        )
        sfw_names = _sfw_name_set(kept_bands, id_keys=("name",))
        adult_music_artists = all_names - sfw_names
    except Exception:
        adult_music_artists = None

    # Precompute adult movie leaf titles for path checks
    adult_film_ids: set[str] = set()
    try:
        from app.adult_content import _enriched_movies_catalog

        films = (_enriched_movies_catalog(db).get("films") or [])
        kept = filter_adult_movie_leaf_cards(db, films, nsfw_unlocked=False)
        kept_ids = {str(f.get("id") or "").casefold() for f in kept if isinstance(f, dict)}
        for f in films:
            if not isinstance(f, dict):
                continue
            fid = str(f.get("id") or "").casefold()
            if fid and fid not in kept_ids:
                adult_film_ids.add(fid)
                title = str(f.get("title") or "").casefold()
                if title:
                    adult_film_ids.add(title)
    except Exception:
        adult_film_ids = set()

    kept_pairs: list[dict] = []
    for pair in pairs:
        rel = str(pair.get("path") or "")
        parts = _path_parts(rel)
        if not parts:
            continue
        if any(p.casefold() == "exclusive" for p in parts):
            continue
        module = str(pair.get("module") or "")
        top = parts[0].casefold()

        if module == "music" or top == "music":
            # Music/{Letter}/{Artist}/...
            if len(parts) < 3:
                continue
            if adult_music_artists is None:
                continue
            artist = parts[2]
            if artist.casefold() in adult_music_artists:
                continue
            kept_pairs.append(pair)
            continue

        if module == "series" or top == "series":
            # Series/{Letter}/{Franchise}/{Leaf}/...
            if len(parts) < 3:
                continue
            fran = parts[2]
            if not series_franchise_is_sfw(db, fran, sfw_ids=sfw_series):
                continue
            leaf = parts[3] if len(parts) >= 4 else None
            if leaf and leaf.casefold() not in {
                "gallery",
                "[artwork]",
                "artwork",
            }:
                if series_leaf_is_adult(db, fran, leaf):
                    continue
            kept_pairs.append(pair)
            continue

        if module == "movies" or top == "movies":
            if len(parts) < 3:
                continue
            work = parts[2]
            if not movie_work_is_sfw(db, work, sfw_ids=sfw_movies):
                continue
            # Leaf film folder name
            if len(parts) >= 4:
                leaf_name = parts[3]
                # Strip date prefix "YYYY.MM.DD. Title"
                title = leaf_name
                if ". " in leaf_name:
                    title = leaf_name.split(". ", 1)[-1]
                if title.casefold() in adult_film_ids or leaf_name.casefold() in adult_film_ids:
                    continue
                # Genre check via card_has_adult on enriched hit by title
                try:
                    from app.adult_content import _enriched_movies_catalog

                    hit = next(
                        (
                            f
                            for f in (_enriched_movies_catalog(db).get("films") or [])
                            if isinstance(f, dict)
                            and str(f.get("title") or "").casefold() == title.casefold()
                        ),
                        None,
                    )
                    if hit and card_has_adult_genres(
                        genre_names=hit.get("genre_names")
                        if isinstance(hit.get("genre_names"), list)
                        else None,
                        parent_genre_names=hit.get("parent_genre_names")
                        if isinstance(hit.get("parent_genre_names"), list)
                        else None,
                        extra_adult_subgenres=extra,
                    ):
                        continue
                except Exception:
                    pass
            kept_pairs.append(pair)
            continue

        if module == "books" or top == "books":
            if len(parts) < 3 or sfw_books is None:
                continue
            work = parts[2]
            from app.franchise_index import normalize_franchise_slug

            slug = normalize_franchise_slug(work) or work.casefold()
            if work.casefold() not in sfw_books and slug not in sfw_books:
                continue
            kept_pairs.append(pair)
            continue

        if module == "games" or top == "games":
            # Games/{Platform}/{Letter}/{Franchise}/...
            if len(parts) < 4 or sfw_games is None:
                continue
            fran = parts[3]
            from app.franchise_index import normalize_franchise_slug

            slug = normalize_franchise_slug(fran) or fran.casefold()
            if fran.casefold() not in sfw_games and slug not in sfw_games:
                continue
            kept_pairs.append(pair)
            continue

    return kept_pairs


def _scan_raw_pairs(root: Path) -> tuple[list[dict], list[dict]]:
    all_pairs: list[dict] = []
    all_pairs.extend(_scan_music(root))
    all_pairs.extend(
        _scan_letter_franchise_leaves(root / "Series", root, module="series")
    )
    all_pairs.extend(
        _scan_letter_franchise_leaves(root / "Movies", root, module="movies")
    )
    all_pairs.extend(
        _scan_letter_franchise_leaves(root / "Books", root, module="books")
    )
    all_pairs.extend(_scan_games(root))
    portrait = [p for p in all_pairs if p.get("orientation") == "portrait"]
    landscape = [p for p in all_pairs if p.get("orientation") == "landscape"]
    return portrait, landscape


def get_ambient_photocard_pools(
    db: Session,
) -> tuple[list[dict], list[dict]]:
    """Return (portrait_pairs, landscape_pairs), SFW-filtered and cached."""
    global _cache
    raw = settings.media_root
    if not raw:
        return [], []
    root = Path(raw)
    if not root.is_dir():
        return [], []

    sig = _listing_sig(root)
    now = time.monotonic()
    if (
        _cache
        and _cache[1] == sig
        and (now - _cache[0]) < _CACHE_TTL_SEC
    ):
        return list(_cache[2]), list(_cache[3])

    portrait_raw, landscape_raw = _scan_raw_pairs(root)
    portrait = _filter_sfw_pairs(db, portrait_raw)
    landscape = _filter_sfw_pairs(db, landscape_raw)
    # Strip internal path before caching public payload shape
    def _public(rows: list[dict]) -> tuple[dict, ...]:
        return tuple(
            {
                "id": r["id"],
                "orientation": r["orientation"],
                "module": r.get("module"),
                "front_url": r["front_url"],
                "back_url": r["back_url"],
            }
            for r in rows
        )

    pub_p = _public(portrait)
    pub_l = _public(landscape)
    _cache = (now, sig, pub_p, pub_l)
    return list(pub_p), list(pub_l)


def sample_ambient_photocards(
    db: Session,
    *,
    orientation: str,
    limit: int = 32,
) -> dict:
    orient = (orientation or "portrait").strip().casefold()
    if orient not in {"portrait", "landscape"}:
        orient = "portrait"
    limit = max(0, min(int(limit or 32), 48))

    portrait, landscape = get_ambient_photocard_pools(db)
    pool = portrait if orient == "portrait" else landscape
    total = len(pool)
    if limit <= 0 or total == 0:
        return {
            "orientation": orient,
            "total": total,
            "items": [],
        }
    if total <= limit:
        items = list(pool)
        random.shuffle(items)
    else:
        items = random.sample(pool, limit)
    return {
        "orientation": orient,
        "total": total,
        "items": items,
    }
