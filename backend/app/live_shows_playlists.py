"""Artist system playlist: Live shows — tracks from attended tour setlists."""
from __future__ import annotations

import json
import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.media_index import format_display_date
from app.models import Band, Tour, TourShow, TourShowSetlist
from app.system_playlists import playlist_cover_url
from app.tours_index import show_slug, sync_band_tours, tour_slug

LIVE_SHOWS_SLUG = "live-shows"

_VENUE_NORM_RE = re.compile(r"[^a-z0-9]+")


def show_join_key(
    date_iso: str | None,
    city: str | None,
    venue: str | None,
) -> str:
    d = (date_iso or "").strip()
    c = _VENUE_NORM_RE.sub("", (city or "").casefold())
    v = _VENUE_NORM_RE.sub("", (venue or "").casefold())
    return f"{d}|{c}|{v}"


def _track_dedupe_key(title: str | None, artist: str | None) -> str:
    t = _VENUE_NORM_RE.sub("", (title or "").casefold())
    a = _VENUE_NORM_RE.sub("", (artist or "").casefold())
    return f"{a}|{t}"


def _show_occurrence(show: TourShow) -> dict:
    return {
        "date_iso": show.tsh_date_iso,
        "display_date": format_display_date(show.tsh_date_iso),
        "venue": show.tsh_venue,
        "city": show.tsh_city,
    }


def _section_title(
    show: TourShow,
    tour: Tour | None,
) -> str:
    tour_title = (tour.tur_title if tour else None) or None
    label_bits = [
        show.tsh_city,
        show.tsh_venue,
        tour_title,
    ]
    base = " · ".join(str(b) for b in label_bits if b)
    if base:
        return base
    return show_slug(show.tsh_date_iso, show.tsh_city, show.tsh_venue)


def _merge_track_into_section(
    tracks: list[dict],
    raw: dict,
    *,
    artist_name: str,
    band_id: int,
    occurrence: dict,
    tour_title: str | None,
    show_label: str,
    show_date_iso: str | None,
    media_root: Path | None,
    db: Session | None,
) -> None:
    t = dict(raw)
    if media_root and t.get("play_path"):
        from app.playlist_tracks import enrich_playlist_track

        t = enrich_playlist_track(t, media_root, db)
    t.setdefault("artist_name", artist_name)
    t.setdefault("navigate_band_id", band_id)
    t["show_label"] = show_label
    t["show_date_iso"] = show_date_iso
    t["tour_title"] = tour_title
    t["play_occurrences"] = [occurrence]
    t["live_plays_count"] = 1

    key = _track_dedupe_key(t.get("title"), t.get("artist_name") or artist_name)
    occ_key = show_join_key(
        occurrence.get("date_iso"),
        occurrence.get("city"),
        occurrence.get("venue"),
    )
    for existing in tracks:
        if _track_dedupe_key(existing.get("title"), existing.get("artist_name")) == key:
            occs = list(existing.get("play_occurrences") or [])
            already = {
                show_join_key(o.get("date_iso"), o.get("city"), o.get("venue"))
                for o in occs
                if isinstance(o, dict)
            }
            if occ_key not in already:
                occs.append(occurrence)
            existing["play_occurrences"] = occs
            existing["live_plays_count"] = len(occs)
            if not existing.get("play_path") and t.get("play_path"):
                for k, v in t.items():
                    if k not in ("play_occurrences", "live_plays_count"):
                        existing[k] = v
            return
    tracks.append(t)


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
    return {
        "slug": LIVE_SHOWS_SLUG,
        "name": "Live Shows",
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
    if sync:
        sync_band_tours(db, band)
    shows = db.scalars(
        select(TourShow)
        .where(TourShow.tsh_band_id == band.bnd_id)
        .order_by(TourShow.tsh_date_iso.asc(), TourShow.tsh_id.asc())
    ).all()
    if not shows:
        return None

    artist_name = (band.bnd_name or "").strip()
    sections: list[dict] = []
    flat_tracks: list[dict] = []

    for s in shows:
        tour = db.get(Tour, s.tsh_tour_id)
        tour_title = tour.tur_title if tour else None
        row = db.scalars(
            select(TourShowSetlist).where(TourShowSetlist.tss_show_id == s.tsh_id)
        ).first()
        tracks: list[dict] = []
        if row and row.tss_tracks_json:
            try:
                data = json.loads(row.tss_tracks_json)
                raw_list = list(
                    (data.get("tracks") if isinstance(data, dict) else data) or []
                )
            except json.JSONDecodeError:
                raw_list = []
        else:
            raw_list = []

        title = _section_title(s, tour)
        occurrence = _show_occurrence(s)
        show_key = show_join_key(s.tsh_date_iso, s.tsh_city, s.tsh_venue)

        for raw in raw_list:
            _merge_track_into_section(
                tracks,
                raw,
                artist_name=artist_name,
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
                    "artist_name": artist_name,
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

        section = {
            "id": f"show-{show_key}",
            "title": title,
            "label": title,
            "date_iso": s.tsh_date_iso,
            "display_date": format_display_date(s.tsh_date_iso),
            "tour_title": tour_title,
            "tour_slug": tour_slug(tour.tur_date_iso, tour.tur_title) if tour else None,
            "show_slug": show_slug(s.tsh_date_iso, s.tsh_city, s.tsh_venue),
            "show_key": show_key,
            "city": s.tsh_city,
            "venue": s.tsh_venue,
            "tracks": tracks,
        }
        sections.append(section)

    description = (
        f"Tracks from concerts you attended with {artist_name}."
        if artist_name
        else "Tracks from concerts you attended (Tours setlists)."
    )
    return {
        "slug": LIVE_SHOWS_SLUG,
        "name": "Live Shows",
        "description": description,
        "cover_url": playlist_cover_url(LIVE_SHOWS_SLUG),
        "view": "grouped",
        "sections": sections,
        "tracks": flat_tracks,
        "show_count": len(sections),
        "track_count": len(flat_tracks),
    }
