"""Scan Series Extras/ for openings, endings, and promo videos."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.config import settings
from app.gallery import _media_url
from app.media_index import parse_bracket_tags
from app.media_item_overview import VIDEO_EXTS, _file_url
from app.media_paths_util import resolve_media_entry, safe_relative
from app.release_tracklist import _duration_from_file, _format_duration
from app.series_index import _list_subseries, find_franchise_dir
from app.series_paths import find_audio_bucket, find_extras_dir
from app.band_library import AUDIO_CATEGORIES, _resolve_child_dir
from app.media_index import _iter_category_release_entries

_OPENING_RE = re.compile(r"\bopenings?\b|\bops?\b", re.I)
_ENDING_RE = re.compile(r"\bendings?\b|\beds?\b", re.I)
_EP_PREFIX = re.compile(r"^(\d+)\.\s*(.+)$")


def _classify_theme(tags: dict, stem: str) -> str | None:
    """Return 'opening' | 'ending' | None from bracket tags / stem."""
    blob = " ".join(
        str(v) for v in tags.values() if isinstance(v, str)
    ) + " " + stem
    # Also check raw bracket contents in stem
    for m in re.finditer(r"\[([^\]]+)\]", stem):
        blob += " " + m.group(1)
    if _OPENING_RE.search(blob):
        return "opening"
    if _ENDING_RE.search(blob):
        return "ending"
    return None


def _parse_extra_title(filename: str) -> tuple[int | None, str]:
    stem = Path(filename).stem.strip()
    clean, _tags = parse_bracket_tags(stem)
    m = _EP_PREFIX.match(clean.strip())
    if m:
        return int(m.group(1)), m.group(2).strip()
    return None, clean.strip() or stem


def _video_item(path: Path, media_root: Path, *, subseries: dict | None) -> dict:
    rel = path.relative_to(media_root).as_posix()
    number, title = _parse_extra_title(path.name)
    clean, tags = parse_bracket_tags(Path(path.name).stem)
    kind = _classify_theme(tags, Path(path.name).stem) or "extra"
    duration_sec = _duration_from_file(path)
    if duration_sec is None and path.suffix.lower() in {".mp4", ".m4v", ".mov"}:
        try:
            from app.media_item_overview import _mp4_duration_from_mvhd

            duration_sec = _mp4_duration_from_mvhd(path)
        except Exception:
            duration_sec = None
    open_url = _file_url(path, media_root) or (
        f"/api/media/file?path={quote(rel, safe='/')}"
    )
    digest = hashlib.sha256(rel.casefold().encode("utf-8")).hexdigest()[:12]
    # Suffix label for tracklist-style video badge (Opening / Ending)
    suffix = None
    for m in re.finditer(r"\[([^\]]+)\]", Path(path.name).stem):
        inner = m.group(1).strip()
        if _OPENING_RE.search(inner) or _ENDING_RE.search(inner):
            suffix = inner
            break
    return {
        "id": f"ex_{digest}",
        "number": number,
        "title": title,
        "play_path": rel,
        "open_url": open_url,
        "kind": kind,
        "duration": _format_duration(duration_sec) if duration_sec else None,
        "duration_sec": duration_sec,
        "video_suffix": suffix,
        "subseries_id": (subseries or {}).get("id"),
        "subseries_title": (subseries or {}).get("title"),
        "subseries_path": (subseries or {}).get("folder_path"),
    }


def scan_extras_videos(franchise_id: str) -> dict:
    """All Extras/ videos under franchise + subseries, split openings/endings."""
    root = Path(settings.media_root) if settings.media_root else None
    if not root or not root.is_dir():
        return {"openings": [], "endings": [], "extras": [], "items": []}
    found = find_franchise_dir(franchise_id, root)
    if not found:
        return {"openings": [], "endings": [], "extras": [], "items": []}
    franchise_dir, _letter = found
    scopes: list[tuple[Path, dict | None]] = [(franchise_dir, None)]
    for s in _list_subseries(franchise_dir, root):
        fp = s.get("folder_path") or ""
        if fp:
            scopes.append((root / fp.replace("\\", "/"), s))

    openings: list[dict] = []
    endings: list[dict] = []
    extras: list[dict] = []
    for folder, sub in scopes:
        ex = find_extras_dir(folder)
        if not ex:
            continue
        try:
            files = sorted(ex.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            continue
        for f in files:
            if not f.is_file() or f.suffix.lower() not in VIDEO_EXTS:
                continue
            item = _video_item(f, root, subseries=sub)
            if item["kind"] == "opening":
                openings.append(item)
            elif item["kind"] == "ending":
                endings.append(item)
            else:
                extras.append(item)

    def _sort(rows: list[dict]) -> list[dict]:
        return sorted(
            rows,
            key=lambda e: (
                e.get("number") is None,
                e.get("number") if e.get("number") is not None else 10**9,
                (e.get("title") or "").casefold(),
            ),
        )

    openings = _sort(openings)
    endings = _sort(endings)
    extras = _sort(extras)
    return {
        "openings": openings,
        "endings": endings,
        "extras": extras,
        "items": openings + endings + extras,
        "title": "Openings & Endings",
        "opening_count": len(openings),
        "ending_count": len(endings),
    }


def _extract_by_artist(stem: str) -> str | None:
    """Pull ``By Artist`` from any bracket group in a filename stem."""
    for m in re.finditer(r"\[([^\]]+)\]", stem):
        for part in m.group(1).split(";"):
            piece = part.strip()
            if piece.casefold().startswith("by "):
                name = piece[3:].strip()
                if name:
                    return name
    _, tags = parse_bracket_tags(stem)
    artist = tags.get("source_artist")
    return artist.strip() if isinstance(artist, str) and artist.strip() else None


def _artist_music_root(media_root: Path, artist_name: str) -> Path | None:
    """Resolve Music/{Letter}/{Artist}/ for a display name."""
    name = (artist_name or "Various Artists").strip() or "Various Artists"
    music = media_root / "Music"
    if not music.is_dir():
        return None
    letter = name[0].upper()
    if not letter.isalpha():
        letter = "#"
    # Prefer exact letter tier, then scan
    candidates = [music / letter / name]
    try:
        for tier in music.iterdir():
            if not tier.is_dir():
                continue
            hit = tier / name
            if hit.is_dir() and hit not in candidates:
                candidates.append(hit)
    except OSError:
        pass
    for c in candidates:
        if c.is_dir():
            return c
    # Case-insensitive fallback under letter tier
    tier = music / letter
    if tier.is_dir():
        want = name.casefold()
        try:
            for child in tier.iterdir():
                if child.is_dir() and child.name.casefold() == want:
                    return child
        except OSError:
            pass
    return None


def _match_theme_audio(
    media_root: Path,
    *,
    title: str,
    artist_name: str | None,
) -> Path | None:
    """Find an mp3 whose cleaned title matches the Extras theme title."""
    from app.band_library import AUDIO_EXTS

    want = (title or "").casefold().strip()
    if not want:
        return None
    artist = (artist_name or "").strip() or "Various Artists"
    roots: list[Path] = []
    primary = _artist_music_root(media_root, artist)
    if primary:
        roots.append(primary)
    if artist.casefold() != "various artists":
        va = _artist_music_root(media_root, "Various Artists")
        if va and va not in roots:
            roots.append(va)
    best: Path | None = None
    for root in roots:
        audio_root = root / "Audio"
        scan = audio_root if audio_root.is_dir() else root
        try:
            files = sorted(
                (p for p in scan.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO_EXTS),
                key=lambda p: p.as_posix().casefold(),
            )
        except OSError:
            continue
        for audio in files:
            clean, _tags = parse_bracket_tags(audio.stem)
            m = _EP_PREFIX.match(clean.strip())
            track_title = (m.group(2) if m else clean).strip()
            if track_title.casefold() == want:
                return audio
            # Soft match: theme title contained as whole phrase
            if want in track_title.casefold() and best is None:
                best = audio
    return best


def _theme_audio_item(
    video: dict,
    audio_path: Path | None,
    media_root: Path,
) -> dict:
    """Merge Extras video metadata with a matched Music audio file when found."""
    item = {
        **video,
        "audio_matched": bool(audio_path),
        # Keep Extras video URL even when audio play_url overwrites open_url.
        "video_url": video.get("open_url") or video.get("play_url"),
        "video_path": video.get("play_path"),
    }
    if not audio_path or not audio_path.is_file():
        return item
    from app.artwork_stems import (
        resolve_animation_album_file,
        resolve_canvas_album_file,
        track_canvas_url,
        find_track_animation_file,
    )
    from app.band_library import _find_artwork_subdir, _find_cover_front_artwork
    from app.franchise_index import parse_dated_folder_name
    from app.media_index import format_display_date
    from app.release_playback_art import disc_url_for_group

    rel = safe_relative(audio_path, media_root) or audio_path.as_posix()
    duration_sec = _duration_from_file(audio_path)
    play_url = f"/api/media/file?path={quote(rel, safe='/')}"
    clean, tags = parse_bracket_tags(audio_path.stem)
    m = _EP_PREFIX.match(clean.strip())
    audio_title = (m.group(2) if m else clean).strip() or video.get("title")
    by_artist = tags.get("source_artist") or _extract_by_artist(audio_path.stem)
    # Album = nearest dated release folder under Music (skip Volume N discs)
    album = None
    year = None
    cover = None
    release_dir: Path | None = None
    cur = audio_path.parent
    volume_re = re.compile(r"^volume\s+\d+\b", re.I)
    for _ in range(8):
        date_iso, title = parse_dated_folder_name(cur.name)
        stem_title = title or cur.name
        if date_iso or title:
            if volume_re.match(stem_title.strip()) and cur.parent != cur:
                parent_iso, parent_title = parse_dated_folder_name(cur.parent.name)
                if parent_title or parent_iso:
                    album = parent_title or cur.parent.name
                    year = ((parent_iso or date_iso) or "")[:4] or None
                    release_dir = cur.parent
                    cover = _find_cover_front_artwork(cur.parent, media_root) or _find_cover_front_artwork(
                        cur, media_root
                    )
                    break
            album = stem_title
            year = (date_iso or "")[:4] or None
            release_dir = cur
            cover = _find_cover_front_artwork(cur, media_root)
            break
        if cur.parent == cur:
            break
        cur = cur.parent

    disc_url = None
    canvas_url = None
    cover_animation_url = None
    date_iso_full = None
    if release_dir is not None:
        date_iso_full, _ = parse_dated_folder_name(release_dir.name)
        artwork = _find_artwork_subdir(release_dir) or _find_artwork_subdir(audio_path.parent)
        disc_url = disc_url_for_group(artwork, audio_path.parent, media_root, None)
        if artwork:
            track_canvas = track_canvas_url(artwork, audio_title or "", media_root)
            canvas_file = resolve_canvas_album_file(artwork)
            canvas_url = track_canvas or (
                _media_url(canvas_file, media_root) if canvas_file else None
            )
            track_anim = find_track_animation_file(artwork, audio_title or "")
            album_anim = resolve_animation_album_file(artwork)
            anim = track_anim or album_anim
            if anim:
                cover_animation_url = _media_url(anim, media_root)

    artist_logo_url = None
    artist_icon_url = None
    if by_artist:
        try:
            from app.gallery import _artist_dir, _gallery_subdir, _list_era_brands

            artist_dir = _artist_dir(media_root, by_artist)
            if artist_dir:
                brands = _list_era_brands(_gallery_subdir(artist_dir, "Logos"))
                logos = [b for b in brands if b.kind == "logo"]
                icons = [b for b in brands if b.kind == "icon"]
                if logos:
                    artist_logo_url = _media_url(logos[0].path, media_root)
                if icons:
                    artist_icon_url = _media_url(icons[0].path, media_root)
        except Exception:
            pass

    item.update(
        {
            "title": video.get("title") or audio_title,
            "play_path": rel,
            "play_url": play_url,
            "open_url": play_url,
            "duration_sec": duration_sec,
            "duration": _format_duration(duration_sec) if duration_sec else None,
            "artist": by_artist or video.get("artist"),
            "album": album,
            "year": year,
            "date_iso": date_iso_full,
            "display_date": format_display_date(date_iso_full)
            if date_iso_full
            else (format_display_date(f"{year}-01-01") if year else None),
            "cover_url": cover or video.get("cover_url"),
            "cover_animation_url": cover_animation_url,
            "disc_url": disc_url,
            "canvas_url": canvas_url,
            "artist_logo_url": artist_logo_url,
            "artist_icon_url": artist_icon_url,
            "audio_path": rel,
            "navigate_band_id": None,
            "navigate_release_id": None,
        }
    )
    try:
        from app.media_index import release_id_from_path

        item["navigate_release_id"] = release_id_from_path(rel)
    except Exception:
        pass
    return item


def match_openings_endings_audio(franchise_id: str) -> dict:
    """Extras OP/ED videos resolved to matching Music mp3 tracks when possible."""
    data = scan_extras_videos(franchise_id)
    root = Path(settings.media_root) if settings.media_root else None
    if not root or not root.is_dir():
        return data

    band_cache: dict[str, int | None] = {}
    try:
        from app.database import SessionLocal
        from app.media_index import _band_id_for_artist_name

        db = SessionLocal()
    except Exception:
        db = None

    def _band_id(artist: str | None) -> int | None:
        if not artist or db is None:
            return None
        key = artist.casefold()
        if key not in band_cache:
            try:
                band_cache[key] = _band_id_for_artist_name(db, artist)
            except Exception:
                band_cache[key] = None
        return band_cache[key]

    def _enrich(rows: list[dict]) -> list[dict]:
        out: list[dict] = []
        for row in rows:
            artist = None
            play = row.get("play_path") or ""
            stem = Path(play).stem if play else (row.get("title") or "")
            artist = _extract_by_artist(stem)
            matched = _match_theme_audio(
                root,
                title=row.get("title") or "",
                artist_name=artist,
            )
            item = _theme_audio_item(row, matched, root)
            item["navigate_band_id"] = _band_id(item.get("artist") or artist)
            out.append(item)
        return out

    try:
        openings = _enrich(list(data.get("openings") or []))
        endings = _enrich(list(data.get("endings") or []))
    finally:
        if db is not None:
            db.close()

    extras = list(data.get("extras") or [])
    return {
        **data,
        "openings": openings,
        "endings": endings,
        "extras": extras,
        "items": openings + endings + extras,
        "opening_count": len(openings),
        "ending_count": len(endings),
        "matched_count": sum(
            1 for r in openings + endings if r.get("audio_matched")
        ),
    }


def openings_endings_playlist_card(franchise_id: str) -> dict | None:
    """Synthetic audio-tab card for the openings/endings playlist."""
    data = match_openings_endings_audio(franchise_id)
    if not data["openings"] and not data["endings"]:
        return None
    cover = None
    first = (data["openings"] or data["endings"] or [None])[0]
    if first:
        cover = first.get("cover_url")
        if not cover:
            sub_path = (first.get("subseries_path") or "").replace("\\", "/")
            root = Path(settings.media_root) if settings.media_root else None
            if root and sub_path:
                from app.series_index import _series_folder_cover

                cover = _series_folder_cover(root / sub_path, root)
    if not cover:
        root = Path(settings.media_root) if settings.media_root else None
        if root:
            found = find_franchise_dir(franchise_id, root)
            if found:
                from app.series_index import _series_folder_cover

                cover = _series_folder_cover(found[0], root)
    return {
        "id": f"series-op-ed:{franchise_id}",
        "category": "playlists",
        "title": "Openings & Endings",
        "date_iso": None,
        "display_date": None,
        "official": True,
        "cover_url": cover,
        "logo_url": None,
        "folder_path": f"playlist:openings-endings:{franchise_id}",
        "navigate_band_id": None,
        "navigate_release_id": None,
        "is_series_playlist": True,
        "playlist_kind": "openings-endings",
        "track_count": len(data["openings"]) + len(data["endings"]),
        "meta": f"{len(data['openings'])} openings · {len(data['endings'])} endings",
    }


def collect_series_audio_tracks(db: Session, franchise_id: str) -> list[dict]:
    """Resolve Audio/ .lnk releases into playable track entries for the series player."""
    from app.band_library import AUDIO_EXTS, _find_cover_front_artwork
    from app.media_index import (
        VARIOUS_ARTISTS_DEFAULT_ID,
        _build_release_card,
        entry_display_name,
    )

    root = Path(settings.media_root) if settings.media_root else None
    if not root or not root.is_dir():
        return []
    found = find_franchise_dir(franchise_id, root)
    if not found:
        return []
    franchise_dir, _ = found
    scopes = [franchise_dir]
    for s in _list_subseries(franchise_dir, root):
        fp = s.get("folder_path") or ""
        if fp:
            scopes.append(root / fp.replace("\\", "/"))

    tracks: list[dict] = []
    seen: set[str] = set()
    for folder in scopes:
        bucket = find_audio_bucket(folder)
        if not bucket:
            continue
        for category_key, category_folder in AUDIO_CATEGORIES.items():
            cat_dir = _resolve_child_dir(bucket, category_folder)
            if not cat_dir.is_dir():
                continue
            for entry in _iter_category_release_entries(cat_dir):
                name = entry_display_name(entry)
                resolved = resolve_media_entry(entry, media_root=root)
                card = _build_release_card(
                    db,
                    media_root=root,
                    owner_band_id=VARIOUS_ARTISTS_DEFAULT_ID,
                    category_key=category_key,
                    category_folder=category_folder,
                    display_entry=entry,
                    content_root=resolved,
                    bracket_name=name,
                    default_source_artist="Various Artists",
                )
                content = resolved if resolved and resolved.is_dir() else None
                if content is None:
                    continue
                cover = card.get("cover_url") if card else None
                try:
                    audio_files = sorted(
                        (
                            p
                            for p in content.rglob("*")
                            if p.is_file() and p.suffix.lower() in AUDIO_EXTS
                        ),
                        key=lambda p: p.as_posix().casefold(),
                    )
                except OSError:
                    continue
                for audio in audio_files:
                    rel = safe_relative(audio, root)
                    if not rel or rel in seen:
                        continue
                    seen.add(rel)
                    play_url = (
                        f"/api/media/file?path={quote(rel, safe='/')}"
                    )
                    title = audio.stem
                    clean, tags = parse_bracket_tags(title)
                    m = _EP_PREFIX.match(clean.strip())
                    if m:
                        title = m.group(2).strip()
                    else:
                        title = clean.strip() or title
                    tracks.append(
                        {
                            "id": f"trk_{hashlib.sha256(rel.encode()).hexdigest()[:12]}",
                            "title": title,
                            "play_url": play_url,
                            "cover_url": cover
                            or _find_cover_front_artwork(audio.parent, root),
                            "duration": _format_duration(dur)
                            if (dur := _duration_from_file(audio))
                            else None,
                            "artist": tags.get("source_artist")
                            or _extract_by_artist(audio.stem)
                            or (card or {}).get("source_artist_name"),
                            "release_title": (card or {}).get("title"),
                            "band_id": (card or {}).get("navigate_band_id"),
                            "release_id": (card or {}).get("navigate_release_id")
                            or (card or {}).get("id"),
                        }
                    )
    return tracks
