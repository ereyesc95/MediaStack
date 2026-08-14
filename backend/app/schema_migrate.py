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
        if "media_item_meta" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE media_item_meta (
                        "mimID" INTEGER NOT NULL PRIMARY KEY,
                        "mimBandID" INTEGER NOT NULL,
                        "mimKind" TEXT NOT NULL,
                        "mimItemID" TEXT NOT NULL,
                        "mimDescription" TEXT,
                        "mimDirector" TEXT,
                        "mimAuthor" TEXT,
                        "mimPublisher" TEXT,
                        "mimGenres" TEXT,
                        "mimContentCategory" TEXT,
                        "mimUpdatedAt" TEXT,
                        UNIQUE ("mimBandID", "mimKind", "mimItemID")
                    )
                    """
                )
            )
        else:
            mim_cols = {c["name"] for c in inspect(eng).get_columns("media_item_meta")}
            if "mimContentCategory" not in mim_cols:
                conn.execute(
                    text(
                        'ALTER TABLE media_item_meta ADD COLUMN "mimContentCategory" TEXT'
                    )
                )
            if "mimCountryIso" not in mim_cols:
                conn.execute(
                    text(
                        'ALTER TABLE media_item_meta ADD COLUMN "mimCountryIso" TEXT'
                    )
                )
            if "mimLanguages" not in mim_cols:
                conn.execute(
                    text(
                        'ALTER TABLE media_item_meta ADD COLUMN "mimLanguages" TEXT'
                    )
                )
        if "staff_roles" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE staff_roles (
                        "sroID" INTEGER NOT NULL PRIMARY KEY,
                        "sroName" TEXT NOT NULL UNIQUE,
                        "sroType" TEXT NOT NULL DEFAULT 'hybrid'
                    )
                    """
                )
            )
        if "release_staff_members" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE release_staff_members (
                        "rsmID" INTEGER NOT NULL PRIMARY KEY,
                        "rsmBandID" INTEGER NOT NULL,
                        "rsmReleaseID" TEXT NOT NULL,
                        "rsmMemberKey" TEXT NOT NULL,
                        "rsmName" TEXT NOT NULL,
                        "rsmPhotoUrl" TEXT,
                        "rsmRolesJson" TEXT,
                        "rsmSortOrder" INTEGER DEFAULT 0
                    )
                    """
                )
            )
            conn.execute(
                text(
                    'CREATE INDEX IF NOT EXISTS "ix_release_staff_band_release" '
                    'ON release_staff_members ("rsmBandID", "rsmReleaseID")'
                )
            )
        if "series" in tables:
            cols = {c["name"] for c in inspect(eng).get_columns("series")}
            for col, typ in (
                ("serBio", "TEXT"),
                ("serBioManual", "INTEGER"),
                ("serBioSource", "TEXT"),
                ("serOriginPlace", "TEXT"),
                ("serCountryIso", "TEXT"),
                ("serWriters", "TEXT"),
                ("serPublishers", "TEXT"),
                ("serGenresJson", "TEXT"),
                ("serCastJson", "TEXT"),
                ("serLinksJson", "TEXT"),
                ("serStatus", "TEXT"),
                ("serType", "TEXT"),
                ("serIsAnimated", "INTEGER"),
                ("serPosterUrl", "TEXT"),
                ("serBackdropUrl", "TEXT"),
                ("serImagesJson", "TEXT"),
                ("serMetadataRefreshedAt", "TEXT"),
            ):
                if col not in cols:
                    conn.execute(text(f'ALTER TABLE series ADD COLUMN "{col}" {typ}'))

        # Start clean: drop legacy movie-only universe tables (replaced by shared universes)
        for legacy in ("movie_universe_members", "movie_universes"):
            if legacy in tables:
                conn.execute(text(f'DROP TABLE IF EXISTS "{legacy}"'))
        # Drop obsolete FK column on movie_works if present
        if "movie_works" in tables:
            mwk_cols = {c["name"] for c in inspect(eng).get_columns("movie_works")}
            if "mwk_universe_id" in mwk_cols:
                try:
                    conn.execute(text("ALTER TABLE movie_works DROP COLUMN mwk_universe_id"))
                except Exception:
                    pass

        # Universe leaf members + franchise sync rules
        if "universe_members" in tables:
            ume_cols = {c["name"] for c in inspect(eng).get_columns("universe_members")}
            if "ume_leaf_id" not in ume_cols:
                conn.execute(
                    text(
                        'ALTER TABLE universe_members '
                        'ADD COLUMN "ume_leaf_id" VARCHAR(512) DEFAULT \'\''
                    )
                )
            # Drop legacy franchise-only unique index (replaced by leaf unique)
            conn.execute(text("DROP INDEX IF EXISTS uq_universe_member"))
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_universe_member_leaf "
                    "ON universe_members "
                    "(ume_universe_id, ume_module, ume_slug, ume_leaf_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_universe_members_leaf "
                    "ON universe_members (ume_module, ume_slug, ume_leaf_id)"
                )
            )

        if "universe_franchise_syncs" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE universe_franchise_syncs (
                        ufs_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        ufs_universe_id INTEGER NOT NULL,
                        ufs_module VARCHAR(32) NOT NULL,
                        ufs_franchise_slug VARCHAR(255) NOT NULL,
                        CONSTRAINT uq_universe_franchise_sync
                            UNIQUE (ufs_universe_id, ufs_module, ufs_franchise_slug)
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_universe_franchise_syncs_lookup "
                    "ON universe_franchise_syncs "
                    "(ufs_module, ufs_franchise_slug)"
                )
            )
