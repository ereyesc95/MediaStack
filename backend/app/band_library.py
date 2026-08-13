"""Scan local Music/{Letter}/{Artist}/Audio folders and match top tracks."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from app.gallery import (
    IMAGE_EXTS,
    _artist_dir,
    _media_url,
    _resolve_child_dir,
)

AUDIO_CATEGORIES = {
    "albums": "Albums",
    "extended_plays": "Extended Plays",
    "compilations": "Compilations",
    "soundtracks": "Soundtracks",
    "live_albums": "Live Albums",
    "singles": "Singles",
}

# Preferred search order when resolving covers under another artist's Audio/
COVER_SEARCH_CATEGORY_ORDER = (
    "Albums",
    "Extended Plays",
    "Compilations",
    "Singles",
    "Soundtracks",
)

DATE_PREFIX_RE = re.compile(r"^(\d{4})(?:\.(\d{2})(?:\.(\d{2}))?)?")
TRACK_PREFIX_RE = re.compile(r"^\d+\.\s*")
VINYL_TRACK_PREFIX_RE = re.compile(r"^[A-Z]\d+\.\s*", re.I)
DOTTED_ACRONYM_RE = re.compile(r"^(?:[A-Za-z]\.)+[A-Za-z]\.?$")
AUDIO_EXTS = {".mp3", ".wma", ".aac", ".wav", ".flac"}
ARTWORK_DIR = "[artwork]"
COVER_FRONT_STEM = "cover - front"


@dataclass
class LocalAlbum:
    id: str
    title: str
    date: str | None
    cover_url: str | None
    folder_path: str
    category: str


@dataclass
class MatchedTrack:
    title: str
    release_date: str | None
    cover_url: str | None
    play_path: str | None
    album_folder: str | None


def _audio_root(artist_dir: Path) -> Path:
    """Release categories live at the artist root (Albums, Singles, …).

    Legacy layout kept ``Audio/{Albums,…}`` — still accepted as a fallback.
    """
    # Prefer artist root when any known category folder is present there.
    for folder_name in AUDIO_CATEGORIES.values():
        for child in (artist_dir / folder_name,):
            if child.is_dir():
                return artist_dir
        # Case-insensitive probe
        try:
            want = folder_name.casefold()
            for child in artist_dir.iterdir():
                if child.is_dir() and child.name.casefold() == want:
                    return artist_dir
        except OSError:
            break
    for name in ("Audio", "audio"):
        p = artist_dir / name
        if p.is_dir():
            return p
    return artist_dir


def _parse_folder_date(name: str) -> str | None:
    m = DATE_PREFIX_RE.match(name.strip())
    if not m:
        return None
    y, mo, d = m.group(1), m.group(2), m.group(3)
    if mo and d:
        return f"{y}-{mo}-{d}"
    if mo:
        return f"{y}-{mo}"
    return y


def _find_cover_in_folder(folder: Path, media_root: Path) -> str | None:
    for pattern in ("cover*", "folder*", "front*"):
        for p in folder.glob(pattern):
            if p.suffix.lower() in IMAGE_EXTS:
                return _media_url(p, media_root)
    for p in folder.iterdir():
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
            return _media_url(p, media_root)
    return None


def _find_artwork_subdir(folder: Path) -> Path | None:
    if not folder.is_dir():
        return None
    for child in folder.iterdir():
        if child.is_dir() and child.name.casefold() == ARTWORK_DIR:
            return child
    return None


def _find_cover_front_artwork(track_dir: Path, media_root: Path) -> str | None:
    """Cover - Front / Cover - Album inside [Artwork], walking up toward the artist."""
    from app.artwork_stems import resolve_cover_front_file

    cur = track_dir
    for _ in range(6):
        artwork = _find_artwork_subdir(cur)
        if artwork:
            cover = resolve_cover_front_file(artwork)
            if cover:
                return _media_url(cover, media_root)
        parent = cur.parent
        if parent == cur:
            break
        cur = parent
    return None


def resolve_track_file_path(path: str | None, media_root: Path) -> Path | None:
    """Resolve a play/reproduction path to an on-disk audio file.

    Accepts relative Media paths, legacy ``Audio/`` layouts, and absolute media
    server URLs (``http://host:8887/Music/...``).
    """
    if not path:
        return None
    from urllib.parse import unquote, urlparse

    raw = path.strip().replace("\\", "/")
    if "://" in raw:
        parsed = urlparse(raw)
        raw = unquote(parsed.path or "").lstrip("/")
    else:
        raw = unquote(raw).lstrip("/")
    if not raw:
        return None

    candidates = [raw]
    parts = raw.split("/")
    # Music/{Letter}/{Artist}/Audio/{Category}/… → artist-root categories
    if (
        len(parts) >= 5
        and parts[0].casefold() == "music"
        and parts[3].casefold() == "audio"
    ):
        candidates.append("/".join(parts[:3] + parts[4:]))

    root = media_root.resolve()
    for cand in candidates:
        try:
            file_path = (root / cand).resolve()
        except OSError:
            continue
        try:
            file_path.relative_to(root)
        except ValueError:
            continue
        if file_path.is_file():
            return file_path
    return None


def title_from_track_path(path: str | None) -> str:
    if not path:
        return ""
    name = Path(path.replace("\\", "/")).name
    return display_track_title_from_stem(Path(name).stem)


def cover_url_for_track_path(path: str | None, media_root: Path) -> str | None:
    if not path:
        return None
    file_path = resolve_track_file_path(path, media_root)
    if not file_path:
        return None
    return _find_cover_front_artwork(file_path.parent, media_root.resolve())


def _album_title_from_folder(name: str) -> str:
    m = DATE_PREFIX_RE.match(name.strip())
    if m:
        rest = name[m.end() :].lstrip(". ").strip()
        return rest or name
    return name


def scan_audio_library(artist_name: str | None, media_root: Path) -> dict[str, list[dict]]:
    artist_dir = _artist_dir(media_root, artist_name)
    if not artist_dir:
        return {k: [] for k in AUDIO_CATEGORIES}

    audio = _audio_root(artist_dir)
    out: dict[str, list[dict]] = {k: [] for k in AUDIO_CATEGORIES}

    for key, folder_name in AUDIO_CATEGORIES.items():
        cat_dir = _resolve_child_dir(audio, folder_name)
        if not cat_dir.is_dir():
            continue
        albums: list[LocalAlbum] = []
        for entry in sorted(cat_dir.iterdir()):
            if not entry.is_dir():
                continue
            cover = _find_cover_in_folder(entry, media_root)
            albums.append(
                LocalAlbum(
                    id=f"{key}:{entry.name}",
                    title=_album_title_from_folder(entry.name),
                    date=_parse_folder_date(entry.name),
                    cover_url=cover,
                    folder_path=entry.relative_to(media_root).as_posix(),
                    category=key,
                )
            )
        out[key] = [
            {
                "id": a.id,
                "title": a.title,
                "date": a.date,
                "cover_url": a.cover_url,
                "folder_path": a.folder_path,
                "category": a.category,
            }
            for a in albums
        ]
    return out


BRACKET_SUFFIX_RE = re.compile(r"\s*\[.*\]\s*$")
PAREN_SUFFIX_RE = re.compile(r"\s*\([^)]*\)\s*$")

TITLE_CASE_SMALL_WORDS = frozenset(
    {
        "and",
        "of",
        "from",
        "the",
        "a",
        "an",
        "in",
        "but",
        "nor",
        "or",
        "by",
        "on",
        "to",
        "into",
        "than",
        "with",
        "without",
    }
)


def _word_core_for_title_case(word: str) -> str:
    return word.strip(".,!?;:\"'()[]{}")


def _capitalize_word(word: str) -> str:
    if DOTTED_ACRONYM_RE.match(word.strip()):
        return "".join(char.upper() if char.isalpha() else char for char in word)
    for index, char in enumerate(word):
        if char.isalpha():
            return word[:index] + char.upper() + word[index + 1 :].lower()
    return word


def _lowercase_word(word: str) -> str:
    return "".join(char.lower() if char.isalpha() else char for char in word)


def _title_case_words(text: str) -> str:
    words = text.split()
    if not words:
        return text
    last_index = len(words) - 1
    out: list[str] = []
    for index, word in enumerate(words):
        core = _word_core_for_title_case(word)
        if (
            core
            and 0 < index < last_index
            and core.casefold() in TITLE_CASE_SMALL_WORDS
        ):
            out.append(_lowercase_word(word))
        else:
            out.append(_capitalize_word(word))
    return " ".join(out)


def title_case_track_title(title: str) -> str:
    """Title-case a track title; preserve trailing [bracket] suffixes unchanged."""
    text = (title or "").strip()
    if not text:
        return text
    bracket_match = BRACKET_SUFFIX_RE.search(text)
    if bracket_match:
        main = text[: bracket_match.start()].strip()
        suffix = text[bracket_match.start() :]
        if not main:
            return text
        return f"{_title_case_words(main)}{suffix}"
    return _title_case_words(text)


def _title_from_filename_stem(stem: str) -> str:
    after_num = TRACK_PREFIX_RE.sub("", stem.strip()).strip()
    vinyl = VINYL_TRACK_PREFIX_RE.match(after_num)
    if vinyl:
        rest = after_num[vinyl.end() :].lstrip(". ").strip()
        if rest:
            return rest
    return after_num


def _strip_bracket_suffix(title: str) -> str:
    return BRACKET_SUFFIX_RE.sub("", title).strip()


def _strip_title_match_suffixes(title: str) -> str:
    """Strip [bracket] and (parenthetical) suffixes for matching Spotify ↔ disk titles."""
    text = title.strip()
    changed = True
    while changed:
        changed = False
        nxt = BRACKET_SUFFIX_RE.sub("", text).strip()
        if nxt != text:
            text = nxt
            changed = True
        nxt = PAREN_SUFFIX_RE.sub("", text).strip()
        if nxt != text:
            text = nxt
            changed = True
    return text


def _normalize_title_for_match(title: str) -> str:
    return _strip_title_match_suffixes(title.strip()).casefold()


def _track_title_from_filename(path: Path) -> str:
    return _title_from_filename_stem(path.stem)


def display_track_title_from_stem(stem: str) -> str:
    """UI title — strips numeric and vinyl/cassette side prefixes (e.g. A1., B6.)."""
    after_num = TRACK_PREFIX_RE.sub("", stem.strip()).strip()
    vinyl = VINYL_TRACK_PREFIX_RE.match(after_num)
    if vinyl:
        rest = after_num[vinyl.end() :].lstrip(". ").strip()
        if rest:
            return title_case_track_title(rest)
    return title_case_track_title(after_num)


def display_track_title_from_path(path: Path) -> str:
    return display_track_title_from_stem(path.stem)


def _titles_match(expected: str, filename_stem: str) -> bool:
    file_title = _normalize_title_for_match(_title_from_filename_stem(filename_stem))
    want = _normalize_title_for_match(expected)
    return file_title == want


def _collect_audio_files(artist_dir: Path) -> list[Path]:
    audio = _audio_root(artist_dir)
    if not audio.is_dir():
        return []
    files: list[Path] = []
    for p in audio.rglob("*"):
        if p.is_file() and p.suffix.lower() in AUDIO_EXTS:
            files.append(p)
    return files


def _album_dir_for_track(file_path: Path) -> Path:
    """Release folder under Albums / Extended Plays / etc. (not edition/disc/side)."""
    current = file_path.parent
    category_names = {name.casefold() for name in AUDIO_CATEGORIES.values()}
    for _ in range(15):
        parent = current.parent
        if parent == current:
            return current
        if parent.name.casefold() in category_names:
            return current
        if parent.name.casefold() in ("audio", "music"):
            return current
        current = parent
    return file_path.parent


def _release_date_for_track(file_path: Path) -> str | None:
    folder = file_path.parent
    for _ in range(5):
        date = _parse_folder_date(folder.name)
        if date:
            return date
        if folder.parent == folder:
            break
        folder = folder.parent
    return None


def _resolve_top_titles(
    *,
    top_paths: str | None,
    top_titles: str | None,
) -> list[str]:
    titles: list[str] = []
    if top_titles:
        for raw in top_titles.replace("%36", "'").split("■"):
            t = raw.strip()
            if t:
                titles.append(t)
    if not titles and top_paths:
        for raw in top_paths.split("^"):
            raw = raw.strip()
            if not raw:
                continue
            rel = raw.replace("\\", "/")
            if "://" in rel:
                rel = rel.split("/")[-1]
            name = Path(rel).stem
            t = _title_from_filename_stem(name)
            if t:
                titles.append(t)
    return titles


def _find_audio_by_title(files: list[Path], title: str) -> Path | None:
    for f in sorted(files, key=lambda p: p.as_posix().lower()):
        if _titles_match(title, f.stem):
            return f
    return None


def _audio_category_rank(file_path: Path, audio_root: Path) -> int:
    try:
        rel = file_path.relative_to(audio_root)
    except ValueError:
        return len(COVER_SEARCH_CATEGORY_ORDER) + 1
    if not rel.parts:
        return len(COVER_SEARCH_CATEGORY_ORDER) + 1
    top = rel.parts[0]
    for index, name in enumerate(COVER_SEARCH_CATEGORY_ORDER):
        if top.casefold() == name.casefold():
            return index
    return len(COVER_SEARCH_CATEGORY_ORDER)


def _find_audio_by_title_prefer_categories(
    files: list[Path],
    title: str,
    artist_dir: Path,
) -> Path | None:
    """Match title preferring Albums → EPs → Compilations → Singles → Soundtracks → rest."""
    matches = [f for f in files if _titles_match(title, f.stem)]
    if not matches:
        return None
    audio_root = _audio_root(artist_dir)
    matches.sort(
        key=lambda p: (
            _audio_category_rank(p, audio_root),
            p.as_posix().lower(),
        )
    )
    return matches[0]


def _bracket_parts_from_stem(stem: str) -> list[str]:
    text = stem.strip()
    parts: list[str] = []
    last_bracket = re.compile(r"\s*\[([^\]]+)\]\s*$")
    while True:
        match = last_bracket.search(text)
        if not match:
            break
        for piece in match.group(1).split(";"):
            piece = piece.strip()
            if piece:
                parts.append(piece)
        text = text[: match.start()].strip()
    return parts


def _stem_has_cover_artist(stem: str, cover_artist: str) -> bool:
    want = cover_artist.casefold().strip()
    if not want:
        return False
    for part in _bracket_parts_from_stem(stem):
        match = re.match(r"^(.+?)\s+cover$", part.strip(), re.IGNORECASE)
        if not match:
            continue
        name = match.group(1).strip().casefold()
        if name == want or want in name or name in want:
            return True
    return False


def _find_audio_by_title_with_cover_tag(
    files: list[Path],
    title: str,
    cover_artist: str,
    artist_dir: Path | None = None,
) -> Path | None:
    """Match title among files tagged ``[CoverArtist cover]`` (any other bracket data allowed)."""
    matches = [
        f
        for f in files
        if _titles_match(title, f.stem)
        and _stem_has_cover_artist(f.stem, cover_artist)
    ]
    if not matches:
        return None
    if artist_dir is not None:
        audio_root = _audio_root(artist_dir)
        matches.sort(
            key=lambda p: (
                _audio_category_rank(p, audio_root),
                p.as_posix().lower(),
            )
        )
        return matches[0]
    return sorted(matches, key=lambda p: p.as_posix().lower())[0]


def _path_from_top_entry(raw: str, media_root: Path) -> Path | None:
    rel = raw.strip().replace("\\", "/")
    if not rel:
        return None
    if "://" in rel:
        idx = rel.lower().find("/music/")
        if idx >= 0:
            rel = rel[idx + 1 :]
    while rel.startswith("/"):
        rel = rel[1:]
    file_path = media_root / rel
    return file_path if file_path.is_file() else None


def match_top_tracks(
    artist_name: str | None,
    media_root: Path,
    *,
    top_paths: str | None = None,
    top_titles: str | None = None,
    limit: int = 5,
) -> list[dict]:
    """Resolve top tracks by exact local title match under Audio/."""
    from app.release_playback_art import resolve_display_cover_for_audio

    artist_dir = _artist_dir(media_root, artist_name)
    if not artist_dir:
        return []

    files = _collect_audio_files(artist_dir)
    titles = _resolve_top_titles(top_paths=top_paths, top_titles=top_titles)
    path_entries = (
        [p.strip() for p in top_paths.split("^") if p.strip()] if top_paths else []
    )

    items: list[dict] = []
    seen: set[str] = set()

    for i, title in enumerate(titles):
        if len(items) >= limit:
            break
        key = _normalize_title_for_match(title)
        if not key or key in seen:
            continue

        matched: Path | None = None
        if i < len(path_entries):
            explicit = _path_from_top_entry(path_entries[i], media_root)
            if explicit and _titles_match(title, explicit.stem):
                matched = explicit

        if matched is None:
            matched = _find_audio_by_title(files, title)

        if matched is None:
            continue

        seen.add(key)
        try:
            play_path = matched.relative_to(media_root).as_posix()
        except ValueError:
            play_path = matched.as_posix()
        try:
            album_folder = _album_dir_for_track(matched).relative_to(media_root).as_posix()
        except ValueError:
            album_folder = None
        items.append(
            {
                "title": display_track_title_from_path(matched),
                "release_date": _release_date_for_track(matched),
                "cover_url": resolve_display_cover_for_audio(
                    matched,
                    media_root,
                    band_name=artist_name,
                    track_title=title,
                ),
                "play_path": play_path,
                "album_folder": album_folder,
            }
        )

    return items
