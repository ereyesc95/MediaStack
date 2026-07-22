"""Cross-module franchise index for Related media discovery.

Builds a slug-keyed map of Movies, Series, Books, and Games entries that share
the same {Franchise} folder name. See docs/franchise_index.md and
docs/media_library_layout.md.

Status: Phase 1 (index builder) — scan/save/load implemented; API + UI not wired yet.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from app.paths import DATA_DIR

FRANCHISE_INDEX_VERSION = 1

MODULE_MOVIES = "movies"
MODULE_SERIES = "series"
MODULE_BOOKS = "books"
MODULE_GAMES = "games"
MODULE_MUSIC = "music"

EntryKind = Literal["movie", "series", "book", "game", "music"]

# Music artist Video/ — categories shown A–Z when folder exists (Pattern A).
MUSIC_VIDEO_CATEGORIES: tuple[str, ...] = (
    "Documentaries",
    "Interviews",
    "Live",
    "Movies",
    "Music Videos",
    "Promo Material",
    "Series",
)

# Music artist Library/ — categories shown A–Z when folder exists (Pattern A).
MUSIC_LIBRARY_CATEGORIES: tuple[str, ...] = (
    "Articles",
    "Books",
    "Interviews",
    "Magazines",
    "Reviews",
    "Scans",
)

# Games — platform folder vocabulary (display names; case-insensitive match on disk).
GAME_PLATFORMS: tuple[str, ...] = (
    "Amiga",
    "Arcade",
    "Browser",
    "Commodore 64",
    "Flash",
    "Game Boy",
    "Game Boy Advance",
    "Game Boy Color",
    "Mac",
    "Nintendo 3DS",
    "Nintendo 64",
    "Nintendo DS",
    "Nintendo Entertainment System",
    "Nintendo Switch",
    "Nintendo Wii",
    "Nintendo Wii U",
    "PC",
    "PlayStation",
    "PlayStation 2",
    "PlayStation 3",
    "PlayStation 4",
    "PlayStation 5",
    "PlayStation Portable",
    "PlayStation Vita",
    "Sega 32X",
    "Sega CD",
    "Sega Dreamcast",
    "Sega Genesis",
    "Sega Master System",
    "Sega Saturn",
    "Super Nintendo",
    "Xbox",
    "Xbox 360",
    "Xbox One",
    "Xbox Series",
)

DATE_PREFIX_RE = re.compile(
    r"^(\d{4})(?:\.(\d{2})(?:\.(\d{2}))?)?\.\s*(.+)$"
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_franchise_slug(name: str) -> str:
    """Normalize a franchise/work folder name for index keys."""
    text = (name or "").strip()
    text = text.replace("█", "'").replace("■", ",")
    text = re.sub(r"\s+", " ", text)
    return text.casefold()


def parse_dated_folder_name(folder_name: str) -> tuple[str | None, str]:
    """Return (date_iso, title) from 'YYYY.MM.DD. Title' or ('YYYY. Title')."""
    name = folder_name.strip()
    match = DATE_PREFIX_RE.match(name)
    if not match:
        return None, name
    year, month, day, title = match.groups()
    month = month or "01"
    day = day or "01"
    date_iso = f"{year}-{month}-{day}"
    return date_iso, (title or name).strip()


def franchise_index_cache_path() -> Path:
    cache_dir = DATA_DIR / "franchise_index"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / "index.json"


@dataclass
class FranchiseEntry:
    kind: EntryKind
    path: str
    title: str
    date_iso: str | None = None
    letter: str | None = None
    platform: str | None = None
    subseries: str | None = None
    franchise_display: str | None = None


@dataclass
class FranchiseGroup:
    display_name: str
    slug: str
    letter: str | None = None
    entries: list[FranchiseEntry] = field(default_factory=list)


@dataclass
class FranchiseIndex:
    index_version: int = FRANCHISE_INDEX_VERSION
    scanned_at: str = field(default_factory=_now_iso)
    franchises: dict[str, FranchiseGroup] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "index_version": self.index_version,
            "scanned_at": self.scanned_at,
            "franchises": {
                slug: {
                    "display_name": group.display_name,
                    "slug": group.slug,
                    "letter": group.letter,
                    "entries": [asdict(e) for e in group.entries],
                }
                for slug, group in self.franchises.items()
            },
        }


def _register_entry(
    index: FranchiseIndex,
    *,
    slug: str,
    display_name: str,
    letter: str | None,
    entry: FranchiseEntry,
) -> None:
    group = index.franchises.get(slug)
    if not group:
        group = FranchiseGroup(display_name=display_name, slug=slug, letter=letter)
        index.franchises[slug] = group
    seen = {e.path.casefold() for e in group.entries}
    if entry.path.casefold() not in seen:
        group.entries.append(entry)


def _is_meta_folder(name: str) -> bool:
    low = name.casefold().strip()
    return low.startswith("[") or low in {"artwork", "extras"} or name.startswith(".")


def _scan_movies(media_root: Path, index: FranchiseIndex) -> None:
    root = media_root / "Movies"
    if not root.is_dir():
        return
    for letter_dir in sorted(root.iterdir()):
        if not letter_dir.is_dir() or _is_meta_folder(letter_dir.name):
            continue
        for work_dir in sorted(letter_dir.iterdir()):
            if not work_dir.is_dir() or _is_meta_folder(work_dir.name):
                continue
            slug = normalize_franchise_slug(work_dir.name)
            for item_dir in sorted(work_dir.iterdir()):
                if not item_dir.is_dir() or _is_meta_folder(item_dir.name):
                    continue
                date_iso, title = parse_dated_folder_name(item_dir.name)
                rel = item_dir.relative_to(media_root).as_posix()
                _register_entry(
                    index,
                    slug=slug,
                    display_name=work_dir.name,
                    letter=letter_dir.name,
                    entry=FranchiseEntry(
                        kind="movie",
                        path=rel,
                        title=title,
                        date_iso=date_iso,
                        letter=letter_dir.name,
                        franchise_display=work_dir.name,
                    ),
                )


def _scan_books(media_root: Path, index: FranchiseIndex) -> None:
    root = media_root / "Books"
    if not root.is_dir():
        return
    for letter_dir in sorted(root.iterdir()):
        if not letter_dir.is_dir() or _is_meta_folder(letter_dir.name):
            continue
        for work_dir in sorted(letter_dir.iterdir()):
            if not work_dir.is_dir() or _is_meta_folder(work_dir.name):
                continue
            slug = normalize_franchise_slug(work_dir.name)
            for item_dir in sorted(work_dir.iterdir()):
                if not item_dir.is_dir() or _is_meta_folder(item_dir.name):
                    continue
                date_iso, title = parse_dated_folder_name(item_dir.name)
                rel = item_dir.relative_to(media_root).as_posix()
                _register_entry(
                    index,
                    slug=slug,
                    display_name=work_dir.name,
                    letter=letter_dir.name,
                    entry=FranchiseEntry(
                        kind="book",
                        path=rel,
                        title=title,
                        date_iso=date_iso,
                        letter=letter_dir.name,
                        franchise_display=work_dir.name,
                    ),
                )


def _scan_series(media_root: Path, index: FranchiseIndex) -> None:
    root = media_root / "Series"
    if not root.is_dir():
        return
    for letter_dir in sorted(root.iterdir()):
        if not letter_dir.is_dir() or _is_meta_folder(letter_dir.name):
            continue
        for franchise_dir in sorted(letter_dir.iterdir()):
            if not franchise_dir.is_dir() or _is_meta_folder(franchise_dir.name):
                continue
            slug = normalize_franchise_slug(franchise_dir.name)
            franchise_rel = franchise_dir.relative_to(media_root).as_posix()
            _register_entry(
                index,
                slug=slug,
                display_name=franchise_dir.name,
                letter=letter_dir.name,
                entry=FranchiseEntry(
                    kind="series",
                    path=franchise_rel,
                    title=franchise_dir.name,
                    letter=letter_dir.name,
                    franchise_display=franchise_dir.name,
                ),
            )
            for child in sorted(franchise_dir.iterdir()):
                if not child.is_dir() or _is_meta_folder(child.name):
                    continue
                date_iso, sub_title = parse_dated_folder_name(child.name)
                if not date_iso:
                    continue
                rel = child.relative_to(media_root).as_posix()
                _register_entry(
                    index,
                    slug=slug,
                    display_name=franchise_dir.name,
                    letter=letter_dir.name,
                    entry=FranchiseEntry(
                        kind="series",
                        path=rel,
                        title=sub_title,
                        date_iso=date_iso,
                        letter=letter_dir.name,
                        subseries=sub_title,
                        franchise_display=franchise_dir.name,
                    ),
                )
                # Nested dated shows under a hub (e.g. Docuseries containing both seasons)
                for nested in sorted(child.iterdir()):
                    if not nested.is_dir() or _is_meta_folder(nested.name):
                        continue
                    nested_date, nested_title = parse_dated_folder_name(nested.name)
                    if not nested_date:
                        continue
                    # Skip pure season folders — those are episodes, not related titles
                    rest = nested.name
                    dm = DATE_PREFIX_RE.match(nested.name.strip())
                    if dm:
                        rest = nested.name[dm.end() :].lstrip(". ").strip()
                    if rest.casefold().startswith("season") or rest.casefold() == "specials":
                        continue
                    nested_rel = nested.relative_to(media_root).as_posix()
                    _register_entry(
                        index,
                        slug=slug,
                        display_name=franchise_dir.name,
                        letter=letter_dir.name,
                        entry=FranchiseEntry(
                            kind="series",
                            path=nested_rel,
                            title=nested_title,
                            date_iso=nested_date,
                            letter=letter_dir.name,
                            subseries=nested_title,
                            franchise_display=franchise_dir.name,
                        ),
                    )


def _scan_games(media_root: Path, index: FranchiseIndex) -> None:
    root = media_root / "Games"
    if not root.is_dir():
        return
    for platform_dir in sorted(root.iterdir()):
        if not platform_dir.is_dir():
            continue
        for letter_dir in sorted(platform_dir.iterdir()):
            if not letter_dir.is_dir():
                continue
            for franchise_dir in sorted(letter_dir.iterdir()):
                if not franchise_dir.is_dir():
                    continue
                slug = normalize_franchise_slug(franchise_dir.name)
                for item_dir in sorted(franchise_dir.iterdir()):
                    if not item_dir.is_dir():
                        continue
                    date_iso, title = parse_dated_folder_name(item_dir.name)
                    rel = item_dir.relative_to(media_root).as_posix()
                    _register_entry(
                        index,
                        slug=slug,
                        display_name=franchise_dir.name,
                        letter=letter_dir.name,
                        entry=FranchiseEntry(
                            kind="game",
                            path=rel,
                            title=title,
                            date_iso=date_iso,
                            letter=letter_dir.name,
                            platform=platform_dir.name,
                            franchise_display=franchise_dir.name,
                        ),
                    )

def build_franchise_index(media_root: Path) -> FranchiseIndex:
    """Scan media root and build franchise slug index."""
    index = FranchiseIndex()
    if not media_root.is_dir():
        return index
    _scan_movies(media_root, index)
    _scan_series(media_root, index)
    _scan_books(media_root, index)
    _scan_games(media_root, index)
    index.scanned_at = _now_iso()
    return index


def save_franchise_index(index: FranchiseIndex, path: Path | None = None) -> Path:
    target = path or franchise_index_cache_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(index.to_dict(), indent=2), encoding="utf-8")
    return target


def load_franchise_index(path: Path | None = None) -> FranchiseIndex | None:
    target = path or franchise_index_cache_path()
    if not target.is_file():
        return None
    try:
        raw = json.loads(target.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    franchises: dict[str, FranchiseGroup] = {}
    for slug, group in (raw.get("franchises") or {}).items():
        entries = [FranchiseEntry(**e) for e in group.get("entries") or []]
        franchises[slug] = FranchiseGroup(
            display_name=group.get("display_name") or slug,
            slug=slug,
            letter=group.get("letter"),
            entries=entries,
        )
    return FranchiseIndex(
        index_version=int(raw.get("index_version") or FRANCHISE_INDEX_VERSION),
        scanned_at=raw.get("scanned_at") or _now_iso(),
        franchises=franchises,
    )


_KIND_BUCKETS: dict[EntryKind, str] = {
    "movie": "movies",
    "series": "series",
    "book": "books",
    "game": "games",
    "music": "music",
}


def franchise_slug_for_path(index: FranchiseIndex, rel_path: str) -> str | None:
    """Resolve franchise slug for a catalog path (exact or ancestor match)."""
    norm = rel_path.replace("\\", "/").casefold().rstrip("/")
    for group in index.franchises.values():
        for entry in group.entries:
            entry_norm = entry.path.casefold().rstrip("/")
            if norm == entry_norm or norm.startswith(entry_norm + "/"):
                return group.slug
    return None


def related_for_path(index: FranchiseIndex, rel_path: str) -> dict[str, list[dict[str, Any]]]:
    """Return related entries for a catalog path (excluding the path itself)."""
    norm = rel_path.replace("\\", "/").casefold().rstrip("/")
    slug = franchise_slug_for_path(index, rel_path)
    if not slug:
        return {}
    group = index.franchises.get(slug)
    if not group:
        return {}
    out: dict[str, list[dict[str, Any]]] = {
        bucket: [] for bucket in _KIND_BUCKETS.values()
    }
    for entry in group.entries:
        if entry.path.casefold().rstrip("/") == norm:
            continue
        bucket = _KIND_BUCKETS.get(entry.kind, "music")
        out[bucket].append(asdict(entry))
    return out
