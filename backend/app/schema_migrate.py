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
                        "troYoutubeVideos" TEXT,
                        "troUpdatedAt" TEXT
                    )
                    """
                )
            )
        if "track_overrides" in tables:
            cols = {c["name"] for c in inspect(eng).get_columns("track_overrides")}
            if "troYoutubeVideos" not in cols:
                conn.execute(
                    text('ALTER TABLE track_overrides ADD COLUMN "troYoutubeVideos" TEXT')
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
        if "playlists" in tables:
            cols = {c["name"] for c in inspect(eng).get_columns("playlists")}
            for col, typ in (
                ("plaCoverPath", "TEXT"),
                ("plaSpotifyId", "TEXT"),
                ("plaSource", "TEXT"),
                ("plaKind", "TEXT"),
            ):
                if col not in cols:
                    conn.execute(text(f'ALTER TABLE playlists ADD COLUMN "{col}" {typ}'))
            conn.execute(
                text(
                    """
                    UPDATE playlists
                    SET "plaKind" = 'snapshot'
                    WHERE "plaKind" IS NULL
                      AND "plaSource" IN ('spotify', 'file')
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE playlists
                    SET "plaKind" = 'local'
                    WHERE "plaKind" IS NULL
                    """
                )
            )
        if "playlist_track_snapshots" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE playlist_track_snapshots (
                        "ptsEntryID" INTEGER NOT NULL PRIMARY KEY,
                        "ptsSpotifyUri" TEXT,
                        "ptsSnapshotTitle" TEXT,
                        "ptsSnapshotArtist" TEXT,
                        "ptsSnapshotAlbum" TEXT,
                        "ptsReleaseDate" TEXT,
                        "ptsDurationMs" INTEGER,
                        "ptsPopularity" INTEGER,
                        "ptsExplicit" INTEGER,
                        "ptsGenres" TEXT,
                        "ptsRecordLabel" TEXT,
                        "ptsDanceability" TEXT,
                        "ptsEnergy" TEXT,
                        "ptsTempo" TEXT,
                        "ptsValence" TEXT,
                        "ptsAcousticness" TEXT,
                        "ptsInstrumentalness" TEXT,
                        "ptsKey" INTEGER,
                        "ptsMode" INTEGER,
                        "ptsLoudness" TEXT,
                        "ptsSpeechiness" TEXT,
                        "ptsLiveness" TEXT,
                        "ptsTimeSignature" INTEGER
                    )
                    """
                )
            )
        if "playlistdata" in tables:
            cols = {c["name"] for c in inspect(eng).get_columns("playlistdata")}
            for col, typ in (
                ("pldAlbum", "TEXT"),
                ("pldYear", "TEXT"),
                ("pldSortOrder", "INTEGER"),
                ("pldUnavailable", "INTEGER"),
            ):
                if col not in cols:
                    conn.execute(text(f'ALTER TABLE playlistdata ADD COLUMN "{col}" {typ}'))
        if "spotify_profile_auth" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE spotify_profile_auth (
                        "spaUserID" INTEGER NOT NULL PRIMARY KEY,
                        "spaAccessToken" TEXT,
                        "spaRefreshToken" TEXT,
                        "spaExpiresAt" TEXT,
                        "spaUpdatedAt" TEXT
                    )
                    """
                )
            )
        if "spotify_oauth_state" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE spotify_oauth_state (
                        "sosState" TEXT NOT NULL PRIMARY KEY,
                        "sosUserID" INTEGER NOT NULL,
                        "sosExpiresAt" REAL NOT NULL,
                        "sosReturnPath" TEXT NOT NULL,
                        "sosFrontendOrigin" TEXT NOT NULL
                    )
                    """
                )
            )
