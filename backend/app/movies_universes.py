"""Compatibility shim — movie universe helpers now live in app.universes."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.universes import universe_for_franchise


def universe_for_work(db: Session, work_slug: str) -> dict | None:
    return universe_for_franchise(db, "movies", work_slug)
