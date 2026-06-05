"""Seed music lookup tables when empty (continents, artist types)."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Artist, ArtistParticipation, ArtistType, Continent, Country, Genre

CONTINENTS = [
    (1001, "Africa", "af"),
    (1002, "Asia", "as"),
    (1003, "Europe", "eu"),
    (1004, "North America", "na"),
    (1005, "South America", "sa"),
]

ARTIST_TYPES = [
    (1, "Solo"),
    (2, "Duo"),
    (3, "Trio"),
    (4, "Quartet"),
    (5, "Quintet"),
    (6, "Sixtet"),
    (7, "Septet"),
    (8, "Octet"),
    (9, "Nonet"),
    (11, "10+"),
]


def seed_music_lookups(db: Session) -> None:
    if not db.scalar(select(func.count()).select_from(Continent)):
        for cid, name, iso in CONTINENTS:
            db.add(
                Continent(
                    con_id=cid,
                    con_name=name,
                    con_iso=iso,
                    con_media_type_id=100,
                )
            )
    if not db.scalar(select(func.count()).select_from(ArtistType)):
        for aid, name in ARTIST_TYPES:
            db.add(ArtistType(aty_id=aid, aty_name=name))
    db.commit()


def ensure_music_lookup_data(db: Session) -> None:
    """Import countries/subgenres from SQL dump when lookup tables are empty."""
    from app.import_databinger import LOOKUP_TABLES, import_tables_from_sql

    seed_music_lookups(db)
    from app.models import Country, Subgenre

    if db.scalar(select(func.count()).select_from(Country)) == 0:
        import_tables_from_sql(LOOKUP_TABLES)
    if not db.scalar(select(func.count()).select_from(Genre)):
        import_tables_from_sql(frozenset({"genres"}))
    if (
        db.scalar(select(func.count()).select_from(Artist)) == 0
        or db.scalar(select(func.count()).select_from(ArtistParticipation)) == 0
    ):
        import_tables_from_sql(frozenset({"artists", "artistparticipations"}))
