"""Pre-auth welcome screen helpers."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.welcome_ambient import sample_ambient_photocards

router = APIRouter(prefix="/api/welcome", tags=["welcome"])


@router.get("/ambient-photocards")
def welcome_ambient_photocards(
    orientation: str = Query("portrait", pattern="^(portrait|landscape)$"),
    limit: int = Query(32, ge=0, le=48),
    db: Session = Depends(get_db),
):
    """Random SFW dedicated photocard pairs for the profile welcome backdrop.

    No auth required — images are already served via ``/api/media/file`` and
    adult / Exclusive paths are filtered out server-side.
    """
    return sample_ambient_photocards(db, orientation=orientation, limit=limit)
