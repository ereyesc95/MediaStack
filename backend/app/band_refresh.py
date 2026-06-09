"""Admin refresh: metadata (MusicBrainz) and local library rescan."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.band_library import match_top_tracks, scan_audio_library
from app.config import settings
from app.models import Band
from app.services.musicbrainz import fetch_artist


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def refresh_band_metadata(
    db: Session,
    band: Band,
    *,
    include_bio: bool = False,
) -> dict:
    """Re-fetch MusicBrainz core fields; optional bio overwrite when not manual."""
    if not band.bnd_code:
        return {"ok": False, "error": "No MusicBrainz ID"}

    data = await fetch_artist(band.bnd_code)
    life = data.get("life-span") or {}
    band.bnd_starting_dates = life.get("begin") or band.bnd_starting_dates
    end = life.get("end")
    if end:
        band.bnd_ending_dates = end
    elif life.get("ended") is False:
        band.bnd_ending_dates = None

    aliases = ";".join(
        a.get("name", "") for a in data.get("aliases", []) if a.get("name")
    )
    if aliases:
        band.bnd_other_names = aliases

    if include_bio:
        annotation = (data.get("annotation") or "").strip()
        if annotation:
            band.bnd_fk_images = annotation.replace(".", "■")
            band.bnd_bio_source = "musicbrainz"
            band.bnd_bio_manual = 0

    band.bnd_metadata_refreshed_at = _now()
    db.commit()
    return {"ok": True, "refreshed_at": band.bnd_metadata_refreshed_at}


def rescan_band_library(db: Session, band: Band) -> dict:
    from pathlib import Path

    root = Path(settings.media_root) if settings.media_root else None
    if not root or not root.is_dir():
        return {"ok": False, "error": "Media root not configured"}

    scan_audio_library(band.bnd_name, root)
    tracks = match_top_tracks(
        band.bnd_name,
        root,
        top_paths=band.bnd_top_tracks,
        top_titles=band.bnd_top_100,
        limit=5,
    )
    band.bnd_library_scanned_at = _now()
    db.commit()
    return {
        "ok": True,
        "scanned_at": band.bnd_library_scanned_at,
        "top_tracks_matched": len(tracks),
    }
