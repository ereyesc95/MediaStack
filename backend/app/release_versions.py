"""Release/edition format version folders (CD, LP, Digital, …).

Layout examples::

  Albums/1997.… GLS666/2025.10.12. Remastered Edition/
    2025.10.12. CD/
    2025.10.12. LP - Black/
    2025.10.12. LP - Bloodline Red/

  Albums/1997.… GLS666/
    1998.11.02. LP - Black/          # alone → not a version set (no tabs)

A version *set* is recognized when a parent has ≥2 sibling folders whose cores
(after date / ``01.`` prefixes) match format tokens, and the parent has no
``[Artwork]`` folder (art lives inside each version).
"""
from __future__ import annotations

import re
from pathlib import Path

from app.band_library import DATE_PREFIX_RE, _find_artwork_subdir, _parse_folder_date

ARTWORK_DIR = "[artwork]"

# Strip leading "01. " / "02. " style numeric prefixes (not dates).
_NUMERIC_PREFIX_RE = re.compile(r"^\d+\.\s*")

# format_key → sort rank (lower first)
FORMAT_ORDER: dict[str, int] = {
    "cd": 0,
    "digital": 1,
    "lp": 2,
    "7inch": 3,
    "10inch": 4,
    "boxset": 5,
    "cassette": 6,
    "dvd": 7,
    "bluray": 8,
    "vhs": 9,
}

# Within CD family, plain CD before SACD / MiniDisc / Flexi
_CD_SUBTYPE_ORDER: dict[str, int] = {
    "cd": 0,
    "sacd": 1,
    "minidisc": 2,
    "flexi": 3,
}

_FORMAT_LABELS: dict[str, str] = {
    "cd": "CD",
    "digital": "Digital",
    "lp": "LP",
    "7inch": '7"',
    "10inch": '10"',
    "boxset": "Boxset",
    "cassette": "Cassette",
    "dvd": "DVD",
    "bluray": "Blu-ray",
    "vhs": "VHS",
}

# Exact cores → (format_key, subtype_for_cd_family | None)
_EXACT_CORES: dict[str, tuple[str, str | None]] = {
    "cd": ("cd", "cd"),
    "sacd": ("cd", "sacd"),
    "minidisc": ("cd", "minidisc"),
    "md": ("cd", "minidisc"),
    "flexi": ("cd", "flexi"),
    "flexidisc": ("cd", "flexi"),
    "digital": ("digital", None),
    "usb": ("digital", None),
    "lp": ("lp", None),
    "vinyl": ("lp", None),
    '7"': ("7inch", None),
    "7''": ("7inch", None),
    "7″": ("7inch", None),
    "7 inch": ("7inch", None),
    "7-inch": ("7inch", None),
    '10"': ("10inch", None),
    "10''": ("10inch", None),
    "10″": ("10inch", None),
    "10 inch": ("10inch", None),
    "10-inch": ("10inch", None),
    "boxset": ("boxset", None),
    "box set": ("boxset", None),
    "box": ("boxset", None),
    "cassette": ("cassette", None),
    "tape": ("cassette", None),
    "dvd": ("dvd", None),
    "blu-ray": ("bluray", None),
    "bluray": ("bluray", None),
    "blu ray": ("bluray", None),
    "vhs": ("vhs", None),
}

# Prefix cores: "cd - minidisc", "lp - black", …
_PREFIX_FORMATS: tuple[tuple[str, str, str | None], ...] = (
    ("cd - ", "cd", "cd"),
    ("sacd - ", "cd", "sacd"),
    ("minidisc - ", "cd", "minidisc"),
    ("md - ", "cd", "minidisc"),
    ("flexi - ", "cd", "flexi"),
    ("digital - ", "digital", None),
    ("usb - ", "digital", None),
    ("lp - ", "lp", None),
    ("vinyl - ", "lp", None),
    ('7" - ', "7inch", None),
    ("7'' - ", "7inch", None),
    ("7″ - ", "7inch", None),
    ("7 inch - ", "7inch", None),
    ("7-inch - ", "7inch", None),
    ('10" - ', "10inch", None),
    ("10'' - ", "10inch", None),
    ("10″ - ", "10inch", None),
    ("10 inch - ", "10inch", None),
    ("10-inch - ", "10inch", None),
    ("boxset - ", "boxset", None),
    ("box set - ", "boxset", None),
    ("box - ", "boxset", None),
    ("cassette - ", "cassette", None),
    ("tape - ", "cassette", None),
    ("dvd - ", "dvd", None),
    ("blu-ray - ", "bluray", None),
    ("bluray - ", "bluray", None),
    ("vhs - ", "vhs", None),
)


def strip_version_name_prefixes(name: str) -> str:
    """Remove date and numeric order prefixes from a folder display name."""
    text = Path(name).name.strip()
    low = text.casefold()
    if low.endswith(".lnk") or low.endswith(".path"):
        text = Path(text).stem
    m = DATE_PREFIX_RE.match(text)
    if m:
        text = text[m.end() :].lstrip(". ").strip()
    m2 = _NUMERIC_PREFIX_RE.match(text)
    if m2:
        text = text[m2.end() :].strip()
    return text


def parse_version_core(core: str) -> dict | None:
    """Parse a stripped folder core into format metadata, or None if not a version."""
    raw = core.strip()
    if not raw:
        return None
    low = raw.casefold()

    if low in _EXACT_CORES:
        format_key, subtype = _EXACT_CORES[low]
        return {
            "format_key": format_key,
            "subtype": subtype,
            "variant": None,
            "core": raw,
            "tab_label": _tab_label(format_key, None, subtype, raw),
        }

    for prefix, format_key, subtype in _PREFIX_FORMATS:
        if low.startswith(prefix):
            variant = raw[len(prefix) :].strip()
            if not variant:
                return None
            # "CD - MiniDisc" → subtype minidisc when variant matches family names
            sub = subtype
            if format_key == "cd":
                vlow = variant.casefold()
                if vlow in ("minidisc", "md"):
                    sub = "minidisc"
                elif vlow in ("flexi", "flexidisc"):
                    sub = "flexi"
                elif vlow == "sacd":
                    sub = "sacd"
                elif vlow == "cd":
                    sub = "cd"
            return {
                "format_key": format_key,
                "subtype": sub,
                "variant": variant,
                "core": raw,
                "tab_label": _tab_label(format_key, variant, sub, raw),
            }
    return None


_CD_FAMILY_TAB_LABELS: dict[str, str] = {
    "sacd": "SACD",
    "minidisc": "MiniDisc",
    "flexi": "Flexi",
}


def _tab_label(
    format_key: str,
    variant: str | None,
    subtype: str | None,
    raw_core: str,
) -> str:
    if variant:
        # CD - MiniDisc / CD - Flexi → short family tabs; LP - Black → Black LP
        if format_key == "cd":
            vlow = variant.casefold()
            if vlow in ("minidisc", "md"):
                return "MiniDisc"
            if vlow in ("flexi", "flexidisc"):
                return "Flexi"
            if vlow == "sacd":
                return "SACD"
            if vlow == "cd":
                return "CD"
            return f"{variant} CD"
        if format_key == "lp":
            return f"{variant} LP"
        if format_key == "7inch":
            return f'{variant} 7"'
        if format_key == "10inch":
            return f'{variant} 10"'
        if format_key == "boxset":
            return f"{variant} Boxset"
        if format_key == "digital":
            return f"{variant} Digital" if variant.casefold() != "usb" else "USB"
        if format_key == "cassette":
            return f"{variant} Cassette"
        if format_key == "dvd":
            return f"{variant} DVD"
        if format_key == "bluray":
            return f"{variant} Blu-ray"
        if format_key == "vhs":
            return f"{variant} VHS"
        return f"{variant} {_FORMAT_LABELS.get(format_key, raw_core)}"
    if subtype and subtype != "cd" and format_key == "cd":
        return _CD_FAMILY_TAB_LABELS.get(subtype, _FORMAT_LABELS["cd"])
    if format_key == "digital" and raw_core.casefold() == "usb":
        return "USB"
    return _FORMAT_LABELS.get(format_key, raw_core)


def is_version_folder_name(name: str) -> bool:
    """True when the folder name looks like a format version (ignores siblings)."""
    return parse_version_core(strip_version_name_prefixes(name)) is not None


def _version_sort_key(meta: dict, folder: Path) -> tuple:
    fmt = meta["format_key"]
    fmt_rank = FORMAT_ORDER.get(fmt, 99)
    sub_rank = 0
    if fmt == "cd":
        sub_rank = _CD_SUBTYPE_ORDER.get(meta.get("subtype") or "cd", 9)
    date = _parse_folder_date(folder.name) or ""
    return (fmt_rank, sub_rank, date, folder.name.casefold())


def list_version_dirs(parent: Path) -> list[Path]:
    """Return sorted version folders if ``parent`` hosts a version set; else []."""
    if not parent.is_dir():
        return []
    # Parent of a version set must not carry its own [Artwork]
    if _find_artwork_subdir(parent):
        return []

    matched: list[tuple[Path, dict]] = []
    try:
        children = list(parent.iterdir())
    except OSError:
        return []

    for child in children:
        if not child.is_dir() or child.name.casefold() == ARTWORK_DIR:
            continue
        meta = parse_version_core(strip_version_name_prefixes(child.name))
        if meta:
            matched.append((child, meta))

    if len(matched) < 2:
        return []

    matched.sort(key=lambda item: _version_sort_key(item[1], item[0]))
    return [folder for folder, _meta in matched]


def preferred_version_dir(parent: Path) -> Path | None:
    """CD-first version under ``parent``, or None if not a version set."""
    versions = list_version_dirs(parent)
    return versions[0] if versions else None


def version_meta_for_folder(folder: Path) -> dict | None:
    return parse_version_core(strip_version_name_prefixes(folder.name))


def resolve_artwork_dir_preferring_cd_version(folder: Path) -> Path | None:
    """Artwork for catalog/cards: CD version [Artwork], else first version, else folder."""
    versions = list_version_dirs(folder)
    if versions:
        for vdir in versions:
            art = _find_artwork_subdir(vdir)
            if art:
                return art
        return None
    art = _find_artwork_subdir(folder)
    if art:
        return art
    # Single nested version-like folder (not a set): still prefer its art
    try:
        for child in sorted(folder.iterdir(), key=lambda p: p.name.casefold()):
            if not child.is_dir() or child.name.casefold() == ARTWORK_DIR:
                continue
            if is_version_folder_name(child.name):
                nested = _find_artwork_subdir(child)
                if nested:
                    return nested
    except OSError:
        pass
    return None


def walk_up_skip_version(folder: Path, stop: Path | None = None) -> Path:
    """If ``folder`` is a version folder by name, return its parent (else folder)."""
    if is_version_folder_name(folder.name):
        parent = folder.parent
        if stop is not None and parent == stop:
            return folder
        return parent
    return folder
