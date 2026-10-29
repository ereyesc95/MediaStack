"""HobbyStack — per-profile collections with a shared optional field bag + presets."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import HobbyCollection, HobbyFieldOption, HobbyItem
from app.paths import ASSETS_DIR, ensure_assets_dir

PRESETS = (
    "generic",
    "custom",
    "marbles",
    "puzzle",
    "cube",
    "uno",
    "poker",
    "fillable_album",
)

# Hub specialty tiles (General removed; custom collections are named cards).
HUB_PRESETS = (
    "marbles",
    "puzzle",
    "cube",
    "uno",
    "poker",
    "fillable_album",
)

PRESET_LABELS = {
    "marbles": "Marbles",
    "puzzle": "Puzzle",
    "cube": "Cubes",
    "uno": "Uno",
    "poker": "Poker",
    "fillable_album": "Albums",
    "generic": "General",
    "custom": "Custom",
}

# Named / freeform collections (many allowed per profile).
MULTI_INSTANCE_PRESETS = frozenset({"custom", "generic"})

# Older hub labels → current (so existing rows pick up renames).
_LEGACY_PRESET_NAMES: dict[str, frozenset[str]] = {
    "fillable_album": frozenset({"fillable album", "fillable_album"}),
    "cube": frozenset({"rubik / cube", "rubik/cube", "rubik", "cube"}),
}

# Columns shown per preset (shared bag; unused stay null)
PRESET_FIELDS: dict[str, tuple[str, ...]] = {
    "marbles": ("type", "size", "style", "theme", "quantity", "image"),
    "puzzle": ("title", "brand", "theme", "size", "box_size", "image", "shop_url"),
    "cube": (
        "title",
        "brand",
        "category",
        "theme",
        "image",
        "shop_url",
        "tutorial_url",
    ),
    "uno": ("title", "brand", "theme", "image", "shop_url"),
    "poker": ("title", "brand", "theme", "type", "image", "shop_url"),
    "fillable_album": (
        "title",
        "year",
        "brand",
        "theme",
        "type",
        "total_slots",
        "missing",
        "image",
        "shop_url",
    ),
    "generic": (
        "title",
        "year",
        "brand",
        "theme",
        "type",
        "category",
        "size",
        "style",
        "quantity",
        "total_slots",
        "box_size",
        "missing",
        "duplicates",
        "image",
        "shop_url",
        "tutorial_url",
        "notes",
    ),
    "custom": (
        "title",
        "year",
        "brand",
        "theme",
        "type",
        "category",
        "size",
        "style",
        "quantity",
        "box_size",
        "image",
        "shop_url",
        "notes",
    ),
}

# Builtin field catalog for New/Edit collection column picker.
# default_on → preselected for new custom collections.
FIELD_CATALOG: tuple[dict, ...] = (
    {"key": "image", "label": "Image", "default_on": True, "computed": False},
    {"key": "quantity", "label": "Number", "default_on": True, "computed": False},
    {"key": "title", "label": "Title", "default_on": True, "computed": False},
    {"key": "year", "label": "Year", "default_on": True, "computed": False},
    {"key": "brand", "label": "Brand", "default_on": True, "computed": False},
    {"key": "theme", "label": "Franchise", "default_on": True, "computed": False},
    {"key": "type", "label": "Type", "default_on": True, "computed": False},
    {"key": "category", "label": "Category", "default_on": True, "computed": False},
    {"key": "size", "label": "Size / Pieces", "default_on": True, "computed": False},
    {"key": "style", "label": "Style", "default_on": True, "computed": False},
    {"key": "box_size", "label": "Box size", "default_on": True, "computed": False},
    {"key": "total_slots", "label": "Total", "default_on": False, "computed": False},
    {"key": "missing", "label": "Missing", "default_on": False, "computed": False},
    {"key": "duplicates", "label": "Duplicates", "default_on": False, "computed": False},
    {
        "key": "items_collected",
        "label": "Collected",
        "default_on": False,
        "computed": True,
    },
    {
        "key": "completion_pct",
        "label": "Complete %",
        "default_on": False,
        "computed": True,
    },
    {"key": "shop_url", "label": "Shop", "default_on": True, "computed": False},
    {"key": "tutorial_url", "label": "Tutorial", "default_on": False, "computed": False},
    {"key": "pdf_url", "label": "PDF", "default_on": False, "computed": True},
    {"key": "notes", "label": "Notes", "default_on": True, "computed": False},
)

BUILTIN_FIELD_KEYS = frozenset(f["key"] for f in FIELD_CATALOG)
COMPUTED_FIELD_KEYS = frozenset(
    f["key"] for f in FIELD_CATALOG if f.get("computed")
)
DEFAULT_CUSTOM_FIELDS = tuple(
    f["key"] for f in FIELD_CATALOG if f.get("default_on")
)

# When a collection is limited, these leave the Columns picker and become
# collection-level info (Collected / Complete % stay optional column toggles).
LIMITED_META_FIELD_KEYS = frozenset(
    {
        "year",
        "brand",
        "theme",
        "total_slots",
        "missing",
        "duplicates",
        "shop_url",
        "tutorial_url",
        "pdf_url",
    }
)
LIMITED_AUTO_COLUMN_KEYS = ("items_collected", "completion_pct")

_CUSTOM_KEY_RE = re.compile(r"^custom_[a-z0-9_]{1,40}$")
_SAFE_CUSTOM_SLUG_RE = re.compile(r"[^a-z0-9]+")

DEFAULT_MARBLE_STYLES = (
    "confetti",
    "swirl",
    "tile swirl",
    "black",
    "milky",
    "tiger",
    "cat's eye",
    "corkscrew",
    "oily",
    "solid",
    "iridescent",
    "patch",
    "game",
    "opaque",
    "slag",
    "agate",
    "clear",
)

_SAFE_NAME_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')
# Books leaf / PDF stem: ``2018.10.23. Title`` or ``2018. Title``
_BOOKS_DATE_TITLE_RE = re.compile(
    r"^(?P<year>\d{4})(?:\.\d{2}\.\d{2})?\.\s+(?P<title>.+)$",
    re.IGNORECASE,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _norm_book_title(value: str | None) -> str:
    text = (value or "").replace("█", "'").replace("■", ",")
    text = text.casefold()
    text = re.sub(r"[^\w\s]+", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def _parse_year(value: object | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        year = int(str(value).strip()[:4])
    except (TypeError, ValueError):
        return None
    if 1000 <= year <= 9999:
        return year
    return None


def _books_pdf_media_url(rel_posix: str) -> str:
    from urllib.parse import quote

    return f"/api/media/file?path={quote(rel_posix, safe='/')}"


def _iter_books_pdf_hits(root: Path) -> list[tuple[int, str, str, str]]:
    """Scan Books PDFs → (year, franchise_norm, title_norm, relative path)."""
    books = root / "Books"
    if not books.is_dir():
        return []
    hits: list[tuple[int, str, str, str]] = []
    try:
        letter_dirs = [p for p in books.iterdir() if p.is_dir()]
    except OSError:
        return []
    for letter_dir in letter_dirs:
        try:
            work_dirs = [p for p in letter_dir.iterdir() if p.is_dir()]
        except OSError:
            continue
        for work_dir in work_dirs:
            franchise_n = _norm_book_title(work_dir.name)
            if not franchise_n:
                continue
            # Pattern B: Books/{Letter}/{Book Title}/{date}. {Book Title}.pdf
            try:
                for pdf in work_dir.glob("*.pdf"):
                    m = _BOOKS_DATE_TITLE_RE.match(pdf.stem)
                    if not m:
                        continue
                    year = int(m.group("year"))
                    title_n = _norm_book_title(m.group("title"))
                    if title_n:
                        hits.append(
                            (
                                year,
                                franchise_n,
                                title_n,
                                pdf.relative_to(root).as_posix(),
                            )
                        )
            except OSError:
                pass
            # Pattern A: Books/{Letter}/{Franchise}/{date}. {Title}/….pdf
            try:
                children = list(work_dir.iterdir())
            except OSError:
                continue
            for child in children:
                if not child.is_dir():
                    continue
                m = _BOOKS_DATE_TITLE_RE.match(child.name)
                if not m:
                    continue
                year = int(m.group("year"))
                title_n = _norm_book_title(m.group("title"))
                pdf_hit: Path | None = None
                preferred = child / f"{child.name}.pdf"
                if preferred.is_file():
                    pdf_hit = preferred
                else:
                    try:
                        pdfs = sorted(child.glob("*.pdf"))
                    except OSError:
                        pdfs = []
                    if pdfs:
                        pdf_hit = pdfs[0]
                if pdf_hit is None or not title_n:
                    continue
                hits.append(
                    (
                        year,
                        franchise_n,
                        title_n,
                        pdf_hit.relative_to(root).as_posix(),
                    )
                )
    return hits


def resolve_album_pdf_url(
    title: str | None,
    year: int | str | None,
    theme: str | None = None,
    *,
    index: list[tuple[int, str, str, str]] | None = None,
) -> str | None:
    """Resolve album PDF via Theme (franchise) + year, then title, then year-only."""
    want_year = _parse_year(year)
    if want_year is None:
        return None
    want_theme = _norm_book_title(theme)
    want_title = _norm_book_title(title)
    if not want_theme and not want_title:
        return None
    from app.config import settings

    root = Path(settings.media_root or "")
    if not root.is_dir():
        return None
    hits = index if index is not None else _iter_books_pdf_hits(root)

    def _pick(
        rows: list[tuple[int, str, str, str]], *, require_title: bool
    ) -> str | None:
        exact: str | None = None
        fuzzy: str | None = None
        any_year: str | None = None
        for _y, _fr, htitle, rel in rows:
            if any_year is None:
                any_year = rel
            if not want_title:
                continue
            if htitle == want_title:
                exact = rel
                break
            if want_title in htitle or htitle in want_title:
                fuzzy = fuzzy or rel
        if exact:
            return exact
        if fuzzy:
            return fuzzy
        if require_title:
            return None
        return any_year

    if want_theme:
        scoped = [h for h in hits if h[0] == want_year and h[1] == want_theme]
        # Title match under franchise, else any PDF for that franchise+year.
        rel = _pick(scoped, require_title=False)
        return _books_pdf_media_url(rel) if rel else None

    # No theme: title+year across Books (standalone or leaf title).
    year_hits = [h for h in hits if h[0] == want_year]
    rel = _pick(year_hits, require_title=True)
    return _books_pdf_media_url(rel) if rel else None


def list_franchise_theme_options() -> list[str]:
    """Franchise folder names from Books/Games/Movies/Series (+ Music artists, index)."""
    from app.config import settings
    from app.franchise_index import build_franchise_index, load_franchise_index

    names: dict[str, str] = {}

    def _add(raw: str | None) -> None:
        text = (raw or "").strip()
        if not text:
            return
        key = text.casefold()
        if key not in names:
            names[key] = text

    root = Path(settings.media_root or "")
    if root.is_dir():
        for module in ("Books", "Movies", "Series", "Games"):
            base = root / module
            if not base.is_dir():
                continue
            try:
                for letter in base.iterdir():
                    if not letter.is_dir():
                        continue
                    # Games: Games/{Platform}/{Letter}/{Franchise}
                    # Others: {Module}/{Letter}/{Franchise}
                    if module == "Games":
                        try:
                            letter_dirs = [
                                p for p in letter.iterdir() if p.is_dir()
                            ]
                        except OSError:
                            continue
                        for letter_dir in letter_dirs:
                            try:
                                for work in letter_dir.iterdir():
                                    if work.is_dir():
                                        _add(work.name)
                            except OSError:
                                continue
                    else:
                        try:
                            for work in letter.iterdir():
                                if work.is_dir():
                                    _add(work.name)
                        except OSError:
                            continue
            except OSError:
                continue

        music = root / "Music"
        if music.is_dir():
            try:
                for letter in music.iterdir():
                    if not letter.is_dir():
                        continue
                    try:
                        for artist in letter.iterdir():
                            if artist.is_dir():
                                _add(artist.name)
                    except OSError:
                        continue
            except OSError:
                pass

    try:
        index = load_franchise_index()
        if index is None and root.is_dir():
            index = build_franchise_index(root)
        if index is not None:
            for group in index.franchises.values():
                _add(getattr(group, "display_name", None))
    except Exception:
        pass

    return sorted(names.values(), key=lambda s: s.casefold())


def _json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [str(x).strip() for x in data if str(x).strip()]
    return []


def _dump_list(items: list[str] | None) -> str | None:
    cleaned = [str(x).strip() for x in (items or []) if str(x).strip()]
    return json.dumps(cleaned, ensure_ascii=False) if cleaned else None


def collectibles_dir() -> Path:
    ensure_assets_dir()
    path = ASSETS_DIR / "collectibles"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_filename(name: str) -> str:
    cleaned = _SAFE_NAME_RE.sub(" ", (name or "").strip()).strip(" .")
    return cleaned or "item"


def icon_url(path: str | None) -> str | None:
    if not path:
        return None
    name = Path(path).name
    return f"/api/assets/collectibles/{name}"


def item_image_url(local_path: str | None, remote_url: str | None) -> str | None:
    if local_path:
        return icon_url(local_path)
    return (remote_url or "").strip() or None


def collection_is_private(row: HobbyCollection) -> bool:
    return bool(getattr(row, "hbc_private", False))


def _display_collection_name(row: HobbyCollection) -> str:
    """Prefer current preset label when the stored name is a known legacy default."""
    if row.hbc_preset in MULTI_INSTANCE_PRESETS:
        return (row.hbc_name or "").strip() or PRESET_LABELS.get(
            row.hbc_preset, "Collection"
        )
    label = PRESET_LABELS.get(row.hbc_preset)
    if not label:
        return row.hbc_name
    stored = (row.hbc_name or "").strip()
    if not stored:
        return label
    legacy = _LEGACY_PRESET_NAMES.get(row.hbc_preset, frozenset())
    if stored.casefold() == label.casefold() or stored.casefold() in legacy:
        return label
    return stored


def _parse_json_obj(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _parse_custom_field_defs(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[dict] = []
    seen: set[str] = set()
    for item in data:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()
        label = str(item.get("label") or "").strip()
        if not key or not _CUSTOM_KEY_RE.match(key) or key in seen:
            continue
        if not label:
            label = key
        seen.add(key)
        out.append({"key": key, "label": label})
    return out


def _default_fields_for_preset(preset: str) -> list[str]:
    return list(PRESET_FIELDS.get(preset, PRESET_FIELDS["custom"]))


def collection_field_keys(row: HobbyCollection) -> list[str]:
    raw = getattr(row, "hbc_fields_json", None)
    if raw:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = None
        if isinstance(data, list):
            custom_keys = {
                d["key"] for d in _parse_custom_field_defs(
                    getattr(row, "hbc_custom_fields_json", None)
                )
            }
            out: list[str] = []
            seen: set[str] = set()
            for item in data:
                key = str(item or "").strip()
                if not key or key in seen:
                    continue
                if key in BUILTIN_FIELD_KEYS or key in custom_keys:
                    seen.add(key)
                    out.append(key)
            if out:
                return out
    fields = _default_fields_for_preset(row.hbc_preset)
    # Album template always exposes computed columns in the table.
    if row.hbc_preset == "fillable_album":
        for extra in ("items_collected", "completion_pct", "pdf_url"):
            if extra not in fields:
                fields.append(extra)
    return fields


def collection_field_labels(row: HobbyCollection) -> dict[str, str]:
    labels = {f["key"]: f["label"] for f in FIELD_CATALOG}
    if row.hbc_preset == "puzzle":
        labels["size"] = "Pieces"
    for cf in _parse_custom_field_defs(
        getattr(row, "hbc_custom_fields_json", None)
    ):
        labels[cf["key"]] = cf["label"]
    return labels


def _normalize_fields_selection(
    fields: list[str] | None,
    custom_defs: list[dict],
) -> list[str]:
    custom_keys = {d["key"] for d in custom_defs}
    selected = [str(f).strip() for f in (fields or []) if str(f).strip()]
    # Auto-require deps for computed columns.
    if "pdf_url" in selected:
        for dep in ("title", "year", "theme"):
            if dep not in selected:
                selected.append(dep)
    # Item-level Collected/Complete% need per-row Total+Missing. Limited
    # collections compute those at collection level instead — callers strip
    # LIMITED_META_FIELD_KEYS afterward when limited.
    if "items_collected" in selected or "completion_pct" in selected:
        for dep in ("total_slots", "missing"):
            if dep not in selected:
                selected.append(dep)
    out: list[str] = []
    seen: set[str] = set()
    for key in selected:
        if key in seen:
            continue
        if key in BUILTIN_FIELD_KEYS or key in custom_keys:
            seen.add(key)
            out.append(key)
    return out or list(DEFAULT_CUSTOM_FIELDS)


def _slug_custom_key(label: str, used: set[str]) -> str:
    base = _SAFE_CUSTOM_SLUG_RE.sub("_", (label or "").casefold()).strip("_")
    base = base[:32] or "field"
    key = f"custom_{base}"
    if key not in used and _CUSTOM_KEY_RE.match(key):
        return key
    n = 2
    while True:
        cand = f"custom_{base}_{n}"[:48]
        if cand not in used and _CUSTOM_KEY_RE.match(cand):
            return cand
        n += 1


def field_catalog_payload() -> dict:
    return {
        "limited_meta_keys": sorted(LIMITED_META_FIELD_KEYS),
        "fields": [
            {
                "key": f["key"],
                "label": f["label"],
                "default_on": bool(f["default_on"]),
                "computed": bool(f.get("computed")),
            }
            for f in FIELD_CATALOG
        ],
        "default_fields": list(DEFAULT_CUSTOM_FIELDS),
    }


def _collection_meta(row: HobbyCollection) -> dict:
    meta = _parse_json_obj(getattr(row, "hbc_meta_json", None))
    missing = meta.get("missing")
    if not isinstance(missing, list):
        missing = []
    missing = [str(x).strip() for x in missing if str(x).strip()]
    items_list = meta.get("items_list")
    if not isinstance(items_list, list):
        items_list = []
    items_list = [str(x).strip() for x in items_list if str(x).strip()]
    duplicates = meta.get("duplicates")
    if not isinstance(duplicates, list):
        duplicates = []
    year = _parse_year(meta.get("year"))
    return {
        "year": year,
        "brand": (str(meta.get("brand") or "").strip() or None),
        "theme": (str(meta.get("theme") or "").strip() or None),
        "items_list": items_list,
        "missing": missing,
        "duplicates": [str(x).strip() for x in duplicates if str(x).strip()],
        "shop_url": (str(meta.get("shop_url") or "").strip() or None),
        "tutorial_url": (str(meta.get("tutorial_url") or "").strip() or None),
    }


def _ensure_items_list_catalog(
    meta: dict,
    *,
    seed_tags: list[str] | None = None,
    item_titles: list[str] | None = None,
) -> list[str]:
    """Keep Items list stable when Missing shrinks.

    Seeds an empty catalog from ``seed_tags`` (Missing *before* a removal),
    current Missing, and collected item titles. Never removes catalog entries;
    collected titles are always folded in additively so a reduced Missing list
    cannot erase the reference checklist.
    """
    seeded: list[str] = [
        str(x).strip() for x in (meta.get("items_list") or []) if str(x).strip()
    ]

    def _add(tag: object) -> None:
        t = str(tag or "").strip()
        if not t:
            return
        if any(_tag_matches(s, t) for s in seeded):
            return
        seeded.append(t)

    if not seeded:
        for tag in seed_tags or []:
            _add(tag)
        for tag in meta.get("missing") or []:
            _add(tag)
    for title in item_titles or []:
        _add(title)
    meta["items_list"] = seeded
    return seeded


def _dump_collection_meta(meta: dict) -> str | None:
    payload = {
        "year": meta.get("year"),
        "brand": meta.get("brand") or None,
        "theme": meta.get("theme") or None,
        "items_list": list(meta.get("items_list") or []),
        "missing": list(meta.get("missing") or []),
        "duplicates": list(meta.get("duplicates") or []),
        "shop_url": meta.get("shop_url") or None,
        "tutorial_url": meta.get("tutorial_url") or None,
    }
    # Drop empty lists / None-only payload noise but keep structure.
    if not any(
        [
            payload["year"] is not None,
            payload["brand"],
            payload["theme"],
            payload["items_list"],
            payload["missing"],
            payload["duplicates"],
            payload["shop_url"],
            payload["tutorial_url"],
        ]
    ):
        return None
    return json.dumps(payload, ensure_ascii=False)


def _collection_is_limited(row: HobbyCollection) -> bool:
    if bool(getattr(row, "hbc_limited", 0)):
        return True
    # Legacy: collection_total alone implied a finite set.
    total = getattr(row, "hbc_collection_total", None)
    try:
        return total is not None and int(total) > 0
    except (TypeError, ValueError):
        return False


def _normalize_tag_list(raw: object | None) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        parts: list[str] = []
        for line in raw.replace("\r", "").split("\n"):
            for piece in re.split(r"[,|;]+", line):
                p = piece.strip()
                if p:
                    parts.append(p)
        raw = parts
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        text = str(item).strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
    return out


def _tag_matches(a: str, b: str) -> bool:
    left = (a or "").strip().casefold()
    right = (b or "").strip().casefold()
    if not left or not right:
        return False
    if left == right:
        return True
    # "#12" / "12" convenience for sticker-style tags
    def _num(s: str) -> str | None:
        t = s.lstrip("#").strip()
        return t if t.isdigit() else None

    na, nb = _num(left), _num(right)
    return na is not None and na == nb


def serialize_collection(
    row: HobbyCollection,
    *,
    item_count: int = 0,
    item_titles: list[str] | None = None,
) -> dict:
    custom_defs = _parse_custom_field_defs(
        getattr(row, "hbc_custom_fields_json", None)
    )
    raw_fields = collection_field_keys(row)
    limited = _collection_is_limited(row)
    collection_total = getattr(row, "hbc_collection_total", None)
    try:
        collection_total = (
            int(collection_total) if collection_total is not None else None
        )
    except (TypeError, ValueError):
        collection_total = None
    if collection_total is not None and collection_total <= 0:
        collection_total = None
    meta = _collection_meta(row)
    missing = meta["missing"]
    if limited:
        # Display/heal catalog without treating Missing as the Items list.
        items_list = _ensure_items_list_catalog(
            meta,
            seed_tags=list(missing),
            item_titles=item_titles,
        )
    else:
        items_list = list(meta.get("items_list") or [])
    missing_count = len(missing)
    items_collected = None
    completion_pct = None
    if limited and collection_total is not None:
        items_collected = max(0, int(collection_total) - missing_count)
        completion_pct = (
            round(100.0 * items_collected / collection_total, 1)
            if collection_total > 0
            else 0.0
        )
    is_complete = bool(
        limited
        and collection_total is not None
        and collection_total > 0
        and missing_count == 0
    )
    pdf_url = None
    if limited and "pdf_url" in raw_fields:
        pdf_url = resolve_album_pdf_url(
            _display_collection_name(row),
            meta.get("year"),
            theme=meta.get("theme"),
        )
    # Columns never include limited meta keys while limited (pdf stays
    # as a stored toggle for the header, not a table column).
    if limited:
        fields = [f for f in raw_fields if f not in LIMITED_META_FIELD_KEYS]
    else:
        fields = raw_fields
    return {
        "id": row.hbc_id,
        "name": _display_collection_name(row),
        "preset": row.hbc_preset,
        "preset_label": PRESET_LABELS.get(row.hbc_preset, row.hbc_preset),
        "fields": fields,
        "field_labels": collection_field_labels(row),
        "custom_fields": custom_defs,
        "is_custom": row.hbc_preset in MULTI_INSTANCE_PRESETS,
        "icon_url": icon_url(row.hbc_icon_path)
        or "/api/assets/media/hobbies",
        "icon_path": row.hbc_icon_path,
        "private": collection_is_private(row),
        "item_count": item_count,
        "limited": limited,
        "collection_total": collection_total,
        "year": meta.get("year") if limited else None,
        "brand": meta.get("brand") if limited else None,
        "theme": meta.get("theme") if limited else None,
        "items_list": items_list if limited else [],
        "missing": missing if limited else [],
        "duplicates": meta.get("duplicates") if limited else [],
        "shop_url": meta.get("shop_url") if limited else None,
        "tutorial_url": meta.get("tutorial_url") if limited else None,
        "items_collected": items_collected if limited else None,
        "missing_count": missing_count if limited else None,
        "completion_pct": completion_pct if limited else None,
        "pdf_url": pdf_url,
        "pdf_enabled": bool(limited and "pdf_url" in raw_fields),
        "is_complete": is_complete,
        "created_at": row.hbc_created_at,
        "updated_at": row.hbc_updated_at,
    }


def serialize_item(
    row: HobbyItem,
    preset: str,
    *,
    fields: list[str] | None = None,
) -> dict:
    missing = _json_list(row.hbi_missing_json)
    duplicates = _json_list(row.hbi_duplicates_json)
    total_slots = row.hbi_total_slots
    items_collected = None
    missing_count = None
    completion_pct = None
    if total_slots is not None and total_slots >= 0:
        missing_count = len(missing)
        items_collected = max(0, int(total_slots) - missing_count)
        completion_pct = (
            round(100.0 * items_collected / total_slots, 1) if total_slots > 0 else 0.0
        )
    year = getattr(row, "hbi_year", None)
    extras = _parse_json_obj(getattr(row, "hbi_extra_json", None))
    payload = {
        "id": row.hbi_id,
        "collection_id": row.hbi_collection_id,
        "title": row.hbi_title,
        "brand": row.hbi_brand,
        "theme": row.hbi_theme,
        "type": row.hbi_type,
        "category": row.hbi_category,
        "size": row.hbi_size,
        "style": row.hbi_style,
        "quantity": row.hbi_quantity if row.hbi_quantity is not None else 1,
        "total_slots": total_slots,
        "year": year,
        "items_collected": items_collected,
        "missing_count": missing_count,
        "completion_pct": completion_pct,
        "box_size": row.hbi_box_size,
        "missing": missing,
        "duplicates": duplicates,
        "image_path": row.hbi_image_path,
        "image_url": row.hbi_image_url,
        "image": item_image_url(row.hbi_image_path, row.hbi_image_url),
        "shop_url": row.hbi_shop_url,
        "tutorial_url": row.hbi_tutorial_url,
        "notes": row.hbi_notes,
        "extra": extras,
        "pdf_url": None,
        "preset": preset,
        "created_at": row.hbi_created_at,
        "updated_at": row.hbi_updated_at,
    }
    for key, val in extras.items():
        if key.startswith("custom_"):
            payload[key] = val
    want_pdf = (
        fields is None and preset == "fillable_album"
    ) or (fields is not None and "pdf_url" in fields)
    if want_pdf:
        payload["pdf_url"] = resolve_album_pdf_url(
            row.hbi_title, year, theme=row.hbi_theme
        )
    return payload


def _collection_franchise_theme(coll: dict) -> str:
    """Franchise for a collection: limited meta theme, else empty."""
    if not coll.get("limited"):
        return ""
    return str(coll.get("theme") or "").strip()


def _item_effective_theme(row: HobbyItem, coll: dict | None) -> str:
    """Item theme column, else limited collection Franchise meta."""
    item_theme = (row.hbi_theme or "").strip()
    if item_theme:
        return item_theme
    if coll:
        return _collection_franchise_theme(coll)
    return ""


def list_hobby_themes(
    db: Session, user_id: int, *, nsfw_unlocked: bool = False
) -> list[dict]:
    """Distinct franchises from item themes and limited collection meta (A→Z)."""
    collections, _hidden = list_collections(
        db, user_id, nsfw_unlocked=nsfw_unlocked
    )
    by_id = {int(c["id"]): c for c in collections if c.get("id") is not None}
    if not by_id:
        return []
    by_key: dict[str, dict] = {}

    def _bump(theme: str, n: int = 1) -> None:
        label = (theme or "").strip()
        if not label:
            return
        key = label.casefold()
        entry = by_key.get(key)
        if entry is None:
            by_key[key] = {"theme": label, "item_count": max(0, int(n))}
        else:
            entry["item_count"] = int(entry["item_count"]) + int(n)

    # Collection-level Franchise (limited) must appear even with zero items.
    for coll in by_id.values():
        meta_theme = _collection_franchise_theme(coll)
        if meta_theme:
            _bump(meta_theme, 0)

    rows = db.scalars(
        select(HobbyItem).where(
            HobbyItem.hbi_user_id == user_id,
            HobbyItem.hbi_collection_id.in_(list(by_id.keys())),
        )
    ).all()
    for row in rows:
        coll = by_id.get(int(row.hbi_collection_id))
        theme = _item_effective_theme(row, coll)
        if theme:
            _bump(theme, 1)
    return sorted(by_key.values(), key=lambda t: str(t["theme"]).casefold())


def list_items_by_theme(
    db: Session,
    user_id: int,
    theme: str,
    *,
    nsfw_unlocked: bool = False,
) -> list[dict]:
    """Items matching franchise via item theme or limited collection meta."""
    want = (theme or "").strip().casefold()
    if not want:
        return []
    collections, _hidden = list_collections(
        db, user_id, nsfw_unlocked=nsfw_unlocked
    )
    by_id = {int(c["id"]): c for c in collections if c.get("id") is not None}
    if not by_id:
        return []
    rows = db.scalars(
        select(HobbyItem).where(
            HobbyItem.hbi_user_id == user_id,
            HobbyItem.hbi_collection_id.in_(list(by_id.keys())),
        )
    ).all()
    out: list[dict] = []
    for row in rows:
        coll = by_id.get(int(row.hbi_collection_id))
        if not coll:
            continue
        effective = _item_effective_theme(row, coll)
        if not effective or effective.casefold() != want:
            continue
        preset = str(coll.get("preset") or "generic")
        ser = serialize_item(row, preset, fields=list(coll.get("fields") or []))
        # Themes table never includes PDF / album-only computed fields.
        ser.pop("pdf_url", None)
        ser["collection_id"] = coll["id"]
        ser["collection_name"] = coll.get("name") or coll.get("preset_label")
        ser["collection_preset"] = preset
        if not (ser.get("theme") or "").strip() and effective:
            ser["theme"] = effective
        # Limited sets: Franchises table inherits collection meta (not per-item).
        if coll.get("limited"):
            for key in ("brand", "year", "theme", "shop_url", "tutorial_url"):
                coll_val = coll.get(key)
                if coll_val is None or coll_val == "":
                    continue
                ser[key] = coll_val
            if not (ser.get("type") or "").strip() and not (
                ser.get("category") or ""
            ).strip():
                ser["type"] = "Limited Edition"
        out.append(ser)
    out.sort(
        key=lambda it: (
            str(it.get("collection_name") or "").casefold(),
            str(it.get("title") or "").casefold(),
        )
    )
    return out


def list_presets() -> list[dict]:
    """Specialty hub presets only (no General / Custom templates)."""
    from app.hobby_assets import hobby_preset_urls

    out: list[dict] = []
    for p in HUB_PRESETS:
        arts = hobby_preset_urls(p)
        out.append(
            {
                "id": p,
                "label": PRESET_LABELS[p],
                "fields": list(PRESET_FIELDS[p]),
                "cover_url": arts["cover_url"],
                "logo_url": arts["logo_url"],
                "icon_url": arts["icon_url"],
            }
        )
    return out


def list_collections(
    db: Session, user_id: int, *, nsfw_unlocked: bool = False
) -> tuple[list[dict], list[str]]:
    """Return (visible collections, presets hidden because private + locked)."""
    rows = db.scalars(
        select(HobbyCollection)
        .where(HobbyCollection.hbc_user_id == user_id)
        .order_by(HobbyCollection.hbc_name.asc())
    ).all()
    out: list[dict] = []
    hidden_private_presets: list[str] = []
    for row in rows:
        if collection_is_private(row) and not nsfw_unlocked:
            hidden_private_presets.append(row.hbc_preset)
            continue
        items = db.scalars(
            select(HobbyItem).where(HobbyItem.hbi_collection_id == row.hbc_id)
        ).all()
        titles = [
            (it.hbi_title or "").strip()
            for it in items
            if (it.hbi_title or "").strip()
        ]
        meta_before = _collection_meta(row)
        payload = serialize_collection(
            row, item_count=len(items), item_titles=titles
        )
        # Persist healed / expanded Items list for limited collections.
        if _collection_is_limited(row) and payload.get("items_list"):
            before_list = list(meta_before.get("items_list") or [])
            after_list = list(payload.get("items_list") or [])
            if after_list != before_list:
                healed = dict(meta_before)
                healed["items_list"] = after_list
                row.hbc_meta_json = _dump_collection_meta(healed)
        out.append(payload)
    db.commit()
    return out, hidden_private_presets


def get_collection(db: Session, user_id: int, collection_id: int) -> HobbyCollection | None:
    row = db.get(HobbyCollection, collection_id)
    if not row or row.hbc_user_id != user_id:
        return None
    return row


def require_collection_access(
    row: HobbyCollection | None, *, nsfw_unlocked: bool
) -> HobbyCollection:
    if not row:
        raise LookupError("Collection not found")
    if collection_is_private(row) and not nsfw_unlocked:
        raise PermissionError("Private collection")
    return row


def get_collection_by_preset(
    db: Session, user_id: int, preset: str
) -> HobbyCollection | None:
    preset_key = (preset or "").strip().casefold()
    if preset_key not in PRESETS:
        return None
    return db.scalars(
        select(HobbyCollection).where(
            HobbyCollection.hbc_user_id == user_id,
            HobbyCollection.hbc_preset == preset_key,
        )
    ).first()


def _normalize_collection_total(value: object | None) -> int | None:
    if value is None or value is False:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        n = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as e:
        raise ValueError("Total must be a positive whole number") from e
    if n <= 0:
        return None
    return n


def _apply_limited_fields(
    fields: list[str] | None,
    *,
    limited: bool,
    pdf_enabled: bool,
) -> list[str] | None:
    if fields is None:
        return None
    selected = [str(f).strip() for f in fields if str(f).strip()]
    if not limited:
        return selected
    # Drop meta keys from columns; keep Collected / Complete % only if requested.
    out = [f for f in selected if f not in LIMITED_META_FIELD_KEYS]
    if pdf_enabled and "pdf_url" not in out:
        # Stored toggle only — stripped from table columns on serialize.
        out.append("pdf_url")
    elif not pdf_enabled:
        out = [f for f in out if f != "pdf_url"]
    return out


def _validate_limited_meta(
    *,
    total: int | None,
    missing: list[str],
    item_titles: list[str] | None = None,
    allow_missing_item_conflicts: bool = False,
) -> list[str]:
    """Return conflicting missing tags that match existing item titles.

    Raises ValueError when missing exceeds total.
    """
    if total is None:
        raise ValueError("Limited collections require a Total greater than 0")
    if len(missing) > total:
        raise ValueError(
            f"Missing ({len(missing)}) cannot exceed Total ({total})"
        )
    conflicts: list[str] = []
    if item_titles:
        for tag in missing:
            if any(_tag_matches(tag, title) for title in item_titles if title):
                conflicts.append(tag)
    if conflicts and not allow_missing_item_conflicts:
        raise ValueError(
            "MISSING_ITEM_CONFLICT:"
            + ",".join(conflicts)
        )
    return conflicts


def create_collection(
    db: Session,
    user_id: int,
    *,
    name: str,
    preset: str,
    icon_path: str | None = None,
    fields: list[str] | None = None,
    custom_fields: list[dict] | None = None,
    limited: bool = False,
    collection_total: int | None = None,
    meta: dict | None = None,
    pdf_enabled: bool = False,
    allow_missing_item_conflicts: bool = False,
) -> dict:
    title = (name or "").strip()
    if not title:
        raise ValueError("Name is required")
    preset_key = (preset or "custom").strip().casefold()
    if preset_key not in PRESETS:
        raise ValueError("Unknown preset")
    if preset_key not in MULTI_INSTANCE_PRESETS:
        if get_collection_by_preset(db, user_id, preset_key):
            raise ValueError("A collection for this preset already exists")
    custom_defs = _parse_custom_field_defs(
        json.dumps(custom_fields or [], ensure_ascii=False)
    )
    limited_on = bool(limited)
    total = _normalize_collection_total(collection_total) if limited_on else None
    meta_in = dict(meta or {})
    items_list = _normalize_tag_list(meta_in.get("items_list"))
    missing = _normalize_tag_list(meta_in.get("missing"))
    # Create: Items list seeds Missing when Missing was omitted.
    if limited_on and items_list and not missing:
        missing = list(items_list)
    if limited_on and not items_list and missing:
        items_list = list(missing)
    duplicates = _normalize_tag_list(meta_in.get("duplicates"))
    if limited_on:
        _validate_limited_meta(
            total=total,
            missing=missing,
            allow_missing_item_conflicts=True,
        )
        if fields is None:
            fields = list(DEFAULT_CUSTOM_FIELDS)
        field_keys = _apply_limited_fields(
            _normalize_fields_selection(fields, custom_defs),
            limited=True,
            pdf_enabled=pdf_enabled,
        )
    elif fields is not None or custom_defs or preset_key in MULTI_INSTANCE_PRESETS:
        field_keys = _normalize_fields_selection(
            fields if fields is not None else list(DEFAULT_CUSTOM_FIELDS),
            custom_defs,
        )
    else:
        field_keys = None
    meta_payload = {
        "year": _parse_year(meta_in.get("year")) if limited_on else None,
        "brand": (str(meta_in.get("brand") or "").strip() or None)
        if limited_on
        else None,
        "theme": (str(meta_in.get("theme") or "").strip() or None)
        if limited_on
        else None,
        "items_list": items_list if limited_on else [],
        "missing": missing if limited_on else [],
        "duplicates": duplicates if limited_on else [],
        "shop_url": (str(meta_in.get("shop_url") or "").strip() or None)
        if limited_on
        else None,
        "tutorial_url": (str(meta_in.get("tutorial_url") or "").strip() or None)
        if limited_on
        else None,
    }
    now = _now_iso()
    row = HobbyCollection(
        hbc_user_id=user_id,
        hbc_name=title,
        hbc_preset=preset_key,
        hbc_icon_path=icon_path,
        hbc_fields_json=(
            json.dumps(field_keys, ensure_ascii=False) if field_keys else None
        ),
        hbc_custom_fields_json=(
            json.dumps(custom_defs, ensure_ascii=False) if custom_defs else None
        ),
        hbc_limited=1 if limited_on else 0,
        hbc_collection_total=total if limited_on else None,
        hbc_meta_json=_dump_collection_meta(meta_payload) if limited_on else None,
        hbc_created_at=now,
        hbc_updated_at=now,
    )
    db.add(row)
    db.flush()
    if preset_key == "marbles":
        _seed_marble_styles(db, user_id, row.hbc_id)
    db.commit()
    db.refresh(row)
    return serialize_collection(row, item_count=0)


def create_custom_collection(
    db: Session,
    user_id: int,
    *,
    name: str,
    fields: list[str] | None = None,
    custom_fields: list[dict] | None = None,
    icon_path: str | None = None,
    limited: bool = False,
    collection_total: int | None = None,
    meta: dict | None = None,
    pdf_enabled: bool = False,
    allow_missing_item_conflicts: bool = False,
) -> dict:
    """Create a named multi-instance collection (hub card)."""
    defs_in = list(custom_fields or [])
    normalized_defs: list[dict] = []
    used_keys: set[str] = set(BUILTIN_FIELD_KEYS)
    for item in defs_in:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        key = str(item.get("key") or "").strip()
        if not label:
            continue
        if not key or not _CUSTOM_KEY_RE.match(key) or key in used_keys:
            key = _slug_custom_key(label, used_keys)
        used_keys.add(key)
        normalized_defs.append({"key": key, "label": label})
    return create_collection(
        db,
        user_id,
        name=name,
        preset="custom",
        icon_path=icon_path,
        fields=fields,
        custom_fields=normalized_defs,
        limited=limited,
        collection_total=collection_total,
        meta=meta,
        pdf_enabled=pdf_enabled,
        allow_missing_item_conflicts=allow_missing_item_conflicts,
    )


def ensure_collection_for_preset(
    db: Session,
    user_id: int,
    preset: str,
    *,
    nsfw_unlocked: bool = False,
) -> dict:
    """Return the user's collection for ``preset``, creating it if missing.

    One collection per preset per profile — name defaults to the preset label.
    Private collections are inaccessible until NSFW is unlocked.
    """
    preset_key = (preset or "generic").strip().casefold()
    if preset_key not in PRESETS:
        raise ValueError("Unknown preset")
    existing = get_collection_by_preset(db, user_id, preset_key)
    if existing:
        if collection_is_private(existing) and not nsfw_unlocked:
            raise PermissionError("Private collection")
        n = len(
            db.scalars(
                select(HobbyItem).where(
                    HobbyItem.hbi_collection_id == existing.hbc_id
                )
            ).all()
        )
        return serialize_collection(existing, item_count=n)
    return create_collection(
        db,
        user_id,
        name=PRESET_LABELS.get(preset_key, preset_key),
        preset=preset_key,
    )


def update_collection(
    db: Session,
    user_id: int,
    collection_id: int,
    *,
    name: str | None = None,
    icon_path: str | None = None,
    clear_icon: bool = False,
    private: bool | None = None,
    fields: list[str] | None = None,
    custom_fields: list[dict] | None = None,
    set_fields: bool = False,
    limited: bool | None = None,
    collection_total: object | None = ...,
    meta: dict | None = None,
    set_meta: bool = False,
    pdf_enabled: bool | None = None,
    allow_missing_item_conflicts: bool = False,
) -> dict | None:
    row = get_collection(db, user_id, collection_id)
    if not row:
        return None
    if name is not None:
        title = name.strip()
        if not title:
            raise ValueError("Name is required")
        row.hbc_name = title
    if clear_icon:
        row.hbc_icon_path = None
    elif icon_path is not None:
        row.hbc_icon_path = icon_path
    if private is not None:
        row.hbc_private = 1 if private else 0

    limited_on = (
        bool(limited) if limited is not None else _collection_is_limited(row)
    )
    if limited is not None:
        row.hbc_limited = 1 if limited_on else 0
        if not limited_on:
            row.hbc_collection_total = None
            row.hbc_meta_json = None

    current_meta = _collection_meta(row)
    if set_meta and meta is not None and limited_on:
        items_list = _normalize_tag_list(meta.get("items_list"))
        missing = _normalize_tag_list(meta.get("missing"))
        if not items_list and missing and "items_list" not in meta:
            items_list = list(current_meta.get("items_list") or missing)
        current_meta = {
            "year": _parse_year(meta.get("year")),
            "brand": (str(meta.get("brand") or "").strip() or None),
            "theme": (str(meta.get("theme") or "").strip() or None),
            "items_list": items_list,
            "missing": missing,
            "duplicates": _normalize_tag_list(meta.get("duplicates")),
            "shop_url": (str(meta.get("shop_url") or "").strip() or None),
            "tutorial_url": (str(meta.get("tutorial_url") or "").strip() or None),
        }

    if collection_total is not ...:
        row.hbc_collection_total = (
            _normalize_collection_total(collection_total) if limited_on else None
        )

    if limited_on and (set_meta or collection_total is not ... or limited is not None):
        items = db.scalars(
            select(HobbyItem).where(HobbyItem.hbi_collection_id == row.hbc_id)
        ).all()
        titles = [(it.hbi_title or "").strip() for it in items]
        conflicts = _validate_limited_meta(
            total=row.hbc_collection_total,
            missing=list(current_meta.get("missing") or []),
            item_titles=titles,
            allow_missing_item_conflicts=allow_missing_item_conflicts,
        )
        if conflicts and allow_missing_item_conflicts:
            # Strip tags that already exist as items.
            current_meta["missing"] = [
                t
                for t in (current_meta.get("missing") or [])
                if not any(_tag_matches(t, c) for c in conflicts)
            ]
        row.hbc_meta_json = _dump_collection_meta(current_meta)

    pdf_on = (
        bool(pdf_enabled)
        if pdf_enabled is not None
        else ("pdf_url" in collection_field_keys(row))
    )

    if set_fields or fields is not None or custom_fields is not None or limited is not None or pdf_enabled is not None:
        defs_in = (
            custom_fields
            if custom_fields is not None
            else _parse_custom_field_defs(
                getattr(row, "hbc_custom_fields_json", None)
            )
        )
        normalized_defs: list[dict] = []
        used_keys: set[str] = set(BUILTIN_FIELD_KEYS)
        for item in defs_in or []:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or "").strip()
            key = str(item.get("key") or "").strip()
            if not label and not key:
                continue
            if not label:
                label = key
            if not key or not _CUSTOM_KEY_RE.match(key) or key in used_keys:
                key = _slug_custom_key(label, used_keys)
            used_keys.add(key)
            normalized_defs.append({"key": key, "label": label})
        selected = (
            fields
            if fields is not None
            else collection_field_keys(row)
        )
        field_keys = _normalize_fields_selection(selected, normalized_defs)
        if limited_on:
            field_keys = _apply_limited_fields(
                field_keys, limited=True, pdf_enabled=pdf_on
            ) or field_keys
        row.hbc_fields_json = json.dumps(field_keys, ensure_ascii=False)
        row.hbc_custom_fields_json = (
            json.dumps(normalized_defs, ensure_ascii=False)
            if normalized_defs
            else None
        )
    row.hbc_updated_at = _now_iso()
    db.commit()
    db.refresh(row)
    n = len(
        db.scalars(select(HobbyItem).where(HobbyItem.hbi_collection_id == row.hbc_id)).all()
    )
    return serialize_collection(row, item_count=n)


def delete_collection(db: Session, user_id: int, collection_id: int) -> bool:
    row = get_collection(db, user_id, collection_id)
    if not row:
        return False
    items = db.scalars(
        select(HobbyItem).where(HobbyItem.hbi_collection_id == collection_id)
    ).all()
    for it in items:
        _delete_asset_file(it.hbi_image_path)
        db.delete(it)
    opts = db.scalars(
        select(HobbyFieldOption).where(HobbyFieldOption.hfo_collection_id == collection_id)
    ).all()
    for opt in opts:
        db.delete(opt)
    _delete_asset_file(row.hbc_icon_path)
    db.delete(row)
    db.commit()
    return True


def _delete_asset_file(rel: str | None) -> None:
    if not rel:
        return
    path = Path(rel)
    if not path.is_file():
        # stored as filename under collectibles
        cand = collectibles_dir() / Path(rel).name
        if cand.is_file():
            path = cand
        else:
            return
    try:
        path.unlink()
    except OSError:
        pass


def save_uploaded_image(
    *,
    collection_name: str,
    stem: str,
    data: bytes,
    ext: str,
) -> str:
    """Write under assets/collectibles/; return stored filename."""
    folder = collectibles_dir()
    safe_coll = _safe_filename(collection_name)
    safe_stem = _safe_filename(stem)
    suffix = ext if ext.startswith(".") else f".{ext}"
    if suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
        suffix = ".png"
    filename = f"{safe_coll} - {safe_stem}{suffix.lower()}"
    dest = folder / filename
    dest.write_bytes(data)
    return filename


def list_items(
    db: Session,
    user_id: int,
    collection_id: int,
    *,
    q: str | None = None,
    type_filter: str | None = None,
    size_filter: str | None = None,
    style_filter: str | None = None,
    theme_filter: str | None = None,
    category_filter: str | None = None,
    sort: str = "title",
    order: str = "asc",
) -> list[dict]:
    coll = get_collection(db, user_id, collection_id)
    if not coll:
        return []
    rows = db.scalars(
        select(HobbyItem).where(
            HobbyItem.hbi_collection_id == collection_id,
            HobbyItem.hbi_user_id == user_id,
        )
    ).all()
    qf = (q or "").strip().casefold()
    pdf_index: list[tuple[int, str, str, str]] | None = None
    if "pdf_url" in collection_field_keys(coll):
        from app.config import settings

        media_root = Path(settings.media_root or "")
        pdf_index = (
            _iter_books_pdf_hits(media_root) if media_root.is_dir() else []
        )
    out: list[dict] = []
    for row in rows:
        if type_filter and (row.hbi_type or "").casefold() != type_filter.casefold():
            continue
        if size_filter and (row.hbi_size or "").casefold() != size_filter.casefold():
            continue
        if style_filter and (row.hbi_style or "").casefold() != style_filter.casefold():
            continue
        if theme_filter and (row.hbi_theme or "").casefold() != theme_filter.casefold():
            continue
        if category_filter and (row.hbi_category or "").casefold() != category_filter.casefold():
            continue
        field_keys = collection_field_keys(coll)
        ser = serialize_item(row, coll.hbc_preset, fields=field_keys)
        if "pdf_url" in field_keys and pdf_index is not None:
            ser["pdf_url"] = resolve_album_pdf_url(
                row.hbi_title,
                getattr(row, "hbi_year", None),
                theme=row.hbi_theme,
                index=pdf_index,
            )
        if qf:
            hay = " ".join(
                str(ser.get(k) or "")
                for k in (
                    "title",
                    "brand",
                    "theme",
                    "type",
                    "category",
                    "size",
                    "style",
                    "box_size",
                    "notes",
                    "year",
                )
            ).casefold()
            if qf not in hay:
                continue
        out.append(ser)

    reverse = order.casefold() == "desc"
    sort_key = (sort or "title").casefold()

    def key_fn(it: dict):
        if sort_key == "quantity":
            return it.get("quantity") or 0
        if sort_key == "completion":
            return it.get("completion_pct") if it.get("completion_pct") is not None else -1
        if sort_key in it:
            val = it.get(sort_key)
            if isinstance(val, (int, float)):
                return val
            return (val or "").casefold()
        return (it.get("title") or "").casefold()

    out.sort(key=key_fn, reverse=reverse)
    return out


def _find_marble_batch(
    db: Session,
    collection_id: int,
    user_id: int,
    *,
    type_v: str | None,
    size_v: str | None,
    style_v: str | None,
) -> HobbyItem | None:
    rows = db.scalars(
        select(HobbyItem).where(
            HobbyItem.hbi_collection_id == collection_id,
            HobbyItem.hbi_user_id == user_id,
        )
    ).all()
    for row in rows:
        if (row.hbi_type or "").casefold() != (type_v or "").casefold():
            continue
        if (row.hbi_size or "").casefold() != (size_v or "").casefold():
            continue
        if (row.hbi_style or "").casefold() != (style_v or "").casefold():
            continue
        return row
    return None


def upsert_item(
    db: Session,
    user_id: int,
    collection_id: int,
    body: dict,
    *,
    item_id: int | None = None,
) -> dict:
    coll = get_collection(db, user_id, collection_id)
    if not coll:
        raise ValueError("Collection not found")

    qty = body.get("quantity")
    try:
        qty_i = int(qty) if qty is not None else 1
    except (TypeError, ValueError):
        qty_i = 1

    # Marbles: merge into existing type/size/style batch
    if coll.hbc_preset == "marbles" and item_id is None:
        existing = _find_marble_batch(
            db,
            collection_id,
            user_id,
            type_v=body.get("type"),
            size_v=body.get("size"),
            style_v=body.get("style"),
        )
        if existing:
            existing.hbi_quantity = (existing.hbi_quantity or 0) + max(qty_i, 1)
            if body.get("image_path"):
                existing.hbi_image_path = body["image_path"]
            if body.get("image_url") is not None:
                existing.hbi_image_url = body.get("image_url") or None
            existing.hbi_updated_at = _now_iso()
            _remember_field_values(db, user_id, collection_id, body)
            db.commit()
            db.refresh(existing)
            return serialize_item(existing, coll.hbc_preset)

    row: HobbyItem | None = None
    if item_id is not None:
        row = db.get(HobbyItem, item_id)
        if not row or row.hbi_user_id != user_id or row.hbi_collection_id != collection_id:
            raise ValueError("Item not found")

    now = _now_iso()
    if row is None:
        row = HobbyItem(
            hbi_collection_id=collection_id,
            hbi_user_id=user_id,
            hbi_quantity=max(qty_i, 1),
            hbi_created_at=now,
            hbi_updated_at=now,
        )
        db.add(row)
    else:
        row.hbi_updated_at = now
        if qty is not None:
            row.hbi_quantity = max(qty_i, 0)

    for attr, key in (
        ("hbi_title", "title"),
        ("hbi_brand", "brand"),
        ("hbi_theme", "theme"),
        ("hbi_type", "type"),
        ("hbi_category", "category"),
        ("hbi_size", "size"),
        ("hbi_style", "style"),
        ("hbi_box_size", "box_size"),
        ("hbi_image_url", "image_url"),
        ("hbi_shop_url", "shop_url"),
        ("hbi_tutorial_url", "tutorial_url"),
        ("hbi_notes", "notes"),
    ):
        if key in body:
            val = body.get(key)
            setattr(row, attr, (str(val).strip() if val is not None else None) or None)

    if "image_path" in body:
        row.hbi_image_path = body.get("image_path") or None
    if "total_slots" in body:
        ts = body.get("total_slots")
        try:
            row.hbi_total_slots = int(ts) if ts is not None and str(ts).strip() != "" else None
        except (TypeError, ValueError):
            row.hbi_total_slots = None
    if "year" in body:
        row.hbi_year = _parse_year(body.get("year"))
    if "missing" in body:
        row.hbi_missing_json = _dump_list(body.get("missing") or [])
    if "duplicates" in body:
        row.hbi_duplicates_json = _dump_list(body.get("duplicates") or [])

    # Custom text columns → hbi_extra_json
    custom_defs = _parse_custom_field_defs(
        getattr(coll, "hbc_custom_fields_json", None)
    )
    custom_keys = {d["key"] for d in custom_defs}
    if custom_keys:
        extras = _parse_json_obj(getattr(row, "hbi_extra_json", None))
        touched = False
        body_extra = body.get("extra") if isinstance(body.get("extra"), dict) else {}
        for key in custom_keys:
            if key in body:
                val = body.get(key)
                extras[key] = (
                    str(val).strip() if val is not None and str(val).strip() else ""
                )
                touched = True
            elif key in body_extra:
                val = body_extra.get(key)
                extras[key] = (
                    str(val).strip() if val is not None and str(val).strip() else ""
                )
                touched = True
        if touched:
            cleaned = {k: v for k, v in extras.items() if v}
            row.hbi_extra_json = (
                json.dumps(cleaned, ensure_ascii=False) if cleaned else None
            )

    # Qty 0 → delete (marbles decrement path)
    if row.hbi_quantity is not None and int(row.hbi_quantity) <= 0:
        title_for_restore = (row.hbi_title or "").strip()
        _delete_asset_file(row.hbi_image_path)
        db.delete(row)
        db.commit()
        return {
            "deleted": True,
            "id": item_id,
            "title": title_for_restore or None,
            "limited": _collection_is_limited(coll),
        }

    # Limited sets: drop matching Missing tags when an item is saved.
    # Items list is the catalog and must not shrink with Missing.
    if _collection_is_limited(coll):
        title = (row.hbi_title or "").strip()
        if title:
            meta = _collection_meta(coll)
            before = list(meta.get("missing") or [])
            after = [t for t in before if not _tag_matches(t, title)]
            if len(after) != len(before):
                _ensure_items_list_catalog(
                    meta, seed_tags=before, item_titles=[title]
                )
                meta["missing"] = after
                coll.hbc_meta_json = _dump_collection_meta(meta)
                coll.hbc_updated_at = _now_iso()

    _remember_field_values(db, user_id, collection_id, body)
    db.commit()
    db.refresh(row)
    return serialize_item(
        row, coll.hbc_preset, fields=collection_field_keys(coll)
    )


def adjust_quantity(
    db: Session, user_id: int, collection_id: int, item_id: int, delta: int
) -> dict:
    row = db.get(HobbyItem, item_id)
    if not row or row.hbi_user_id != user_id or row.hbi_collection_id != collection_id:
        raise ValueError("Item not found")
    coll = get_collection(db, user_id, collection_id)
    if not coll:
        raise ValueError("Collection not found")
    new_qty = (row.hbi_quantity or 0) + int(delta)
    if new_qty <= 0:
        _delete_asset_file(row.hbi_image_path)
        db.delete(row)
        db.commit()
        return {"deleted": True, "id": item_id}
    row.hbi_quantity = new_qty
    row.hbi_updated_at = _now_iso()
    db.commit()
    db.refresh(row)
    return serialize_item(row, coll.hbc_preset)


def delete_item(
    db: Session,
    user_id: int,
    collection_id: int,
    item_id: int,
    *,
    restore_missing: bool = False,
) -> dict | None:
    row = db.get(HobbyItem, item_id)
    if not row or row.hbi_user_id != user_id or row.hbi_collection_id != collection_id:
        return None
    coll = get_collection(db, user_id, collection_id)
    title = (row.hbi_title or "").strip()
    limited = bool(coll and _collection_is_limited(coll))
    _delete_asset_file(row.hbi_image_path)
    db.delete(row)
    restored = False
    if limited and restore_missing and title and coll is not None:
        meta = _collection_meta(coll)
        missing = list(meta.get("missing") or [])
        total = getattr(coll, "hbc_collection_total", None)
        try:
            total_i = int(total) if total is not None else None
        except (TypeError, ValueError):
            total_i = None
        already = any(_tag_matches(m, title) for m in missing)
        if not already and (total_i is None or len(missing) < total_i):
            _ensure_items_list_catalog(meta, item_titles=[title])
            missing.append(title)
            meta["missing"] = missing
            coll.hbc_meta_json = _dump_collection_meta(meta)
            coll.hbc_updated_at = _now_iso()
            restored = True
    db.commit()
    return {
        "ok": True,
        "id": item_id,
        "title": title or None,
        "limited": limited,
        "restored_missing": restored,
    }


def delete_items(
    db: Session,
    user_id: int,
    collection_id: int,
    item_ids: list[int],
    *,
    restore_missing: bool = False,
) -> int:
    n = 0
    for iid in item_ids:
        if delete_item(
            db,
            user_id,
            collection_id,
            iid,
            restore_missing=restore_missing,
        ):
            n += 1
    return n


def _seed_marble_styles(db: Session, user_id: int, collection_id: int) -> None:
    now = _now_iso()
    for style in DEFAULT_MARBLE_STYLES:
        db.add(
            HobbyFieldOption(
                hfo_user_id=user_id,
                hfo_collection_id=collection_id,
                hfo_field="style",
                hfo_value=style,
                hfo_created_at=now,
            )
        )


def _remember_field_values(
    db: Session, user_id: int, collection_id: int, body: dict
) -> None:
    now = _now_iso()
    for field in ("type", "size", "style", "theme", "category", "brand"):
        raw = body.get(field)
        if not raw or not str(raw).strip():
            continue
        val = str(raw).strip()
        exists = db.scalar(
            select(HobbyFieldOption)
            .where(
                HobbyFieldOption.hfo_user_id == user_id,
                HobbyFieldOption.hfo_collection_id == collection_id,
                HobbyFieldOption.hfo_field == field,
                HobbyFieldOption.hfo_value.ilike(val),
            )
            .limit(1)
        )
        if exists:
            continue
        db.add(
            HobbyFieldOption(
                hfo_user_id=user_id,
                hfo_collection_id=collection_id,
                hfo_field=field,
                hfo_value=val,
                hfo_created_at=now,
            )
        )


def list_field_options(
    db: Session, user_id: int, collection_id: int, field: str
) -> list[str]:
    rows = db.scalars(
        select(HobbyFieldOption)
        .where(
            HobbyFieldOption.hfo_user_id == user_id,
            HobbyFieldOption.hfo_collection_id == collection_id,
            HobbyFieldOption.hfo_field == field,
        )
        .order_by(HobbyFieldOption.hfo_value.asc())
    ).all()
    # Dedupe casefold preserving first casing
    out: list[str] = []
    seen: set[str] = set()
    for r in rows:
        key = (r.hfo_value or "").casefold()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(r.hfo_value)
    return out


def add_field_option(
    db: Session, user_id: int, collection_id: int, field: str, value: str
) -> list[str]:
    coll = get_collection(db, user_id, collection_id)
    if not coll:
        raise ValueError("Collection not found")
    val = (value or "").strip()
    if not val:
        raise ValueError("Value is required")
    field_key = (field or "").strip().casefold()
    if field_key not in {"type", "size", "style", "theme", "category", "brand"}:
        raise ValueError("Unsupported field")
    _remember_field_values(db, user_id, collection_id, {field_key: val})
    db.commit()
    return list_field_options(db, user_id, collection_id, field_key)


def store_icon_file(collection_name: str, data: bytes, ext: str) -> str:
    return save_uploaded_image(
        collection_name="Icon",
        stem=collection_name,
        data=data,
        ext=ext,
    )


def copy_local_path_into_collectibles(
    src: Path, *, collection_name: str, stem: str
) -> str:
    if not src.is_file():
        raise ValueError("Source file not found")
    data = src.read_bytes()
    return save_uploaded_image(
        collection_name=collection_name,
        stem=stem,
        data=data,
        ext=src.suffix or ".png",
    )
