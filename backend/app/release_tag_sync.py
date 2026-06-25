"""Write embedded audio file tags from MediaStack release/track metadata."""
from __future__ import annotations

import base64
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.band_library import (
    ARTWORK_DIR,
    COVER_FRONT_STEM,
    DATE_PREFIX_RE,
    display_track_title_from_path,
    title_case_track_title,
)
from app.gallery import IMAGE_EXTS
from app.media_paths import path_to_local_file
from app.release_overview import build_release_overview
from app.release_tracklist import DISC_LOOSE_RE, build_release_tracklist

WRITABLE_EXTS = {".mp3", ".flac", ".ogg", ".opus", ".m4a", ".mp4", ".aac"}

TAG_KEYS = (
    "title",
    "artist",
    "album",
    "albumartist",
    "date",
    "tracknumber",
    "discnumber",
    "genre",
)

BY_RE = re.compile(r"^by\s+(.+)$", re.I)
FEAT_RE = re.compile(r"^feat\.?\s*(.+)$", re.I)
INNER_SPLIT_RE = re.compile(r"[;:]+")


@dataclass
class TagExtras:
    lyrics: str | None = None
    writers: str | None = None
    cover_path: Path | None = None
    embed_cover: bool = False


def _display_name(name: str) -> str:
    return (name or "").replace("█", "'").strip()


def _strip_outer_brackets(title: str) -> tuple[str, str | None]:
    m = re.match(r"^(.+?)\s*\[([^\]]+)\]\s*$", (title or "").strip())
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return (title or "").strip(), None


def _parse_featuring(part: str) -> list[str] | None:
    m = FEAT_RE.match(part.strip())
    if not m:
        return None
    return [n.strip() for n in re.split(r"[,;]+", m.group(1)) if n.strip()]


def _edition_label_core(label: str) -> str:
    text = (label or "").strip()
    m = DATE_PREFIX_RE.match(text)
    if m:
        rest = text[m.end() :].lstrip(". ").strip()
        if rest:
            return rest
    return text


def _edition_album_title(
    release_title: str,
    edition_label: str | None,
    track: dict,
) -> str:
    source = (track.get("source_album_title") or "").strip()
    if source:
        return source
    core = _edition_label_core(edition_label or "")
    if not core:
        return release_title
    core_fold = core.casefold()
    release_fold = release_title.casefold()
    if core_fold == release_fold:
        return release_title
    if core_fold in ("standard edition", "standard"):
        return release_title
    return f"{release_title}: {core}"


def _title_and_artist_for_tags(
    track_title: str,
    album_artist: str,
    *,
    is_va: bool = False,
    performer: str | None = None,
) -> tuple[str, str]:
    track_title = title_case_track_title((track_title or "").strip())
    main, inner = _strip_outer_brackets(track_title)
    suffix_parts: list[str] = []
    feat_names: list[str] = []

    if inner:
        for part in INNER_SPLIT_RE.split(inner):
            piece = part.strip()
            if not piece:
                continue
            feat = _parse_featuring(piece)
            if feat:
                feat_names.extend(feat)
                continue
            if BY_RE.match(piece) and is_va:
                continue
            suffix_parts.append(piece)

    tag_title = main
    if suffix_parts:
        tag_title = f"{main} ({'; '.join(suffix_parts)})"

    base_artist = performer if (is_va and performer) else album_artist
    if feat_names:
        return tag_title, f"{base_artist} feat. {', '.join(feat_names)}"
    return tag_title, base_artist


def _performer_from_stem(stem: str) -> str | None:
    bracket = re.search(r"\[([^\]]+)\]\s*$", stem)
    if not bracket:
        return None
    for part in INNER_SPLIT_RE.split(bracket.group(1)):
        piece = part.strip()
        if not piece:
            continue
        m = BY_RE.match(piece)
        if m:
            return m.group(1).strip()
    return None


def _disc_number(group_label: str | None, group_index: int, group_count: int) -> int:
    if group_label:
        m = DISC_LOOSE_RE.match(group_label.strip())
        if m:
            try:
                return int(m.group(1))
            except ValueError:
                pass
    if group_count > 1:
        return group_index + 1
    return 1


def _year_from_iso(date_iso: str | None) -> str | None:
    if not date_iso:
        return None
    text = date_iso.strip()
    if len(text) >= 4 and text[:4].isdigit():
        return text[:4]
    return None


def _subgenre_label(item: object) -> str | None:
    if isinstance(item, dict):
        name = str(item.get("name") or "").strip()
        return name or None
    if isinstance(item, str):
        text = item.strip()
        return text or None
    return None


def _genre_text(subgenres: list | None) -> str | None:
    if not subgenres:
        return None
    parts: list[str] = []
    for item in subgenres:
        label = _subgenre_label(item)
        if label:
            parts.append(label)
    if not parts:
        return None
    return "; ".join(parts)


def _mime_for_image(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(ext, "image/jpeg")


def _find_artwork_subdir(folder: Path) -> Path | None:
    if not folder.is_dir():
        return None
    for child in folder.iterdir():
        if child.is_dir() and child.name.casefold() == ARTWORK_DIR:
            return child
    return None


def _find_cover_front_path(track_dir: Path) -> Path | None:
    """Local Cover - Front inside [Artwork] in track folder, else one level up."""
    for base in (track_dir, track_dir.parent):
        artwork = _find_artwork_subdir(base)
        if not artwork:
            continue
        for p in artwork.iterdir():
            if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
                if p.stem.casefold() == COVER_FRONT_STEM:
                    return p
    return None


def _resolve_cover_path(cover_override: str | None, track_dir: Path) -> Path | None:
    if cover_override:
        raw = cover_override.strip()
        if raw:
            candidate = Path(raw)
            if not candidate.is_absolute():
                from_media = path_to_local_file(raw)
                if from_media and from_media.is_file():
                    return from_media
            else:
                try:
                    resolved = candidate.resolve()
                except OSError:
                    resolved = candidate
                if resolved.is_file():
                    return resolved
    return _find_cover_front_path(track_dir)


def _track_eligible_for_file_tags(track: dict) -> bool:
    if track.get("is_link"):
        return False
    play_path = (track.get("play_path") or "").strip()
    if not play_path:
        return False
    if play_path.casefold().endswith(".lnk"):
        return False
    return True


def _release_cover_locations(
    tracklist: dict,
) -> tuple[Path | None, Path | None]:
    """Return (Cover - Front file, [Artwork] folder) from first local track."""
    for edition in tracklist.get("editions") or []:
        for group in edition.get("groups") or []:
            for track in group.get("tracks") or []:
                if not _track_eligible_for_file_tags(track):
                    continue
                play_path = (track.get("play_path") or "").strip()
                local = path_to_local_file(play_path)
                if not local:
                    continue
                cover = _find_cover_front_path(local.parent)
                if cover:
                    return cover, cover.parent
                for base in (local.parent, local.parent.parent):
                    artwork = _find_artwork_subdir(base)
                    if artwork:
                        return None, artwork
    return None, None


def pick_cover_image_dialog(initial_dir: Path | None) -> Path | None:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    try:
        root.attributes("-topmost", True)
    except tk.TclError:
        pass
    initialdir = None
    if initial_dir and initial_dir.is_dir():
        initialdir = str(initial_dir)
    picked = filedialog.askopenfilename(
        parent=root,
        initialdir=initialdir,
        title="Choose cover art",
        filetypes=[
            ("Images", "*.jpg *.jpeg *.png *.webp *.gif *.bmp"),
            ("All files", "*.*"),
        ],
    )
    root.destroy()
    if not picked:
        return None
    path = Path(picked)
    return path if path.is_file() else None


def _norm_tag(value: object | None) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return str(value[0]).strip() if value else ""
    return str(value).strip()


def _tags_changed(
    desired: dict[str, str | None],
    existing: dict[str, str | None],
) -> dict[str, str | None]:
    changed: dict[str, str | None] = {}
    for key in TAG_KEYS:
        new_val = _norm_tag(desired.get(key))
        old_val = _norm_tag(existing.get(key))
        if new_val != old_val:
            changed[key] = new_val or None
    return changed


def _digest(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def _cover_file_digest(path: Path) -> bytes:
    return _digest(path.read_bytes())


def _read_mp3_tags(path: Path) -> dict[str, str | None]:
    from mutagen.easyid3 import EasyID3
    from mutagen.id3 import ID3NoHeaderError

    out = {k: None for k in TAG_KEYS}
    try:
        audio = EasyID3(path)
    except (ID3NoHeaderError, Exception):
        return out
    mapping = {
        "title": "title",
        "artist": "artist",
        "album": "album",
        "albumartist": "albumartist",
        "date": "date",
        "tracknumber": "tracknumber",
        "discnumber": "discnumber",
        "genre": "genre",
    }
    for src, dst in mapping.items():
        if dst in audio:
            out[src] = _norm_tag(audio[dst]) or None
    return out


def _read_vorbis_tags(path: Path, flac: bool) -> dict[str, str | None]:
    out = {k: None for k in TAG_KEYS}
    try:
        if flac:
            from mutagen.flac import FLAC

            audio = FLAC(path)
        else:
            from mutagen.oggvorbis import OggVorbis

            audio = OggVorbis(path)
    except Exception:
        return out
    mapping = {
        "title": "TITLE",
        "artist": "ARTIST",
        "album": "ALBUM",
        "albumartist": "ALBUMARTIST",
        "date": "DATE",
        "tracknumber": "TRACKNUMBER",
        "discnumber": "DISCNUMBER",
        "genre": "GENRE",
    }
    for src, dst in mapping.items():
        if dst in audio:
            out[src] = _norm_tag(audio[dst]) or None
    return out


def _read_mp4_tags(path: Path) -> dict[str, str | None]:
    from mutagen.mp4 import MP4

    out = {k: None for k in TAG_KEYS}
    try:
        audio = MP4(path)
    except Exception:
        return out
    key_map = {
        "title": "\xa9nam",
        "artist": "\xa9ART",
        "album": "\xa9alb",
        "albumartist": "aART",
        "date": "\xa9day",
        "genre": "\xa9gen",
    }
    for src, atom in key_map.items():
        if atom in audio:
            out[src] = _norm_tag(audio[atom]) or None
    if "trkn" in audio and audio["trkn"]:
        out["tracknumber"] = str(audio["trkn"][0][0])
    if "disk" in audio and audio["disk"]:
        out["discnumber"] = str(audio["disk"][0][0])
    return out


def _read_tags_from_file(path: Path) -> dict[str, str | None]:
    ext = path.suffix.lower()
    if ext == ".mp3":
        return _read_mp3_tags(path)
    if ext == ".flac":
        return _read_vorbis_tags(path, flac=True)
    if ext in {".ogg", ".opus"}:
        return _read_vorbis_tags(path, flac=False)
    if ext in {".m4a", ".mp4", ".aac"}:
        return _read_mp4_tags(path)
    return {k: None for k in TAG_KEYS}


def _read_file_lyrics(path: Path) -> str | None:
    ext = path.suffix.lower()
    if ext == ".mp3":
        from mutagen.id3 import ID3, ID3NoHeaderError

        try:
            id3 = ID3(path)
        except ID3NoHeaderError:
            return None
        frames = id3.getall("USLT")
        if frames:
            return (frames[0].text or "").strip() or None
        return None
    if ext == ".flac":
        from mutagen.flac import FLAC

        try:
            audio = FLAC(path)
        except Exception:
            return None
        vals = audio.get("LYRICS")
        return _norm_tag(vals) or None if vals else None
    if ext in {".ogg", ".opus"}:
        from mutagen.oggvorbis import OggVorbis

        try:
            audio = OggVorbis(path)
        except Exception:
            return None
        vals = audio.get("LYRICS")
        return _norm_tag(vals) or None if vals else None
    if ext in {".m4a", ".mp4", ".aac"}:
        from mutagen.mp4 import MP4

        try:
            audio = MP4(path)
        except Exception:
            return None
        vals = audio.get("\xa9lyr")
        return _norm_tag(vals) or None if vals else None
    return None


def _read_file_writers(path: Path) -> str | None:
    ext = path.suffix.lower()
    if ext == ".mp3":
        from mutagen.id3 import ID3, ID3NoHeaderError

        try:
            id3 = ID3(path)
        except ID3NoHeaderError:
            return None
        names = [f.text.strip() for f in id3.getall("TCOM") if f.text and str(f.text).strip()]
        return "; ".join(names) if names else None
    if ext == ".flac":
        from mutagen.flac import FLAC

        try:
            audio = FLAC(path)
        except Exception:
            return None
        vals = audio.get("COMPOSER")
        return _norm_tag(vals) or None if vals else None
    if ext in {".ogg", ".opus"}:
        from mutagen.oggvorbis import OggVorbis

        try:
            audio = OggVorbis(path)
        except Exception:
            return None
        vals = audio.get("COMPOSER")
        return _norm_tag(vals) or None if vals else None
    if ext in {".m4a", ".mp4", ".aac"}:
        from mutagen.mp4 import MP4

        try:
            audio = MP4(path)
        except Exception:
            return None
        vals = audio.get("\xa9wrt")
        return _norm_tag(vals) or None if vals else None
    return None


def _read_file_cover_digest(path: Path) -> bytes | None:
    ext = path.suffix.lower()
    try:
        if ext == ".mp3":
            from mutagen.id3 import ID3, ID3NoHeaderError

            try:
                id3 = ID3(path)
            except ID3NoHeaderError:
                return None
            apics = id3.getall("APIC")
            if apics:
                return _digest(apics[0].data)
            return None
        if ext == ".flac":
            from mutagen.flac import FLAC

            audio = FLAC(path)
            if audio.pictures:
                return _digest(audio.pictures[0].data)
            return None
        if ext in {".ogg", ".opus"}:
            from mutagen.oggvorbis import OggVorbis

            audio = OggVorbis(path)
            raw = audio.get("metadata_block_picture")
            if raw:
                from mutagen.flac import Picture

                pic = Picture()
                pic.parse(base64.b64decode(raw[0]))
                return _digest(pic.data)
            return None
        if ext in {".m4a", ".mp4", ".aac"}:
            from mutagen.mp4 import MP4

            audio = MP4(path)
            covr = audio.get("covr")
            if covr:
                return _digest(bytes(covr[0]))
            return None
    except Exception:
        return None
    return None


def _edition_artwork_for_edition(
    tracklist: dict,
    edition_id: str,
) -> tuple[Path | None, Path | None]:
    """Return (Cover - Front, [Artwork] folder) for one edition."""
    want = (edition_id or "").strip()
    if not want:
        return None, None
    for edition in tracklist.get("editions") or []:
        if edition.get("kind") == "bside":
            continue
        if (edition.get("id") or "").strip() != want:
            continue
        for group in edition.get("groups") or []:
            for track in group.get("tracks") or []:
                if not _track_eligible_for_file_tags(track):
                    continue
                play_path = (track.get("play_path") or "").strip()
                local = path_to_local_file(play_path)
                if not local:
                    continue
                cover = _find_cover_front_path(local.parent)
                if cover:
                    return cover, cover.parent
                for base in (local.parent, local.parent.parent):
                    artwork = _find_artwork_subdir(base)
                    if artwork:
                        return None, artwork
        return None, None
    return None, None


def _collect_edition_covers(
    tracklist: dict,
    *,
    band_id: int,
    release_id: str,
) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for edition in tracklist.get("editions") or []:
        if edition.get("kind") == "bside":
            continue
        edition_id = (edition.get("id") or "").strip()
        if not edition_id or edition_id in seen:
            continue
        seen.add(edition_id)
        label_raw = edition.get("label") or ""
        label = _edition_label_core(label_raw) or label_raw or "Edition"
        cover_file, artwork_dir = _edition_artwork_for_edition(tracklist, edition_id)
        cover_path = str(cover_file) if cover_file else None
        preview_url = None
        if cover_file and cover_file.is_file():
            token = encode_cover_path(str(cover_file.resolve()))
            preview_url = (
                f"/api/music/bands/{band_id}/releases/{release_id}"
                f"/write-file-tags/cover-preview?token={quote(token, safe='')}"
            )
        out.append(
            {
                "id": edition_id,
                "label": label,
                "cover_path": cover_path,
                "artwork_dir": str(artwork_dir) if artwork_dir else None,
                "preview_url": preview_url,
            }
        )
    return out


def encode_cover_path(path: str) -> str:
    return base64.urlsafe_b64encode(path.encode("utf-8")).decode("ascii")


def decode_cover_path(token: str) -> Path:
    return Path(base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8"))


def _lyrics_text_for_track(
    db: Session,
    band_id: int,
    release_id: str,
    play_path: str,
    track_title: str,
    *,
    tracklist: dict | None = None,
) -> str | None:
    from app.lyrics_storage import find_lrc_path
    from app.release_lyrics_shared import find_release_synced_lrc
    from app.track_overrides import read_lyrics_lrc, read_lyrics_plain

    synced = find_release_synced_lrc(
        db,
        band_id=band_id,
        release_id=release_id,
        track_title=track_title,
        play_path=play_path,
        backfill=False,
        payload=tracklist,
    )
    if synced:
        return synced

    lrc = read_lyrics_lrc(db, play_path)
    if lrc:
        return lrc

    plain = read_lyrics_plain(db, play_path)
    if plain:
        return plain

    local = path_to_local_file(play_path)
    if not local:
        return None
    lrc_path = find_lrc_path(local)
    if not lrc_path or not lrc_path.is_file():
        return None
    try:
        raw = lrc_path.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return None
    return raw or None


def _collect_track_rows(
    db: Session,
    band_id: int,
    release_id: str,
    tracklist: dict,
    overview: dict,
    *,
    lyrics_lookup=None,
    writers_lookup=None,
) -> list[dict]:
    from app.release_lyrics_shared import LyricsAvailabilityLookup
    from app.release_track_credits import ReleaseWritersLookup

    if lyrics_lookup is None:
        lyrics_lookup = LyricsAvailabilityLookup.build(db, tracklist)
    if writers_lookup is None:
        writers_lookup = ReleaseWritersLookup.build(
            db, band_id, release_id, overview
        )
    album_artist = _display_name(overview.get("artist_name") or tracklist.get("artist_name") or "")
    album_title = (overview.get("title") or tracklist.get("title") or "").strip()
    release_date = overview.get("date_iso")
    subgenres = overview.get("subgenres") or []
    genre = _genre_text(subgenres if isinstance(subgenres, list) else None)
    is_va = bool(overview.get("is_various_artists"))

    rows: list[dict] = []
    for edition in tracklist.get("editions") or []:
        if edition.get("kind") == "bside":
            continue
        edition_id = (edition.get("id") or "").strip()
        edition_date = edition.get("date_iso") or release_date
        year = _year_from_iso(edition_date)
        edition_label = edition.get("label")
        groups = edition.get("groups") or []
        group_count = len(groups)
        for group_index, group in enumerate(groups):
            disc = _disc_number(group.get("label"), group_index, group_count)
            for track in group.get("tracks") or []:
                if not _track_eligible_for_file_tags(track):
                    continue
                play_path = (track.get("play_path") or "").strip()
                if not play_path:
                    continue
                local = path_to_local_file(play_path)
                performer: str | None = None
                if local:
                    performer = _performer_from_stem(local.stem)
                track_title_raw = (track.get("title") or "").strip()
                if not track_title_raw and local:
                    track_title_raw = display_track_title_from_path(local)
                title, track_artist = _title_and_artist_for_tags(
                    track_title_raw,
                    album_artist,
                    is_va=is_va,
                    performer=performer,
                )
                album = _edition_album_title(album_title, edition_label, track)
                track_no = track.get("number")
                has_lyrics = lyrics_lookup.has_lyrics(
                    play_path, track_title_raw
                )
                writers = (
                    writers_lookup.writers_text_for_title(track_title_raw)
                    if writers_lookup
                    else None
                )
                rows.append(
                    {
                        "play_path": play_path,
                        "edition_id": edition_id,
                        "file_name": local.name if local else None,
                        "file_exists": bool(local and local.is_file()),
                        "supported": bool(
                            local and local.suffix.lower() in WRITABLE_EXTS
                        ),
                        "track_title": track_title_raw,
                        "has_lyrics": has_lyrics,
                        "tags": {
                            "title": title,
                            "artist": track_artist,
                            "albumartist": album_artist,
                            "album": album,
                            "date": year,
                            "tracknumber": str(track_no) if track_no else None,
                            "discnumber": str(disc),
                            "genre": genre,
                        },
                        "writers": writers,
                    }
                )
    return rows


def _extras_for_write(
    db: Session,
    band_id: int,
    release_id: str,
    play_path: str,
    track_title: str,
    local: Path,
    *,
    include_lyrics: bool,
    include_cover: bool,
    writers: str,
    cover_path_override: str | None = None,
    resolved_cover: Path | None = None,
) -> TagExtras | None:
    lyrics = None
    cover_path = None
    if include_lyrics:
        lyrics = _lyrics_text_for_track(
            db, band_id, release_id, play_path, track_title
        ) or ""
    if include_cover:
        if resolved_cover is not None:
            cover_path = resolved_cover if resolved_cover.is_file() else None
        else:
            cover_path = _resolve_cover_path(cover_path_override, local.parent)
        if not cover_path or not cover_path.is_file():
            raise ValueError("Cover art file not found")
    if not include_lyrics and not include_cover and not writers:
        return None
    return TagExtras(
        lyrics=lyrics,
        writers=writers or None,
        cover_path=cover_path,
        embed_cover=include_cover,
    )


def _write_mp3(path: Path, tags: dict[str, str | None], extras: TagExtras | None = None) -> None:
    from mutagen.easyid3 import EasyID3
    from mutagen.id3 import APIC, ID3, TCOM, USLT, ID3NoHeaderError

    try:
        audio = EasyID3(path)
    except ID3NoHeaderError:
        audio = EasyID3()
        audio.save(path)
        audio = EasyID3(path)

    mapping = {
        "title": "title",
        "artist": "artist",
        "album": "album",
        "albumartist": "albumartist",
        "date": "date",
        "tracknumber": "tracknumber",
        "discnumber": "discnumber",
        "genre": "genre",
    }
    for src, dst in mapping.items():
        if src not in tags:
            continue
        value = tags.get(src)
        if value:
            audio[dst] = value
        elif dst in audio:
            del audio[dst]
    if tags:
        audio.save()

    if not extras:
        return

    try:
        id3 = ID3(path)
    except ID3NoHeaderError:
        id3 = ID3()
    if extras.lyrics is not None:
        id3.delall("USLT")
        if extras.lyrics:
            id3.add(
                USLT(encoding=3, lang="eng", desc="", text=extras.lyrics)
            )
    if extras.writers is not None:
        id3.delall("TCOM")
        if extras.writers:
            for name in extras.writers.split(";"):
                piece = name.strip()
                if piece:
                    id3.add(TCOM(encoding=3, text=piece))
    if extras.embed_cover:
        id3.delall("APIC")
        cover = extras.cover_path
        if not cover or not cover.is_file():
            raise ValueError("Cover art file not found")
        id3.add(
            APIC(
                encoding=3,
                mime=_mime_for_image(cover),
                type=3,
                desc="Cover",
                data=cover.read_bytes(),
            )
        )
    id3.save(path, v2_version=3)


def _write_vorbis(
    path: Path,
    tags: dict[str, str | None],
    flac: bool,
    extras: TagExtras | None = None,
) -> None:
    if flac:
        from mutagen.flac import FLAC, Picture

        audio = FLAC(path)
    else:
        from mutagen.flac import Picture
        from mutagen.oggvorbis import OggVorbis

        audio = OggVorbis(path)

    mapping = {
        "title": "TITLE",
        "artist": "ARTIST",
        "album": "ALBUM",
        "albumartist": "ALBUMARTIST",
        "date": "DATE",
        "tracknumber": "TRACKNUMBER",
        "discnumber": "DISCNUMBER",
        "genre": "GENRE",
    }
    for src, dst in mapping.items():
        if src not in tags:
            continue
        value = tags.get(src)
        if value:
            audio[dst] = [value]
        elif dst in audio:
            del audio[dst]

    if extras:
        if extras.lyrics is not None:
            if extras.lyrics:
                audio["LYRICS"] = [extras.lyrics]
            elif "LYRICS" in audio:
                del audio["LYRICS"]
        if extras.writers is not None:
            if extras.writers:
                audio["COMPOSER"] = [extras.writers]
            elif "COMPOSER" in audio:
                del audio["COMPOSER"]
        if extras.embed_cover:
            cover = extras.cover_path
            if flac:
                audio.clear_pictures()
            elif "metadata_block_picture" in audio:
                del audio["metadata_block_picture"]
            if not cover or not cover.is_file():
                raise ValueError("Cover art file not found")
            pic = Picture()
            pic.type = 3
            pic.mime = _mime_for_image(cover)
            pic.desc = "Cover"
            pic.data = cover.read_bytes()
            if flac:
                audio.add_picture(pic)
            else:
                audio["metadata_block_picture"] = [
                    base64.b64encode(pic.write()).decode("ascii")
                ]

    audio.save()


def _write_mp4(path: Path, tags: dict[str, str | None], extras: TagExtras | None = None) -> None:
    from mutagen.mp4 import MP4, MP4Cover

    try:
        from mutagen.easymp4 import EasyMP4

        audio = EasyMP4(path)
        mapping = {
            "title": "title",
            "artist": "artist",
            "album": "album",
            "albumartist": "albumartist",
            "date": "date",
            "tracknumber": "tracknumber",
            "discnumber": "discnumber",
            "genre": "genre",
        }
        for src, dst in mapping.items():
            if src not in tags:
                continue
            value = tags.get(src)
            if value:
                audio[dst] = value
            elif dst in audio:
                del audio[dst]
        if tags:
            audio.save()
    except ImportError:
        audio = MP4(path)
        key_map = {
            "title": "\xa9nam",
            "artist": "\xa9ART",
            "album": "\xa9alb",
            "albumartist": "aART",
            "date": "\xa9day",
            "genre": "\xa9gen",
        }
        for src, atom in key_map.items():
            if src not in tags:
                continue
            value = tags.get(src)
            if value:
                audio[atom] = [value]
            elif atom in audio:
                del audio[atom]
        if "tracknumber" in tags and tags.get("tracknumber"):
            try:
                audio["trkn"] = [(int(tags["tracknumber"]), 0)]
            except ValueError:
                pass
        if "discnumber" in tags and tags.get("discnumber"):
            try:
                audio["disk"] = [(int(tags["discnumber"]), 0)]
            except ValueError:
                pass
        if tags:
            audio.save()

    if not extras:
        return

    audio = MP4(path)
    if extras.lyrics is not None:
        if extras.lyrics:
            audio["\xa9lyr"] = [extras.lyrics]
        elif "\xa9lyr" in audio:
            del audio["\xa9lyr"]
    if extras.writers is not None:
        if extras.writers:
            audio["\xa9wrt"] = [extras.writers]
        elif "\xa9wrt" in audio:
            del audio["\xa9wrt"]
    if extras.embed_cover:
        cover = extras.cover_path
        if not cover or not cover.is_file():
            raise ValueError("Cover art file not found")
        ext = cover.suffix.lower()
        fmt = MP4Cover.FORMAT_PNG if ext == ".png" else MP4Cover.FORMAT_JPEG
        audio["covr"] = [MP4Cover(cover.read_bytes(), imageformat=fmt)]
    audio.save()


def _prepare_file_write(
    local: Path,
    desired_tags: dict[str, str | None],
    *,
    include_lyrics: bool,
    include_cover: bool,
    writers: str,
    cover_path: Path | None,
    lyrics_text: str | None = None,
) -> tuple[dict[str, str | None], TagExtras | None, bool]:
    existing = _read_tags_from_file(local)
    changed_tags = _tags_changed(desired_tags, existing)

    lyrics: str | None = None
    writers_out: str | None = None
    embed_cover = False
    cover_out: Path | None = None

    if include_lyrics and lyrics_text is not None:
        existing_lyrics = _read_file_lyrics(local) or ""
        if lyrics_text != existing_lyrics:
            lyrics = lyrics_text

    writers_norm = (writers or "").strip()
    if writers_norm:
        existing_writers = _read_file_writers(local) or ""
        if writers_norm != existing_writers:
            writers_out = writers_norm

    if include_cover and cover_path and cover_path.is_file():
        new_digest = _cover_file_digest(cover_path)
        old_digest = _read_file_cover_digest(local)
        if new_digest != old_digest:
            embed_cover = True
            cover_out = cover_path

    extras: TagExtras | None = None
    if lyrics is not None or writers_out is not None or embed_cover:
        extras = TagExtras(
            lyrics=lyrics,
            writers=writers_out,
            cover_path=cover_out,
            embed_cover=embed_cover,
        )

    if not changed_tags and not extras:
        return {}, None, False
    return changed_tags, extras, True


def write_tags_to_file(
    path: Path,
    tags: dict[str, str | None],
    extras: TagExtras | None = None,
) -> None:
    ext = path.suffix.lower()
    clean = {k: v for k, v in tags.items() if k in TAG_KEYS}
    if not clean and not extras:
        return
    if ext == ".mp3":
        _write_mp3(path, clean, extras)
        return
    if ext == ".flac":
        _write_vorbis(path, clean, flac=True, extras=extras)
        return
    if ext in {".ogg", ".opus"}:
        _write_vorbis(path, clean, flac=False, extras=extras)
        return
    if ext in {".m4a", ".mp4", ".aac"}:
        _write_mp4(path, clean, extras)
        return
    raise ValueError(f"Unsupported format: {ext}")


def _resolve_cover_path_str(path_str: str | None, track_dir: Path | None = None) -> Path | None:
    if not path_str or not str(path_str).strip():
        if track_dir:
            return _find_cover_front_path(track_dir)
        return None
    return _resolve_cover_path(path_str, track_dir or Path("."))


def sync_release_file_tags(
    db: Session,
    band_id: int,
    release_id: str,
    *,
    dry_run: bool = True,
    include_cover: bool = False,
    cover_path: str | None = None,
    edition_covers: list[dict] | None = None,
    tracks_input: list[dict] | None = None,
) -> dict:
    tracklist = build_release_tracklist(db, band_id, release_id)
    if not tracklist:
        return {"ok": False, "error": "Release tracklist not found"}

    overview = build_release_overview(db, band_id, release_id)
    if not overview:
        return {"ok": False, "error": "Release overview not found"}

    from app.release_lyrics_shared import LyricsAvailabilityLookup
    from app.release_track_credits import ReleaseWritersLookup

    lyrics_lookup = LyricsAvailabilityLookup.build(db, tracklist)
    writers_lookup = ReleaseWritersLookup.build(
        db, band_id, release_id, overview
    )
    default_rows = _collect_track_rows(
        db,
        band_id,
        release_id,
        tracklist,
        overview,
        lyrics_lookup=lyrics_lookup,
        writers_lookup=writers_lookup,
    )
    default_by_path = {row["play_path"]: row for row in default_rows}
    editions = _collect_edition_covers(
        tracklist, band_id=band_id, release_id=release_id
    )
    edition_defaults = {
        e["id"]: e.get("cover_path") for e in editions if e.get("id")
    }
    edition_overrides: dict[str, str] = {}
    if edition_covers:
        for item in edition_covers:
            eid = (item.get("edition_id") or "").strip()
            cp = item.get("cover_path")
            if eid and cp:
                edition_overrides[eid] = cp
    elif cover_path:
        for eid in edition_defaults:
            edition_overrides[eid] = cover_path

    def cover_for_edition(edition_id: str, track_dir: Path | None) -> Path | None:
        raw = edition_overrides.get(edition_id) or edition_defaults.get(edition_id)
        return _resolve_cover_path_str(raw, track_dir)

    if include_cover and not dry_run:
        missing = False
        for row in default_rows:
            local = path_to_local_file(row["play_path"])
            if not local:
                continue
            eid = row.get("edition_id") or ""
            if not cover_for_edition(eid, local.parent):
                missing = True
                break
        if missing and not edition_defaults and not edition_overrides:
            return {"ok": False, "error": "Cover art file not found for embedding"}

    if dry_run:
        work_items = [
            {
                "play_path": row["play_path"],
                "selected": True,
                "include_lyrics": row.get("has_lyrics", False),
                "tags": dict(row["tags"]),
                "writers": row.get("writers"),
            }
            for row in default_rows
        ]
    else:
        if not tracks_input:
            return {"ok": False, "error": "No tracks provided"}
        work_items = tracks_input

    results: list[dict] = []
    written = 0
    skipped = 0
    errors: list[dict] = []

    for item in work_items:
        play_path = (item.get("play_path") or "").strip()
        default = default_by_path.get(play_path, {})
        tags_in = item.get("tags") or {}
        tags = {
            "title": tags_in.get("title") or default.get("tags", {}).get("title"),
            "artist": tags_in.get("artist") or default.get("tags", {}).get("artist"),
            "album": tags_in.get("album") or default.get("tags", {}).get("album"),
            "albumartist": tags_in.get("albumartist")
            or default.get("tags", {}).get("albumartist"),
            "date": tags_in.get("date") or default.get("tags", {}).get("date"),
            "tracknumber": tags_in.get("tracknumber")
            or default.get("tags", {}).get("tracknumber"),
            "discnumber": tags_in.get("discnumber")
            or default.get("tags", {}).get("discnumber"),
            "genre": tags_in.get("genre") or default.get("tags", {}).get("genre"),
        }
        writers = item.get("writers")
        if writers is None:
            writers = default.get("writers")
        selected = bool(item.get("selected", True))
        include_lyrics = bool(item.get("include_lyrics", False))
        track_title = default.get("track_title") or tags.get("title") or ""

        entry = {
            "play_path": play_path,
            "edition_id": default.get("edition_id"),
            "file_name": default.get("file_name"),
            "tags": tags,
            "writers": writers,
            "has_lyrics": default.get("has_lyrics", False),
            "status": "pending",
            "message": None,
        }

        if not selected:
            entry["status"] = "skipped"
            entry["message"] = "Not selected"
            skipped += 1
            results.append(entry)
            continue

        local = path_to_local_file(play_path)
        if not local or not local.is_file():
            entry["status"] = "skipped"
            entry["message"] = "File not found on disk"
            skipped += 1
            results.append(entry)
            continue

        if local.suffix.lower() not in WRITABLE_EXTS:
            entry["status"] = "skipped"
            entry["message"] = f"Unsupported format ({local.suffix})"
            skipped += 1
            results.append(entry)
            continue

        if dry_run:
            entry["status"] = "ready"
            results.append(entry)
            continue

        try:
            writers_raw = item.get("writers")
            if writers_raw is None:
                writers_raw = default.get("writers") or ""
            writers_raw_norm = str(writers_raw).strip()
            default_writers = (default.get("writers") or "").strip()
            writers_db_updated = False
            if writers_raw_norm != default_writers:
                from app.release_track_credits import set_track_writers

                writers_db_updated = set_track_writers(
                    db,
                    band_id,
                    release_id,
                    track_title,
                    writers_raw_norm,
                )
            edition_id = default.get("edition_id") or ""
            track_cover = (
                cover_for_edition(edition_id, local.parent) if include_cover else None
            )
            if include_cover and not track_cover:
                raise ValueError("Cover art file not found for this edition")
            lyrics_text = None
            if include_lyrics:
                lyrics_text = (
                    _lyrics_text_for_track(
                        db,
                        band_id,
                        release_id,
                        play_path,
                        track_title,
                        tracklist=tracklist,
                    )
                    or ""
                )
            changed_tags, extras, has_changes = _prepare_file_write(
                local,
                tags,
                include_lyrics=include_lyrics,
                include_cover=include_cover,
                writers=writers_raw_norm,
                cover_path=track_cover,
                lyrics_text=lyrics_text,
            )
            if not has_changes and not writers_db_updated:
                entry["status"] = "skipped"
                entry["message"] = "No changes"
                skipped += 1
                results.append(entry)
                continue
            if has_changes:
                write_tags_to_file(local, changed_tags, extras)
            entry["status"] = "written"
            written += 1
        except Exception as exc:
            entry["status"] = "error"
            entry["message"] = str(exc)
            errors.append({"play_path": play_path, "error": str(exc)})
            skipped += 1
        results.append(entry)

    ready = sum(1 for r in results if r["status"] in {"ready", "written"})
    return {
        "ok": True,
        "dry_run": dry_run,
        "include_cover": include_cover,
        "cover_url": overview.get("cover_url"),
        "editions": editions,
        "release_title": overview.get("title") or tracklist.get("title"),
        "tracks": results,
        "summary": {
            "total": len(results),
            "ready": ready,
            "written": written,
            "skipped": skipped,
            "errors": len(errors),
        },
        "errors": errors,
    }


def pick_release_cover_file(
    db: Session,
    band_id: int,
    release_id: str,
    *,
    edition_id: str | None = None,
) -> dict:
    tracklist = build_release_tracklist(db, band_id, release_id)
    if not tracklist:
        return {"ok": False, "error": "Release tracklist not found"}

    if edition_id:
        cover_file, artwork_dir = _edition_artwork_for_edition(tracklist, edition_id)
    else:
        cover_file, artwork_dir = _release_cover_locations(tracklist)
    initial = artwork_dir or (cover_file.parent if cover_file else None)
    picked = pick_cover_image_dialog(initial)
    if not picked:
        return {"ok": True, "cancelled": True}
    if picked.suffix.lower() not in IMAGE_EXTS:
        return {"ok": False, "error": "Unsupported image format"}

    resolved = picked.resolve()
    token = encode_cover_path(str(resolved))
    return {
        "ok": True,
        "cancelled": False,
        "edition_id": edition_id,
        "cover_path": str(resolved),
        "preview_url": (
            f"/api/music/bands/{band_id}/releases/{release_id}"
            f"/write-file-tags/cover-preview?token={quote(token, safe='')}"
        ),
    }


def cover_preview_file(token: str) -> Path:
    path = decode_cover_path(token)
    if not path.is_file():
        raise FileNotFoundError(str(path))
    if path.suffix.lower() not in IMAGE_EXTS:
        raise ValueError("Not an image file")
    return path
