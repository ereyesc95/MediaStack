"""Library-wide audio matching for Spotify imports and Find in disk."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.band_library import (
    _album_dir_for_track,
    _collect_audio_files,
    _normalize_title_for_match,
    _release_date_for_track,
    _titles_match,
    cover_url_for_track_path,
    display_track_title_from_path,
)
from app.media_index import _band_id_from_content_path, _release_dir_from_content_folder
from app.media_index import release_id_from_path
from app.media_paths_util import safe_relative


@dataclass
class MatchedTrack:
    path: str
    title: str
    artist_name: str
    album_title: str | None
    release_date: str | None
    year: str | None
    cover_url: str | None
    navigate_band_id: int | None
    navigate_release_id: str | None


def _normalize_album(name: str | None) -> str:
    if not name:
        return ""
    text = name.strip()
    from app.band_library import DATE_PREFIX_RE

    m = DATE_PREFIX_RE.match(text)
    if m:
        text = m.group(4) if m.lastindex and m.lastindex >= 4 else text
    return text.casefold()


def _artist_folder_name(path: Path, media_root: Path) -> str | None:
    parts = path.relative_to(media_root).parts
    if len(parts) >= 3 and parts[0].casefold() == "music":
        return parts[2]
    return None


def _year_from_date(date_iso: str | None) -> str | None:
    if not date_iso:
        return None
    year = date_iso[:4]
    return year if year.isdigit() else None


class LibraryTrackIndex:
    """Index of local audio keyed by normalized title (+ optional album)."""

    def __init__(self, media_root: Path, db=None) -> None:
        self.media_root = media_root.resolve()
        self.db = db
        self._by_title: dict[str, list[Path]] = {}
        self._build()

    def _build(self) -> None:
        music = self.media_root / "Music"
        if not music.is_dir():
            return
        for letter_dir in music.iterdir():
            if not letter_dir.is_dir():
                continue
            for artist_dir in letter_dir.iterdir():
                if not artist_dir.is_dir():
                    continue
                for audio in _collect_audio_files(artist_dir):
                    key = _normalize_title_for_match(
                        display_track_title_from_path(audio)
                    )
                    if not key:
                        continue
                    self._by_title.setdefault(key, []).append(audio)

    def _to_matched(self, audio: Path) -> MatchedTrack:
        rel = safe_relative(audio, self.media_root)
        rel_posix = rel.replace("\\", "/") if rel else audio.as_posix()
        release_dir = _release_dir_from_content_folder(audio.parent)
        album_dir = _album_dir_for_track(audio)
        album_name = album_dir.name if album_dir else None
        from app.release_tracklist import _source_album_display, _source_edition_dir_for_audio

        album_display, _, _ = _source_album_display(
            release_dir, _source_edition_dir_for_audio(release_dir, audio)
        )
        date_iso = _release_date_for_track(audio)
        artist_folder = _artist_folder_name(audio, self.media_root) or "Unknown"
        nav_band_id = None
        if self.db is not None:
            nav_band_id = _band_id_from_content_path(self.db, self.media_root, audio.parent)
        release_rel = safe_relative(release_dir, self.media_root)
        nav_release_id = (
            release_id_from_path(release_rel.replace("\\", "/")) if release_rel else None
        )
        return MatchedTrack(
            path=rel_posix,
            title=display_track_title_from_path(audio),
            artist_name=artist_folder.replace("█", "'").replace("■", ","),
            album_title=album_display or album_name,
            release_date=date_iso,
            year=_year_from_date(date_iso),
            cover_url=cover_url_for_track_path(rel_posix, self.media_root),
            navigate_band_id=nav_band_id,
            navigate_release_id=nav_release_id,
        )

    def match(
        self,
        *,
        title: str,
        artist: str | None = None,
        album: str | None = None,
    ) -> MatchedTrack | None:
        key = _normalize_title_for_match(title)
        if not key:
            return None
        candidates = list(self._by_title.get(key, []))
        if not candidates:
            for files in self._by_title.values():
                for f in files:
                    if _titles_match(title, f.stem):
                        candidates.append(f)
            if not candidates:
                return None

        want_album = _normalize_album(album)
        want_artist = (artist or "").casefold()

        scored: list[tuple[int, Path]] = []
        for audio in candidates:
            score = 0
            if want_album:
                album_dir = _album_dir_for_track(audio)
                rel_album = _normalize_album(album_dir.name)
                release_dir = _release_dir_from_content_folder(audio.parent)
                from app.release_tracklist import _source_album_display, _source_edition_dir_for_audio

                disp, _, _ = _source_album_display(
                    release_dir, _source_edition_dir_for_audio(release_dir, audio)
                )
                if want_album in (_normalize_album(disp), rel_album):
                    score += 10
                elif want_album and (
                    want_album in rel_album or rel_album in want_album
                ):
                    score += 5
            if want_artist:
                folder = (_artist_folder_name(audio, self.media_root) or "").casefold()
                if want_artist in folder or folder in want_artist:
                    score += 3
            scored.append((score, audio))

        scored.sort(key=lambda x: (-x[0], x[1].as_posix().casefold()))
        best = scored[0][1]
        return self._to_matched(best)

    def search(self, query: str, *, limit: int = 25) -> list[MatchedTrack]:
        q = query.strip().casefold()
        if not q:
            return []
        results: list[MatchedTrack] = []
        seen: set[str] = set()
        for paths in self._by_title.values():
            for audio in paths:
                matched = self._to_matched(audio)
                if matched.path in seen:
                    continue
                hay = " ".join(
                    filter(
                        None,
                        [matched.title, matched.artist_name, matched.album_title],
                    )
                ).casefold()
                if q not in hay:
                    continue
                seen.add(matched.path)
                results.append(matched)
                if len(results) >= limit:
                    return results
        results.sort(
            key=lambda m: (
                m.title.casefold(),
                (m.artist_name or "").casefold(),
            )
        )
        return results

    def find_candidates(
        self, *, title: str, artist: str | None = None, album: str | None = None, limit: int = 12
    ) -> list[MatchedTrack]:
        key = _normalize_title_for_match(title)
        out: list[MatchedTrack] = []
        seen: set[str] = set()
        for audio in self._by_title.get(key, []):
            rel = safe_relative(audio, self.media_root)
            if not rel:
                continue
            rel_posix = rel.replace("\\", "/")
            if rel_posix in seen:
                continue
            seen.add(rel_posix)
            out.append(self._to_matched(audio))
            if len(out) >= limit:
                break
        if want_album := _normalize_album(album):
            out.sort(
                key=lambda m: (
                    0
                    if want_album in _normalize_album(m.album_title or "")
                    else 1,
                    m.title.casefold(),
                )
            )
        return out[:limit]
