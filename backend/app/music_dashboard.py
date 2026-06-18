from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import cover_url_for_track_path, title_from_track_path
from app.config import settings
from app.gallery import pick_playlist_cover, resolve_artist_card
from app.models import Band, Country, Genre, Playlist, PlaylistData, Reproduction, Subgenre
from app.play_stats import is_quiz_play_title, subgenre_image_url

FEAT_RE = re.compile(r"\s*[\(\[](?:feat\.?|ft\.?|featuring)[^\)\]]*[\)\]]", re.I)


def _clean_track_title(title: str | None) -> str:
    if not title:
        return ""
    t = FEAT_RE.sub("", title)
    t = re.sub(r"\s{2,}", " ", t).strip()
    return t


def _resolve_subgenre_name(db: Session, sid: int) -> str | None:
    sub = db.get(Subgenre, sid)
    if sub and sub.sgn_name:
        return sub.sgn_name
    return None


def _genre_names(db: Session, genre_ids: str | None) -> list[str]:
    if not genre_ids:
        return []
    names: list[str] = []
    for part in genre_ids.split(";"):
        part = part.strip()
        if not part:
            continue
        try:
            gid = int(part)
        except ValueError:
            continue
        name = _resolve_subgenre_name(db, gid)
        if name:
            names.append(name)
    return names


def _country_info(db: Session, country_field: str | None) -> tuple[str | None, str | None]:
    if not country_field:
        return None, None
    cid = country_field.split("[")[0].strip()
    try:
        row = db.get(Country, int(cid))
        if row:
            return row.cou_name, (row.cou_iso or "").lower() or None
    except ValueError:
        pass
    return None, None


def _effective_track_title(r: Reproduction) -> str:
    raw = r.rep_title or ""
    if is_quiz_play_title(raw) and r.rep_path:
        from_path = title_from_track_path(r.rep_path)
        if from_path:
            return from_path
    return raw


def _dashboard_rep_weight(r: Reproduction) -> int:
    if is_quiz_play_title(r.rep_title):
        return 0
    try:
        return int(r.rep_reproductions or "0")
    except ValueError:
        return 0


def build_dashboard(db: Session, user_id: int) -> dict:
    from app.profile_scope import rep_user_filter

    reps = list(
        db.scalars(
            select(Reproduction)
            .where(
                Reproduction.rep_media_type == 200,
                rep_user_filter(user_id),
            )
            .order_by(Reproduction.rep_id.desc())
            .limit(300)
        ).all()
    )

    def plays(r: Reproduction) -> int:
        return _dashboard_rep_weight(r)

    reps_sorted = sorted(
        [r for r in reps if plays(r) > 0 and not is_quiz_play_title(r.rep_title)],
        key=plays,
        reverse=True,
    )

    media_root = Path(settings.media_root) if settings.media_root else None

    top_tracks = []
    for r in reps_sorted[:10]:
        artist_name = None
        if r.rep_artist_id:
            band = db.get(Band, r.rep_artist_id)
            artist_name = band.bnd_name if band else None
        raw_title = _effective_track_title(r)
        cover_url = (
            cover_url_for_track_path(r.rep_path, media_root) if media_root else None
        )
        top_tracks.append(
            {
                "id": r.rep_id,
                "title": _clean_track_title(raw_title),
                "title_full": raw_title,
                "artist_id": r.rep_artist_id,
                "artist_name": artist_name,
                "artist_name_full": artist_name,
                "play_count": plays(r),
                "path": r.rep_path,
                "release": r.rep_release,
                "cover_url": cover_url,
            }
        )

    artist_counts: Counter[int] = Counter()
    for r in reps:
        if r.rep_artist_id and plays(r) > 0 and not is_quiz_play_title(r.rep_title):
            artist_counts[r.rep_artist_id] += plays(r)

    top_artists = []
    for aid, count in artist_counts.most_common(10):
        band = db.get(Band, aid)
        if not band:
            continue
        card = resolve_artist_card(band.bnd_name, orientation="landscape")
        top_artists.append(
            {
                "id": band.bnd_id,
                "name": band.bnd_name,
                "play_count": count,
                "photo_url": card.photo_url,
                "logo_url": card.logo_url,
                "icon_url": card.icon_url,
                "show_name_on_hover": False,
            }
        )

    genre_counts: Counter[int] = Counter()
    country_counts: Counter[int] = Counter()
    for aid in artist_counts:
        band = db.get(Band, aid)
        if not band:
            continue
        weight = artist_counts[aid]
        for part in (band.bnd_fk_subgenres or "").split(";"):
            part = part.strip()
            if part.isdigit():
                genre_counts[int(part)] += weight
        cid = _parse_country_id(band.bnd_fk_countries)
        if cid:
            country_counts[cid] += weight

    top_genres = []
    for gid, count in genre_counts.most_common(10):
        name = _resolve_subgenre_name(db, gid)
        if name:
            top_genres.append(
                {
                    "id": gid,
                    "name": name,
                    "play_count": count,
                    "image_url": subgenre_image_url(name),
                }
            )

    top_countries = []
    for cid, count in country_counts.most_common(10):
        row = db.get(Country, cid)
        if row and row.cou_name:
            top_countries.append(
                {
                    "id": cid,
                    "name": row.cou_name,
                    "iso": (row.cou_iso or "").lower(),
                    "play_count": count,
                }
            )

    return {
        "top_tracks": top_tracks,
        "top_artists": top_artists,
        "top_genres": top_genres,
        "top_countries": top_countries,
    }


def _parse_country_id(field: str | None) -> int | None:
    if not field:
        return None
    part = field.split("[")[0].strip()
    try:
        return int(part)
    except ValueError:
        return None


def list_artist_cards(
    db: Session,
    *,
    user_id: int,
    search: str = "",
    letter: str = "",
    orientation: str = "landscape",
    page: int = 1,
    page_size: int = 48,
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
) -> tuple[list[dict], int]:
    from app.music_filters import _play_counts, filter_bands, sort_bands

    rows = list(db.scalars(select(Band)).all())
    play_counts = (
        _play_counts(db, user_id) if filter_mode == "most_played" else None
    )
    rows = filter_bands(
        db,
        rows,
        search=search,
        letter=letter,
        filter_mode=filter_mode,
        member_count=member_count,
        member=member,
        member_artist_id=member_artist_id,
        continent_id=continent_id,
        country_id=country_id,
        start_decade=start_decade,
        end_decade=end_decade,
        subgenre_id=subgenre_id,
        gender=gender,
        label=label,
        producer=producer,
    )
    rows = sort_bands(rows, filter_mode=filter_mode, play_counts=play_counts)

    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    items = []
    for b in page_rows:
        card = resolve_artist_card(b.bnd_name, orientation=orientation)
        items.append(
            {
                "id": b.bnd_id,
                "code": b.bnd_code,
                "name": b.bnd_name,
                "starting_dates": b.bnd_starting_dates,
                "photo_url": card.photo_url,
                "logo_url": card.logo_url,
                "icon_url": card.icon_url,
                "era_year": card.era_year,
                "show_name_on_hover": card.show_name_on_hover or not card.photo_url,
                "play_count": play_counts.get(b.bnd_id, 0) if play_counts else None,
            }
        )
    return items, total


def list_user_playlists(db: Session, *, user_id: int, is_admin: bool) -> list[dict]:
    del user_id, is_admin
    rows = db.scalars(
        select(Playlist)
        .where(Playlist.pla_type == 200)
        .order_by(Playlist.pla_name)
    ).all()
    out = []
    for p in rows:
        first = db.scalars(
            select(PlaylistData).where(PlaylistData.pld_playlist == p.pla_id).limit(1)
        ).first()
        artist = (first.pld_artist.strip() if first else "") or None
        cover = pick_playlist_cover(artist, first.pld_release if first else None)
        track_count = len(
            db.scalars(
                select(PlaylistData).where(PlaylistData.pld_playlist == p.pla_id)
            ).all()
        )
        out.append(
            {
                "id": p.pla_id,
                "name": p.pla_name,
                "type_id": p.pla_type,
                "description": p.pla_description,
                "cover_url": cover,
                "track_count": track_count,
            }
        )
    return out


def playlist_tracks(db: Session, playlist_id: int) -> list[dict]:
    rows = db.scalars(
        select(PlaylistData)
        .where(PlaylistData.pld_playlist == playlist_id)
        .order_by(PlaylistData.pld_id)
    ).all()
    return [
        {
            "id": r.pld_id,
            "title": r.pld_title.strip(),
            "artist": r.pld_artist.strip(),
            "release": r.pld_release.strip(),
            "path": r.pld_path.strip(),
        }
        for r in rows
    ]


def artists_by_genre(db: Session, genre_name: str, limit: int = 48) -> list[dict]:
    rows = db.scalars(select(Band).order_by(Band.bnd_name)).all()
    matched = []
    for b in rows:
        if any(n.lower() == genre_name.lower() for n in _genre_names(db, b.bnd_fk_subgenres)):
            matched.append(b)
    items = []
    for b in matched[:limit]:
        card = resolve_artist_card(b.bnd_name, orientation="landscape")
        items.append(
            {
                "id": b.bnd_id,
                "name": b.bnd_name,
                "photo_url": card.photo_url,
                "logo_url": card.logo_url,
                "icon_url": card.icon_url,
                "era_year": card.era_year,
                "show_name_on_hover": card.show_name_on_hover,
            }
        )
    return items
