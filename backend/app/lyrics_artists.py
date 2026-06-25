"""Artist name variants for LRCLIB bulk lyrics fetch."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Band


def lyrics_artist_names(db: Session, band: Band) -> list[str]:
    """Primary band name, aliases, and solo performer name (deduped, ordered)."""
    seen: set[str] = set()
    out: list[str] = []

    def add(name: str | None) -> None:
        cleaned = (name or "").strip().replace("█", "'")
        if not cleaned:
            return
        key = cleaned.casefold()
        if key in seen:
            return
        seen.add(key)
        out.append(cleaned)

    add(band.bnd_name)
    for part in (band.bnd_other_names or "").replace("█", "'").split(";"):
        add(part)

    from app.band_overview import _is_solo, _solo_performer

    if _is_solo(db, band):
        performer = _solo_performer(db, band, None)
        if performer:
            add(performer.get("name"))

    return out or [(band.bnd_name or "").strip()]
