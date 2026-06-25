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

DATE_PREFIX_RE = re.compile(r"^(\d{4})(?:\.(\d{2})(?:\.(\d{2}))?)?")
TRACK_PREFIX_RE = re.compile(r"^\d+\.\s*")
VINYL_TRACK_PREFIX_RE = re.compile(r"^[A-Z]\d+\.\s*", re.I)
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
    for name in ("Audio", "audio"):
        p = artist_dir / name
        if p.is_dir():
            return p
    return artist_dir / "Audio"


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
    """Cover - Front / Cover - Album inside [Artwork] in track folder, else one level up."""
    from app.artwork_stems import resolve_cover_front_file

    for base in (track_dir, track_dir.parent):
        artwork = _find_artwork_subdir(base)
        if not artwork:
            continue
        cover = resolve_cover_front_file(artwork)
        if cover:
            return _media_url(cover, media_root)
    return None


def title_from_track_path(path: str | None) -> str:
    if not path:
        return ""
    name = Path(path.replace("\\", "/")).name
    stem = Path(name).stem
    raw = TRACK_PREFIX_RE.sub("", stem).strip()
    return title_case_track_title(raw)


def cover_url_for_track_path(path: str | None, media_root: Path) -> str | None:
    if not path:
        return None
    root = media_root.resolve()
    file_path = (root / path.replace("\\", "/")).resolve()
    if not str(file_path).startswith(str(root)) or not file_path.is_file():
        return None
    return _find_cover_front_artwork(file_path.parent, root)


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
    return TRACK_PREFIX_RE.sub("", stem).strip()


def _strip_bracket_suffix(title: str) -> str:
    return BRACKET_SUFFIX_RE.sub("", title).strip()


def _normalize_title_for_match(title: str) -> str:
    return _strip_bracket_suffix(title.strip()).casefold()


def _track_title_from_filename(path: Path) -> str:
    return _title_from_filename_stem(path.stem)


def display_track_title_from_path(path: Path) -> str:
    """UI title — strips numeric and vinyl side prefixes (e.g. A1.)."""
    stem = path.stem.strip()
    after_num = TRACK_PREFIX_RE.sub("", stem).strip()
    vinyl = VINYL_TRACK_PREFIX_RE.match(after_num)
    if vinyl:
        rest = after_num[vinyl.end() :].lstrip(". ").strip()
        if rest:
            return title_case_track_title(rest)
    return title_case_track_title(_track_title_from_filename(path))


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
    album_dir = file_path.parent
    while album_dir.name.lower() in ("standard edition", "deluxe edition", "bonus"):
        album_dir = album_dir.parent
    return album_dir


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
                "title": title,
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
