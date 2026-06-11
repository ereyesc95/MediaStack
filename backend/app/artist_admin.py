"""Admin CRUD helpers for artists, participations, and local photos."""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.gallery import _media_url
from app.lineup_instruments import ATTR_TO_INSTRUMENT_ID, map_mb_attributes
from app.models import Artist, ArtistParticipation, Band

PAR_OFFICIAL = 0
PAR_ORIGINAL = 1
PAR_FORMER = 3

ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def _display_name(name: str | None) -> str:
    if not name:
        return "Unknown"
    return name.replace("■", ",").replace("█", "'").strip()


def _next_artist_id(db: Session) -> int:
    return (db.scalar(select(func.max(Artist.art_id))) or 0) + 1


def _next_arp_id(db: Session) -> int:
    return (db.scalar(select(func.max(ArtistParticipation.arp_id))) or 0) + 1


def roles_text_to_instrument_ids(db: Session, roles_text: str | None) -> str | None:
    if not roles_text or not roles_text.strip():
        return None
    parts = [p.strip() for p in roles_text.replace(";", ",").split(",") if p.strip()]
    ids, _ = map_mb_attributes(db, parts)
    if not ids:
        for part in parts:
            key = part.strip().lower()
            iid = ATTR_TO_INSTRUMENT_ID.get(key)
            if iid and iid not in ids:
                ids.append(iid)
    return ";".join(str(i) for i in ids) if ids else None


def participation_types_from_flags(
    *,
    is_official: bool,
    is_founding: bool,
    is_former: bool,
) -> str:
    ids: list[int] = []
    if is_official:
        ids.append(PAR_OFFICIAL)
    if is_founding:
        ids.append(PAR_ORIGINAL)
    if is_former:
        ids.append(PAR_FORMER)
    if not ids:
        ids.append(PAR_OFFICIAL)
    return ";".join(str(i) for i in ids)


def save_artist_photo_file(
    artist: Artist,
    media_root: Path,
    raw: bytes,
    ext: str,
) -> str:
    from app.artist_photo import photo_file_stem

    ext = ext.lower() if ext.lower() in ALLOWED_IMAGE_EXT else ".jpg"
    name = _display_name(artist.art_stage_name or artist.art_name)
    letter = name[0].upper() if name and name[0].isalpha() else "#"
    dest_dir = media_root / "People" / letter
    dest_dir.mkdir(parents=True, exist_ok=True)
    stem = photo_file_stem(artist)
    code = (artist.art_code or str(artist.art_id)).lower()
    dest = dest_dir / f"{stem}{ext}"
    for old in dest_dir.iterdir():
        if old.suffix.lower() not in ALLOWED_IMAGE_EXT:
            continue
        old_stem = old.stem.lower()
        if old_stem == stem or code in old_stem:
            old.unlink(missing_ok=True)
    dest.write_bytes(raw)
    return _media_url(dest, media_root)


def patch_artist(
    db: Session,
    artist: Artist,
    *,
    name: str | None = None,
    stage_name: str | None = None,
    aliases: str | None = None,
    birth_date: str | None = None,
    birth_place: str | None = None,
    birth_country_id: int | None = None,
    death_date: str | None = None,
    mbid: str | None = None,
) -> Artist:
    if name is not None:
        artist.art_name = name.strip() or artist.art_name
    if stage_name is not None:
        artist.art_stage_name = stage_name.strip() or None
    if aliases is not None:
        artist.art_aliases = aliases.strip() or None
    if birth_date is not None:
        artist.art_birth_date = birth_date.strip() or None
    if birth_place is not None:
        artist.art_birth_place = birth_place.strip() or None
    if birth_country_id is not None:
        artist.art_birth_fk_countries = (
            str(birth_country_id) if birth_country_id else None
        )
    if death_date is not None:
        artist.art_death_date = death_date.strip() or None
    if mbid is not None:
        artist.art_code = mbid.strip() or None
    artist.art_source = artist.art_source or "manual"
    db.commit()
    db.refresh(artist)
    return artist


def patch_participation(
    db: Session,
    arp: ArtistParticipation,
    *,
    start: str | None = None,
    end: str | None = None,
    roles_text: str | None = None,
    is_official: bool | None = None,
    is_founding: bool | None = None,
    is_former: bool | None = None,
) -> ArtistParticipation:
    if start is not None:
        arp.arp_start_dates = start.strip() or None
    if end is not None:
        arp.arp_end_dates = end.strip() or None
    if roles_text is not None:
        arp.arp_fk_instruments = roles_text_to_instrument_ids(db, roles_text)

    if any(v is not None for v in (is_official, is_founding, is_former)):
        from app.music_filters import _parse_ids

        current = _parse_ids(arp.arp_fk_participation_types)
        off = is_official if is_official is not None else PAR_OFFICIAL in current
        found = is_founding if is_founding is not None else PAR_ORIGINAL in current
        former = is_former if is_former is not None else PAR_FORMER in current
        arp.arp_fk_participation_types = participation_types_from_flags(
            is_official=off,
            is_founding=found,
            is_former=former,
        )

    arp.arp_manual = 1
    db.commit()
    db.refresh(arp)
    return arp


def create_participation(
    db: Session,
    band: Band,
    *,
    artist_id: int | None = None,
    name: str | None = None,
    mbid: str | None = None,
    start: str | None = None,
    end: str | None = None,
    roles_text: str | None = None,
    is_official: bool = True,
    is_founding: bool = False,
    is_former: bool = False,
) -> ArtistParticipation:
    artist: Artist | None = None
    if artist_id:
        artist = db.get(Artist, artist_id)
    elif mbid:
        artist = db.scalars(select(Artist).where(Artist.art_code == mbid)).first()
    if not artist and name:
        artist = Artist(
            art_id=_next_artist_id(db),
            art_name=name.strip(),
            art_stage_name=name.strip(),
            art_code=mbid.strip() if mbid else None,
            art_source="manual",
        )
        db.add(artist)
        db.flush()
    if not artist:
        raise ValueError("artist_id, mbid, or name required")

    arp = ArtistParticipation(
        arp_id=_next_arp_id(db),
        arp_fk_bands=band.bnd_id,
        arp_fk_artists=artist.art_id,
        arp_start_dates=start.strip() if start else None,
        arp_end_dates=end.strip() if end else None,
        arp_fk_instruments=roles_text_to_instrument_ids(db, roles_text),
        arp_fk_participation_types=participation_types_from_flags(
            is_official=is_official,
            is_founding=is_founding,
            is_former=is_former,
        ),
        arp_manual=1,
    )
    db.add(arp)
    db.commit()
    db.refresh(arp)
    return arp


def delete_participation(db: Session, arp: ArtistParticipation) -> None:
    db.execute(delete(ArtistParticipation).where(ArtistParticipation.arp_id == arp.arp_id))
    db.commit()


def patch_band_about(
    db: Session,
    band: Band,
    *,
    bio: str | None = None,
    aliases: str | None = None,
    origin_city: str | None = None,
    country_id: int | None = None,
    activity_start: str | None = None,
    activity_end: str | None = None,
) -> Band:
    if bio is not None:
        band.bnd_fk_images = bio.strip()
        band.bnd_bio_manual = 1
        band.bnd_bio_source = "manual"
    if aliases is not None:
        band.bnd_other_names = aliases.strip().replace(",", ";") or None
    if origin_city is not None:
        band.bnd_origin_place = origin_city.strip() or None
    if country_id is not None:
        band.bnd_fk_countries = str(country_id) if country_id else None
    if activity_start is not None:
        band.bnd_starting_dates = activity_start.strip() or None
    if activity_end is not None:
        band.bnd_ending_dates = activity_end.strip() or None
    db.commit()
    db.refresh(band)
    return band


def participations_for_band(
    db: Session, band_id: int, artist_id: int
) -> list[ArtistParticipation]:
    return list(
        db.scalars(
            select(ArtistParticipation).where(
                ArtistParticipation.arp_fk_bands == band_id,
                ArtistParticipation.arp_fk_artists == artist_id,
            ).order_by(ArtistParticipation.arp_id)
        ).all()
    )


def participation_for_band(
    db: Session, band_id: int, artist_id: int
) -> ArtistParticipation | None:
    """Prefer an active stint; otherwise the most recent row."""
    rows = participations_for_band(db, band_id, artist_id)
    if not rows:
        return None
    for arp in rows:
        if not (arp.arp_end_dates or "").strip():
            return arp
    return rows[-1]
