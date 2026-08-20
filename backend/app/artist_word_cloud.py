"""Lyrics word cloud for artist About tab."""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import _collect_audio_files, match_top_tracks
from app.config import settings
from app.gallery import _artist_dir
from app.models import Band, TrackOverride
from app.services.lyrics import LYRICS_CACHE_DIR, _read_lrc_file, _strip_lrc_tags

WORD_CLOUD_TERM_LIMIT = 50

WORD_RE = re.compile(r"[a-z0-9']{2,}", re.IGNORECASE)
LRC_TAG_RE = re.compile(r"\[[^\]]+\]")
CONTRACTION_RE = re.compile(
    r"^(i|you|he|she|we|they|it|who|what|where|when|why|how|that|there|here|let|ain)"
    r"['']?(m|s|re|ve|ll|d|t)$",
    re.IGNORECASE,
)

STOP_WORDS = frozenset(
    """
    a an and are as at be but by for from had has have he her hers him his i if in into
    is it its me my no nor not of on or our ours out she so than that the their them then
    there these they this those to too up us was we were what when where which who why will
    with you your yours am been being can could did do does doing done get got having
    just like ll re s t ve vey ya yeah oh ah um uh la na da di de du le les des ein eine
    im i'm ill i'll ive i've id i'd youre you're youll you'll youve you've youd you'd
    hes he's hell he'll shed she'd shes she's shell she'll wed we'd were we're weve we've
    well we'll theyre they're theyll they'll theyve they've theyd they'd thats that's
    theres there's heres here's wont won't can't cannot dont don't doesnt doesn't didnt
    didn't isnt isn't wasnt wasn't werent weren't havent haven't hasnt hasn't hadnt hadn't
    shouldnt shouldn't wouldnt wouldn't couldnt couldn't ain't aint lets let's
    """.split()
)


def _is_stop_word(word: str) -> bool:
    w = word.casefold().strip("'")
    if not w or w in STOP_WORDS:
        return True
    if CONTRACTION_RE.match(w):
        return True
    if "'" in w:
        head = w.split("'", 1)[0]
        if head in STOP_WORDS:
            return True
    return False


def _tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    for match in WORD_RE.finditer(text.casefold()):
        word = match.group(0).strip("'")
        if _is_stop_word(word):
            continue
        tokens.append(word)
    return tokens


def _lyrics_from_cache_file(path: Path) -> str | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    lyrics = (data.get("lyrics") or "").strip()
    return lyrics or None


def _collect_lrc_lyrics(
    artist_dir: Path,
    media_root: Path,
    *,
    db: Session | None = None,
    seen_paths: set[str] | None = None,
) -> list[tuple[str, str]]:
    texts: list[tuple[str, str]] = []
    seen = seen_paths if seen_paths is not None else set()
    for audio in _collect_audio_files(artist_dir):
        try:
            play_path = audio.relative_to(media_root).as_posix()
        except ValueError:
            continue
        if play_path in seen:
            continue
        lrc = _read_lrc_file(play_path, db=db)
        if not lrc and audio.with_suffix(".lrc").is_file():
            try:
                raw = audio.with_suffix(".lrc").read_text(encoding="utf-8", errors="replace")
                lrc = _strip_lrc_tags(raw).strip() or None
            except OSError:
                lrc = None
        if lrc:
            seen.add(play_path)
            texts.append((play_path, lrc))
    return texts


def _lyrics_text_from_override(row: TrackOverride) -> str | None:
    lrc = (row.tro_lyrics_lrc or "").strip()
    if lrc:
        text = _strip_lrc_tags(lrc).strip()
        if text:
            return text
    plain = (row.tro_lyrics_plain or "").strip()
    return plain or None


def _artist_path_prefix(band: Band, media_root: Path) -> str | None:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return None
    try:
        rel = artist_dir.relative_to(media_root).as_posix().casefold()
    except ValueError:
        return None
    return f"{rel}/" if rel else None


def _collect_override_lyrics(
    db: Session,
    band: Band,
    media_root: Path | None,
) -> list[tuple[str, str]]:
    band_id = band.bnd_id
    rows: dict[str, TrackOverride] = {}
    for row in db.scalars(
        select(TrackOverride).where(TrackOverride.tro_band_id == band_id)
    ).all():
        path = (row.tro_play_path or "").strip()
        if path:
            rows[path.casefold()] = row

    if media_root:
        prefix = _artist_path_prefix(band, media_root)
        if prefix:
            for row in db.scalars(
                select(TrackOverride).where(TrackOverride.tro_band_id.is_(None))
            ).all():
                path = (row.tro_play_path or "").strip()
                if not path:
                    continue
                key = path.casefold()
                if key in rows:
                    continue
                if path.casefold().startswith(prefix):
                    rows[key] = row

    out: list[tuple[str, str]] = []
    for row in rows.values():
        path = (row.tro_play_path or "").strip()
        text = _lyrics_text_from_override(row)
        if path and text:
            out.append((path, text))
    return out


def _collect_cached_lyrics(
    artist_name: str,
    *,
    seen_text_hashes: set[str] | None = None,
) -> list[str]:
    if not LYRICS_CACHE_DIR.is_dir():
        return []
    needle = artist_name.casefold()
    seen = seen_text_hashes if seen_text_hashes is not None else set()
    texts: list[str] = []
    for path in LYRICS_CACHE_DIR.glob("*.json"):
        text = _lyrics_from_cache_file(path)
        if not text:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if (data.get("artist") or "").casefold() != needle:
                continue
        except (json.JSONDecodeError, OSError):
            continue
        digest = hashlib.sha256(text.casefold().encode("utf-8")).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)
        texts.append(text)
    return texts


def build_word_cloud(
    db: Session,
    band: Band,
    *,
    limit: int = WORD_CLOUD_TERM_LIMIT,
) -> dict:
    from collections import defaultdict

    from app.band_library import _track_title_from_filename, display_track_title_from_path
    from app.media_index import (
        _release_dir_from_content_folder,
        release_id_from_path,
    )

    artist_name = (band.bnd_name or "").strip()
    seen_paths: set[str] = set()
    seen_text_hashes: set[str] = set()
    # (play_path|None, lyrics text)
    sources_list: list[tuple[str | None, str]] = []

    media_root = Path(settings.media_root) if settings.media_root else None

    for play_path, text in _collect_override_lyrics(db, band, media_root):
        key = play_path.casefold()
        if key in seen_paths:
            continue
        seen_paths.add(key)
        digest = hashlib.sha256(text.casefold().encode("utf-8")).hexdigest()
        seen_text_hashes.add(digest)
        sources_list.append((play_path, text))

    if media_root:
        artist_dir = _artist_dir(media_root, band.bnd_name)
        if artist_dir:
            for play_path, text in _collect_lrc_lyrics(
                artist_dir, media_root, db=db, seen_paths=seen_paths
            ):
                digest = hashlib.sha256(text.casefold().encode("utf-8")).hexdigest()
                seen_text_hashes.add(digest)
                sources_list.append((play_path, text))

    for text in _collect_cached_lyrics(
        artist_name, seen_text_hashes=seen_text_hashes
    ):
        sources_list.append((None, text))

    counter: Counter[str] = Counter()
    word_tracks: dict[str, set[str]] = defaultdict(set)
    for play_path, text in sources_list:
        words = _tokenize(text)
        counter.update(words)
        if play_path:
            for word in set(words):
                word_tracks[word].add(play_path)

    if not counter:
        return {
            "terms": [],
            "track_sources": 0,
            "ready": False,
            "hint": "Open Lyrics on a few tracks to build the word cloud, or run Build from cached lyrics.",
        }

    def _track_payload(play_path: str) -> dict | None:
        if not media_root:
            return {
                "title": Path(play_path).stem,
                "play_path": play_path,
                "release_id": None,
                "navigate_band_id": band.bnd_id,
                "release_title": None,
            }
        audio = media_root / Path(play_path.replace("\\", "/"))
        try:
            title = (
                display_track_title_from_path(audio)
                if audio.is_file()
                else _track_title_from_filename(audio)
            )
        except Exception:
            title = Path(play_path).name
        release_id = None
        release_title = None
        try:
            parent = audio.parent if audio.exists() else (media_root / Path(play_path).parent)
            release_dir = _release_dir_from_content_folder(parent)
            rel = release_dir.relative_to(media_root).as_posix()
            release_id = release_id_from_path(rel)
            from app.media_index import entry_display_name
            from app.franchise_index import parse_dated_folder_name

            folder_name = entry_display_name(release_dir)
            _date_iso, title_part = parse_dated_folder_name(folder_name)
            release_title = title_part or folder_name
        except Exception:
            pass
        return {
            "title": title,
            "play_path": play_path,
            "release_id": release_id,
            "navigate_band_id": band.bnd_id,
            "release_title": release_title,
        }

    max_count = max(counter.values())
    terms = []
    for word, count in counter.most_common(limit):
        tracks = []
        seen_titles: set[str] = set()
        for path in sorted(word_tracks.get(word) or ()):
            payload = _track_payload(path)
            if not payload:
                continue
            key = (payload.get("title") or "").casefold()
            if key in seen_titles:
                continue
            seen_titles.add(key)
            tracks.append(payload)
        terms.append(
            {
                "text": word,
                "count": count,
                "weight": round(0.35 + 0.65 * (count / max_count), 3),
                "tracks": tracks,
            }
        )
    return {
        "terms": terms,
        "track_sources": len(sources_list),
        "ready": True,
        "hint": None,
    }


async def prefetch_lyrics_for_cloud(db: Session, band: Band, *, max_tracks: int = 24) -> int:
    """Fetch lyrics for top/local tracks to populate cache. Returns count cached."""
    from app.services.lyrics import resolve_lyrics

    if not settings.media_root:
        return 0
    media_root = Path(settings.media_root)
    artist_name = (band.bnd_name or "").strip()
    if not artist_name:
        return 0

    candidates: list[tuple[str, str | None]] = []
    for t in match_top_tracks(
        band.bnd_name,
        media_root,
        top_paths=band.bnd_top_tracks,
        top_titles=band.bnd_top_100,
        limit=max_tracks,
    ):
        title = (t.get("title") or "").strip()
        path = t.get("play_path")
        if title:
            candidates.append((title, path))

    if len(candidates) < max_tracks:
        artist_dir = _artist_dir(media_root, band.bnd_name)
        if artist_dir:
            seen: set[str] = set()
            for audio in _collect_audio_files(artist_dir):
                from app.band_library import _track_title_from_filename

                title = _track_title_from_filename(audio)
                key = title.casefold()
                if key in seen or not title:
                    continue
                seen.add(key)
                try:
                    path = audio.relative_to(media_root).as_posix()
                except ValueError:
                    path = audio.as_posix()
                candidates.append((title, path))
                if len(candidates) >= max_tracks:
                    break

    cached = 0
    for title, path in candidates[:max_tracks]:
        lyrics, _ = await resolve_lyrics(artist_name, title, play_path=path, db=db)
        if lyrics:
            cached += 1
    return cached
