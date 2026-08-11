"""Scan Books/{Letter}/{Work}/ into catalog + detail payloads for the Books module.

Disk model (v1):
- Franchise/work root: ``Books/{L}/{Name}/``
- Book cards (C): dated or undated child folders that contain PDFs
- Root PDFs (A): PDFs directly under ``{Name}/`` form one book card for that work
- Volumes: PDF files inside a book folder (no per-volume subfolders)
- Standalone: single book matching the franchise folder name → open leaf directly
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.franchise_index import normalize_franchise_slug, parse_dated_folder_name
from app.media_index import format_display_date
from app.media_item_overview import _file_url
from app.media_paths_util import safe_relative
from app.media_tabs_index import _folder_cover

# v1: Chrome-friendly open-in-tab
PDF_EXTS = {".pdf"}

_META_DIRS = frozenset(
    {
        "[artwork]",
        "artwork",
        "gallery",
        "audio",
        "extras",
        "[extras]",
        "[audio]",
        "covers",
        "renders",
    }
)
_PORTAL_DIRS = frozenset(
    {
        "audio",
        "video",
        "library",
        "gallery",
        "movies",
        "series",
        "books",
        "games",
        "music",
        "extras",
    }
)

_DATE_PREFIX_RE = re.compile(
    r"^(?P<date>\d{4}(?:\.\d{2}(?:\.\d{2})?)?)\.\s*(?P<title>.+)$",
    re.I,
)
_NUMERIC_PREFIX_RE = re.compile(
    r"^(?P<num>\d{1,4})[.\-_\s]+(?P<title>.+)$",
    re.I,
)
_VOLUME_TITLE_RE = re.compile(
    r"^(?:vol(?:ume)?|tome|tom[eo]|book)\s*\.?\s*\d+",
    re.I,
)


def _is_meta_dir(name: str) -> bool:
    return name.casefold() in _META_DIRS or name.startswith(".")


def _is_skip_dir(name: str) -> bool:
    return _is_meta_dir(name) or name.casefold() in _PORTAL_DIRS


def _resolve_media_root(media_root: Path | None = None) -> Path:
    root = Path(media_root or settings.media_root or "")
    if not root.is_dir():
        raise FileNotFoundError("Media root is not configured or missing")
    return root


def _book_id(rel_path: str) -> str:
    digest = hashlib.sha1(rel_path.encode("utf-8")).hexdigest()[:12]
    return f"book_{digest}"


def _names_match(a: str, b: str) -> bool:
    def key(s: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", (s or "").casefold())

    ka, kb = key(a), key(b)
    if not ka or not kb:
        return False
    return ka == kb or ka in kb or kb in ka


def _is_volume_like_title(title: str) -> bool:
    t = (title or "").strip()
    if not t:
        return False
    if _VOLUME_TITLE_RE.match(t):
        return True
    if re.fullmatch(r"#?\d{1,4}", t):
        return True
    return False


def _list_pdfs(folder: Path) -> list[Path]:
    try:
        return sorted(
            (
                p
                for p in folder.iterdir()
                if p.is_file() and p.suffix.lower() in PDF_EXTS
            ),
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        return []


def _folder_has_pdf(folder: Path) -> bool:
    return bool(_list_pdfs(folder))


def parse_volume_filename(filename: str) -> dict:
    """Extract optional date / numeric prefixes from a PDF stem for display + sort."""
    stem = Path(filename).stem.strip()
    date_iso = None
    num = None
    title = stem

    m = _DATE_PREFIX_RE.match(stem)
    if m:
        raw = m.group("date")
        parts = raw.split(".")
        if len(parts) == 1:
            date_iso = f"{parts[0]}-01-01"
        elif len(parts) == 2:
            date_iso = f"{parts[0]}-{parts[1]}-01"
        else:
            date_iso = f"{parts[0]}-{parts[1]}-{parts[2]}"
        title = m.group("title").strip()
        # remaining title may still have a numeric prefix
        m2 = _NUMERIC_PREFIX_RE.match(title)
        if m2:
            try:
                num = int(m2.group("num"))
            except ValueError:
                num = None
            title = m2.group("title").strip()
    else:
        m2 = _NUMERIC_PREFIX_RE.match(stem)
        if m2:
            try:
                num = int(m2.group("num"))
            except ValueError:
                num = None
            title = m2.group("title").strip()

    return {
        "stem": stem,
        "title": title or stem,
        "date_iso": date_iso,
        "display_date": format_display_date(date_iso) if date_iso else None,
        "number": num,
    }


def _volume_sort_key(meta: dict, filename: str) -> tuple:
    date = meta.get("date_iso")
    num = meta.get("number")
    # Date first when present; else numeric; else after numbered, alpha
    if date:
        return (0, date, num if num is not None else 10**9, filename.casefold())
    if num is not None:
        return (1, "", num, filename.casefold())
    return (2, "", 10**9, filename.casefold())


def _match_volume_cover(
    book_dir: Path, media_root: Path, volume_meta: dict, filename: str
) -> str | None:
    """Prefer Gallery/Covers (or Artwork) image matching stem / numeric prefix."""
    from app.series_paths import cover_search_dirs
    from app.gallery import IMAGE_EXTS, _media_url

    stem = (volume_meta.get("stem") or Path(filename).stem).casefold()
    title_key = re.sub(
        r"[^a-z0-9]+", "", (volume_meta.get("title") or "").casefold()
    )
    num = volume_meta.get("number")
    num_token = f"{num:02d}" if isinstance(num, int) else None

    candidates: list[Path] = []
    for d in cover_search_dirs(book_dir):
        try:
            for p in d.iterdir():
                if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
                    candidates.append(p)
        except OSError:
            continue

    def score(p: Path) -> int:
        s = p.stem.casefold()
        if s == stem:
            return 100
        if stem and stem in s:
            return 80
        pk = re.sub(r"[^a-z0-9]+", "", s)
        if title_key and title_key in pk:
            return 60
        if num_token and (
            s.startswith(num_token)
            or re.search(rf"(^|[^0-9]){num}([^0-9]|$)", s)
        ):
            return 40
        return 0

    best = None
    best_score = 0
    for p in candidates:
        sc = score(p)
        if sc > best_score:
            best_score = sc
            best = p
    if best and best_score > 0:
        return _media_url(best, media_root)
    return None


def _list_volumes(book_dir: Path, media_root: Path) -> list[dict]:
    volumes: list[dict] = []
    pdfs = list(_list_pdfs(book_dir))
    # Mid-tier hubs: PDFs live in nested volume folders, not the hub itself.
    if not pdfs:
        try:
            nested_dirs = sorted(
                (
                    p
                    for p in book_dir.iterdir()
                    if p.is_dir() and not _is_skip_dir(p.name)
                ),
                key=lambda p: p.name.casefold(),
            )
        except OSError:
            nested_dirs = []
        for nested in nested_dirs:
            pdfs.extend(_list_pdfs(nested))
    for pdf in pdfs:
        rel = safe_relative(pdf, media_root)
        meta = parse_volume_filename(pdf.name)
        cover = _match_volume_cover(pdf.parent, media_root, meta, pdf.name)
        if not cover:
            cover = _match_volume_cover(book_dir, media_root, meta, pdf.name)
        banner = None
        landscape = None
        try:
            from app.series_index import (
                _series_folder_banner,
                _series_folder_landscape,
            )

            banner = _series_folder_banner(pdf.parent, media_root)
            landscape = _series_folder_landscape(pdf.parent, media_root)
        except Exception:
            pass
        from app.media_item_overview import _format_pages, _pdf_page_count

        page_count = _pdf_page_count(pdf)
        pages_label = _format_pages(page_count)
        volumes.append(
            {
                "id": f"vol_{hashlib.sha1(rel.encode()).hexdigest()[:10]}",
                "label": meta["title"],
                "file_name": pdf.name,
                "play_path": rel,
                "file_url": _file_url(pdf, media_root),
                "open_url": _file_url(pdf, media_root),
                "open_mode": "tab",
                "open_label": "Read",
                "date_iso": meta.get("date_iso"),
                "display_date": meta.get("display_date"),
                "number": meta.get("number"),
                "cover_url": cover,
                "banner_url": banner,
                "portrait_url": cover,
                "landscape_url": landscape,
                "page_count": page_count,
                "pages": pages_label,
            }
        )
    volumes.sort(
        key=lambda v: _volume_sort_key(
            {
                "date_iso": v.get("date_iso"),
                "number": v.get("number"),
            },
            v.get("file_name") or "",
        )
    )
    return volumes


def _book_cover(book_dir: Path, media_root: Path) -> str | None:
    from app.series_index import _series_folder_cover

    return _series_folder_cover(book_dir, media_root) or _folder_cover(
        book_dir, media_root
    )


def _work_cover(work_dir: Path, media_root: Path, books: list[dict]) -> str | None:
    """Franchise art, else first book / first volume cover."""
    from app.series_index import _series_folder_cover

    cover = _series_folder_cover(work_dir, media_root) or _folder_cover(
        work_dir, media_root
    )
    if cover:
        return cover
    for b in books:
        if b.get("cover_url"):
            return b["cover_url"]
        if b.get("portrait_url"):
            return b["portrait_url"]
    return None


def _work_art(work_dir: Path, media_root: Path, resolver, books: list[dict]) -> str | None:
    art = resolver(work_dir, media_root)
    if art:
        return art
    for b in books:
        folder = b.get("folder_path")
        if not folder:
            continue
        p = media_root / folder
        if p.is_dir():
            art = resolver(p, media_root)
            if art:
                return art
    return None


def _book_card_from_dir(
    book_dir: Path,
    media_root: Path,
    *,
    title: str | None = None,
    date_iso: str | None = None,
) -> dict:
    from app.series_index import (
        _series_folder_banner,
        _series_folder_cover,
        _series_folder_landscape,
    )
    from app.series_paths import find_badge_file, find_logo_file

    rel = book_dir.relative_to(media_root).as_posix()
    if title is None or date_iso is None:
        parsed_date, parsed_title = parse_dated_folder_name(book_dir.name)
        date_iso = date_iso if date_iso is not None else parsed_date
        title = title or parsed_title or book_dir.name

    volumes = _list_volumes(book_dir, media_root)
    primary = volumes[0] if volumes else None
    logo_url, icon_url = find_logo_file(book_dir, media_root)
    cover = _book_cover(book_dir, media_root)
    # Prefer book-series (mid-tier) art; only fall back to a volume cover when
    # the series folder itself has no artwork.
    if not cover and primary and primary.get("cover_url"):
        # Still avoid using a volume folder path as the card identity; cover only.
        cover = primary["cover_url"]

    n = len(volumes)
    return {
        "id": _book_id(rel),
        "title": title,
        "date_iso": date_iso,
        "display_date": format_display_date(date_iso) if date_iso else None,
        "folder_path": rel,
        "folder_name": book_dir.name,
        "path": rel,
        "cover_url": cover,
        "portrait_url": _series_folder_cover(book_dir, media_root) or cover,
        "landscape_url": _series_folder_landscape(book_dir, media_root),
        "banner_url": _series_folder_banner(book_dir, media_root),
        "logo_url": logo_url,
        "icon_url": icon_url,
        "badge_url": find_badge_file(book_dir, media_root),
        "has_pdf": n > 0,
        "volume_count": n,
        "open_url": (primary or {}).get("file_url"),
        "open_mode": "tab" if primary else None,
        "open_label": "Read" if primary else None,
        "volumes": volumes,
    }


def _list_books(work_dir: Path, media_root: Path) -> list[dict]:
    """Discover book works under a franchise/work folder (A+C + mid-tier)."""
    books: list[dict] = []
    root_pdfs = _list_pdfs(work_dir)

    try:
        children = sorted(
            (
                p
                for p in work_dir.iterdir()
                if p.is_dir() and not _is_skip_dir(p.name)
            ),
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        children = []

    work_children: list[Path] = []
    for child in children:
        date_iso, title = parse_dated_folder_name(child.name)
        # Skip pure volume-named dated folders as separate cards only when
        # they have no PDFs of their own weirdness — user said no vol folders;
        # any child with PDFs (or nested) is a work card.
        if _folder_has_pdf(child):
            work_children.append(child)
            continue
        # Mid-tier hub (dated/undated) with nested PDF folders → one card for
        # the hub; volumes are aggregated from nested folders in _list_volumes.
        try:
            nested = [
                n
                for n in child.iterdir()
                if n.is_dir() and not _is_skip_dir(n.name) and _folder_has_pdf(n)
            ]
        except OSError:
            nested = []
        if nested:
            work_children.append(child)
        elif _is_volume_like_title(title or child.name):
            # Legacy empty volume folder — ignore
            continue
        elif date_iso:
            # Dated folder without PDFs yet — still a card placeholder
            work_children.append(child)

    for child in work_children:
        date_iso, title = parse_dated_folder_name(child.name)
        books.append(
            _book_card_from_dir(
                child, media_root, title=title or child.name, date_iso=date_iso
            )
        )

    if root_pdfs:
        # A: PDFs at franchise/work root → one card for the work itself
        books.append(
            _book_card_from_dir(
                work_dir,
                media_root,
                title=work_dir.name,
                date_iso=None,
            )
        )

    # Dedupe by folder_path (root card + child shouldn't collide)
    seen: set[str] = set()
    unique: list[dict] = []
    for b in books:
        key = (b.get("folder_path") or "").casefold()
        if key in seen:
            continue
        seen.add(key)
        unique.append(b)

    unique.sort(
        key=lambda b: (
            b.get("date_iso") or "9999",
            (b.get("title") or "").casefold(),
        )
    )
    return unique


def iter_work_dirs(media_root: Path | None = None) -> list[tuple[Path, str]]:
    root = Path(media_root or settings.media_root or "")
    books_root = root / "Books"
    out: list[tuple[Path, str]] = []
    if not books_root.is_dir():
        return out
    try:
        letters = sorted(
            (p for p in books_root.iterdir() if p.is_dir()),
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        return out
    for letter_dir in letters:
        if _is_skip_dir(letter_dir.name):
            continue
        letter = letter_dir.name
        try:
            works = sorted(letter_dir.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            continue
        for work_dir in works:
            if not work_dir.is_dir() or _is_skip_dir(work_dir.name):
                continue
            out.append((work_dir, letter))
    return out


def find_work_dir(
    work_id: str, media_root: Path | None = None
) -> tuple[Path, str] | None:
    want = (work_id or "").casefold().strip()
    if not want:
        return None
    want_compact = want.replace("-", " ").replace("_", " ")
    want_compact = " ".join(want_compact.split())
    for work_dir, letter in iter_work_dirs(media_root):
        slug = normalize_franchise_slug(work_dir.name)
        name = work_dir.name.casefold()
        if (
            slug == want
            or name == want
            or slug == want_compact
            or name == want_compact
            or slug.replace(" ", "-") == want
            or name.replace(" ", "-") == want
        ):
            return work_dir, letter
    return None


def find_book_dir(
    book_id: str, media_root: Path | None = None
) -> tuple[Path, Path, str] | None:
    """Return (book_dir, work_dir, letter)."""
    want = (book_id or "").strip()
    if not want:
        return None
    root = _resolve_media_root(media_root)
    for work_dir, letter in iter_work_dirs(root):
        for book in _list_books(work_dir, root):
            if book.get("id") == want:
                folder = book.get("folder_path") or ""
                book_dir = root / folder
                if book_dir.is_dir():
                    return book_dir, work_dir, letter
        # also allow raw folder name match
        for book in _list_books(work_dir, root):
            if (book.get("folder_name") or "").casefold() == want.casefold():
                folder = book.get("folder_path") or ""
                book_dir = root / folder
                if book_dir.is_dir():
                    return book_dir, work_dir, letter
    return None


def _work_card(work_dir: Path, letter: str, media_root: Path) -> dict:
    from app.series_paths import find_badge_file, find_logo_file
    from app.series_index import (
        _series_folder_banner,
        _series_folder_cover,
        _series_folder_landscape,
    )

    books = _list_books(work_dir, media_root)
    logo_url, icon_url = find_logo_file(work_dir, media_root)
    standalone = False
    primary_book_id = None
    if len(books) == 1:
        only = books[0]
        standalone = _names_match(work_dir.name, only.get("title") or "") or (
            (only.get("folder_path") or "").casefold()
            == work_dir.relative_to(media_root).as_posix().casefold()
        )
        primary_book_id = only.get("id")
    # No child books but also no PDFs — empty franchise card
    return {
        "id": normalize_franchise_slug(work_dir.name) or work_dir.name.casefold(),
        "name": work_dir.name,
        "letter": letter,
        "slug": normalize_franchise_slug(work_dir.name),
        "folder_path": work_dir.relative_to(media_root).as_posix(),
        "cover_url": _work_cover(work_dir, media_root, books),
        "portrait_url": _work_art(
            work_dir, media_root, _series_folder_cover, books
        )
        or _work_cover(work_dir, media_root, books),
        "landscape_url": _work_art(
            work_dir, media_root, _series_folder_landscape, books
        ),
        "banner_url": _work_art(
            work_dir, media_root, _series_folder_banner, books
        ),
        "logo_url": logo_url,
        "icon_url": icon_url,
        "badge_url": find_badge_file(work_dir, media_root),
        "book_count": len(books),
        "film_count": len(books),  # SeriesFranchiseCard compat
        "books": books,
        "films": books,  # reuse movies-shaped franchise page mapping
        "is_standalone": standalone,
        "primary_book_id": primary_book_id if standalone else None,
        "primary_film_id": primary_book_id if standalone else None,
        "subseries_count": 0,
        "season_count": len(books),
        "subseries": [],
    }


def _title_letter(title: str | None) -> str:
    t = (title or "").strip()
    if not t:
        return "#"
    ch = t[0].upper()
    return ch if "A" <= ch <= "Z" else "#"


def build_books_catalog(media_root: Path | None = None) -> dict:
    root = Path(media_root or settings.media_root or "")
    franchises = [
        _work_card(work_dir, letter, root)
        for work_dir, letter in iter_work_dirs(root)
    ]
    franchises.sort(key=lambda f: (f.get("name") or "").casefold())
    books: list[dict] = []
    for card in franchises:
        for book in card.get("books") or []:
            books.append(
                {
                    **book,
                    "work_id": card["id"],
                    "work_name": card["name"],
                    "letter": _title_letter(book.get("title")),
                    "work_letter": card["letter"],
                    "is_standalone": bool(card.get("is_standalone")),
                }
            )
    books.sort(
        key=lambda b: (
            b.get("date_iso") or "9999",
            (b.get("title") or "").casefold(),
        )
    )
    return {
        "franchises": franchises,
        "books": books,
        "films": books,  # MoviesHome/catalog reuse helpers
        "scanned_at": datetime.now(timezone.utc).isoformat() if franchises else None,
    }


def build_work_detail(work_id: str, media_root: Path | None = None) -> dict | None:
    root = _resolve_media_root(media_root)
    found = find_work_dir(work_id, root)
    if not found:
        return None
    work_dir, letter = found
    card = _work_card(work_dir, letter, root)
    from app.series_index import _has_gallery

    return {
        **card,
        "kind": "franchise",
        "has_gallery": _has_gallery(work_dir),
        "has_series": False,
        "has_movies": False,
        "has_books": card["book_count"] > 0,
    }


def build_book_detail(book_id: str, media_root: Path | None = None) -> dict | None:
    root = _resolve_media_root(media_root)
    found = find_book_dir(book_id, root)
    if not found:
        return None
    book_dir, work_dir, letter = found
    from app.series_index import (
        _has_gallery,
        _series_cover_back,
        _series_folder_banner,
        _series_folder_cover,
        _series_folder_landscape,
    )
    from app.series_paths import find_badge_file, find_logo_file
    from app.series_artwork import resolve_series_photocards

    card = _book_card_from_dir(book_dir, root)
    work_card = _work_card(work_dir, letter, root)
    volumes = card.get("volumes") or []
    return {
        **card,
        "kind": "book",
        "cover_back_url": _series_cover_back(book_dir, root),
        "banner_url": card.get("banner_url")
        or card.get("landscape_url")
        or card.get("portrait_url"),
        "photocards": resolve_series_photocards(book_dir, root),
        "has_gallery": _has_gallery(book_dir),
        "versions": volumes,  # film-page reuse
        "volumes": volumes,
        "trailer_url": None,
        "seasons": [],
        "subseries": [],
        "episodes": [],
        "movies": [],
        "work": {
            "id": work_card["id"],
            "name": work_card["name"],
            "letter": letter,
            "folder_path": work_card["folder_path"],
            "cover_url": work_card["cover_url"],
            "logo_url": work_card["logo_url"],
            "icon_url": work_card["icon_url"],
            "is_standalone": work_card["is_standalone"],
        },
    }


def resolve_books_path(
    rel_path: str, media_root: Path | None = None
) -> dict | None:
    root = _resolve_media_root(media_root)
    norm = (rel_path or "").replace("\\", "/").strip("/")
    if not norm:
        return None
    want = norm.casefold()
    for work_dir, letter in iter_work_dirs(root):
        work_rel = work_dir.relative_to(root).as_posix()
        work_id = normalize_franchise_slug(work_dir.name) or work_dir.name.casefold()
        if work_rel.casefold() == want:
            return {
                "work_id": work_id,
                "book_id": None,
                "letter": letter,
                "name": work_dir.name,
            }
        for book in _list_books(work_dir, root):
            item_rel = (book.get("folder_path") or "").casefold()
            if item_rel == want or want.startswith(item_rel + "/"):
                return {
                    "work_id": work_id,
                    "book_id": book.get("id"),
                    "letter": letter,
                    "name": work_dir.name,
                    "book_title": book.get("title"),
                }
    return None
