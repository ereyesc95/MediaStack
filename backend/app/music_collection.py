"""Per-profile physical music collection (owned edition × media leaves)."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.artwork_stems import (
    COVER_BANNER_STEM,
    VIDEO_EXTS,
    resolve_animation_album_file,
    resolve_canvas_album_file,
    resolve_cover_banner_file,
    resolve_cover_front_file,
    resolve_cover_landscape_file,
    resolve_cover_portrait_file,
)
from app.band_library import (
    AUDIO_CATEGORIES,
    DATE_PREFIX_RE,
    _find_artwork_subdir,
    _strip_bracket_suffix,
)
from app.config import settings
from app.gallery import IMAGE_EXTS, _artist_dir, _media_url
from app.media_index import release_id_from_path
from app.models import Band, CollectionItem, Country, Genre, Subgenre
from app.release_versions import (
    is_version_folder_name,
    parse_version_core,
    strip_version_name_prefixes,
)

MANDATORY_ARTWORK = (
    "Cover - Front",
    "Cover - Landscape",
    "Cover - Portrait",
    "Cover - Banner",
    "Cover - Animation",
    "Cover - Canvas",
    "Photo - Square",
    "Photo - Landscape",
    "Photo - Portrait",
    "Photo - Banner",
    "Code - Spotify",
    "Code - Spotify Card",
    "Photocard - Landscape - Front",
    "Photocard - Landscape - Back",
    "Photocard - Portrait - Front",
    "Photocard - Portrait - Back",
    "Logo",
)

_CATEGORY_TO_TYPE = {
    "albums": "Studio Album",
    "extended_plays": "Extended Play",
    "compilations": "Compilation",
    "soundtracks": "Soundtrack",
    "live_albums": "Live Album",
    "singles": "Single",
}

_TYPE_TO_CATEGORY = {v.casefold(): k for k, v in _CATEGORY_TO_TYPE.items()}

_SOURCE_ALIASES = {
    "youtube": "YouTube",
    "youtu.be": "YouTube",
    "ai": "AI",
    "apple": "Apple",
    "spotify": "Spotify",
    "instagram": "Instagram",
    "facebook": "Facebook",
    "filter": "Filter",
    "official": "Official",
}

_ALBUM_LINE_RE = re.compile(
    r"^\s*(?P<artist>.+?),\s*"
    r"(?P<date>\d{4}(?:\.\d{2}(?:\.\d{2})?)?)\.\s*"
    r"(?P<title>.+?)\s*$"
)
_FILENAME_BRACKET_RE = re.compile(r"^(?P<stem>.+?)\s*\[(?P<source>[^\]]+)\]\s*$")
_MONTHS = (
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


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


def canonicalize_source(value: str | None) -> str | None:
    text = (value or "").strip()
    if not text:
        return None
    return _SOURCE_ALIASES.get(text.casefold(), text)


def split_sources(value: str | None) -> list[str]:
    if not value:
        return []
    parts = re.split(r"[/,|;]+", str(value))
    out: list[str] = []
    seen: set[str] = set()
    for part in parts:
        canon = canonicalize_source(part)
        if not canon:
            continue
        key = canon.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(canon)
    return out


def normalize_media_type(value: str | None) -> str | None:
    text = (value or "").strip()
    if not text:
        return None
    low = text.casefold().replace("″", '"').replace("''", '"')
    aliases = {
        "vinyl": "LP",
        "lp": "LP",
        "cd": "CD",
        "dvd": "DVD",
        "box": "BOX",
        "boxset": "BOX",
        "box set": "BOX",
        '7"': '7"',
        "7": '7"',
        '10"': '10"',
        "10": '10"',
        "cassette": "Cassette",
        "tape": "Cassette",
        "digital": "Digital",
        "usb": "USB",
        "sacd": "SACD",
        "minidisc": "MiniDisc",
        "md": "MiniDisc",
        "flexi": "Flexi",
    }
    if low in aliases:
        return aliases[low]
    if low.endswith('"') and low[:-1].isdigit():
        return f'{low[:-1]}"'
    return text


def split_media_types(value: str | None) -> list[str]:
    if not value:
        return []
    parts = re.split(r"[+/|,;]+", str(value))
    out: list[str] = []
    for part in parts:
        media = normalize_media_type(part)
        if media and media not in out:
            out.append(media)
    return out or ([normalize_media_type(value)] if normalize_media_type(value) else [])


def match_key(
    *,
    artist: str,
    title: str,
    edition: str | None,
    media_type: str | None,
    date_iso: str | None = None,
    release_type: str | None = None,
) -> str:
    parts = [
        (artist or "").casefold().strip(),
        (date_iso or "")[:4],
        (title or "").casefold().strip(),
        (edition or "Standard Edition").casefold().strip(),
        (media_type or "").casefold().strip(),
        (release_type or "").casefold().strip(),
    ]
    return "|".join(parts)


def format_display_date(iso: str | None) -> str | None:
    if not iso:
        return None
    parts = iso.split(".")
    try:
        year = int(parts[0])
    except (TypeError, ValueError):
        return iso
    if len(parts) == 1:
        return str(year)
    try:
        month = int(parts[1])
    except (TypeError, ValueError):
        return str(year)
    month_name = _MONTHS[month] if 1 <= month <= 12 else parts[1]
    if len(parts) == 2:
        return f"{month_name} {year}"
    try:
        day = int(parts[2])
    except (TypeError, ValueError):
        return f"{month_name} {year}"
    suffix = "th"
    if day % 10 == 1 and day % 100 != 11:
        suffix = "st"
    elif day % 10 == 2 and day % 100 != 12:
        suffix = "nd"
    elif day % 10 == 3 and day % 100 != 13:
        suffix = "rd"
    return f"{month_name} {day}{suffix}, {year}"


def parse_album_line(album: str) -> dict:
    """Parse Excel ALBUM cell: Artist, YYYY[.MM[.DD]]. Title[, Edition…]."""
    raw = (album or "").strip()
    m = _ALBUM_LINE_RE.match(raw)
    if not m:
        return {
            "artist": raw,
            "title": raw,
            "date_iso": None,
            "edition": "Standard Edition",
        }
    artist = m.group("artist").strip()
    date_iso = m.group("date").strip()
    rest = m.group("title").strip()
    edition = "Standard Edition"
    # Split trailing edition-ish clause after comma when present
    if "," in rest:
        left, right = rest.rsplit(",", 1)
        right_s = right.strip()
        if right_s and (
            re.search(
                r"\b(edition|remaster|deluxe|standard|limited|expanded|anniversary|fan)\b",
                right_s,
                re.I,
            )
            or re.match(r"^\d{4}\b", right_s)
        ):
            rest = left.strip()
            edition = right_s
            # "2023 20th Anniversary Edition" stays as edition text
    return {
        "artist": artist,
        "title": rest,
        "date_iso": date_iso,
        "edition": edition or "Standard Edition",
    }


def _media_root() -> Path | None:
    root = settings.media_root
    return Path(root) if root else None


def _stem_base(path: Path) -> tuple[str, str | None]:
    """Return (display stem without bracket source, source or None)."""
    stem = path.stem
    m = _FILENAME_BRACKET_RE.match(stem)
    if not m:
        return stem.strip(), None
    return m.group("stem").strip(), canonicalize_source(m.group("source"))


def _find_artwork_file(artwork: Path, want_stem: str, *, allow_video: bool = False) -> Path | None:
    want = want_stem.casefold()
    exts = set(IMAGE_EXTS)
    if allow_video:
        exts |= VIDEO_EXTS
    try:
        for path in artwork.iterdir():
            if not path.is_file() or path.suffix.lower() not in exts:
                continue
            base, _src = _stem_base(path)
            if base.casefold() == want:
                return path
    except OSError:
        return None
    return None


def _normalize_code_stem(base: str) -> str | None:
    """Map legacy / new code filenames to canonical Code - * labels."""
    low = base.casefold().strip()
    aliases = {
        "spotify - code": "Code - Spotify",
        "code - spotify": "Code - Spotify",
        "spotify": "Code - Spotify",
        "spotify code": "Code - Spotify",
        "spotify - card": "Code - Spotify Card",
        "code - spotify card": "Code - Spotify Card",
        "code - spotify - card": "Code - Spotify Card",
        "spotify card": "Code - Spotify Card",
        "spotify - code - card": "Code - Spotify Card",
        "qr - code": "Code - QR",
        "code - qr": "Code - QR",
        "qr": "Code - QR",
        "qr code": "Code - QR",
        "qr - card": "Code - QR Card",
        "code - qr card": "Code - QR Card",
        "qr card": "Code - QR Card",
    }
    return aliases.get(low)


def _short_artwork_label(canonical: str) -> str:
    """Strip redundant group prefixes for modal display."""
    label = canonical
    for prefix in (
        "Cover - ",
        "Photo - ",
        "Photocard - ",
        "Booklet - ",
        "Code - ",
        "Autograph - ",
        "Logo - ",
    ):
        if label.casefold().startswith(prefix.casefold()):
            return label[len(prefix) :].strip()
    if label.casefold() == "logo":
        return "Logo"
    return label


def _sort_group_entries(entries: list[dict]) -> list[dict]:
    return sorted(entries, key=lambda e: (e.get("label") or "").casefold())


def scan_artwork_checklist(artwork: Path | None) -> dict:
    """Classify [Artwork] files into groups + mandatory presence."""
    groups: dict[str, list[dict]] = {
        "Cover": [],
        "Photo": [],
        "Photocards": [],
        "Codes": [],
        "Media": [],
        "Branding": [],
        "Booklet": [],
        "Autographs": [],
        "Other": [],
    }
    present: set[str] = set()
    animation_sources: list[str] = []
    canvas_sources: list[str] = []
    autograph_labels: list[str] = []
    urls: dict[str, str | None] = {
        "logo_url": None,
        "cover_front_url": None,
        "cover_banner_url": None,
        "spotify_card_url": None,
        "spotify_code_url": None,
        "photo_square_url": None,
        "animation_url": None,
        "canvas_url": None,
        "disc_url": None,
        "disc_b_url": None,
    }
    root = _media_root()
    if not artwork or not artwork.is_dir() or not root:
        return {
            "groups": groups,
            "present": sorted(present),
            "missing_mandatory": list(MANDATORY_ARTWORK),
            "animation_sources": animation_sources,
            "canvas_sources": canvas_sources,
            "autographs": autograph_labels,
            "urls": urls,
        }

    def add_url(key: str, path: Path | None) -> None:
        if path and not urls.get(key):
            urls[key] = _media_url(path, root)

    def push(group: str, canonical: str, *, source: str | None, url: str | None, missing: bool) -> None:
        short = _short_artwork_label(canonical)
        # Animation / Canvas always expose a source for the modal suffix
        src = source
        if not missing and group == "Cover" and short.casefold() in ("animation", "canvas"):
            src = source or "Official"
        groups[group].append(
            {
                "label": short,
                "canonical": canonical,
                "source": src,
                "url": url,
                "missing": missing,
            }
        )

    try:
        files = sorted(artwork.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        files = []

    for path in files:
        if not path.is_file():
            continue
        if path.suffix.lower() not in IMAGE_EXTS | VIDEO_EXTS:
            continue
        if "_small" in path.name.casefold():
            continue
        base, source = _stem_base(path)
        low = base.casefold()
        url = _media_url(path, root)
        code_canon = _normalize_code_stem(base)

        if low.startswith("cover - "):
            present.add(base)
            push("Cover", base, source=source, url=url, missing=False)
            suffix = base[8:].strip()
            if low == "cover - front":
                add_url("cover_front_url", path)
            elif low == "cover - banner":
                add_url("cover_banner_url", path)
            elif low == "cover - animation":
                add_url("animation_url", path)
                animation_sources.append(source or "Official")
            elif low == "cover - canvas":
                add_url("canvas_url", path)
                canvas_sources.append(source or "Official")
            elif suffix.casefold() in {
                "front", "landscape", "portrait", "banner", "animation", "canvas",
                "back", "inner", "inlay", "alternate", "spine",
            }:
                pass
        elif low.startswith("animation"):
            # Animation - Album style
            present.add("Cover - Animation")
            push("Cover", "Cover - Animation", source=source or "Official", url=url, missing=False)
            add_url("animation_url", path)
            animation_sources.append(source or "Official")
        elif low.startswith("canvas"):
            present.add("Cover - Canvas")
            push("Cover", "Cover - Canvas", source=source or "Official", url=url, missing=False)
            add_url("canvas_url", path)
            canvas_sources.append(source or "Official")
        elif low.startswith("booklet - ") or low.startswith("booklet "):
            push("Booklet", base, source=source, url=url, missing=False)
        elif low.startswith("photo - "):
            present.add(base)
            push("Photo", base, source=source, url=url, missing=False)
            if low == "photo - square":
                add_url("photo_square_url", path)
        elif low in ("logo", "collapsed logo", "icon") or low.startswith("logo "):
            push("Branding", base, source=source, url=url, missing=False)
            if low == "logo":
                present.add("Logo")
                add_url("logo_url", path)
        elif code_canon:
            present.add(code_canon)
            push("Codes", code_canon, source=source, url=url, missing=False)
            if code_canon == "Code - Spotify Card":
                add_url("spotify_card_url", path)
            elif code_canon == "Code - Spotify":
                add_url("spotify_code_url", path)
        elif low.startswith("photocard - "):
            present.add(base)
            push("Photocards", base, source=source, url=url, missing=False)
        elif low.startswith("autograph - "):
            label = base[12:].strip() or base
            push("Autographs", f"Autograph - {label}", source=source, url=url, missing=False)
            if label not in autograph_labels:
                autograph_labels.append(label)
        elif low in ("disc", "side a", "side b") or low.startswith("side "):
            push("Media", base, source=source, url=url, missing=False)
            if low == "disc" or low == "side a":
                add_url("disc_url", path)
            elif low == "side b":
                add_url("disc_b_url", path)
        else:
            push("Other", base, source=source, url=url, missing=False)

    # Also mark mandatory via dedicated resolvers (handles Cover - Album alias etc.)
    if resolve_cover_front_file(artwork):
        present.add("Cover - Front")
        add_url("cover_front_url", resolve_cover_front_file(artwork))
    if resolve_cover_landscape_file(artwork):
        present.add("Cover - Landscape")
    if resolve_cover_portrait_file(artwork):
        present.add("Cover - Portrait")
    if resolve_cover_banner_file(artwork):
        present.add("Cover - Banner")
        add_url("cover_banner_url", resolve_cover_banner_file(artwork))
    anim = resolve_animation_album_file(artwork)
    if anim:
        present.add("Cover - Animation")
        add_url("animation_url", anim)
        if not animation_sources:
            _b, src = _stem_base(anim)
            animation_sources.append(src or "Official")
    canv = resolve_canvas_album_file(artwork)
    if canv:
        present.add("Cover - Canvas")
        add_url("canvas_url", canv)
        if not canvas_sources:
            _b, src = _stem_base(canv)
            canvas_sources.append(src or "Official")

    code_lookup_stems = (
        (
            "Code - Spotify",
            ("Code - Spotify", "Spotify - Code", "Spotify", "Code - Spotify.png"),
        ),
        (
            "Code - Spotify Card",
            (
                "Code - Spotify Card",
                "Code - Spotify - Card",
                "Spotify - Card",
                "Spotify Card",
            ),
        ),
        ("Code - QR", ("Code - QR", "QR - Code", "QR")),
        ("Code - QR Card", ("Code - QR Card", "QR - Card", "QR Card")),
    )
    for canonical, stems in code_lookup_stems:
        already = canonical in present
        for stem in stems:
            found = _find_artwork_file(artwork, stem)
            if not found:
                continue
            present.add(canonical)
            if canonical == "Code - Spotify Card":
                add_url("spotify_card_url", found)
            elif canonical == "Code - Spotify":
                add_url("spotify_code_url", found)
            if already:
                break
            break

    for stem in (
        "Photo - Square",
        "Photo - Landscape",
        "Photo - Portrait",
        "Photo - Banner",
        "Photocard - Landscape - Front",
        "Photocard - Landscape - Back",
        "Photocard - Portrait - Front",
        "Photocard - Portrait - Back",
        "Logo",
    ):
        found = _find_artwork_file(
            artwork,
            stem,
            allow_video=stem.startswith("Cover -"),
        )
        if found:
            present.add(stem)
            if stem == "Logo":
                add_url("logo_url", found)
            elif stem == "Photo - Square":
                add_url("photo_square_url", found)

    # Avoid duplicate labels when resolvers already covered files on disk
    seen_keys: dict[str, set[str]] = {g: set() for g in groups}
    for gname, entries in list(groups.items()):
        deduped: list[dict] = []
        for e in entries:
            key = (e.get("label") or "").casefold()
            if key in seen_keys[gname]:
                continue
            seen_keys[gname].add(key)
            deduped.append(e)
        groups[gname] = deduped

    missing = [name for name in MANDATORY_ARTWORK if name not in present]
    for name in missing:
        if name.startswith("Cover - "):
            push("Cover", name, source=None, url=None, missing=True)
        elif name.startswith("Photo - "):
            push("Photo", name, source=None, url=None, missing=True)
        elif name.startswith("Code - "):
            push("Codes", name, source=None, url=None, missing=True)
        elif name.startswith("Photocard"):
            push("Photocards", name, source=None, url=None, missing=True)
        elif name == "Logo":
            push("Branding", name, source=None, url=None, missing=True)

    for gname in groups:
        groups[gname] = _sort_group_entries(groups[gname])

    return {
        "groups": groups,
        "present": sorted(present),
        "missing_mandatory": missing,
        "animation_sources": animation_sources,
        "canvas_sources": canvas_sources,
        "autographs": autograph_labels,
        "urls": urls,
    }


def _resolve_folder(folder_path: str | None) -> Path | None:
    root = _media_root()
    if not root or not folder_path:
        return None
    path = Path(folder_path)
    if not path.is_absolute():
        path = root / folder_path
    return path if path.is_dir() else None


def _category_from_path(folder: Path, root: Path) -> str | None:
    try:
        rel = folder.resolve().relative_to(root.resolve())
    except ValueError:
        return None
    parts = [p.casefold() for p in rel.parts]
    for key, name in AUDIO_CATEGORIES.items():
        if name.casefold() in parts:
            return key
    # Also accept Audio-less Music/Letter/Artist/Albums layout
    for key, name in AUDIO_CATEGORIES.items():
        if name.casefold() in parts:
            return key
    return None


def _edition_label_from_folder(folder: Path) -> str:
    core = _strip_bracket_suffix(strip_version_name_prefixes(folder.name))
    if is_version_folder_name(folder.name):
        parent = folder.parent
        core = _strip_bracket_suffix(strip_version_name_prefixes(parent.name))
    low = core.casefold()
    if not core or low in ("standard", "standard edition"):
        return "Standard Edition"
    if re.search(r"\b(edition|remaster|deluxe|limited|expanded|anniversary)\b", core, re.I):
        return core
    # Release folder itself → Standard
    return "Standard Edition"


def _version_label_from_folder(folder: Path) -> str | None:
    meta = parse_version_core(strip_version_name_prefixes(folder.name))
    if not meta:
        return None
    return meta.get("variant")


def _media_from_folder(folder: Path) -> str | None:
    meta = parse_version_core(strip_version_name_prefixes(folder.name))
    if meta:
        return normalize_media_type(_FORMAT_MEDIA.get(meta["format_key"], meta["format_key"]))
    return None


def _split_edition_variant(
    edition: str | None, version: str | None = None
) -> tuple[str, str | None]:
    """Keep edition name clean; move color/finish into version when jammed into edition."""
    ed = (edition or "Standard Edition").strip() or "Standard Edition"
    ver = (version or "").strip() or None
    if ver:
        return ed, ver
    m = re.match(r"^(.+?)\s*[-·—–]\s*(.+)$", ed)
    if not m:
        return ed, None
    left, right = m.group(1).strip(), m.group(2).strip()
    if not left or not right or len(right) > 40:
        return ed, None
    if not re.search(
        r"\b(edition|remaster|deluxe|limited|expanded|anniversary|standard)\b",
        left,
        re.I,
    ):
        return ed, None
    # Avoid splitting "20th Anniversary Edition" style left without a real variant
    if re.search(r"\b(edition|remaster|deluxe|limited)\b", right, re.I):
        return ed, None
    return left, right


_FORMAT_MEDIA = {
    "cd": "CD",
    "lp": "LP",
    "7inch": '7"',
    "10inch": '10"',
    "boxset": "BOX",
    "digital": "Digital",
    "cassette": "Cassette",
    "dvd": "DVD",
    "bluray": "Blu-ray",
    "vhs": "VHS",
}


def _band_country(db: Session, band: Band | None) -> tuple[str | None, str | None]:
    if not band:
        return None, None
    place = (band.bnd_origin_place or "").strip() or None
    iso = None
    country_name = None
    fk = (band.bnd_fk_countries or "").strip()
    if fk:
        # May be id or iso
        crow = None
        if fk.isdigit():
            crow = db.get(Country, int(fk))
        if not crow:
            crow = db.scalars(
                select(Country).where(Country.cou_iso == fk.upper())
            ).first()
        if not crow:
            crow = db.scalars(
                select(Country).where(Country.cou_name == fk)
            ).first()
        if crow:
            iso = (crow.cou_iso or "").lower() or None
            country_name = crow.cou_name
    display = ", ".join(p for p in (place, country_name) if p) or country_name or place
    return display, iso


def _band_genres(db: Session, band: Band | None) -> list[str]:
    if not band:
        return []
    names: list[str] = []
    raw_sub = (band.bnd_fk_subgenres or "").strip()
    if raw_sub:
        for part in re.split(r"[■;,|]+", raw_sub):
            part = part.strip()
            if not part:
                continue
            if part.isdigit():
                row = db.get(Subgenre, int(part))
                if row and row.sgn_name:
                    names.append(row.sgn_name)
            else:
                names.append(part)
    raw_gen = (band.bnd_fk_genres or "").strip()
    if raw_gen and not names:
        for part in re.split(r"[■;,|]+", raw_gen):
            part = part.strip()
            if not part:
                continue
            if part.isdigit():
                row = db.get(Genre, int(part))
                if row and row.gen_name:
                    names.append(row.gen_name)
            else:
                names.append(part)
    # dedupe
    out: list[str] = []
    seen: set[str] = set()
    for n in names:
        key = n.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(n)
    return out


def _panel_subgenre_names(
    db: Session, band_id: int | None, release_id: str | None
) -> list[str] | None:
    """Genres shown on the release left panel (overrides, then DB / MusicBrainz)."""
    if not band_id or not release_id:
        return None
    try:
        from app.release_overview import build_release_overview

        payload = build_release_overview(db, band_id, release_id)
    except Exception:
        return None
    if not payload:
        return None
    names: list[str] = []
    for item in payload.get("subgenres") or []:
        if isinstance(item, dict) and item.get("name"):
            names.append(str(item["name"]).strip())
        elif isinstance(item, str) and item.strip():
            names.append(item.strip())
    return [n for n in names if n]


def _release_genres(db: Session, band_id: int | None, title: str | None) -> list[str]:
    """Prefer per-release subgenres from DB; fall back to band genres."""
    if band_id and title:
        try:
            from app.release_overview import _match_db_release, _resolve_subgenres

            rel = _match_db_release(db, band_id, title)
            if rel and (rel.rel_fk_subgenres or "").strip():
                resolved = _resolve_subgenres(db, rel.rel_fk_subgenres)
                names = [s["name"] for s in resolved if s.get("name")]
                if names:
                    return names
        except Exception:
            pass
    band = db.get(Band, band_id) if band_id else None
    return _band_genres(db, band)


def _find_band_by_name(db: Session, artist: str) -> Band | None:
    want = (artist or "").strip().casefold()
    if not want:
        return None
    rows = db.scalars(select(Band)).all()
    for band in rows:
        if (band.bnd_name or "").strip().casefold() == want:
            return band
    for band in rows:
        others = band.bnd_other_names or ""
        for part in re.split(r"[■;,|]+", others):
            if part.strip().casefold() == want:
                return band
    return None


def _release_title_from_folder(folder: Path) -> str:
    walk = folder
    if is_version_folder_name(walk.name):
        walk = walk.parent
    # edition folder → parent is release
    core = _strip_bracket_suffix(strip_version_name_prefixes(walk.name))
    if re.search(r"\b(edition|remaster|deluxe|limited|expanded|anniversary)\b", core, re.I):
        walk = walk.parent
        core = _strip_bracket_suffix(strip_version_name_prefixes(walk.name))
    m = DATE_PREFIX_RE.match(walk.name)
    if m:
        core = walk.name[m.end() :].lstrip(". ").strip()
        core = _strip_bracket_suffix(core)
    return core or walk.name


def _original_date_from_release_folder(folder: Path) -> str | None:
    walk = folder
    if is_version_folder_name(walk.name):
        walk = walk.parent
    core = _strip_bracket_suffix(strip_version_name_prefixes(walk.name))
    if re.search(r"\b(edition|remaster|deluxe|limited|expanded|anniversary)\b", core, re.I):
        walk = walk.parent
    m = DATE_PREFIX_RE.match(walk.name)
    if not m:
        return None
    y, mo, d = m.group(1), m.group(2), m.group(3)
    if d:
        return f"{y}.{mo}.{d}"
    if mo:
        return f"{y}.{mo}"
    return y


def _edition_date_from_folder(folder: Path) -> str | None:
    walk = folder
    if is_version_folder_name(walk.name):
        walk = walk.parent
    m = DATE_PREFIX_RE.match(walk.name)
    if not m:
        return None
    y, mo, d = m.group(1), m.group(2), m.group(3)
    if d:
        return f"{y}.{mo}.{d}"
    if mo:
        return f"{y}.{mo}"
    return y


def _release_folder_path(folder: Path, root: Path) -> str:
    walk = folder
    if is_version_folder_name(walk.name):
        walk = walk.parent
    core = _strip_bracket_suffix(strip_version_name_prefixes(walk.name))
    if re.search(r"\b(edition|remaster|deluxe|limited|expanded|anniversary)\b", core, re.I):
        walk = walk.parent
    try:
        return walk.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return walk.as_posix()


def build_preview_from_folder(
    db: Session,
    *,
    band_id: int,
    folder_path: str,
) -> dict:
    """Build Add-to-collection modal payload from a local version/edition folder."""
    root = _media_root()
    band = db.get(Band, band_id)
    folder = _resolve_folder(folder_path)
    if not folder or not root:
        raise ValueError("Folder not found")

    artwork = _find_artwork_subdir(folder)
    checklist = scan_artwork_checklist(artwork)
    category = _category_from_path(folder, root)
    release_type = _CATEGORY_TO_TYPE.get(category or "", "Studio Album")
    country, iso = _band_country(db, band)
    media = _media_from_folder(folder) or "Digital"
    version = _version_label_from_folder(folder)
    edition = _edition_label_from_folder(folder)
    edition, version = _split_edition_variant(edition, version)
    title = _release_title_from_folder(folder)
    original = _original_date_from_release_folder(folder)
    edition_date = _edition_date_from_folder(folder)
    # Hide edition date when no real edition folder (same as original / Standard)
    show_edition_date = edition.casefold() != "standard edition"
    rel_folder = _release_folder_path(folder, root)
    release_id = release_id_from_path(rel_folder)
    panel_genres = _panel_subgenre_names(db, band_id, release_id)
    genres = panel_genres if panel_genres is not None else _release_genres(db, band_id, title)
    try:
        leaf_rel = folder.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        leaf_rel = folder_path.replace("\\", "/")

    anim = checklist["animation_sources"] or []
    canv = checklist["canvas_sources"] or []
    if not anim:
        anim = ["None"]
    if not canv:
        canv = ["None"]

    return {
        "title": title,
        "original_release_date": original,
        "original_release_date_display": format_display_date(original),
        "edition": edition,
        "release_date": edition_date if show_edition_date else None,
        "release_date_display": format_display_date(edition_date) if show_edition_date else None,
        "artist": band.bnd_name if band else None,
        "band_id": band_id,
        "country": country,
        "country_iso": iso,
        "release_type": release_type,
        "genres": genres,
        "media_type": media,
        "version": version,
        "animation": anim,
        "canvas": canv,
        "autographs": checklist["autographs"],
        "artwork": checklist["groups"],
        "missing_mandatory": checklist["missing_mandatory"],
        "urls": checklist["urls"],
        "folder_path": leaf_rel,
        "release_folder_path": rel_folder,
        "release_id": release_id,
        "in_collection": False,
        "collection_id": None,
    }


def compute_pending(row: CollectionItem, checklist: dict | None) -> list[str]:
    cleared = {x.casefold() for x in _json_list(row.col_pending_cleared_json)}
    extra = _json_list(row.col_pending_extra_json)
    missing: list[str] = []
    if checklist:
        missing = list(checklist.get("missing_mandatory") or [])
    else:
        # Orphan / no artwork → treat as Everything unless extras only
        if any(x.casefold() == "everything" for x in extra):
            missing = list(MANDATORY_ARTWORK)
        else:
            missing = list(MANDATORY_ARTWORK)
    pending = [m for m in missing if m.casefold() not in cleared]
    for item in extra:
        low = item.casefold()
        if low == "everything":
            continue
        if low in ("spotify code", "spotify - code", "code - spotify"):
            if "Code - Spotify" not in pending and "code - spotify" not in cleared:
                pending.append("Code - Spotify")
            continue
        if low in ("spotify card", "spotify - card", "code - spotify card"):
            if "Code - Spotify Card" not in pending and "code - spotify card" not in cleared:
                pending.append("Code - Spotify Card")
            continue
        if low in ("qr code", "qr - code", "code - qr"):
            if "Code - QR" not in pending and "code - qr" not in cleared:
                pending.append("Code - QR")
            continue
        if low in ("qr card", "qr - card", "code - qr card"):
            if "Code - QR Card" not in pending and "code - qr card" not in cleared:
                pending.append("Code - QR Card")
            continue
        if item not in pending:
            pending.append(item)
    return pending


def pair_photocards(entries: list[dict] | None) -> list[dict]:
    """Group Photocard - {Orientation} - Front/Back into flip-ready pairs."""
    fronts: dict[str, dict] = {}
    backs: dict[str, dict] = {}
    for entry in entries or []:
        if entry.get("missing"):
            continue
        raw = str(entry.get("canonical") or entry.get("label") or "")
        low = raw.casefold().strip()
        m = re.match(r"^(?:photocard\s*-\s*)?(.+?)\s*-\s*(front|back)\s*$", low)
        if not m:
            continue
        orient = m.group(1).strip()
        if orient.casefold().startswith("photocard"):
            orient = re.sub(r"^photocard\s*-\s*", "", orient, flags=re.I).strip()
        side = m.group(2)
        if side == "front":
            fronts[orient] = entry
        else:
            backs[orient] = entry
    keys = sorted(
        set(fronts) | set(backs),
        key=lambda k: (0 if "portrait" in k else 1 if "landscape" in k else 2, k),
    )
    out: list[dict] = []
    for key in keys:
        front = fronts.get(key)
        back = backs.get(key)
        title = key.title()
        out.append(
            {
                "id": key,
                "label": title,
                "front_url": (front or {}).get("url"),
                "back_url": (back or {}).get("url"),
            }
        )
    return out


def serialize_item(db: Session, row: CollectionItem, *, include_previews: bool = True) -> dict:
    folder = _resolve_folder(row.col_folder_path)
    artwork = _find_artwork_subdir(folder) if folder else None
    checklist = scan_artwork_checklist(artwork) if include_previews else None
    pending = compute_pending(row, checklist)
    genres = _json_list(row.col_genres_json)
    if row.col_band_id and row.col_release_id:
        panel_genres = _panel_subgenre_names(db, row.col_band_id, row.col_release_id)
        if panel_genres is not None:
            genres = panel_genres
    animation = _json_list(row.col_animation_json)
    canvas = _json_list(row.col_canvas_json)
    autographs = _json_list(row.col_autographs_json)
    urls = (checklist or {}).get("urls") or {}
    local = bool(folder)
    band = db.get(Band, row.col_band_id) if row.col_band_id else None
    if not band and row.col_artist:
        band = _find_band_by_name(db, row.col_artist)

    # Prefer Standard cover for release cards — resolved at group level
    cover_url = urls.get("cover_front_url")
    photo_raw = (checklist or {}).get("groups", {}).get("Photocards") if include_previews else None
    edition, version = _split_edition_variant(row.col_edition, row.col_version)
    edition_label = edition or "Standard Edition"
    is_standard = edition_label.casefold().startswith("standard")
    # Non-standard editions use their edition date; Standard uses release date.
    date_iso = (
        row.col_original_date
        if is_standard or not row.col_edition_date
        else row.col_edition_date
    )
    return {
        "id": row.col_id,
        "artist": row.col_artist,
        "title": row.col_title,
        "edition": edition_label,
        "release_type": row.col_release_type,
        "original_date": row.col_original_date,
        "original_date_display": format_display_date(row.col_original_date),
        "edition_date": row.col_edition_date,
        "edition_date_display": format_display_date(row.col_edition_date),
        "display_date": date_iso,
        "display_date_display": format_display_date(date_iso),
        "year": (date_iso or "")[:4] or None,
        "media_type": row.col_media_type,
        "version": version,
        "genres": genres,
        "country": row.col_country,
        "country_iso": row.col_country_iso,
        "animation": animation,
        "canvas": canvas,
        "autographs": autographs,
        "pending": pending,
        "has_pending": bool(pending),
        "folder_path": row.col_folder_path,
        "release_folder_path": row.col_release_folder_path,
        "band_id": row.col_band_id or (band.bnd_id if band else None),
        "release_id": row.col_release_id,
        "local": local,
        "orphan": not local,
        "notes": row.col_notes,
        "cover_url": cover_url,
        "logo_url": urls.get("logo_url"),
        "cover_banner_url": urls.get("cover_banner_url"),
        "spotify_card_url": urls.get("spotify_card_url"),
        "spotify_code_url": urls.get("spotify_code_url"),
        "photo_square_url": urls.get("photo_square_url"),
        "animation_url": urls.get("animation_url"),
        "canvas_url": urls.get("canvas_url"),
        "disc_url": urls.get("disc_url"),
        "disc_b_url": urls.get("disc_b_url"),
        "spotify_icon_active": bool(
            urls.get("cover_banner_url")
            and (urls.get("spotify_card_url") or urls.get("spotify_code_url"))
        ),
        "artwork": (checklist or {}).get("groups") if include_previews else None,
        "missing_mandatory": (checklist or {}).get("missing_mandatory") if include_previews else pending,
        "match_key": row.col_match_key,
        "photocards": photo_raw,
        "photocard_pairs": pair_photocards(photo_raw) if include_previews else None,
        "autograph_images": (checklist or {}).get("groups", {}).get("Autographs") if include_previews else None,
    }


def find_existing(
    db: Session,
    user_id: int,
    key: str,
) -> CollectionItem | None:
    return db.scalars(
        select(CollectionItem).where(
            CollectionItem.col_user_id == user_id,
            CollectionItem.col_match_key == key,
        )
    ).first()


def upsert_item(db: Session, user_id: int, payload: dict) -> CollectionItem:
    artist = (payload.get("artist") or "").strip()
    title = (payload.get("title") or "").strip()
    edition = (payload.get("edition") or "Standard Edition").strip() or "Standard Edition"
    media = normalize_media_type(payload.get("media_type"))
    release_type = (payload.get("release_type") or "").strip() or None
    date_iso = payload.get("original_date") or payload.get("date_iso")
    key = payload.get("match_key") or match_key(
        artist=artist,
        title=title,
        edition=edition,
        media_type=media,
        date_iso=date_iso,
        release_type=release_type,
    )
    row = find_existing(db, user_id, key)
    created = False
    if not row:
        created = True
        row = CollectionItem(col_user_id=user_id, col_match_key=key)
        db.add(row)

    row.col_artist = artist
    row.col_title = title
    row.col_edition = edition
    row.col_release_type = release_type
    row.col_original_date = date_iso
    row.col_edition_date = payload.get("edition_date")
    row.col_media_type = media
    row.col_version = payload.get("version")
    row.col_genres_json = _dump_list(payload.get("genres") or [])
    row.col_country = payload.get("country")
    row.col_country_iso = payload.get("country_iso")
    row.col_animation_json = _dump_list(payload.get("animation") or [])
    row.col_canvas_json = _dump_list(payload.get("canvas") or [])
    row.col_autographs_json = _dump_list(payload.get("autographs") or [])
    if "pending_extra" in payload:
        row.col_pending_extra_json = _dump_list(payload.get("pending_extra") or [])
    if "pending_cleared" in payload:
        row.col_pending_cleared_json = _dump_list(payload.get("pending_cleared") or [])
    row.col_folder_path = payload.get("folder_path")
    row.col_release_folder_path = payload.get("release_folder_path")
    row.col_band_id = payload.get("band_id")
    row.col_release_id = payload.get("release_id")
    row.col_notes = payload.get("notes")
    row.col_match_key = key
    now = _now_iso()
    if created:
        row.col_created_at = now
    row.col_updated_at = now
    db.commit()
    db.refresh(row)
    return row


def delete_item(db: Session, user_id: int, item_id: int) -> bool:
    row = db.get(CollectionItem, item_id)
    if not row or row.col_user_id != user_id:
        return False
    db.delete(row)
    db.commit()
    return True


def delete_items(db: Session, user_id: int, item_ids: list[int]) -> int:
    """Delete many collection rows owned by user. Returns count removed."""
    removed = 0
    for item_id in item_ids:
        row = db.get(CollectionItem, item_id)
        if not row or row.col_user_id != user_id:
            continue
        db.delete(row)
        removed += 1
    if removed:
        db.commit()
    return removed


def get_item(db: Session, user_id: int, item_id: int) -> CollectionItem | None:
    row = db.get(CollectionItem, item_id)
    if not row or row.col_user_id != user_id:
        return None
    return row


def list_items(
    db: Session,
    user_id: int,
    *,
    q: str | None = None,
    subfilter: str | None = None,
    media: str | None = None,
    animation: str | None = None,
    canvas: str | None = None,
    genre: str | None = None,
    country: str | None = None,
    continent: str | None = None,
    letter: str | None = None,
    sort: str = "artist",
    order: str = "asc",
) -> list[dict]:
    rows = db.scalars(
        select(CollectionItem).where(CollectionItem.col_user_id == user_id)
    ).all()
    items = [serialize_item(db, r, include_previews=True) for r in rows]

    qn = (q or "").strip().casefold()
    if qn:
        # Collection search is title-only.
        items = [it for it in items if qn in (it["title"] or "").casefold()]

    sf = (subfilter or "").strip().casefold()
    if sf == "pending":
        items = [it for it in items if it["has_pending"]]
    elif sf == "autographs":
        items = [it for it in items if it["autographs"]]
    elif sf in ("orphan", "unlinked"):
        items = [it for it in items if it["orphan"]]
    elif sf in ("matched", "linked"):
        items = [it for it in items if it["local"]]
    elif sf == "media" and media:
        want = normalize_media_type(media)
        items = [it for it in items if (it["media_type"] or "") == want]
    elif sf == "animation" and animation:
        want = canonicalize_source(animation)
        items = [
            it
            for it in items
            if want and any(canonicalize_source(a) == want for a in it["animation"])
        ]
    elif sf == "canvas" and canvas:
        want = canonicalize_source(canvas)
        items = [
            it
            for it in items
            if want and any(canonicalize_source(c) == want for c in it["canvas"])
        ]
    elif sf == "genre" and genre:
        want = genre.strip().casefold()
        items = [
            it
            for it in items
            if any((g or "").casefold() == want for g in (it["genres"] or []))
        ]
    elif sf == "country":
        want_iso = (country or "").strip().casefold()
        want_cont = (continent or "").strip().casefold()
        if want_iso:
            items = [
                it
                for it in items
                if (it.get("country_iso") or "").casefold() == want_iso
                or (it.get("country") or "").casefold() == want_iso
            ]
        elif want_cont:
            from app.models import Continent, Country

            cont_ids: set[int] = set()
            for cont in db.scalars(select(Continent)).all():
                if (
                    str(cont.con_id) == want_cont
                    or (cont.con_name or "").casefold() == want_cont
                ):
                    cont_ids.add(cont.con_id)
            iso_set = {
                (c.cou_iso or "").strip().lower()
                for c in db.scalars(select(Country)).all()
                if c.cou_continent_id in cont_ids and c.cou_iso
            }
            items = [
                it
                for it in items
                if (it.get("country_iso") or "").casefold() in iso_set
            ]

    if letter:
        L = letter.strip().casefold()[:1]
        items = [it for it in items if (it["artist"] or "").casefold()[:1] == L]

    reverse = order.casefold() == "desc"
    sort_key = sort.casefold()

    def key_fn(it: dict):
        if sort_key == "title":
            return ((it["title"] or "").casefold(), (it["artist"] or "").casefold())
        if sort_key == "year":
            return (it["year"] or "", (it["artist"] or "").casefold(), (it["title"] or "").casefold())
        if sort_key == "edition":
            return ((it["edition"] or "").casefold(), (it["title"] or "").casefold())
        if sort_key == "type":
            return ((it["release_type"] or "").casefold(), (it["title"] or "").casefold())
        if sort_key == "media":
            return ((it["media_type"] or "").casefold(), (it["title"] or "").casefold())
        if sort_key == "genre":
            first = (it["genres"][0] if it["genres"] else "").casefold()
            return (first, (it["title"] or "").casefold())
        # default artist
        return ((it["artist"] or "").casefold(), it["year"] or "", (it["title"] or "").casefold())

    items.sort(key=key_fn, reverse=reverse)
    return items


def _edition_sort_key(it: dict) -> tuple:
    """Standard editions first; within that prefer CD over LP / other media."""
    ed = (it.get("edition") or "").casefold()
    media = (it.get("media_type") or "").casefold()
    standard = 0 if ed.startswith("standard") else 1
    if media == "cd":
        media_rank = 0
    elif media == "digital":
        media_rank = 1
    elif media == "lp":
        media_rank = 2
    else:
        media_rank = 3
    return (standard, media_rank, ed, media, it.get("version") or "")


def _shared_release_meta(versions: list[dict]) -> dict:
    """Shared list-column values for a multi-edition release group."""
    def first(key: str, default=None):
        for v in versions:
            val = v.get(key)
            if val:
                return val
        return default

    genres: list[str] = []
    for v in versions:
        g = v.get("genres") or []
        if g:
            genres = list(g)
            break
    return {
        "title": first("title", ""),
        "artist": first("artist", ""),
        "release_type": first("release_type"),
        "genres": genres,
        "country_iso": first("country_iso"),
        "band_id": first("band_id"),
        "release_id": first("release_id"),
        "year": first("year"),
    }


def group_for_cards(items: list[dict]) -> list[dict]:
    """Aggregate leaves into release-level cards (preferred Standard cover)."""
    groups: dict[str, dict] = {}
    order: list[str] = []
    for it in items:
        # Group by release identity — never edition year (remasters share a release).
        release_year = (it.get("original_date") or "")[:4] or (it.get("year") or "")
        gk = "|".join(
            [
                (it["artist"] or "").casefold(),
                (it["title"] or "").casefold(),
                release_year,
            ]
        )
        if gk not in groups:
            groups[gk] = {
                "group_key": gk,
                "artist": it["artist"],
                "title": it["title"],
                "year": it["year"],
                "band_id": it["band_id"],
                "release_id": it["release_id"],
                "release_folder_path": it["release_folder_path"],
                "country_iso": it["country_iso"],
                "cover_url": None,
                "cover_banner_url": it.get("cover_banner_url"),
                "logo_url": it.get("logo_url"),
                "disc_url": it.get("disc_url"),
                "edition": it.get("edition"),
                "media_type": it.get("media_type"),
                "original_date_display": it.get("original_date_display"),
                "id": it.get("id"),
                "versions": [],
                "version_count": 0,
                "pending": [],
                "has_pending": False,
                "local": False,
                "orphan": True,
            }
            order.append(gk)
        g = groups[gk]
        g["versions"].append(it)
        if it["local"]:
            g["local"] = True
            g["orphan"] = False
        if it["band_id"]:
            g["band_id"] = it["band_id"]
        if it["release_id"]:
            g["release_id"] = it["release_id"]
        if it.get("id") and not g.get("id"):
            g["id"] = it["id"]
        for p in it["pending"]:
            if p not in g["pending"]:
                g["pending"].append(p)
        g["has_pending"] = bool(g["pending"])
        # Prefer Standard Edition cover / banner / branding
        ed = (it["edition"] or "").casefold()
        prefer = ed.startswith("standard") or not g["cover_url"]
        if it["cover_url"] and prefer:
            if ed.startswith("standard") or not g["cover_url"]:
                g["cover_url"] = it["cover_url"]
                if it.get("cover_banner_url"):
                    g["cover_banner_url"] = it["cover_banner_url"]
                if it.get("logo_url"):
                    g["logo_url"] = it["logo_url"]
                if it.get("disc_url"):
                    g["disc_url"] = it["disc_url"]
                g["edition"] = it.get("edition")
                g["media_type"] = it.get("media_type")
                g["original_date_display"] = it.get("original_date_display")
                g["id"] = it.get("id") or g.get("id")
        elif not g["cover_url"] and it["cover_url"]:
            g["cover_url"] = it["cover_url"]
            g["cover_banner_url"] = it.get("cover_banner_url") or g.get("cover_banner_url")
            g["logo_url"] = it.get("logo_url") or g.get("logo_url")
            g["disc_url"] = it.get("disc_url") or g.get("disc_url")
            g["edition"] = it.get("edition") or g.get("edition")
            g["media_type"] = it.get("media_type") or g.get("media_type")
            g["original_date_display"] = (
                it.get("original_date_display") or g.get("original_date_display")
            )
            g["id"] = it.get("id") or g.get("id")
    for g in groups.values():
        g["versions"] = sorted(g["versions"], key=_edition_sort_key)
        g["version_count"] = len(g["versions"])
        # Default card leaf = first after sort (Standard + CD preferred)
        if g["versions"]:
            head = g["versions"][0]
            g["cover_url"] = head.get("cover_url") or g.get("cover_url")
            g["cover_banner_url"] = head.get("cover_banner_url") or g.get("cover_banner_url")
            g["logo_url"] = head.get("logo_url") or g.get("logo_url")
            g["disc_url"] = head.get("disc_url") or g.get("disc_url")
            g["edition"] = head.get("edition") or g.get("edition")
            g["media_type"] = head.get("media_type") or g.get("media_type")
            g["original_date_display"] = (
                head.get("original_date_display") or g.get("original_date_display")
            )
            g["display_date"] = head.get("display_date") or g.get("display_date")
            g["display_date_display"] = (
                head.get("display_date_display") or g.get("display_date_display")
            )
            g["year"] = head.get("year") or g.get("year")
            g["id"] = head.get("id") or g.get("id")
            shared = _shared_release_meta(g["versions"])
            g["release_type"] = shared.get("release_type")
            g["genres"] = shared.get("genres") or []
    return [groups[k] for k in order]


def group_for_table(items: list[dict]) -> list[dict]:
    """Edition rows only; first row carries rowspan meta for shared columns."""
    cards = group_for_cards(items)
    rows: list[dict] = []
    for g in cards:
        versions = list(g["versions"])
        if len(versions) <= 1:
            leaf = versions[0]
            rows.append({**leaf, "row_kind": "leaf", "group_key": g["group_key"]})
            continue
        shared = _shared_release_meta(versions)
        n = len(versions)
        for i, leaf in enumerate(versions):
            rows.append(
                {
                    **leaf,
                    "row_kind": "child",
                    "group_key": g["group_key"],
                    "is_group_head": i == 0,
                    "group_span": n if i == 0 else 0,
                    "version_count": n,
                    "group_title": shared["title"],
                    "group_artist": shared["artist"],
                    "group_release_type": shared["release_type"],
                    "group_genres": shared["genres"],
                    "group_country_iso": shared["country_iso"],
                    "group_versions": versions,
                }
            )
    return rows


def lookup_status(
    db: Session,
    user_id: int,
    *,
    folder_path: str | None = None,
    match: dict | None = None,
) -> dict:
    if folder_path:
        row = db.scalars(
            select(CollectionItem).where(
                CollectionItem.col_user_id == user_id,
                CollectionItem.col_folder_path == folder_path.replace("\\", "/"),
            )
        ).first()
        if row:
            return {"in_collection": True, "collection_id": row.col_id}
    if match:
        key = match_key(
            artist=match.get("artist") or "",
            title=match.get("title") or "",
            edition=match.get("edition"),
            media_type=match.get("media_type"),
            date_iso=match.get("original_date"),
            release_type=match.get("release_type"),
        )
        row = find_existing(db, user_id, key)
        if row:
            return {"in_collection": True, "collection_id": row.col_id}
    return {"in_collection": False, "collection_id": None}


def fuzzy_matches(db: Session, *, artist: str, title: str, limit: int = 8) -> list[dict]:
    """Suggest possible local band/release links for orphans."""
    band = _find_band_by_name(db, artist)
    if not band:
        return []
    root = _media_root()
    artist_dir = _artist_dir(root, band.bnd_name or "") if root else None
    if not artist_dir or not artist_dir.is_dir():
        return [{"band_id": band.bnd_id, "artist": band.bnd_name, "release_id": None, "folder_path": None}]
    want = (title or "").casefold()
    found: list[dict] = []
    for cat_name in AUDIO_CATEGORIES.values():
        for base in (artist_dir / "Audio" / cat_name, artist_dir / cat_name):
            if not base.is_dir():
                continue
            try:
                children = list(base.iterdir())
            except OSError:
                continue
            for child in children:
                if not child.is_dir():
                    continue
                core = _strip_bracket_suffix(strip_version_name_prefixes(child.name)).casefold()
                if want and want not in core and core not in want:
                    continue
                try:
                    rel = child.resolve().relative_to(root.resolve()).as_posix()
                except ValueError:
                    continue
                found.append(
                    {
                        "band_id": band.bnd_id,
                        "artist": band.bnd_name,
                        "title": _release_title_from_folder(child),
                        "folder_path": rel,
                        "release_id": release_id_from_path(rel),
                    }
                )
                if len(found) >= limit:
                    return found
    return found


def validate_collection_source_folder(abs_or_rel: str) -> dict:
    """Validate a picked folder as a collection leaf (release / edition / version).

    A valid leaf has a direct ``[Artwork]`` child and lives under ``Music/…``.
    """
    root = _media_root()
    if not root:
        return {"ok": False, "error": "Media library root is not configured."}
    raw = (abs_or_rel or "").strip().strip('"')
    if not raw:
        return {"ok": False, "error": "No folder selected."}
    path = Path(raw)
    if not path.is_absolute():
        path = (root / path).resolve()
    else:
        path = path.resolve()
    try:
        rel = path.relative_to(root.resolve())
    except ValueError:
        return {
            "ok": False,
            "error": "Source folder must be inside your Music library.",
        }
    parts = rel.parts
    if not parts or parts[0].casefold() != "music":
        return {
            "ok": False,
            "error": "Source folder must be under Music/{Letter}/{Artist}/…",
        }
    if len(parts) < 4:
        return {
            "ok": False,
            "error": "Pick a release, edition, or version folder — not the artist root.",
        }
    if not path.is_dir():
        return {"ok": False, "error": "Source folder not found."}
    artwork = _find_artwork_subdir(path)
    if not artwork or artwork.parent.resolve() != path.resolve():
        return {
            "ok": False,
            "error": "Source folder not valid — it must contain an [Artwork] folder.",
        }
    artist_name = parts[2] if len(parts) > 2 else ""
    return {
        "ok": True,
        "folder_path": rel.as_posix(),
        "artist_name": artist_name,
        "title": _release_title_from_folder(path),
    }


def collection_facets(db: Session, user_id: int) -> dict:
    """Distinct facet values + counts for filter tabs / dropdowns."""
    from app.music_filters import continents_for_country_ids, _country_groups_from_ids
    from app.models import Country, Genre, Subgenre

    rows = db.scalars(
        select(CollectionItem).where(CollectionItem.col_user_id == user_id)
    ).all()
    media: set[str] = set()
    animation: set[str] = set()
    canvas: set[str] = set()
    genre_names: set[str] = set()
    country_isos: set[str] = set()
    country_names: set[str] = set()
    pending_n = orphan_n = autograph_n = matched_n = 0

    for row in rows:
        try:
            folder = _resolve_folder(row.col_folder_path)
            artwork = _find_artwork_subdir(folder) if folder else None
            checklist = scan_artwork_checklist(artwork) if folder else None
            pending = compute_pending(row, checklist)
        except Exception:
            folder = None
            pending = compute_pending(row, None)
        local = bool(folder)
        if pending:
            pending_n += 1
        if not local:
            orphan_n += 1
        else:
            matched_n += 1
        if _json_list(row.col_autographs_json):
            autograph_n += 1
        mt = normalize_media_type(row.col_media_type)
        if mt:
            media.add(mt)
        for a in _json_list(row.col_animation_json):
            c = canonicalize_source(a)
            if c and c.casefold() != "none":
                animation.add(c)
        for a in _json_list(row.col_canvas_json):
            c = canonicalize_source(a)
            if c and c.casefold() != "none":
                canvas.add(c)
        for g in _json_list(row.col_genres_json):
            if g.strip():
                genre_names.add(g.strip())
        if row.col_country_iso:
            country_isos.add(row.col_country_iso.strip().lower())
        if row.col_country:
            country_names.add(row.col_country.strip())

    # Prefer live panel genres for display facets when release is linked
    for row in rows:
        if row.col_band_id and row.col_release_id:
            try:
                panel = _panel_subgenre_names(db, row.col_band_id, row.col_release_id)
            except Exception:
                panel = None
            if panel:
                for g in panel:
                    genre_names.add(g)

    used_country_ids: set[int] = set()
    name_keys = {n.casefold() for n in country_names}
    # Also index trailing country tokens from "City, Country" displays
    for n in list(country_names):
        if "," in n:
            tail = n.rsplit(",", 1)[-1].strip()
            if tail:
                name_keys.add(tail.casefold())
    try:
        for c in db.scalars(select(Country)).all():
            iso = (c.cou_iso or "").strip().lower()
            name = (c.cou_name or "").strip()
            name_cf = name.casefold() if name else ""
            if iso and iso in country_isos:
                used_country_ids.add(c.cou_id)
                continue
            if name_cf and (
                name_cf in name_keys
                or any(name_cf in nk or nk in name_cf for nk in name_keys)
            ):
                used_country_ids.add(c.cou_id)
    except Exception:
        used_country_ids = set()

    # Group collection genres under parent genre when DB knows the subgenre
    by_parent: dict[str, list[dict]] = {}
    used: set[str] = set()
    for name in sorted(genre_names, key=str.casefold):
        key = name.casefold()
        if key in used:
            continue
        used.add(key)
        parent = "Other"
        sgn_id = None
        try:
            sg = (
                db.query(Subgenre)
                .filter(Subgenre.sgn_name.ilike(name))
                .first()
            )
            if sg:
                sgn_id = sg.sgn_id
                g = db.get(Genre, sg.sgn_genre_id or 0) if sg.sgn_genre_id else None
                if g and g.gen_name:
                    parent = g.gen_name
        except Exception:
            pass
        by_parent.setdefault(parent, []).append(
            {"id": sgn_id or name, "name": name, "genre_id": None}
        )
    subgenre_groups = [
        {"genre": gname, "items": items}
        for gname, items in sorted(by_parent.items(), key=lambda x: x[0].casefold())
    ]

    country_groups: list = []
    continents: list = []
    try:
        if used_country_ids:
            country_groups = _country_groups_from_ids(db, used_country_ids)
            continents = continents_for_country_ids(db, used_country_ids)
        elif country_isos or country_names:
            # Fallback when ISO/name didn't resolve to Country rows
            synthetic: list[dict] = []
            seen: set[str] = set()
            for iso in sorted(country_isos):
                key = iso.casefold()
                if key in seen:
                    continue
                seen.add(key)
                synthetic.append(
                    {"id": iso, "name": iso.upper(), "iso": iso, "continent_id": None}
                )
            for name in sorted(country_names, key=str.casefold):
                key = name.casefold()
                if key in seen:
                    continue
                seen.add(key)
                synthetic.append(
                    {"id": name, "name": name, "iso": None, "continent_id": None}
                )
            if synthetic:
                country_groups = [{"continent": "Collection", "items": synthetic}]
    except Exception:
        country_groups = []
        continents = []

    return {
        "media": sorted(media, key=str.casefold),
        "animation": sorted(animation, key=str.casefold),
        "canvas": sorted(canvas, key=str.casefold),
        "genres": sorted(genre_names, key=str.casefold),
        "subgenre_groups": subgenre_groups,
        "country_groups": country_groups,
        "continents": continents,
        "total": len(rows),
        "counts": {
            "pending": pending_n,
            "orphan": orphan_n,
            "unlinked": orphan_n,
            "autographs": autograph_n,
            "matched": matched_n,
            "linked": matched_n,
            "media": len(media),
            "animation": len(animation),
            "canvas": len(canvas),
            "genre": len(genre_names),
            "country": max(len(used_country_ids), len(country_isos) or len(country_names)),
        },
    }
