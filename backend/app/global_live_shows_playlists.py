"""Catalog-wide Live shows playlist (all artists with tour setlists)."""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.live_shows_playlists import (
    LIVE_SHOWS_SLUG,
    _merge_track_into_section,
    _section_title,
    _show_occurrence,
    build_live_shows_card,
    build_live_shows_detail,
    show_join_key,
)
from app.models import Band, Tour, TourShow, TourShowSetlist
from app.system_playlists import playlist_cover_url


def build_global_live_shows_card(db: Session) -> dict | None:
    bands = db.scalars(select(Band).order_by(Band.bnd_name.asc())).all()
    show_n = 0
    track_n = 0
    for band in bands:
        card = build_live_shows_card(db, band)
        if not card:
            continue
        show_n += int(card.get("show_count") or 0)
        track_n += int(card.get("track_count") or 0)
    if show_n <= 0:
        return None
    return {
        "slug": LIVE_SHOWS_SLUG,
        "name": "Live Shows",
        "track_count": track_n or None,
        "show_count": show_n,
        "cover_url": playlist_cover_url(LIVE_SHOWS_SLUG),
        "scope": "global",
    }


def build_global_live_shows_detail(
    db: Session,
    media_root: Path | None = None,
) -> dict | None:
    bands = db.scalars(select(Band).order_by(Band.bnd_name.asc())).all()
    section_by_key: dict[str, dict] = {}
    flat_tracks: list[dict] = []

    for band in bands:
        shows = db.scalars(
            select(TourShow)
            .where(TourShow.tsh_band_id == band.bnd_id)
            .order_by(TourShow.tsh_date_iso.asc(), TourShow.tsh_id.asc())
        ).all()
        if not shows:
            continue
        artist = (band.bnd_name or "").strip()
        for s in shows:
            tour = db.get(Tour, s.tsh_tour_id)
            tour_title = tour.tur_title if tour else None
            show_key = show_join_key(s.tsh_date_iso, s.tsh_city, s.tsh_venue)
            title = _section_title(s, tour)
            occurrence = _show_occurrence(s)

            row = db.scalars(
                select(TourShowSetlist).where(TourShowSetlist.tss_show_id == s.tsh_id)
            ).first()
            raw_list: list[dict] = []
            if row and row.tss_tracks_json:
                try:
                    data = json.loads(row.tss_tracks_json)
                    raw_list = list(
                        (data.get("tracks") if isinstance(data, dict) else data) or []
                    )
                except json.JSONDecodeError:
                    raw_list = []

            if show_key not in section_by_key:
                section_by_key[show_key] = {
                    "id": f"show-{show_key}",
                    "title": title,
                    "label": title,
                    "date_iso": s.tsh_date_iso,
                    "display_date": occurrence.get("display_date"),
                    "tour_title": tour_title,
                    "show_key": show_key,
                    "city": s.tsh_city,
                    "venue": s.tsh_venue,
                    "tracks": [],
                }
            else:
                sec = section_by_key[show_key]
                if tour_title and tour_title not in (sec.get("title") or ""):
                    sec["title"] = title
                    sec["label"] = title
                if not sec.get("tour_title") and tour_title:
                    sec["tour_title"] = tour_title

            sec = section_by_key[show_key]
            for raw in raw_list:
                _merge_track_into_section(
                    sec["tracks"],
                    raw,
                    artist_name=artist,
                    band_id=band.bnd_id,
                    occurrence=occurrence,
                    tour_title=tour_title,
                    show_label=title,
                    show_date_iso=s.tsh_date_iso,
                    media_root=media_root,
                    db=db,
                )
                flat_tracks.append(
                    {
                        **dict(raw),
                        "artist_name": artist,
                        "navigate_band_id": band.bnd_id,
                        "show_label": title,
                        "show_date_iso": s.tsh_date_iso,
                        "tour_title": tour_title,
                        "city": s.tsh_city,
                        "venue": s.tsh_venue,
                        "show_key": show_key,
                        "play_occurrences": [occurrence],
                        "live_plays_count": 1,
                    }
                )

    sections = list(section_by_key.values())
    if not sections:
        return None
    sections.sort(key=lambda s: (s.get("date_iso") or "", s.get("title") or ""))
    flat_tracks.sort(
        key=lambda t: (t.get("show_date_iso") or "", t.get("title") or "")
    )
    return {
        "slug": LIVE_SHOWS_SLUG,
        "name": "Live Shows",
        "description": "Tracks from concerts you attended across your library.",
        "cover_url": playlist_cover_url(LIVE_SHOWS_SLUG),
        "view": "grouped",
        "sections": sections,
        "tracks": flat_tracks,
        "show_count": len(sections),
        "track_count": len(flat_tracks),
        "scope": "global",
    }
