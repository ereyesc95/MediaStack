"""SQLAlchemy models aligned with MediaBinger databinger schema."""
from __future__ import annotations

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ContentType(Base):
    __tablename__ = "contenttype"

    cnt_id: Mapped[int] = mapped_column("cntID", Integer, primary_key=True)
    cnt_name: Mapped[str | None] = mapped_column("cntName", Text)
    cnt_sort_id: Mapped[str | None] = mapped_column("cntSortID", Text)


class MenuItem(Base):
    __tablename__ = "menuitems"

    mei_id: Mapped[int] = mapped_column("meiID", Integer, primary_key=True)
    mei_name: Mapped[str | None] = mapped_column("meiName", Text)
    mei_fk_contenttype: Mapped[str | None] = mapped_column("meiFKcontenttype", Text)
    mei_order: Mapped[int | None] = mapped_column("meiOrder", Integer)


class Filter(Base):
    __tablename__ = "filters"

    fil_id: Mapped[int] = mapped_column("filID", Integer, primary_key=True)
    fil_name: Mapped[str | None] = mapped_column("filName", String(255))
    fil_data_type: Mapped[str | None] = mapped_column("filDataType", Text)
    fil_fk_contenttype: Mapped[int | None] = mapped_column("filFKcontenttype", Integer)
    fil_fk_menuitems: Mapped[int | None] = mapped_column("filFKmenuitems", Integer)
    fil_parent_table: Mapped[str | None] = mapped_column("filParentTable", Text)
    fil_parent_field: Mapped[str | None] = mapped_column("filParentField", Text)
    fil_order: Mapped[int | None] = mapped_column("filOrder", Integer)


class Band(Base):
    __tablename__ = "bands"

    bnd_id: Mapped[int] = mapped_column("bndID", Integer, primary_key=True)
    bnd_name: Mapped[str | None] = mapped_column("bndName", Text)
    bnd_code: Mapped[str | None] = mapped_column("bndCode", Text)
    bnd_other_names: Mapped[str | None] = mapped_column("bndOtherNames", Text)
    bnd_origin_place: Mapped[str | None] = mapped_column("bndOriginPlace", Text)
    bnd_fk_countries: Mapped[str | None] = mapped_column("bndFKcountries", Text)
    bnd_starting_dates: Mapped[str | None] = mapped_column("bndStartingDates", Text)
    bnd_ending_dates: Mapped[str | None] = mapped_column("bndEndingDates", Text)
    bnd_fk_artists: Mapped[str | None] = mapped_column("bndFKartists", Text)
    bnd_fk_genres: Mapped[str | None] = mapped_column("bndFKgenres", Text)
    bnd_fk_subgenres: Mapped[str | None] = mapped_column("bndFKsubgenres", Text)
    bnd_fk_artisttypes: Mapped[str | None] = mapped_column("bndFKartisttypes", Text)
    bnd_websites: Mapped[str | None] = mapped_column("bndWebsites", Text)
    bnd_fk_images: Mapped[str | None] = mapped_column("bndFKimages", Text)
    bnd_top_tracks: Mapped[str | None] = mapped_column("bndtoptracks", Text)
    bnd_top_100: Mapped[str | None] = mapped_column("bndtop100", Text)
    bnd_bio_manual: Mapped[int | None] = mapped_column("bndBioManual", Integer, default=0)
    bnd_bio_source: Mapped[str | None] = mapped_column("bndBioSource", Text)
    bnd_metadata_refreshed_at: Mapped[str | None] = mapped_column(
        "bndMetadataRefreshedAt", Text
    )
    bnd_library_scanned_at: Mapped[str | None] = mapped_column("bndLibraryScannedAt", Text)
    bnd_lineup_imported_at: Mapped[str | None] = mapped_column("bndLineupImportedAt", Text)
    bnd_lineup_source: Mapped[str | None] = mapped_column("bndLineupSource", Text)
    bnd_related_similar_at: Mapped[str | None] = mapped_column("bndRelatedSimilarAt", Text)
    bnd_related_participations_at: Mapped[str | None] = mapped_column(
        "bndRelatedParticipationsAt", Text
    )
    bnd_related_legacy_imported: Mapped[int | None] = mapped_column(
        "bndRelatedLegacyImported", Integer, default=0
    )


class Release(Base):
    __tablename__ = "releases"

    rel_id: Mapped[int] = mapped_column("relID", Integer, primary_key=True)
    rel_title: Mapped[str | None] = mapped_column("relTitle", Text)
    rel_alt_title: Mapped[str | None] = mapped_column("relAltTitle", Text)
    rel_fk_bands: Mapped[str | None] = mapped_column("relFKbands", Text)
    rel_date: Mapped[str | None] = mapped_column("relDate", Text)
    rel_fk_companies: Mapped[str | None] = mapped_column("relFKcompanies", Text)
    rel_fk_subgenres: Mapped[str | None] = mapped_column("relFKsubgenres", Text)
    rel_fk_desc: Mapped[str | None] = mapped_column("relFKdesc", Text)
    rel_fk_instruments: Mapped[str | None] = mapped_column("relFKinstruments", Text)
    rel_duration: Mapped[str | None] = mapped_column("relDuration", Text)
    rel_fk_artists: Mapped[str | None] = mapped_column("relFKartists", Text)
    rel_fk_lineup: Mapped[str | None] = mapped_column("relFKlineup", Text)
    rel_release_code: Mapped[str | None] = mapped_column("relReleaseCode", Text)
    rel_fk_writers: Mapped[str | None] = mapped_column("relFKwriters", Text)
    rel_fk_features: Mapped[str | None] = mapped_column("relFKfeatures", Text)
    rel_fk_covers: Mapped[str | None] = mapped_column("relFKcovers", Text)


class Track(Base):
    __tablename__ = "tracks"

    tra_id: Mapped[int] = mapped_column("traID", Integer, primary_key=True)
    tra_name: Mapped[str | None] = mapped_column("traName", Text)
    tra_alt_name: Mapped[str | None] = mapped_column("traAltName", Text)
    tra_track_type: Mapped[str | None] = mapped_column("traTrackType", Text)
    tra_duration: Mapped[str | None] = mapped_column("traDuration", Text)
    tra_author_id: Mapped[str | None] = mapped_column("traAuthorID", Text)
    tra_band_id: Mapped[str | None] = mapped_column("traBandID", Text)
    tra_bpm: Mapped[str | None] = mapped_column("traBPM", Text)
    tra_video: Mapped[str | None] = mapped_column("traVideo", Text)


class TrackOverride(Base):
    __tablename__ = "track_overrides"

    tro_play_path: Mapped[str] = mapped_column("troPlayPath", Text, primary_key=True)
    tro_band_id: Mapped[int | None] = mapped_column("troBandID", Integer)
    tro_title: Mapped[str | None] = mapped_column("troTitle", Text)
    tro_lyrics_lrc: Mapped[str | None] = mapped_column("troLyricsLrc", Text)
    tro_lyrics_plain: Mapped[str | None] = mapped_column("troLyricsPlain", Text)
    tro_youtube_url: Mapped[str | None] = mapped_column("troYoutubeUrl", Text)
    tro_youtube_videos: Mapped[str | None] = mapped_column("troYoutubeVideos", Text)
    tro_updated_at: Mapped[str | None] = mapped_column("troUpdatedAt", Text)


class Playlist(Base):
    __tablename__ = "playlists"

    pla_id: Mapped[int] = mapped_column("plaID", Integer, primary_key=True)
    pla_name: Mapped[str | None] = mapped_column("plaName", Text)
    pla_type: Mapped[int] = mapped_column("plaType", Integer)
    pla_description: Mapped[str | None] = mapped_column("plaDescription", Text)
    pla_cover_path: Mapped[str | None] = mapped_column("plaCoverPath", Text)
    pla_spotify_id: Mapped[str | None] = mapped_column("plaSpotifyId", Text)
    pla_source: Mapped[str | None] = mapped_column("plaSource", Text)


class SpotifyProfileAuth(Base):
    __tablename__ = "spotify_profile_auth"

    spa_user_id: Mapped[int] = mapped_column("spaUserID", Integer, primary_key=True)
    spa_access_token: Mapped[str | None] = mapped_column("spaAccessToken", Text)
    spa_refresh_token: Mapped[str | None] = mapped_column("spaRefreshToken", Text)
    spa_expires_at: Mapped[str | None] = mapped_column("spaExpiresAt", Text)
    spa_updated_at: Mapped[str | None] = mapped_column("spaUpdatedAt", Text)


class Series(Base):
    __tablename__ = "series"

    ser_id: Mapped[int] = mapped_column("serID", Integer, primary_key=True)
    ser_name: Mapped[str | None] = mapped_column("serName", Text)
    ser_code: Mapped[str | None] = mapped_column("serCode", Text)
    ser_other_names: Mapped[str | None] = mapped_column("serOtherNames", Text)
    ser_genre_id: Mapped[str | None] = mapped_column("serGenreID", Text)
    ser_sub_genre_id: Mapped[str | None] = mapped_column("serSubGenreID", Text)
    ser_starting_date: Mapped[str | None] = mapped_column("serStartingDate", Text)
    ser_ending_date: Mapped[str | None] = mapped_column("serEndingDate", Text)
    ser_studio: Mapped[str | None] = mapped_column("serStudio", Text)


class Season(Base):
    __tablename__ = "seasons"

    ssn_id: Mapped[int] = mapped_column("ssnID", Integer, primary_key=True)
    ssn_serie_id: Mapped[int | None] = mapped_column("ssnSerieID", Integer)
    ssn_subserie_id: Mapped[int | None] = mapped_column("ssnSubserieID", Integer)
    ssn_name: Mapped[str | None] = mapped_column("ssnName", Text)
    ssn_number: Mapped[int | None] = mapped_column("ssnNumber", Integer)


class Episode(Base):
    __tablename__ = "episodes"

    epi_id: Mapped[int] = mapped_column("epiID", Integer, primary_key=True)
    epi_number: Mapped[str | None] = mapped_column("epiNumber", Text)
    epi_name: Mapped[str | None] = mapped_column("epiName", Text)
    epi_season_id: Mapped[int | None] = mapped_column("epiSeasonID", Integer)


class User(Base):
    __tablename__ = "user"

    usr_id: Mapped[int] = mapped_column("usrID", Integer, primary_key=True)
    usr_machine_id: Mapped[str | None] = mapped_column("usrMachineID", String(50))
    usr_name: Mapped[str | None] = mapped_column("usrName", Text)
    usr_birth_date: Mapped[str | None] = mapped_column("usrBirthDate", Text)
    usr_password: Mapped[str | None] = mapped_column("usrPassword", Text)
    usr_mail: Mapped[str | None] = mapped_column("usrMail", Text)
    usr_first_name: Mapped[str | None] = mapped_column("usrFirstName", Text)
    usr_middle_name: Mapped[str | None] = mapped_column("usrMiddleName", Text)
    usr_last_name: Mapped[str | None] = mapped_column("usrLastName", Text)
    usr_image: Mapped[str | None] = mapped_column("usrImage", Text)
    usr_gender_id: Mapped[str | None] = mapped_column("usrGenderID", Text)
    usr_registration_date: Mapped[str | None] = mapped_column("usrRegistrationDate", Text)
    usr_last_login_date: Mapped[str | None] = mapped_column("usrLastLoginDate", Text)
    usr_role_id: Mapped[int | None] = mapped_column("usrRoleID", Integer)


class SystemDevice(Base):
    __tablename__ = "system"

    sys_id: Mapped[int] = mapped_column("sysID", Integer, primary_key=True)
    sys_device: Mapped[str | None] = mapped_column("sysDevice", Text)
    sys_login_date: Mapped[str | None] = mapped_column("sysLoginDate", Text)
    sys_dark_mode: Mapped[int | None] = mapped_column("sysDarkMode", Integer)


class PlaylistData(Base):
    __tablename__ = "playlistdata"

    pld_id: Mapped[int] = mapped_column("pldID", Integer, primary_key=True)
    pld_title: Mapped[str] = mapped_column("pldTitle", Text)
    pld_artist: Mapped[str] = mapped_column("pldArtist", Text)
    pld_release: Mapped[str] = mapped_column("pldRelease", Text)
    pld_path: Mapped[str] = mapped_column("pldPath", Text)
    pld_playlist: Mapped[int] = mapped_column("pldPlaylist", Integer)
    pld_album: Mapped[str | None] = mapped_column("pldAlbum", Text)
    pld_year: Mapped[str | None] = mapped_column("pldYear", Text)
    pld_sort_order: Mapped[int | None] = mapped_column("pldSortOrder", Integer)
    pld_unavailable: Mapped[int | None] = mapped_column("pldUnavailable", Integer)


class Reproduction(Base):
    __tablename__ = "reproductions"

    rep_id: Mapped[int] = mapped_column("repID", Integer, primary_key=True)
    rep_title: Mapped[str | None] = mapped_column("repTitle", Text)
    rep_artist_id: Mapped[int | None] = mapped_column("repArtistID", Integer)
    rep_release: Mapped[str | None] = mapped_column("repRelease", Text)
    rep_media_type: Mapped[int | None] = mapped_column("repMediaType", Integer)
    rep_reproductions: Mapped[str | None] = mapped_column("repReproductions", Text)
    rep_path: Mapped[str | None] = mapped_column("repPath", Text)
    rep_user_id: Mapped[int | None] = mapped_column("repUserID", Integer)


class Movie(Base):
    __tablename__ = "movies"

    mov_id: Mapped[int] = mapped_column("movID", Integer, primary_key=True)
    mov_title: Mapped[str | None] = mapped_column("movTitle", Text)
    mov_genre_id: Mapped[str | None] = mapped_column("movGenreID", Text)
    mov_subgenre_id: Mapped[str | None] = mapped_column("mobSubgenreID", Text)
    mov_release_date: Mapped[str | None] = mapped_column("movReleaseDate", Text)
    mov_studio_id: Mapped[str | None] = mapped_column("movStudioID", Text)
    mov_director_id: Mapped[str | None] = mapped_column("movDirectorID", Text)
    mov_cover_id: Mapped[str | None] = mapped_column("movCoverID", Text)


class Book(Base):
    __tablename__ = "books"

    boo_id: Mapped[int] = mapped_column("booID", Integer, primary_key=True)
    boo_title: Mapped[str | None] = mapped_column("booTitle", Text)
    boo_author_id: Mapped[str | None] = mapped_column("booAuthorID", Text)
    boo_release_date: Mapped[str | None] = mapped_column("booReleaseDate", Text)
    boo_series_id: Mapped[int | None] = mapped_column("booSeriesID", Integer)
    boo_number: Mapped[int | None] = mapped_column("booNumber", Integer)
    boo_isbn: Mapped[str | None] = mapped_column("bookISBN", Text)


class BookSeries(Base):
    __tablename__ = "bookseries"

    bos_id: Mapped[int] = mapped_column("bosID", Integer, primary_key=True)
    bos_name: Mapped[str | None] = mapped_column("bosName", Text)
    bos_creator_id: Mapped[str | None] = mapped_column("botCreatorID", Text)


class Game(Base):
    """Games module (legacy expected gamName; table added for MediaStack)."""

    __tablename__ = "games"

    gam_id: Mapped[int] = mapped_column("gamID", Integer, primary_key=True)
    gam_name: Mapped[str | None] = mapped_column("gamName", Text)
    gam_code: Mapped[str | None] = mapped_column("gamCode", Text)
    gam_release_date: Mapped[str | None] = mapped_column("gamReleaseDate", Text)
    gam_studio: Mapped[str | None] = mapped_column("gamStudio", Text)


class Genre(Base):
    __tablename__ = "genres"

    gen_id: Mapped[int] = mapped_column("genID", Integer, primary_key=True)
    gen_name: Mapped[str | None] = mapped_column("genName", Text)
    gen_media_type_id: Mapped[int | None] = mapped_column("genMediaTypeID", Integer)


class Subgenre(Base):
    __tablename__ = "subgenres"

    sgn_id: Mapped[int] = mapped_column("sgnID", Integer, primary_key=True)
    sgn_name: Mapped[str | None] = mapped_column("sgnName", Text)
    sgn_genre_id: Mapped[int | None] = mapped_column("sgnGenreID", Integer)
    sgn_media_type_id: Mapped[int | None] = mapped_column("sgnMediaTypeID", Integer)


class Continent(Base):
    __tablename__ = "continents"

    con_id: Mapped[int] = mapped_column("conID", Integer, primary_key=True)
    con_name: Mapped[str | None] = mapped_column("conName", Text)
    con_iso: Mapped[str | None] = mapped_column("conISO", String(8))
    con_media_type_id: Mapped[int | None] = mapped_column("conMediaTypeID", Integer)


class Country(Base):
    __tablename__ = "countries"

    cou_id: Mapped[int] = mapped_column("couID", Integer, primary_key=True)
    cou_continent_id: Mapped[int | None] = mapped_column("couContinentID", Integer)
    cou_name: Mapped[str | None] = mapped_column("couName", Text)
    cou_iso: Mapped[str | None] = mapped_column("couISO", String(8))
    cou_media_type_id: Mapped[int | None] = mapped_column("couMediaTypeID", Integer)


class ArtistType(Base):
    __tablename__ = "artisttypes"

    aty_id: Mapped[int] = mapped_column("atyID", Integer, primary_key=True)
    aty_name: Mapped[str | None] = mapped_column("atyName", Text)


class ArtistParticipation(Base):
    __tablename__ = "artistparticipations"

    arp_id: Mapped[int] = mapped_column("arpID", Integer, primary_key=True)
    arp_fk_bands: Mapped[int | None] = mapped_column("arpFKbands", Integer)
    arp_fk_artists: Mapped[int | None] = mapped_column("arpFKartists", Integer)
    arp_start_dates: Mapped[str | None] = mapped_column("arpStartDates", Text)
    arp_end_dates: Mapped[str | None] = mapped_column("arpEndDates", Text)
    arp_fk_participation_types: Mapped[str | None] = mapped_column(
        "arpFKparticipationtypes", Text
    )
    arp_fk_instruments: Mapped[str | None] = mapped_column("artFKinstruments", Text)
    arp_manual: Mapped[int | None] = mapped_column("arpManual", Integer, default=0)


class Instrument(Base):
    __tablename__ = "instruments"

    ins_id: Mapped[int] = mapped_column("insID", Integer, primary_key=True)
    ins_name: Mapped[str | None] = mapped_column("insName", Text)
    ins_fk_instrumenttypes: Mapped[str | None] = mapped_column("insFKinstrumenttypes", Text)


class Artist(Base):
    __tablename__ = "artists"

    art_id: Mapped[int] = mapped_column("artID", Integer, primary_key=True)
    art_code: Mapped[str | None] = mapped_column("artCode", Text)
    art_name: Mapped[str | None] = mapped_column("artName", Text)
    art_stage_name: Mapped[str | None] = mapped_column("artStageName", Text)
    art_aliases: Mapped[str | None] = mapped_column("artAliases", Text)
    art_birth_date: Mapped[str | None] = mapped_column("artBirthDate", Text)
    art_birth_place: Mapped[str | None] = mapped_column("artBirthPlace", Text)
    art_birth_fk_countries: Mapped[str | None] = mapped_column("artBirthFKcountries", Text)
    art_death_date: Mapped[str | None] = mapped_column("artDeathDate", Text)
    art_death_place: Mapped[str | None] = mapped_column("artDeathPlace", Text)
    art_death_fk_countries: Mapped[str | None] = mapped_column("artDeathFKcountries", Text)
    art_fk_voicetypes: Mapped[str | None] = mapped_column("artFKvoicetypes", Text)
    art_fk_instruments: Mapped[str | None] = mapped_column("artFKinstruments", Text)
    art_fk_genders: Mapped[str | None] = mapped_column("artFKgenders", Text)
    art_fk_occupations: Mapped[str | None] = mapped_column("artFKoccupations", Text)
    art_fk_images: Mapped[str | None] = mapped_column("artFKimages", Text)
    art_photo_url: Mapped[str | None] = mapped_column("artPhotoUrl", Text)
    art_photo_source: Mapped[str | None] = mapped_column("artPhotoSource", Text)
    art_photo_fetched_at: Mapped[str | None] = mapped_column("artPhotoFetchedAt", Text)
    art_photo_manual: Mapped[int | None] = mapped_column("artPhotoManual", Integer, default=0)
    art_fields_manual: Mapped[str | None] = mapped_column("artFieldsManual", Text)
    art_source: Mapped[str | None] = mapped_column("artSource", Text)
    art_external_urls: Mapped[str | None] = mapped_column("artExternalUrls", Text)
    art_related_similar_at: Mapped[str | None] = mapped_column("artRelatedSimilarAt", Text)
    art_related_participations_at: Mapped[str | None] = mapped_column(
        "artRelatedParticipationsAt", Text
    )


class EntityLink(Base):
    __tablename__ = "entity_links"

    lnk_id: Mapped[int] = mapped_column("lnkID", Integer, primary_key=True)
    lnk_fk_bands: Mapped[int | None] = mapped_column("lnkFKbands", Integer)
    lnk_fk_artists: Mapped[int | None] = mapped_column("lnkFKartists", Integer)
    lnk_category: Mapped[str | None] = mapped_column("lnkCategory", Text)
    lnk_label: Mapped[str | None] = mapped_column("lnkLabel", Text)
    lnk_url: Mapped[str | None] = mapped_column("lnkURL", Text)
    lnk_logo_key: Mapped[str | None] = mapped_column("lnkLogoKey", Text)
    lnk_logo_path: Mapped[str | None] = mapped_column("lnkLogoPath", Text)
    lnk_source: Mapped[str | None] = mapped_column("lnkSource", Text)
    lnk_manual: Mapped[int | None] = mapped_column("lnkManual", Integer, default=0)
    lnk_hidden: Mapped[int | None] = mapped_column("lnkHidden", Integer, default=0)
    lnk_mb_type: Mapped[str | None] = mapped_column("lnkMBType", Text)


class EntityRelated(Base):
    __tablename__ = "entity_related"

    erl_id: Mapped[int] = mapped_column("erlID", Integer, primary_key=True)
    erl_kind: Mapped[str | None] = mapped_column("erlKind", Text)
    erl_fk_bands: Mapped[int | None] = mapped_column("erlFKbands", Integer)
    erl_fk_artists: Mapped[int | None] = mapped_column("erlFKartists", Integer)
    erl_target_band_id: Mapped[int | None] = mapped_column("erlTargetBandID", Integer)
    erl_name: Mapped[str | None] = mapped_column("erlName", Text)
    erl_code: Mapped[str | None] = mapped_column("erlCode", Text)
    erl_photo_url: Mapped[str | None] = mapped_column("erlPhotoUrl", Text)
    erl_external_urls: Mapped[str | None] = mapped_column("erlExternalUrls", Text)
    erl_source: Mapped[str | None] = mapped_column("erlSource", Text)
    erl_manual: Mapped[int | None] = mapped_column("erlManual", Integer, default=0)
    erl_hidden: Mapped[int | None] = mapped_column("erlHidden", Integer, default=0)
    erl_sort_order: Mapped[int | None] = mapped_column("erlSortOrder", Integer, default=0)


class ApiAuth(Base):
    __tablename__ = "apiauth"

    api_id: Mapped[int] = mapped_column("apiID", Integer, primary_key=True)
    api_name: Mapped[str | None] = mapped_column("apiName", Text)
    api_key_encrypted: Mapped[str | None] = mapped_column("apiKeyEncrypted", Text)
    api_secret_encrypted: Mapped[str | None] = mapped_column("apiSecretEncrypted", Text)
    api_url: Mapped[str | None] = mapped_column("apiURL", Text)
    api_doc: Mapped[str | None] = mapped_column("apiDoc", Text)
    api_token: Mapped[str | None] = mapped_column("apiToken", Text)
