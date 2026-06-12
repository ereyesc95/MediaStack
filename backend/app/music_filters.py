"""Artist browse filters for /api/music/artist-cards."""
from __future__ import annotations

import re
from collections import Counter
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Artist,
    ArtistParticipation,
    Band,
    Continent,
    Country,
    Genre,
    Reproduction,
    Release,
    Subgenre,
)

ANTARCTICA_ID = 1007
MUSIC_MEDIA_TYPE = 200
VOCALS_INSTRUMENT_ID = 1016


def is_catalog_label(name: str) -> bool:
    """Exclude placeholder labels (e.g. self-released) from catalog and artist UI."""
    q = (name or "").strip()
    return bool(q) and "self-released" not in q.lower()
SOLO_ARTIST_TYPE_ID = 1

def _artist_gender_ids(artist: Artist) -> set[int]:
    raw = (artist.art_fk_genders or "").strip()
    if not raw:
        return {0}
    ids = set(_parse_ids(raw))
    return ids if ids else {0}


def _artist_matches_gender(artist: Artist, gender_key: str) -> bool:
    key = gender_key.strip().lower()
    ids = _artist_gender_ids(artist)
    if key == "female":
        return 1 in ids
    if key == "other":
        return 2 in ids
    if key == "male":
        return not (artist.art_fk_genders or "").strip() or 0 in ids
    return False

DECADE_RE = re.compile(r"(\d{4})")


def decade_options() -> list[int]:
    end = (datetime.now().year // 10) * 10
    return list(range(1950, end + 10, 10))


def _parse_ids(field: str | None) -> list[int]:
    if not field:
        return []
    out: list[int] = []
    for part in re.split(r"[;,\[\]]+", field):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(int(part))
        except ValueError:
            continue
    return out


def _band_type_id(b: Band) -> int | None:
    ids = _parse_ids(b.bnd_fk_artisttypes)
    return ids[0] if ids else None


def _first_decade(dates: str | None) -> int | None:
    if not dates:
        return None
    m = DECADE_RE.search(dates)
    if not m:
        return None
    year = int(m.group(1))
    return (year // 10) * 10


def _country_ids(db: Session, *, continent_id: int | None = None, country_id: int | None = None) -> set[int]:
    rows = db.scalars(select(Country)).all()
    ids: set[int] = set()
    for c in rows:
        if country_id is not None and c.cou_id != country_id:
            continue
        cid = getattr(c, "cou_continent_id", None)
        if continent_id is not None and cid != continent_id:
            continue
        ids.add(c.cou_id)
    return ids


def _band_country_id(b: Band) -> int | None:
    ids = _parse_ids(b.bnd_fk_countries)
    return ids[0] if ids else None


def _band_matches_country(b: Band, country_ids: set[int]) -> bool:
    cid = _band_country_id(b)
    return cid is not None and cid in country_ids


def _play_counts(db: Session, user_id: int) -> Counter[int]:
    from app.play_stats import is_quiz_play_title
    from app.profile_scope import rep_user_filter

    counts: Counter[int] = Counter()
    for r in db.scalars(
        select(Reproduction).where(
            Reproduction.rep_media_type == 200,
            rep_user_filter(user_id),
        )
    ).all():
        if not r.rep_artist_id or is_quiz_play_title(r.rep_title):
            continue
        try:
            n = int(r.rep_reproductions or "0")
        except ValueError:
            n = 1
        if n > 0:
            counts[r.rep_artist_id] += n
    return counts


def _label_band_ids(db: Session, label: str) -> set[int]:
    q = label.strip().lower()
    if not q:
        return set()
    band_ids: set[int] = set()
    for rel in db.scalars(select(Release)).all():
        companies = (rel.rel_fk_companies or "").strip().lower()
        if companies != q:
            continue
        for bid in _parse_ids(rel.rel_fk_bands):
            band_ids.add(bid)
    return band_ids


def _is_music_media(value: int | str | None) -> bool:
    if value is None:
        return False
    return str(value).strip() == str(MUSIC_MEDIA_TYPE)


def _band_artist_ids(b: Band) -> list[int]:
    return _parse_ids(b.bnd_fk_artists)


def _participation_active(arp: ArtistParticipation) -> bool:
    end = (arp.arp_end_dates or "").strip()
    return not end


def _participation_has_vocals(arp: ArtistParticipation) -> bool:
    return VOCALS_INSTRUMENT_ID in _parse_ids(arp.arp_fk_instruments)


def _current_lineup_count(db: Session, band_id: int) -> int:
    return sum(
        1
        for arp in db.scalars(
            select(ArtistParticipation).where(ArtistParticipation.arp_fk_bands == band_id)
        ).all()
        if arp.arp_fk_artists and _participation_active(arp)
    )


def _band_ids_for_gender(db: Session, gender_key: str) -> set[int]:
    key = gender_key.strip().lower()
    matching = {
        a.art_id
        for a in db.scalars(select(Artist)).all()
        if _artist_matches_gender(a, key)
    }
    if not matching:
        return set()

    band_ids: set[int] = set()
    for b in db.scalars(select(Band)).all():
        if SOLO_ARTIST_TYPE_ID in _parse_ids(b.bnd_fk_artisttypes):
            if any(aid in matching for aid in _band_artist_ids(b)):
                band_ids.add(b.bnd_id)

    for arp in db.scalars(select(ArtistParticipation)).all():
        if not arp.arp_fk_bands or not arp.arp_fk_artists:
            continue
        if arp.arp_fk_artists not in matching:
            continue
        if not _participation_has_vocals(arp):
            continue
        band_ids.add(arp.arp_fk_bands)
    return band_ids


def _matches_member_count(db: Session, b: Band, member_count: int) -> bool:
    n = _current_lineup_count(db, b.bnd_id)
    if n == 0:
        tid = _band_type_id(b)
        if tid is None:
            return False
        if member_count >= 10:
            return tid >= 10
        return tid == member_count
    if member_count >= 10:
        return n >= 10
    return n == member_count


def _producer_band_ids(db: Session, producer: str) -> set[int]:
    q = producer.strip()
    if not q:
        return set()
    band_ids: set[int] = set()
    for rel in db.scalars(select(Release)).all():
        prod = (rel.rel_fk_artists or "").strip()
        if prod != q and prod.lower() != q.lower():
            continue
        for bid in _parse_ids(rel.rel_fk_bands):
            band_ids.add(bid)
    return band_ids


def _member_band_ids(db: Session, member_query: str) -> set[int]:
    q = member_query.strip().lower()
    if not q:
        return set()
    artist_ids: list[int] = []
    for a in db.scalars(select(Artist)).all():
        names = " ".join(
            filter(
                None,
                [
                    (a.art_name or "").lower(),
                    (a.art_stage_name or "").lower(),
                    (a.art_aliases or "").lower(),
                ],
            )
        )
        if q in names:
            artist_ids.append(a.art_id)

    band_ids: set[int] = set()
    for b in db.scalars(select(Band)).all():
        fk = (b.bnd_fk_artists or "").lower()
        if q in fk:
            band_ids.add(b.bnd_id)
        for aid in artist_ids:
            if str(aid) in fk or f"[{aid}]" in fk:
                band_ids.add(b.bnd_id)
    return band_ids


def filter_bands(
    db: Session,
    rows: list[Band],
    *,
    search: str = "",
    letter: str = "",
    filter_mode: str = "name",
    member_count: int | None = None,
    member: str = "",
    member_artist_id: int | None = None,
    continent_id: int | None = None,
    country_id: int | None = None,
    start_decade: int | None = None,
    end_decade: int | None = None,
    subgenre_id: int | None = None,
    gender: str = "",
    label: str = "",
    producer: str = "",
) -> list[Band]:
    out = list(rows)

    if search.strip():
        term = search.strip().lower()
        out = [
            b
            for b in out
            if (b.bnd_name and term in b.bnd_name.lower())
            or (b.bnd_other_names and term in b.bnd_other_names.lower())
        ]

    if filter_mode == "name" or not filter_mode:
        if letter and letter != "#":
            ch = letter.upper()[0]
            out = [b for b in out if (b.bnd_name or "").upper().startswith(ch)]
        elif letter == "#":
            out = [b for b in out if (b.bnd_name or "") and not (b.bnd_name[0].isalpha())]

    if filter_mode in ("type", "group") and member_count is not None:
        out = [b for b in out if _matches_member_count(db, b, member_count)]

    if filter_mode == "members" and member_artist_id is not None:
        allowed = {
            arp.arp_fk_bands
            for arp in db.scalars(
                select(ArtistParticipation).where(
                    ArtistParticipation.arp_fk_artists == member_artist_id
                )
            ).all()
            if arp.arp_fk_bands
        }
        out = [b for b in out if b.bnd_id in allowed]
    elif filter_mode == "members" and member.strip():
        allowed = _member_band_ids(db, member)
        out = [b for b in out if b.bnd_id in allowed]

    if filter_mode == "continent" and continent_id is not None:
        cids = _country_ids(db, continent_id=continent_id)
        if cids:
            out = [b for b in out if _band_matches_country(b, cids)]

    if filter_mode == "country" and country_id is not None:
        cids = _country_ids(db, country_id=country_id)
        if cids:
            out = [b for b in out if _band_matches_country(b, cids)]

    if filter_mode == "start" and start_decade is not None:
        out = [b for b in out if _first_decade(b.bnd_starting_dates) == start_decade]

    if filter_mode == "end" and end_decade is not None:
        out = [b for b in out if _first_decade(b.bnd_ending_dates) == end_decade]

    if filter_mode == "genre" and subgenre_id is not None:
        out = [b for b in out if subgenre_id in _parse_ids(b.bnd_fk_subgenres)]

    if filter_mode == "gender" and gender:
        allowed = _band_ids_for_gender(db, gender)
        out = [b for b in out if b.bnd_id in allowed]

    if filter_mode == "label" and label.strip():
        allowed = _label_band_ids(db, label)
        out = [b for b in out if b.bnd_id in allowed]

    if filter_mode == "producer" and producer.strip():
        allowed = _producer_band_ids(db, producer)
        out = [b for b in out if b.bnd_id in allowed]

    return out


def sort_bands(
    rows: list[Band],
    *,
    filter_mode: str = "name",
    play_counts: Counter[int] | None = None,
) -> list[Band]:
    if filter_mode == "most_played" and play_counts is not None:
        return sorted(
            rows,
            key=lambda b: (-play_counts.get(b.bnd_id, 0), (b.bnd_name or "").lower()),
        )
    return sorted(rows, key=lambda b: (b.bnd_name or "").lower())


def search_roster_artists(db: Session, query: str, *, limit: int = 25) -> list[dict]:
    term = query.strip().lower()
    if len(term) < 1:
        return []
    out: list[dict] = []
    for a in db.scalars(select(Artist).order_by(Artist.art_name)).all():
        hay = " ".join(
            filter(
                None,
                [
                    (a.art_name or "").lower(),
                    (a.art_stage_name or "").lower(),
                    (a.art_aliases or "").lower(),
                ],
            )
        )
        if term not in hay:
            continue
        label = (a.art_stage_name or a.art_name or "").strip()
        if label:
            out.append({"id": a.art_id, "name": label})
        if len(out) >= limit:
            break
    return out


def _country_groups_from_ids(
    db: Session,
    country_ids: set[int] | None = None,
) -> list[dict]:
    continent_names = {
        c.con_id: c.con_name
        for c in db.scalars(select(Continent)).all()
        if c.con_name and c.con_id != ANTARCTICA_ID
    }
    by_continent: dict[str, list[dict]] = {}
    rows = db.scalars(select(Country)).all()
    for c in rows:
        if country_ids is not None and c.cou_id not in country_ids:
            continue
        if not c.cou_name:
            continue
        cont_id = getattr(c, "cou_continent_id", None)
        if cont_id == ANTARCTICA_ID:
            continue
        group = continent_names.get(cont_id or 0) or "Other"
        by_continent.setdefault(group, []).append(
            {
                "id": c.cou_id,
                "name": c.cou_name,
                "iso": (c.cou_iso or "").lower(),
                "continent_id": cont_id,
            }
        )
    for items in by_continent.values():
        items.sort(key=lambda x: (x.get("name") or "").lower())
    return [
        {"continent": name, "items": items}
        for name, items in sorted(by_continent.items(), key=lambda x: x[0].lower())
    ]


def all_country_groups(db: Session) -> list[dict]:
    """Every country in the database, grouped by continent (for admin pickers)."""
    return _country_groups_from_ids(db, country_ids=None)


def search_roster_bands(db: Session, query: str, *, limit: int = 25) -> list[dict]:
    term = query.strip().lower()
    if len(term) < 1:
        return []
    out: list[dict] = []
    for b in db.scalars(select(Band).order_by(Band.bnd_name)).all():
        hay = " ".join(
            filter(
                None,
                [
                    (b.bnd_name or "").lower(),
                    (b.bnd_other_names or "").lower(),
                ],
            )
        )
        if term not in hay:
            continue
        label = (b.bnd_name or "").strip()
        if label:
            out.append({"id": b.bnd_id, "name": label})
        if len(out) >= limit:
            break
    return out


def filter_options(db: Session) -> dict:
    bands = list(db.scalars(select(Band)).all())
    band_ids = {b.bnd_id for b in bands}

    used_country_ids: set[int] = set()
    used_subgenre_ids: set[int] = set()
    for b in bands:
        cid = _band_country_id(b)
        if cid:
            used_country_ids.add(cid)
        for sid in _parse_ids(b.bnd_fk_subgenres):
            used_subgenre_ids.add(sid)

    parent_names = {
        g.gen_id: g.gen_name
        for g in db.scalars(select(Genre)).all()
        if g.gen_name and _is_music_media(g.gen_media_type_id)
    }
    by_parent: dict[str, list[dict]] = {}
    for sid in sorted(used_subgenre_ids):
        s = db.get(Subgenre, sid)
        if not s or not s.sgn_name:
            continue
        if not _is_music_media(s.sgn_media_type_id):
            parent_genre = db.get(Genre, s.sgn_genre_id or 0)
            if not parent_genre or not _is_music_media(parent_genre.gen_media_type_id):
                continue
        parent = parent_names.get(s.sgn_genre_id or 0) or "Other"
        by_parent.setdefault(parent, []).append(
            {"id": s.sgn_id, "name": s.sgn_name, "genre_id": s.sgn_genre_id}
        )
    for name, items in by_parent.items():
        items.sort(key=lambda x: (x.get("name") or "").lower())
    subgenre_groups = [
        {"genre": name, "items": items}
        for name, items in sorted(by_parent.items(), key=lambda x: x[0].lower())
    ]

    country_groups = _country_groups_from_ids(db, used_country_ids)

    labels: set[str] = set()
    producers: dict[str, str] = {}
    for rel in db.scalars(select(Release)).all():
        rel_band_ids = _parse_ids(rel.rel_fk_bands)
        if not any(bid in band_ids for bid in rel_band_ids):
            continue
        lab = (rel.rel_fk_companies or "").strip()
        if lab and is_catalog_label(lab):
            labels.add(lab)
        prod = (rel.rel_fk_artists or "").strip()
        if prod:
            producers[prod] = prod

    producer_list = []
    for pid in sorted(producers, key=lambda x: (not x.isdigit(), x.lower())):
        name = pid
        if pid.isdigit():
            artist = db.get(Artist, int(pid))
            if artist:
                name = (artist.art_stage_name or artist.art_name or "").strip() or pid
        producer_list.append({"id": pid, "name": name})

    return {
        "subgenre_groups": subgenre_groups,
        "country_groups": country_groups,
        "all_country_groups": all_country_groups(db),
        "decades": decade_options(),
        "labels": sorted(labels, key=str.lower),
        "producers": producer_list,
    }
