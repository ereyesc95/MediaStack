"""Enrich Series catalog cards with DB metadata for catalog filters."""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Country, Series
from app.series_refresh import find_series_row


def _split_semi(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [p.strip() for p in raw.replace(",", ";").split(";") if p.strip()]


def enrich_catalog_metadata(db: Session, catalog: dict) -> dict:
    """Attach country/genre/publisher/writer fields from Series rows onto franchise cards."""
    franchises = catalog.get("franchises") or []
    if not franchises:
        return catalog

    # Preload countries by ISO for id/continent lookup
    iso_to_country: dict[str, Country] = {}
    for c in db.scalars(select(Country)).all():
        iso = (c.cou_iso or "").strip().lower()
        if iso:
            iso_to_country[iso] = c

    for card in franchises:
        if not isinstance(card, dict):
            continue
        name = card.get("name") or ""
        row = find_series_row(db, name) if name else None
        if not row:
            card.setdefault("country_iso", None)
            card.setdefault("country_id", None)
            card.setdefault("continent_id", None)
            card.setdefault("genre_ids", [])
            card.setdefault("genre_names", [])
            card.setdefault("publishers", [])
            card.setdefault("writers", [])
            continue

        iso = (row.ser_country_iso or "").strip().lower() or None
        crow = iso_to_country.get(iso) if iso else None
        card["country_iso"] = iso
        card["country_id"] = crow.cou_id if crow else None
        card["continent_id"] = getattr(crow, "cou_continent_id", None) if crow else None

        genre_ids: list = []
        genre_names: list[str] = []
        try:
            raw = json.loads(row.ser_genres_json or "[]")
        except (json.JSONDecodeError, TypeError):
            raw = []
        if isinstance(raw, list):
            for g in raw:
                if not isinstance(g, dict):
                    continue
                name_g = (g.get("name") or "").strip()
                if name_g:
                    genre_names.append(name_g)
                gid = g.get("id")
                if gid is not None:
                    genre_ids.append(gid)
        card["genre_ids"] = genre_ids
        card["genre_names"] = genre_names
        card["publishers"] = _split_semi(row.ser_publishers)
        card["writers"] = _split_semi(row.ser_writers)

    return catalog
