"""Lightweight SQLite schema patches for legacy DB files."""
from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def migrate_schema(eng: Engine) -> None:
    if eng.dialect.name != "sqlite":
        return
    with eng.begin() as conn:
        tables = set(inspect(eng).get_table_names())
        if "countries" in tables:
            cols = {c["name"] for c in inspect(eng).get_columns("countries")}
            if "couContinentID" not in cols:
                conn.execute(
                    text('ALTER TABLE countries ADD COLUMN "couContinentID" INTEGER')
                )
            if "couMediaTypeID" not in cols:
                conn.execute(
                    text('ALTER TABLE countries ADD COLUMN "couMediaTypeID" INTEGER')
                )
        if "genres" in tables:
            cols = {c["name"] for c in inspect(eng).get_columns("genres")}
            if "genMediaTypeID" not in cols:
                conn.execute(
                    text('ALTER TABLE genres ADD COLUMN "genMediaTypeID" INTEGER')
                )
        if "artists" in tables:
            cols = {c["name"] for c in inspect(eng).get_columns("artists")}
            for col, typ in (
                ("artBirthDate", "TEXT"),
                ("artBirthPlace", "TEXT"),
                ("artBirthFKcountries", "TEXT"),
                ("artDeathDate", "TEXT"),
                ("artDeathPlace", "TEXT"),
                ("artDeathFKcountries", "TEXT"),
                ("artFKvoicetypes", "TEXT"),
                ("artFKinstruments", "TEXT"),
                ("artFKoccupations", "TEXT"),
                ("artFKimages", "TEXT"),
            ):
                if col not in cols:
                    conn.execute(text(f'ALTER TABLE artists ADD COLUMN "{col}" {typ}'))
        if "reproductions" in tables:
            cols = {c["name"] for c in inspect(eng).get_columns("reproductions")}
            if "repUserID" not in cols:
                conn.execute(
                    text('ALTER TABLE reproductions ADD COLUMN "repUserID" INTEGER')
                )
        if "bands" in tables:
            cols = {c["name"] for c in inspect(eng).get_columns("bands")}
            for col, typ in (
                ("bndBioManual", "INTEGER"),
                ("bndBioSource", "TEXT"),
                ("bndMetadataRefreshedAt", "TEXT"),
                ("bndLibraryScannedAt", "TEXT"),
                ("bndLineupImportedAt", "TEXT"),
                ("bndLineupSource", "TEXT"),
                ("bndRelatedSimilarAt", "TEXT"),
                ("bndRelatedParticipationsAt", "TEXT"),
                ("bndRelatedLegacyImported", "INTEGER"),
            ):
                if col not in cols:
                    conn.execute(text(f'ALTER TABLE bands ADD COLUMN "{col}" {typ}'))
        if "artistparticipations" in tables:
            cols = {c["name"] for c in inspect(eng).get_columns("artistparticipations")}
            for col, typ in (
                ("arpStartDates", "TEXT"),
                ("arpEndDates", "TEXT"),
                ("arpFKparticipationtypes", "TEXT"),
                ("artFKinstruments", "TEXT"),
                ("arpManual", "INTEGER"),
            ):
                if col not in cols:
                    conn.execute(
                        text(f'ALTER TABLE artistparticipations ADD COLUMN "{col}" {typ}')
                    )
        if "track_overrides" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE track_overrides (
                        "troPlayPath" TEXT NOT NULL PRIMARY KEY,
                        "troBandID" INTEGER,
                        "troTitle" TEXT,
                        "troLyricsLrc" TEXT,
                        "troLyricsPlain" TEXT,
                        "troYoutubeUrl" TEXT,
                        "troUpdatedAt" TEXT
                    )
                    """
                )
            )
        if "artists" in tables:
            cols = {c["name"] for c in inspect(eng).get_columns("artists")}
            for col, typ in (
                ("artPhotoUrl", "TEXT"),
                ("artPhotoSource", "TEXT"),
                ("artPhotoFetchedAt", "TEXT"),
                ("artPhotoManual", "INTEGER"),
                ("artFieldsManual", "TEXT"),
                ("artSource", "TEXT"),
                ("artExternalUrls", "TEXT"),
                ("artRelatedSimilarAt", "TEXT"),
                ("artRelatedParticipationsAt", "TEXT"),
            ):
                if col not in cols:
                    conn.execute(text(f'ALTER TABLE artists ADD COLUMN "{col}" {typ}'))
