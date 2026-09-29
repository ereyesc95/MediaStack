"""Artist system playlist: Live shows — tracks from attended tour setlists."""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.media_index import format_display_date
from app.models import Band, Tour, TourShow, TourShowSetlist
from app.system_playlists import playlist_cover_url
from app.tours_index import show_slug, sync_band_tours, tour_slug

LIVE_SHOWS_SLUG = "live-shows"


def build_live_shows_card(db: Session, band: Band) -> dict | None:
    shows = db.scalars(
        select(TourShow).where(TourShow.tsh_band_id == band.bnd_id)
    ).all()
    if not shows:
        return None
    track_n = 0
    for s in shows:
        row = db.scalars(
            select(TourShowSetlist).where(TourShowSetlist.tss_show_id == s.tsh_id)
        ).first()
        if not row or not row.tss_tracks_json:
            continue
        try:
            data = json.loads(row.tss_tracks_json)
        except json.JSONDecodeError:
            continue
        tracks = data.get("tracks") if isinstance(data, dict) else data
        track_n += len(tracks or [])
    # Show card whenever the artist has tour shows (even before setlists are fetched)
    return {
        "slug": LIVE_SHOWS_SLUG,
        "name": "Live shows",
        "track_count": track_n or None,
        "show_count": len(shows),
        "cover_url": playlist_cover_url(LIVE_SHOWS_SLUG),
    }


def build_live_shows_detail(
    db: Session,
    band: Band,
    media_root: Path | None = None,
    *,
    sync: bool = False,
) -> dict | None:
    """Grouped-by-show (oldest→newest) with flat tracks for playback / flat view."""
    del media_root  # tracks already resolved when cached
    if sync:
        sync_band_tours(db, band)
    shows = db.scalars(
        select(TourShow)
        .where(TourShow.tsh_band_id == band.bnd_id)
        .order_by(TourShow.tsh_date_iso.asc(), TourShow.tsh_id.asc())
    ).all()
    if not shows:
        return None

    sections: list[dict] = []
    flat_tracks: list[dict] = []
    for s in shows:
        tour = db.get(Tour, s.tsh_tour_id)
        row = db.scalars(
            select(TourShowSetlist).where(TourShowSetlist.tss_show_id == s.tsh_id)
        ).first()
        tracks: list[dict] = []
        if row and row.tss_tracks_json:
            try:
                data = json.loads(row.tss_tracks_json)
                tracks = list(
                    (data.get("tracks") if isinstance(data, dict) else data) or []
                )
            except json.JSONDecodeError:
                tracks = []
        label_bits = [
            s.tsh_city,
            s.tsh_venue,
            tour.tur_title if tour else None,
        ]
        title = " · ".join(str(b) for b in label_bits if b) or show_slug(
            s.tsh_date_iso, s.tsh_city, s.tsh_venue
        )
        section = {
            "id": f"show-{s.tsh_id}",
            "title": title,
            "label": title,
            "date_iso": s.tsh_date_iso,
            "display_date": format_display_date(s.tsh_date_iso),
            "tour_title": tour.tur_title if tour else None,
            "tour_slug": tour_slug(tour.tur_date_iso, tour.tur_title) if tour else None,
            "show_slug": show_slug(s.tsh_date_iso, s.tsh_city, s.tsh_venue),
            "city": s.tsh_city,
            "venue": s.tsh_venue,
            "tracks": tracks,
        }
        sections.append(section)
        for t in tracks:
            flat_tracks.append(
                {
                    **t,
                    "show_label": title,
                    "show_date_iso": s.tsh_date_iso,
                    "tour_title": section["tour_title"],
                    "city": s.tsh_city,
                    "venue": s.tsh_venue,
                }
            )

    artist_name = (band.bnd_name or "").strip()
    description = (
        f"Tracks from concerts you attended with {artist_name}."
        if artist_name
        else "Tracks from concerts you attended (Tours setlists)."
    )
    return {
        "slug": LIVE_SHOWS_SLUG,
        "name": "Live shows",
        "description": description,
        "cover_url": playlist_cover_url(LIVE_SHOWS_SLUG),
        "view": "grouped",
        "sections": sections,
        "tracks": flat_tracks,
        "show_count": len(sections),
        "track_count": len(flat_tracks),
    }
