"""Admin CRUD helpers for artists, participations, and local photos."""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.lineup_instruments import ATTR_TO_INSTRUMENT_ID, map_mb_attributes
from app.models import Artist, ArtistParticipation, ArtistType, Band
from app.music_filters import _parse_ids

PAR_OFFICIAL = 0
PAR_ORIGINAL = 1
PAR_TOURING = 2
PAR_FORMER = 3

# Seeded artist-type sizes (see seed_music.ARTIST_TYPES).
SOLO_ARTIST_TYPE_ID = 1
GROUP_SIZE_TYPE_IDS = {
    2: 2,  # Duo
    3: 3,  # Trio
    4: 4,  # Quartet
    5: 5,  # Quintet
    6: 6,  # Sixtet
    7: 7,  # Septet
    8: 8,  # Octet
    9: 9,  # Nonet
    10: 10,  # Dectet
}
GROUP_LARGE_TYPE_ID = 11  # 10+

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
    is_touring: bool = False,
) -> str:
    ids: list[int] = []
    if is_touring:
        ids.append(PAR_TOURING)
    if is_official:
        ids.append(PAR_OFFICIAL)
    if is_founding:
        ids.append(PAR_ORIGINAL)
    if is_former:
        ids.append(PAR_FORMER)
    if not ids:
        ids.append(PAR_OFFICIAL)
    return ";".join(str(i) for i in ids)


def _is_official_active_participation(arp: ArtistParticipation) -> bool:
    """Official + currently active (no end date). Touring-only does not count."""
    if (arp.arp_end_dates or "").strip():
        return False
    type_ids = _parse_ids(arp.arp_fk_participation_types)
    if PAR_OFFICIAL in type_ids:
        return True
    if not type_ids:
        return True
    return False


def _has_touring_participation(db: Session, band_id: int) -> bool:
    for arp in db.scalars(
        select(ArtistParticipation).where(
            ArtistParticipation.arp_fk_bands == band_id
        )
    ).all():
        if PAR_TOURING in _parse_ids(arp.arp_fk_participation_types):
            return True
    return False


def _is_band_mirror_artist(db: Session, artist: Artist, *, band_id: int) -> bool:
    """True when the artist row is a band entity, not a person.

    Catches related-project pollution (HIM/Agents/Daniel Lioneye ARPs on VV):
    - art_code matches another Band's MBID
    - display name matches another Band's name
    - MusicBrainz group shape: year-only birth date and no gender
    """
    code = (artist.art_code or "").strip()
    if code:
        other = db.scalars(
            select(Band).where(Band.bnd_code == code, Band.bnd_id != band_id)
        ).first()
        if other is not None:
            return True

    name = _display_name(artist.art_stage_name or artist.art_name).casefold()
    if name:
        named = db.scalars(
            select(Band).where(
                func.lower(Band.bnd_name) == name,
                Band.bnd_id != band_id,
            )
        ).first()
        if named is not None:
            return True

    birth = (artist.art_birth_date or "").strip()
    gender = (artist.art_fk_genders or "").strip()
    if len(birth) == 4 and birth.isdigit() and not gender:
        return True

    return False


def _official_active_artist_ids(db: Session, band: Band) -> set[int]:
    """Official-active person ids, including an implicit solo headliner by MBID.

    Band-mirror artist rows (e.g. related projects stored as artists) are ignored.
    """
    ids: set[int] = set()
    for arp in db.scalars(
        select(ArtistParticipation).where(
            ArtistParticipation.arp_fk_bands == band.bnd_id
        )
    ).all():
        if not arp.arp_fk_artists:
            continue
        if not _is_official_active_participation(arp):
            continue
        artist = db.get(Artist, arp.arp_fk_artists)
        if not artist or _is_band_mirror_artist(db, artist, band_id=band.bnd_id):
            continue
        ids.add(int(arp.arp_fk_artists))

    code = (band.bnd_code or "").strip()
    if not code:
        return ids
    head = db.scalars(select(Artist).where(Artist.art_code == code)).first()
    if not head or head.art_id in ids:
        return ids
    if _is_band_mirror_artist(db, head, band_id=band.bnd_id):
        return ids
    arp = db.scalars(
        select(ArtistParticipation).where(
            ArtistParticipation.arp_fk_bands == band.bnd_id,
            ArtistParticipation.arp_fk_artists == head.art_id,
        )
    ).first()
    if arp and (arp.arp_end_dates or "").strip():
        return ids
    if arp and not _is_official_active_participation(arp):
        # Explicit non-official / touring-only row for the headliner.
        type_ids = _parse_ids(arp.arp_fk_participation_types)
        if type_ids and PAR_OFFICIAL not in type_ids:
            return ids
    ids.add(head.art_id)
    return ids


def _artist_type_id_for_official_count(count: int) -> int:
    if count <= 1:
        return SOLO_ARTIST_TYPE_ID
    if count in GROUP_SIZE_TYPE_IDS:
        return GROUP_SIZE_TYPE_IDS[count]
    return GROUP_LARGE_TYPE_ID


def _ensure_official_arp_for_artist(
    db: Session, band: Band, artist_id: int
) -> None:
    """Make sure a promoted band's headliner has an Official participation row."""
    arp = db.scalars(
        select(ArtistParticipation).where(
            ArtistParticipation.arp_fk_bands == band.bnd_id,
            ArtistParticipation.arp_fk_artists == artist_id,
        )
    ).first()
    if arp:
        type_ids = _parse_ids(arp.arp_fk_participation_types)
        if PAR_OFFICIAL not in type_ids:
            type_ids = [PAR_OFFICIAL, *type_ids]
            arp.arp_fk_participation_types = ";".join(str(i) for i in type_ids)
        if (arp.arp_end_dates or "").strip():
            arp.arp_end_dates = None
        return
    db.add(
        ArtistParticipation(
            arp_id=_next_arp_id(db),
            arp_fk_bands=band.bnd_id,
            arp_fk_artists=artist_id,
            arp_fk_participation_types=str(PAR_OFFICIAL),
            arp_manual=1,
        )
    )


def sync_band_type_from_lineup(db: Session, band_id: int) -> str | None:
    """Persist Solo vs group artist type from Official-active membership.

    Rules (locked):
    - Count Official + currently active only (Founder+Official counts once).
    - >= 2 → group (Duo/Trio/… by count)
    - exactly 1 → Solo
    - 0 Official-active but Touring exists → stay/become group (not Solo)
    - 0 Official-active and no Touring → leave type unchanged

    Returns ``\"solo\"``, ``\"group\"``, or ``None`` when unchanged / band missing.
    """
    band = db.get(Band, band_id)
    if not band:
        return None

    official_ids = _official_active_artist_ids(db, band)
    n = len(official_ids)
    has_touring = _has_touring_participation(db, band_id)

    if n == 0 and not has_touring:
        return None

    if n == 0 and has_touring:
        # Stay band — use Duo as the minimum group size when promoting.
        target_id = GROUP_SIZE_TYPE_IDS[2]
        want = "group"
    elif n == 1:
        target_id = SOLO_ARTIST_TYPE_ID
        want = "solo"
    else:
        target_id = _artist_type_id_for_official_count(n)
        want = "group"
        # Ensure implicit solo headliner becomes a real Official row.
        code = (band.bnd_code or "").strip()
        if code:
            head = db.scalars(select(Artist).where(Artist.art_code == code)).first()
            if head and head.art_id in official_ids:
                _ensure_official_arp_for_artist(db, band, head.art_id)

    # Keep type row valid if seed missing for some reason.
    if not db.get(ArtistType, target_id):
        return None

    current = _parse_ids(band.bnd_fk_artisttypes)
    changed = current != [target_id]
    if changed:
        band.bnd_fk_artisttypes = str(target_id)
    db.commit()
    if changed:
        from app.band_overview_cache import invalidate_overview_cache

        invalidate_overview_cache(band_id)
    return want


def save_artist_photo_file(
    artist: Artist,
    media_root: Path,
    raw: bytes,
    ext: str,
) -> str:
    from app.artist_photo import _data_file_url, photo_file_stem
    from app.paths import people_dir

    ext = ext.lower() if ext.lower() in ALLOWED_IMAGE_EXT else ".jpg"
    name = _display_name(artist.art_stage_name or artist.art_name)
    letter = name[0].upper() if name and name[0].isalpha() else "#"
    dest_dir = people_dir() / letter
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
    return _data_file_url(dest)


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
    is_touring: bool | None = None,
) -> ArtistParticipation:
    if start is not None:
        arp.arp_start_dates = start.strip() or None
    if end is not None:
        arp.arp_end_dates = end.strip() or None
    if roles_text is not None:
        arp.arp_fk_instruments = roles_text_to_instrument_ids(db, roles_text)

    if any(
        v is not None
        for v in (is_official, is_founding, is_former, is_touring)
    ):
        current = _parse_ids(arp.arp_fk_participation_types)
        off = is_official if is_official is not None else PAR_OFFICIAL in current
        found = is_founding if is_founding is not None else PAR_ORIGINAL in current
        former = is_former if is_former is not None else PAR_FORMER in current
        touring = (
            is_touring if is_touring is not None else PAR_TOURING in current
        )
        arp.arp_fk_participation_types = participation_types_from_flags(
            is_official=off,
            is_founding=found,
            is_former=former,
            is_touring=touring,
        )

    arp.arp_manual = 1
    band_id = arp.arp_fk_bands
    db.commit()
    db.refresh(arp)
    if band_id:
        sync_band_type_from_lineup(db, band_id)
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
    is_touring: bool = False,
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
            is_touring=is_touring,
        ),
        arp_manual=1,
    )
    db.add(arp)
    db.commit()
    db.refresh(arp)
    sync_band_type_from_lineup(db, band.bnd_id)
    return arp


def delete_participation(db: Session, arp: ArtistParticipation) -> None:
    band_id = arp.arp_fk_bands
    db.execute(delete(ArtistParticipation).where(ArtistParticipation.arp_id == arp.arp_id))
    db.commit()
    if band_id:
        sync_band_type_from_lineup(db, band_id)


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


def _next_band_id(db: Session) -> int:
    return (db.scalar(select(func.max(Band.bnd_id))) or 0) + 1


def add_project_for_members(
    db: Session,
    current_band: Band,
    *,
    member_artist_ids: list[int],
    project_name: str,
    project_mbid: str | None = None,
) -> dict:
    """Link current band members to another project band (manual participations)."""
    ids = [int(x) for x in member_artist_ids if x]
    if not ids:
        raise ValueError("Select at least one member of this band")
    name = (project_name or "").strip()
    if not name and not project_mbid:
        raise ValueError("project name or mbid required")

    member_set = {
        arp.arp_fk_artists
        for arp in db.scalars(
            select(ArtistParticipation).where(
                ArtistParticipation.arp_fk_bands == current_band.bnd_id
            )
        ).all()
        if arp.arp_fk_artists
    }
    for mid in ids:
        if mid not in member_set:
            raise ValueError(f"Artist {mid} is not a member of this band")

    target: Band | None = None
    mbid = (project_mbid or "").strip() or None
    if mbid:
        target = db.scalars(select(Band).where(Band.bnd_code == mbid)).first()
    if not target and name:
        target = db.scalars(
            select(Band).where(func.lower(Band.bnd_name) == name.casefold())
        ).first()
    if not target:
        target = Band(
            bnd_id=_next_band_id(db),
            bnd_name=name or "Unknown",
            bnd_code=mbid,
        )
        db.add(target)
        db.flush()

    created = 0
    for mid in ids:
        existing = db.scalars(
            select(ArtistParticipation).where(
                ArtistParticipation.arp_fk_bands == target.bnd_id,
                ArtistParticipation.arp_fk_artists == mid,
            )
        ).first()
        if existing:
            continue
        db.add(
            ArtistParticipation(
                arp_id=_next_arp_id(db),
                arp_fk_bands=target.bnd_id,
                arp_fk_artists=mid,
                arp_manual=1,
            )
        )
        created += 1
    from app.entity_related import KIND_PARTICIPATION, _upsert_row

    via_members = [
        _display_name(
            (artist.art_stage_name or artist.art_name) if artist else ""
        )
        for artist in (db.get(Artist, mid) for mid in ids)
        if artist
    ]
    _upsert_row(
        db,
        kind=KIND_PARTICIPATION,
        band_id=current_band.bnd_id,
        artist_id=None,
        name=target.bnd_name or name,
        mbid=target.bnd_code,
        local_band_id=target.bnd_id,
        source="manual",
        manual=True,
        via_members=via_members,
    )
    db.commit()
    return {
        "ok": True,
        "project_band_id": target.bnd_id,
        "project_name": target.bnd_name,
        "created": created,
    }
