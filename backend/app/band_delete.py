"""Remove a band from the database when it has no on-disk Music folder."""
from __future__ import annotations

import time
from pathlib import Path

from sqlalchemy import delete, or_, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.artist_quiz import QUIZ_SCORES_DIR
from app.band_overview_cache import invalidate_overview_cache
from app.media_index import VARIOUS_ARTISTS_DEFAULT_ID, invalidate_media_cache
from app.media_tabs_index import invalidate_media_tab_caches
from app.models import (
    ArtistParticipation,
    Band,
    EntityLink,
    EntityRelated,
    MediaItemMeta,
    Release,
    ReleaseStaffMember,
    TrackOverride,
)
from app.music_filters import _parse_ids
from app.person_lookup import _band_has_local_folder
from app.playlist_index import invalidate_playlist_cache


def _is_sqlite_locked(exc: BaseException) -> bool:
    text = str(exc).lower()
    return "database is locked" in text or "database table is locked" in text


def delete_band_without_folder(db: Session, band_id: int, media_root: Path | None) -> None:
    last_error: OperationalError | None = None
    for attempt in range(8):
        try:
            _delete_band_without_folder_once(db, band_id, media_root)
            return
        except OperationalError as exc:
            if not _is_sqlite_locked(exc):
                raise
            db.rollback()
            last_error = exc
            time.sleep(min(0.2 * (2**attempt), 2.0))
    if last_error:
        raise last_error


def _delete_band_without_folder_once(
    db: Session, band_id: int, media_root: Path | None
) -> None:
    band = db.get(Band, band_id)
    if not band:
        raise LookupError("Band not found")
    if band_id == VARIOUS_ARTISTS_DEFAULT_ID:
        raise ValueError("Cannot remove Various Artists")
    root = media_root if media_root and media_root.is_dir() else None
    if root and _band_has_local_folder(root, band):
        raise ValueError("Cannot remove an artist that has a local Music folder")

    db.execute(
        delete(ArtistParticipation).where(ArtistParticipation.arp_fk_bands == band_id)
    )
    db.execute(delete(EntityLink).where(EntityLink.lnk_fk_bands == band_id))
    db.execute(delete(EntityRelated).where(EntityRelated.erl_fk_bands == band_id))
    db.execute(
        delete(EntityRelated).where(EntityRelated.erl_target_band_id == band_id)
    )
    db.execute(delete(MediaItemMeta).where(MediaItemMeta.mim_band_id == band_id))
    db.execute(delete(ReleaseStaffMember).where(ReleaseStaffMember.rsm_band_id == band_id))
    db.execute(delete(TrackOverride).where(TrackOverride.tro_band_id == band_id))

    # Avoid scanning every release on delete (can time out on large DBs).
    # `rel_fk_bands` is a delimited id string (";" normally, "," on legacy rows),
    # so prefilter with LIKE patterns then do the exact parse/update.
    band_s = str(band_id)
    patterns = [f"%{sep}{band_s}{sep}%" for sep in (";", ",")]
    patterns += [f"{band_s}{sep}%" for sep in (";", ",")]
    patterns += [f"%{sep}{band_s}" for sep in (";", ",")]
    candidates = db.scalars(
        select(Release).where(
            or_(
                Release.rel_fk_bands == band_s,
                *(Release.rel_fk_bands.like(p) for p in patterns),
            )
        )
    ).all()

    for rel in candidates:
        ids = _parse_ids(rel.rel_fk_bands)
        if band_id not in ids:
            continue
        remaining = [i for i in ids if i != band_id]
        if not remaining:
            db.delete(rel)
        else:
            rel.rel_fk_bands = ";".join(str(i) for i in remaining)

    db.delete(band)
    db.commit()

    invalidate_overview_cache(band_id)
    invalidate_media_cache(band_id)
    invalidate_playlist_cache(band_id)
    invalidate_media_tab_caches(band_id=band_id)
    _delete_quiz_score_files(band_id)


def _delete_quiz_score_files(band_id: int) -> None:
    if not QUIZ_SCORES_DIR.is_dir():
        return
    suffix = f"_{band_id}.json"
    for path in QUIZ_SCORES_DIR.glob(f"*{suffix}"):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
