"""Artist person detail payload for member modal."""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_overview import _display_name, _parse_websites
from app.gallery import _artist_dir
from app.models import Artist, ArtistParticipation, Band, Country
from app.music_dashboard import _parse_country_id


def _parse_urls(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _age_text(birth: str | None) -> str | None:
    if not birth or len(birth) < 10:
        return None
    try:
        born = date.fromisoformat(birth[:10])
    except ValueError:
        return None
    today = date.today()
    years = today.year - born.year - (
        (today.month, today.day) < (born.month, born.day)
    )
    born_label = born.strftime("%b ") + str(born.day) + born.strftime(", %Y")
    return f"{years} years old (born {born_label})"


def _band_in_library(db: Session, band: Band, media_root: Path | None) -> bool:
    if not media_root or not media_root.is_dir():
        return False
    return _artist_dir(media_root, band.bnd_name) is not None


def _external_urls_for_band(band: Band) -> dict[str, str]:
    urls: dict[str, str] = {}
    for link in _parse_websites(band.bnd_websites):
        typ = link["type"].lower()
        if "wikipedia" in typ:
            urls.setdefault("wikipedia", link["url"])
        elif "musicbrainz" in typ:
            urls.setdefault("musicbrainz", link["url"])
        elif "wikidata" in typ:
            urls.setdefault("wikidata", link["url"])
    if band.bnd_code and "musicbrainz" not in urls:
        urls["musicbrainz"] = f"https://musicbrainz.org/artist/{band.bnd_code}"
    return urls


def build_artist_details(
    db: Session,
    artist_id: int,
    *,
    media_root: Path | None,
    band_id: int | None = None,
) -> dict | None:
    artist = db.get(Artist, artist_id)
    if not artist:
        return None

    birth_name = _display_name(artist.art_name)
    stage = _display_name(artist.art_stage_name or artist.art_name)
    aliases = [
        a.strip()
        for a in (artist.art_aliases or "").replace("█", "'").split(";")
        if a.strip()
    ]

    country = None
    cid = _parse_country_id(artist.art_birth_fk_countries)
    if cid:
        row = db.get(Country, cid)
        if row:
            country = {
                "id": cid,
                "name": row.cou_name,
                "iso": (row.cou_iso or "").lower() or None,
            }

    city = None
    if artist.art_birth_place:
        city = artist.art_birth_place.split("[")[0].strip()

    from app.lineup_instruments import instrument_label
    from app.music_filters import _parse_ids

    PAR_OFFICIAL = 0
    PAR_ORIGINAL = 1
    PAR_FORMER = 3

    def _membership_flags(arp: ArtistParticipation) -> dict:
        type_ids = _parse_ids(arp.arp_fk_participation_types)
        return {
            "is_official": PAR_OFFICIAL in type_ids if type_ids else not arp.arp_end_dates,
            "is_founding": PAR_ORIGINAL in type_ids,
            "is_former": PAR_FORMER in type_ids or bool(arp.arp_end_dates),
        }

    participations: list[dict] = []
    for arp in db.scalars(
        select(ArtistParticipation).where(
            ArtistParticipation.arp_fk_artists == artist_id
        ).order_by(ArtistParticipation.arp_id)
    ).all():
        if not arp.arp_fk_bands:
            continue
        band = db.get(Band, arp.arp_fk_bands)
        if not band or not band.bnd_name:
            continue
        in_lib = _band_in_library(db, band, media_root)
        roles: list[str] = []
        for iid in _parse_ids(arp.arp_fk_instruments):
            label = instrument_label(db, iid)
            if label:
                roles.append(label)
        participations.append(
            {
                "participation_id": arp.arp_id,
                "band_id": band.bnd_id if in_lib else None,
                "band_db_id": band.bnd_id,
                "name": _display_name(band.bnd_name),
                "mbid": band.bnd_code,
                "in_library": in_lib,
                "start": arp.arp_start_dates,
                "end": arp.arp_end_dates,
                "roles": roles,
                "participation_types": arp.arp_fk_participation_types,
                "urls": _external_urls_for_band(band),
                **_membership_flags(arp),
            }
        )

    urls = _parse_urls(artist.art_external_urls)
    if artist.art_code and "musicbrainz" not in urls:
        urls["musicbrainz"] = f"https://musicbrainz.org/artist/{artist.art_code}"

    from app.artist_photo import member_photo_url

    photo = member_photo_url(artist, media_root)

    band_membership = None
    band_memberships: list[dict] = []

    if band_id:
        from app.artist_admin import participations_for_band

        for arp in participations_for_band(db, band_id, artist_id):
            roles = [
                instrument_label(db, iid)
                for iid in _parse_ids(arp.arp_fk_instruments)
                if instrument_label(db, iid)
            ]
            flags = _membership_flags(arp)
            entry = {
                "participation_id": arp.arp_id,
                "start": arp.arp_start_dates,
                "end": arp.arp_end_dates,
                "roles": roles,
                **flags,
            }
            band_memberships.append(entry)
            if band_membership is None and flags["is_official"] and not flags["is_former"]:
                band_membership = entry
        if band_membership is None and band_memberships:
            band_membership = band_memberships[-1]

    return {
        "id": artist.art_id,
        "mbid": artist.art_code,
        "name": stage,
        "birth_name": birth_name if birth_name != stage else None,
        "aliases": aliases,
        "origin": {
            "city": city,
            "country": country,
        },
        "birth_date": artist.art_birth_date,
        "death_date": artist.art_death_date,
        "age_text": _age_text(artist.art_birth_date),
        "is_deceased": bool((artist.art_death_date or "").strip()),
        "photo_url": photo,
        "urls": urls,
        "participations": participations,
        "band_membership": band_membership,
        "band_memberships": band_memberships,
        "source": artist.art_source,
    }
