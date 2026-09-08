"""Live, cross-module quizzes for franchise hubs and standalone media leaves."""
from __future__ import annotations

import hashlib
import json
import random
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_index import (
    FranchiseEntry,
    build_franchise_index,
    is_unofficial_folder,
    normalize_franchise_slug,
)
from app.gallery import IMAGE_EXTS, _media_url
from app.paths import DATA_DIR
from app.series_index import _series_folder_cover
from app.series_paths import find_episodes_root, find_extras_dir, find_gallery_root

MODULE_LABELS = {
    "series": "Series",
    "movie": "Movies",
    "book": "Books",
}
MODULE_ORDER = {"series": 0, "movie": 1, "book": 2, "game": 3}
QUIZ_ENTRY_KINDS = frozenset(MODULE_LABELS)
NUMBER_PREFIX_RE = re.compile(r"^\s*(\d+)\.\s*(.+)$")
BRACKET_RE = re.compile(r"\s*\[([^\]]+)\]")
SEASON_RE = re.compile(r"\bseason\s*(\d+)\b", re.I)
SPECIAL_RE = re.compile(r"\bspecials?\b", re.I)


def _root() -> Path | None:
    root = Path(settings.media_root or "")
    return root if root.is_dir() else None


def normalize_answer(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("█", "'").replace("■", ",").casefold()
    return "".join(ch for ch in text if ch.isalnum())


def _is_unofficial_path(path: str) -> bool:
    return any(is_unofficial_folder(part) for part in Path(path).parts)


def _live_group(slug: str):
    root = _root()
    if not root:
        return None, None
    index = build_franchise_index(root)
    return root, index.franchises.get(normalize_franchise_slug(slug))


def _dedupe_entries(entries: list[FranchiseEntry]) -> list[FranchiseEntry]:
    seen: set[tuple[str, str]] = set()
    out: list[FranchiseEntry] = []
    for entry in entries:
        key = (entry.kind, entry.path.casefold().rstrip("/"))
        if key in seen or _is_unofficial_path(entry.path):
            continue
        seen.add(key)
        out.append(entry)
    return out


def _catalog_entries(entries: list[FranchiseEntry]) -> list[FranchiseEntry]:
    """Drop the synthetic Series franchise root when dated shows exist."""
    clean = [
        entry
        for entry in _dedupe_entries(entries)
        if entry.kind in QUIZ_ENTRY_KINDS
    ]
    series = [entry for entry in clean if entry.kind == "series"]
    series_leaves = [entry for entry in series if entry.subseries]
    if series_leaves:
        clean = [entry for entry in clean if entry.kind != "series"] + series_leaves
    return sorted(
        clean,
        key=lambda entry: (
            MODULE_ORDER.get(entry.kind, 99),
            entry.date_iso or "9999",
            entry.title.casefold(),
        ),
    )


def _scope_entries(
    entries: list[FranchiseEntry], scope_path: str | None
) -> list[FranchiseEntry]:
    clean = _catalog_entries(entries)
    if not scope_path:
        return clean
    wanted = scope_path.replace("\\", "/").casefold().rstrip("/")
    return [
        entry
        for entry in clean
        if entry.path.replace("\\", "/").casefold().rstrip("/") == wanted
    ]


def _navigate_id(entry: FranchiseEntry, root: Path) -> str:
    if entry.kind == "movie":
        from app.movies_index import _film_id

        return _film_id(entry.path)
    if entry.kind == "book":
        from app.books_store import book_id_for_dir

        return book_id_for_dir(root / entry.path) or entry.path
    if entry.kind == "series":
        return Path(entry.path).name
    return entry.path


def build_catalog(
    slug: str, *, scope_path: str | None = None, _context=None
) -> dict:
    root, group = _context or _live_group(slug)
    if not root or not group or scope_path:
        return {"columns": [], "total": 0}
    columns: dict[str, list[dict]] = {}
    for entry in _catalog_entries(group.entries):
        folder = root / entry.path
        bucket = MODULE_LABELS.get(entry.kind)
        if not bucket or not folder.is_dir():
            continue
        columns.setdefault(bucket, []).append(
            {
                "id": f"{entry.kind}:{_navigate_id(entry, root)}",
                "module": entry.kind,
                "navigate_id": _navigate_id(entry, root),
                "title": entry.title,
                "date_iso": entry.date_iso,
                "cover_url": _series_folder_cover(folder, root),
                "path": entry.path,
            }
        )
    payload = [
        {"key": key.casefold(), "label": key, "items": items}
        for key, items in columns.items()
        if items
    ]
    return {"columns": payload, "total": sum(len(col["items"]) for col in payload)}


def _extras_root(folder: Path) -> Path | None:
    gallery = find_gallery_root(folder)
    if not gallery:
        return None
    try:
        return next(
            (
                child
                for child in gallery.iterdir()
                if child.is_dir() and child.name.casefold() == "extras"
            ),
            None,
        )
    except OSError:
        return None


def _encyclopedia_file(path: Path) -> tuple[int | None, str, str, str] | None:
    if not path.is_file() or path.suffix.casefold() not in IMAGE_EXTS:
        return None
    if is_unofficial_folder(path.stem):
        return None
    stem = path.stem.strip()
    number: int | None = None
    numbered = NUMBER_PREFIX_RE.match(stem)
    if numbered:
        number = int(numbered.group(1))
        stem = numbered.group(2).strip()
    suffixes = [
        match.group(1).strip()
        for match in BRACKET_RE.finditer(stem)
        if match.group(1).strip().casefold() != "unofficial"
    ]
    base = BRACKET_RE.sub("", stem).strip(" .-_")
    key = normalize_answer(base)
    if not key:
        return None
    variant = base
    if suffixes:
        variant += " - " + " - ".join(suffixes)
    return number, base, key, variant


def _topic_rows(
    root: Path, entries: list[FranchiseEntry]
) -> dict[str, dict]:
    topics: dict[str, dict] = {}
    for entry in entries:
        folder = root / entry.path
        extras = _extras_root(folder)
        if not extras:
            continue
        try:
            children = sorted(extras.iterdir(), key=lambda path: path.name.casefold())
        except OSError:
            continue
        sources: list[tuple[str, Path]] = [("Extras", extras)]
        sources.extend(
            (child.name, child) for child in children if child.is_dir()
        )
        for topic_label, topic_dir in sources:
            topic_key = topic_label.casefold()
            topic = topics.setdefault(
                topic_key, {"key": topic_key, "label": topic_label, "rows": {}}
            )
            try:
                files = sorted(topic_dir.iterdir(), key=lambda path: path.name.casefold())
            except OSError:
                continue
            for path in files:
                parsed = _encyclopedia_file(path)
                if not parsed:
                    continue
                number, base, identity, variant = parsed
                row = topic["rows"].setdefault(
                    identity,
                    {
                        "id": identity,
                        "title": base,
                        "number": number,
                        "variants": [],
                    },
                )
                if number is not None and (
                    row["number"] is None or number < row["number"]
                ):
                    row["number"] = number
                url = _media_url(path, root)
                try:
                    url = f"{url}&v={int(path.stat().st_mtime)}"
                except OSError:
                    pass
                row["variants"].append(
                    {
                        "id": hashlib.sha256(
                            path.as_posix().casefold().encode()
                        ).hexdigest()[:12],
                        "url": url,
                        "title": variant,
                        "source_title": entry.title,
                        "module": entry.kind,
                    }
                )
    return topics


def encyclopedia_topics(
    slug: str, *, scope_path: str | None = None, _context=None
) -> dict:
    root, group = _context or _live_group(slug)
    if not root or not group:
        return {"topics": []}
    topics = _topic_rows(root, _scope_entries(group.entries, scope_path))
    out = [
        {
            "key": topic["key"],
            "label": topic["label"],
            "count": len(topic["rows"]),
        }
        for topic in topics.values()
        if len(topic["rows"]) >= 2
    ]
    out.sort(key=lambda item: item["label"].casefold())
    return {"topics": out}


def build_encyclopedia(
    slug: str, topic_key: str, *, scope_path: str | None = None
) -> dict:
    root, group = _live_group(slug)
    if not root or not group:
        return {"topic": topic_key, "items": []}
    topic = _topic_rows(
        root, _scope_entries(group.entries, scope_path)
    ).get(topic_key.casefold())
    if not topic:
        return {"topic": topic_key, "items": []}
    items = list(topic["rows"].values())
    items.sort(
        key=lambda item: (
            item["number"] is None,
            item["number"] if item["number"] is not None else 10**9,
            item["title"].casefold(),
        )
    )
    return {"topic": topic["label"], "items": items}


def _work_roots(entries: list[FranchiseEntry], root: Path) -> list[Path]:
    folders: dict[str, Path] = {}
    for entry in _dedupe_entries(entries):
        parts = Path(entry.path).parts
        depth = 4 if entry.kind == "game" else 3
        if len(parts) >= depth:
            work = root.joinpath(*parts[:depth])
            folders[str(work).casefold()] = work
    return list(folders.values())


def _audio_folders(
    root: Path, entries: list[FranchiseEntry], scope_path: str | None
) -> list[Path]:
    if scope_path:
        wanted = scope_path.replace("\\", "/").casefold().rstrip("/")
        entry = next(
            (
                item
                for item in _dedupe_entries(entries)
                if item.path.replace("\\", "/").casefold().rstrip("/") == wanted
            ),
            None,
        )
        folder = root / entry.path if entry else None
        return [folder] if folder and folder.is_dir() else []
    folders = _work_roots(entries, root)
    for entry in _catalog_entries(entries):
        folder = root / entry.path
        if folder.is_dir():
            folders.append(folder)
    unique = {str(folder).casefold(): folder for folder in folders}
    return list(unique.values())


def original_soundtrack_items(
    db: Session, slug: str, *, scope_path: str | None = None, _context=None
) -> list[dict]:
    root, group = _context or _live_group(slug)
    if not root or not group:
        return []
    from app.series_extras import collect_audio_tracks_from_folders

    tracks = collect_audio_tracks_from_folders(
        db,
        _audio_folders(root, group.entries, scope_path),
        root,
        official_only=True,
        exclude_tagged_tracks=True,
        shortcuts_only=True,
    )
    seen: set[str] = set()
    out: list[dict] = []
    for track in tracks:
        key = normalize_answer(track.get("title") or "")
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(
            {
                **track,
                "subtitle": track.get("artist") or "",
                "cover_aspect": "square",
            }
        )
    return out


def _season_cover(folder: Path, suffix: str, root: Path) -> str | None:
    match = SEASON_RE.search(suffix)
    if not match:
        return None
    number = int(match.group(1))
    episodes = find_episodes_root(folder)
    try:
        season = next(
            (
                child
                for child in episodes.iterdir()
                if child.is_dir()
                and re.search(rf"\bseason\s*{number}\b", child.name, re.I)
            ),
            None,
        )
    except OSError:
        season = None
    return _series_folder_cover(season, root) if season else None


def openings_endings_items(
    slug: str, *, scope_path: str | None = None, _context=None
) -> list[dict]:
    root, group = _context or _live_group(slug)
    if not root or not group:
        return []
    entries = _scope_entries(group.entries, scope_path)
    seen_paths: set[str] = set()
    audio_matches: dict[tuple[str, str], Path | None] = {}
    out: list[dict] = []
    from app.series_extras import (
        _extract_by_artist,
        _match_theme_audio,
        _video_item,
    )

    for entry in entries:
        folder = root / entry.path
        extras = find_extras_dir(folder)
        if not extras:
            continue
        try:
            files = sorted(extras.iterdir(), key=lambda path: path.name.casefold())
        except OSError:
            continue
        for path in files:
            if not path.is_file() or is_unofficial_folder(path.stem):
                continue
            item = _video_item(
                path,
                root,
                subseries={
                    "id": _navigate_id(entry, root),
                    "title": entry.title,
                    "folder_path": entry.path,
                },
            )
            kind = item.get("kind")
            if kind not in {"opening", "ending"}:
                continue
            rel = str(item.get("play_path") or "")
            if not rel or rel.casefold() in seen_paths:
                continue
            seen_paths.add(rel.casefold())
            artist = _extract_by_artist(path.stem)
            match_key = (
                normalize_answer(str(item.get("title") or "")),
                normalize_answer(artist or "Various Artists"),
            )
            if match_key not in audio_matches:
                audio_matches[match_key] = _match_theme_audio(
                    root,
                    title=str(item.get("title") or ""),
                    artist_name=artist,
                )
            matched_audio = audio_matches[match_key]
            play_path = (
                matched_audio.relative_to(root).as_posix()
                if matched_audio and matched_audio.is_file()
                else rel
            )
            suffix = str(item.get("video_suffix") or "")
            season = SEASON_RE.search(suffix) if entry.kind == "series" else None
            if season:
                subtitle = f"Season {int(season.group(1))} {kind}"
            elif entry.kind == "series" and SPECIAL_RE.search(suffix):
                subtitle = f"Special {kind}"
            else:
                subtitle = f"{entry.title} {kind}"
            out.append(
                {
                    "id": item["id"],
                    "title": item.get("title") or path.stem,
                    "subtitle": subtitle,
                    "play_path": play_path,
                    "cover_url": (
                        _season_cover(folder, suffix, root)
                        if entry.kind == "series"
                        else None
                    )
                    or _series_folder_cover(folder, root),
                    "cover_aspect": "portrait",
                }
            )
    return out


def _questions(items: list[dict], rounds: int) -> list[dict]:
    if len(items) < 3:
        return []
    questions: list[dict] = []
    for correct in random.sample(items, min(max(1, rounds), 10, len(items))):
        distractors = random.sample(
            [item for item in items if item["id"] != correct["id"]], 2
        )
        choices = [correct, *distractors]
        random.shuffle(choices)
        questions.append(
            {
                "id": correct["id"],
                "play_path": correct["play_path"],
                "correct_id": correct["id"],
                "choices": choices,
            }
        )
    return questions


def build_soundtrack(
    db: Session,
    slug: str,
    *,
    topic: str = "original",
    scope_path: str | None = None,
    rounds: int = 10,
) -> dict:
    items = (
        openings_endings_items(slug, scope_path=scope_path)
        if topic == "openings-endings"
        else original_soundtrack_items(db, slug, scope_path=scope_path)
    )
    return {
        "topic": topic,
        "questions": _questions(items, rounds),
        "available_count": len(items),
    }


def availability(
    db: Session, slug: str, *, scope_path: str | None = None
) -> dict:
    context = _live_group(slug)
    root, group = context
    if not root or not group:
        return {
            "catalog": False,
            "encyclopedia": False,
            "soundtrack": False,
            "encyclopedia_topics": [],
            "soundtrack_topics": [],
        }
    catalog = build_catalog(slug, scope_path=scope_path, _context=context)
    encyclopedia = encyclopedia_topics(
        slug, scope_path=scope_path, _context=context
    )
    original = original_soundtrack_items(
        db, slug, scope_path=scope_path, _context=context
    )
    themes = openings_endings_items(
        slug, scope_path=scope_path, _context=context
    )
    soundtrack_topics = []
    if len(original) >= 3:
        soundtrack_topics.append(
            {"key": "original", "label": "Original Soundtrack", "count": len(original)}
        )
    if len(themes) >= 3:
        soundtrack_topics.append(
            {
                "key": "openings-endings",
                "label": "Openings & Endings",
                "count": len(themes),
            }
        )
    return {
        "catalog": not scope_path and catalog["total"] >= 2,
        "encyclopedia": bool(encyclopedia["topics"]),
        "soundtrack": bool(soundtrack_topics),
        "encyclopedia_topics": encyclopedia["topics"],
        "soundtrack_topics": soundtrack_topics,
    }


def _score_path(user_id: int, slug: str) -> Path:
    key = hashlib.sha256(normalize_franchise_slug(slug).encode()).hexdigest()[:16]
    folder = DATA_DIR / "quiz_scores"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"franchise_{user_id}_{key}.json"


def load_scores(user_id: int, slug: str) -> dict:
    path = _score_path(user_id, slug)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_score(
    user_id: int,
    slug: str,
    *,
    quiz_type: str,
    score: int,
    total: int,
    time_ms: int,
) -> dict:
    data = load_scores(user_id, slug)
    previous = data.get(quiz_type) or {}
    best_score = max(int(previous.get("best_score") or 0), score)
    best_time = previous.get("best_time_ms")
    if score >= best_score and (best_time is None or time_ms < int(best_time)):
        best_time = time_ms
    row = {
        "best_score": best_score,
        "best_total": max(int(previous.get("best_total") or 0), total),
        "best_time_ms": best_time,
        "last_score": score,
        "last_total": total,
        "last_time_ms": time_ms,
    }
    data[quiz_type] = row
    path = _score_path(user_id, slug)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
    return row
