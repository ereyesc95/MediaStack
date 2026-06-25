"""Cross-artist system playlists (writing credits, guest appearances)."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import (
    _album_title_from_folder,
    _collect_audio_files,
    _find_audio_by_title,
    _find_cover_front_artwork,
    _normalize_title_for_match,
    _track_title_from_filename,
)
from app.gallery import _artist_dir
from app.media_index import parse_bracket_tags
from app.media_paths_util import safe_relative
from app.models import Artist, ArtistParticipation, Band, Track
from app.music_filters import _parse_ids
from app.system_playlists import _track_tags

WRITING_CREDITS_SLUG = "writing-credits"
APPEARANCES_SLUG = "appearances"

CROSS_PLAYLIST_LABELS: dict[str, str] = {
    WRITING_CREDITS_SLUG: "Writing Credits",
    APPEARANCES_SLUG: "Appearances",
}


def _member_artist_ids(db: Session, band_id: int) -> set[int]:
    ids: set[int] = set()
    for arp in db.scalars(
        select(ArtistParticipation).where(ArtistParticipation.arp_fk_bands == band_id)
    ).all():
        if arp.arp_fk_artists:
            ids.add(int(arp.arp_fk_artists))
    return ids


def _track_entry(
    audio_file: Path,
    media_root: Path,
    *,
    album_title: str | None = None,
) -> dict | None:
    play_path = safe_relative(audio_file, media_root)
    if not play_path:
        return None
    album_dir = audio_file.parent
    while album_dir.name.casefold() in ("standard edition", "deluxe edition", "bonus"):
        album_dir = album_dir.parent
    return {
        "title": _track_title_from_filename(audio_file),
        "play_path": play_path,
        "album_title": album_title or _album_title_from_folder(album_dir.name),
        "cover_url": _find_cover_front_artwork(audio_file.parent, media_root),
    }


def _member_artist_names(db: Session, band_id: int) -> dict[int, set[str]]:
    from app.system_playlists import _name_pool

    out: dict[int, set[str]] = {}
    for arp in db.scalars(
        select(ArtistParticipation).where(ArtistParticipation.arp_fk_bands == band_id)
    ).all():
        if not arp.arp_fk_artists:
            continue
        artist = db.get(Artist, int(arp.arp_fk_artists))
        if not artist:
            continue
        names = _name_pool(artist.art_name) | _name_pool(artist.art_stage_name)
        names |= _name_pool(artist.art_aliases)
        if names:
            out[int(arp.arp_fk_artists)] = names
    return out


def _bands_for_member_projects(db: Session, band: Band) -> list[Band]:
    from app.system_playlists import _name_pool

    own_id = band.bnd_id
    member_names = _member_artist_names(db, own_id)
    if not member_names:
        return []
    all_member_name_tokens: set[str] = set()
    for names in member_names.values():
        all_member_name_tokens |= names

    matched: list[Band] = []
    seen: set[int] = set()
    for other in db.scalars(select(Band)).all():
        if other.bnd_id == own_id or other.bnd_id in seen:
            continue
        band_names = _name_pool(other.bnd_name) | _name_pool(other.bnd_other_names)
        if band_names & all_member_name_tokens:
            matched.append(other)
            seen.add(other.bnd_id)
    return matched


def scan_writing_credits(db: Session, band: Band, media_root: Path) -> list[dict]:
    member_ids = _member_artist_ids(db, band.bnd_id)
    if not member_ids:
        return []

    own = str(band.bnd_id)
    out: list[dict] = []
    seen: set[str] = set()

    for row in db.scalars(select(Track)).all():
        authors = set(_parse_ids(row.tra_author_id or ""))
        if not authors & member_ids:
            continue

        title = (row.tra_name or "").strip()
        if not title:
            continue

        other_band_ids = [
            bid
            for bid in _parse_ids(row.tra_band_id or "")
            if str(bid) != own
        ]
        if not other_band_ids:
            continue

        for other_id in other_band_ids:
            other = db.get(Band, other_id)
            if not other or not other.bnd_name:
                continue
            artist_dir = _artist_dir(media_root, other.bnd_name)
            if not artist_dir:
                continue
            matched = _find_audio_by_title(_collect_audio_files(artist_dir), title)
            if not matched:
                continue
            entry = _track_entry(
                matched,
                media_root,
                album_title=_album_title_from_folder(matched.parent.name),
            )
            if not entry:
                continue
            key = entry["play_path"]
            if key in seen:
                continue
            seen.add(key)
            out.append(entry)

    out.sort(key=lambda t: (t.get("album_title") or "", t.get("title") or ""))

    if out:
        return out

    for other in _bands_for_member_projects(db, band):
        if not other.bnd_name:
            continue
        artist_dir = _artist_dir(media_root, other.bnd_name)
        if not artist_dir:
            continue
        for audio_file in _collect_audio_files(artist_dir):
            entry = _track_entry(
                audio_file,
                media_root,
                album_title=_album_title_from_folder(audio_file.parent.name),
            )
            if not entry:
                continue
            key = entry["play_path"]
            if key in seen:
                continue
            seen.add(key)
            out.append(entry)

    out.sort(key=lambda t: (t.get("album_title") or "", t.get("title") or ""))
    return out


def _appearance_names(band: Band) -> list[str]:
    names: list[str] = []
    if band.bnd_name:
        names.append(band.bnd_name.strip())
    for part in (band.bnd_name or "").split(";"):
        piece = part.strip()
        if piece and piece not in names:
            names.append(piece)
    for part in (band.bnd_other_names or "").replace("█", "'").replace(";", ",").split(","):
        piece = part.strip()
        if piece and piece not in names:
            names.append(piece)
    return [n.casefold() for n in names if n]


def _mentions_artist(tags: list[str], names: list[str]) -> bool:
    for tag in tags:
        for name in names:
            if name in tag:
                return True
            if tag.startswith("with ") and name in tag[5:]:
                return True
            if "feat" in tag and name in tag:
                return True
    return False


def scan_appearances(band: Band, media_root: Path) -> list[dict]:
    names = _appearance_names(band)
    if not names:
        return []

    own_dir = _artist_dir(media_root, band.bnd_name)
    music_root = media_root / "Music"
    if not music_root.is_dir():
        return []

    out: list[dict] = []
    seen: set[str] = set()

    for letter_dir in sorted(music_root.iterdir()):
        if not letter_dir.is_dir():
            continue
        for artist_folder in sorted(letter_dir.iterdir()):
            if not artist_folder.is_dir():
                continue
            if own_dir and artist_folder.resolve() == own_dir.resolve():
                continue
            for audio_file in _collect_audio_files(artist_folder):
                stem = audio_file.stem
                file_tags = _track_tags(stem)
                album_dir = audio_file.parent
                while album_dir.name.casefold() in (
                    "standard edition",
                    "deluxe edition",
                    "bonus",
                ):
                    album_dir = album_dir.parent
                _, folder_tags = parse_bracket_tags(album_dir.name)
                folder_tag_text = " ".join(
                    t.casefold()
                    for t in (
                        [folder_tags.get("with_artist", "")]
                        if folder_tags.get("with_artist")
                        else []
                    )
                )
                combined = file_tags + ([folder_tag_text] if folder_tag_text else [])
                if not _mentions_artist(combined, names):
                    continue
                entry = _track_entry(audio_file, media_root)
                if not entry:
                    continue
                key = _normalize_title_for_match(entry["title"])
                if key in seen:
                    continue
                seen.add(key)
                out.append(entry)

    out.sort(key=lambda t: (t.get("album_title") or "", t.get("title") or ""))
    return out


def scan_cross_artist_playlists(
    db: Session, band: Band, media_root: Path
) -> dict[str, list[dict]]:
    return {
        WRITING_CREDITS_SLUG: scan_writing_credits(db, band, media_root),
        APPEARANCES_SLUG: scan_appearances(band, media_root),
    }
