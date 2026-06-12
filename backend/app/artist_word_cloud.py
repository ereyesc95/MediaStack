"""Lyrics word cloud for artist About tab."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import _collect_audio_files, match_top_tracks
from app.config import settings
from app.gallery import _artist_dir
from app.models import Band
from app.services.lyrics import LYRICS_CACHE_DIR, _read_lrc_file, _strip_lrc_tags

WORD_RE = re.compile(r"[a-z0-9']{3,}", re.IGNORECASE)
LRC_TAG_RE = re.compile(r"\[[^\]]+\]")

STOP_WORDS = frozenset(
    """
    a an and are as at be but by for from had has have he her hers him his i if in into
    is it its me my no nor not of on or our ours out she so than that the their them then
    there these they this those to too up us was we were what when where which who why will
    with you your yours am been being can could did do does doing done get got had has having
    just like ll re s t ve vey ya yeah oh ah um uh la na da di de du le les des ein eine
    """.split()
)


def _tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    for match in WORD_RE.finditer(text.casefold()):
        word = match.group(0).strip("'")
        if len(word) < 3 or word in STOP_WORDS:
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


def _collect_cached_lyrics(artist_name: str) -> list[str]:
    if not LYRICS_CACHE_DIR.is_dir():
        return []
    needle = artist_name.casefold()
    texts: list[str] = []
    for path in LYRICS_CACHE_DIR.glob("*.json"):
        text = _lyrics_from_cache_file(path)
        if not text:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if (data.get("artist") or "").casefold() == needle:
                texts.append(text)
        except (json.JSONDecodeError, OSError):
            continue
    return texts


def _collect_lrc_lyrics(artist_dir: Path, media_root: Path) -> list[str]:
    texts: list[str] = []
    seen: set[str] = set()
    for audio in _collect_audio_files(artist_dir):
        try:
            play_path = audio.relative_to(media_root).as_posix()
        except ValueError:
            continue
        if play_path in seen:
            continue
        lrc = _read_lrc_file(play_path)
        if not lrc and audio.with_suffix(".lrc").is_file():
            try:
                raw = audio.with_suffix(".lrc").read_text(encoding="utf-8", errors="replace")
                lrc = _strip_lrc_tags(raw).strip() or None
            except OSError:
                lrc = None
        if lrc:
            seen.add(play_path)
            texts.append(lrc)
    return texts


def build_word_cloud(
    db: Session,
    band: Band,
    *,
    limit: int = 48,
) -> dict:
    artist_name = (band.bnd_name or "").strip()
    texts: list[str] = []
    sources = 0

    cached_texts = _collect_cached_lyrics(artist_name)
    texts.extend(cached_texts)
    sources += len(cached_texts)

    if settings.media_root:
        media_root = Path(settings.media_root)
        artist_dir = _artist_dir(media_root, band.bnd_name)
        if artist_dir:
            lrc_texts = _collect_lrc_lyrics(artist_dir, media_root)
            texts.extend(lrc_texts)
            sources += len(lrc_texts)

    counter: Counter[str] = Counter()
    for text in texts:
        counter.update(_tokenize(text))

    if not counter:
        return {
            "terms": [],
            "track_sources": 0,
            "ready": False,
            "hint": "Open Lyrics on a few tracks to build the word cloud, or run Build from cached lyrics.",
        }

    max_count = max(counter.values())
    terms = [
        {
            "text": word,
            "count": count,
            "weight": round(0.35 + 0.65 * (count / max_count), 3),
        }
        for word, count in counter.most_common(limit)
    ]
    return {
        "terms": terms,
        "track_sources": sources,
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
        lyrics, _ = await resolve_lyrics(artist_name, title, play_path=path)
        if lyrics:
            cached += 1
    return cached
