export type ContentType = {
  id: number;
  name: string | null;
  sort_id?: string | null;
};

export type MenuItem = {
  id: number;
  name: string | null;
  content_type: string | null;
  order: number | null;
};

export type FilterDef = {
  id: number;
  name: string | null;
  data_type: string | null;
  content_type_id: number | null;
  menu_item_id: number | null;
  parent_table: string | null;
  parent_field: string | null;
  order: number | null;
};

export type ModuleNav = {
  content_type: ContentType;
  menu_items: MenuItem[];
  filters: FilterDef[];
};

export type Band = {
  id: number;
  name: string | null;
  code?: string | null;
  origin_place?: string | null;
  starting_dates?: string | null;
  genres?: string | null;
  bio_excerpt?: string | null;
};

export type ArtistCard = {
  id: number;
  code?: string | null;
  name: string | null;
  photo_url: string | null;
  logo_url: string | null;
  logo_collapsed_url?: string | null;
  icon_url: string | null;
  era_year: number | null;
  show_name_on_hover: boolean;
  starting_dates?: string | null;
  play_count?: number | null;
};

export type ArtistFilterMode =
  | "name"
  | "group"
  | "members"
  | "continent"
  | "country"
  | "start"
  | "end"
  | "genre"
  | "gender"
  | "label"
  | "producer"
  | "most_played";

export type FilterOptions = {
  subgenre_groups: {
    genre: string;
    items: { id: number; name: string | null; genre_id: number | null }[];
  }[];
  country_groups: {
    continent: string;
    items: {
      id: number;
      name: string | null;
      iso: string | null;
      continent_id: number | null;
    }[];
  }[];
  all_country_groups?: {
    continent: string;
    items: {
      id: number;
      name: string | null;
      iso: string | null;
      continent_id: number | null;
    }[];
  }[];
  decades: number[];
  continents: { id: number; name: string | null }[];
  labels: string[];
  producers: { id: string; name: string }[];
};

export type MbArtistMatch = {
  mbid: string;
  name: string;
  sort_name?: string;
  type?: string;
  country?: string;
  disambiguation?: string;
};

export type DashboardTrack = {
  id: number;
  title: string | null;
  title_full?: string | null;
  artist_id: number | null;
  artist_name: string | null;
  artist_name_full?: string | null;
  play_count: number;
  path: string | null;
  release: string | null;
  cover_url?: string | null;
};

export type MusicDashboard = {
  top_tracks: DashboardTrack[];
  top_artists: ArtistCard[];
  top_genres: {
    id: number | string;
    name: string;
    play_count: number;
    image_url?: string | null;
  }[];
  top_countries: { id?: number; name: string; play_count: number; iso: string }[];
};

export const EMPTY_DASHBOARD: MusicDashboard = {
  top_tracks: [],
  top_artists: [],
  top_genres: [],
  top_countries: [],
};

export type UserPlaylist = {
  id: number;
  name: string | null;
  type_id: number;
  description: string | null;
  cover_url: string | null;
  track_count: number;
  source?: string | null;
  spotify_id?: string | null;
  kind?: "local" | "snapshot" | string | null;
};

export type PlaylistSnapshotMeta = {
  spotify_uri?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  release_date?: string | null;
  duration_ms?: number | null;
  popularity?: number | null;
  explicit?: boolean | null;
  genres?: string | null;
  record_label?: string | null;
  danceability?: number | null;
  energy?: number | null;
  tempo?: number | null;
  valence?: number | null;
  acousticness?: number | null;
  instrumentalness?: number | null;
  key?: number | null;
  mode?: number | null;
  loudness?: number | null;
  speechiness?: number | null;
  liveness?: number | null;
  time_signature?: number | null;
};

export type PlaylistTrack = {
  id: number;
  title: string;
  artist: string;
  release: string;
  path: string;
};

export type CardOrientation = "landscape" | "portrait" | "banner" | "icons";

/** Cover vs banner layout for Audio / Video / Library release cards on artist pages. */
export type ReleaseCardLayout = "cover" | "banner";

export type MusicTab = "home" | "artists" | "playlists";

export type ArtistSection =
  | "overview"
  | "audio"
  | "video"
  | "library"
  | "gallery"
  | "quiz";
export type ArtistOverviewTab = "about" | "lineup" | "links" | "related" | "artists";

export type LinkCategory =
  | "social"
  | "streaming"
  | "shopping"
  | "downloads"
  | "databases"
  | "lyrics";

export type LinkItem = {
  id: number;
  label: string;
  url: string;
  category: LinkCategory;
  logo_key: string | null;
  logo_url: string;
  show_label: boolean;
  famous: boolean;
  sort_tier: number;
  source: string | null;
  manual: boolean;
};

export type LinkCategoryTab = {
  id: LinkCategory;
  label: string;
  count: number;
};

export type EntityLinksPayload = {
  entity_type: "band" | "artist";
  entity_id: number;
  groups: Partial<Record<LinkCategory, LinkItem[]>>;
  categories: LinkCategoryTab[];
};

export type RelatedTab = "similar" | "participations";

export type RelatedCardItem = {
  id: number;
  name: string;
  code: string | null;
  local_band_id: number | null;
  in_library: boolean;
  photo_url: string | null;
  logo_url: string | null;
  icon_url: string | null;
  era_year: number | null;
  show_name_on_hover: boolean;
  external_urls: Record<string, string>;
  via_members?: string[];
  manual: boolean;
  source: string | null;
};

export type EntityRelatedPayload = {
  entity_type: "band" | "artist";
  entity_id: number;
  similar: RelatedCardItem[];
  participations: RelatedCardItem[];
  similar_count: number;
  participations_count: number;
  similar_fetched_at: string | null;
  participations_fetched_at: string | null;
  needs_similar_fetch: boolean;
  needs_participations_fetch: boolean;
};

export type LinkCatalogEntry = {
  key: string;
  name: string;
  category: LinkCategory;
};

export type BandOverview = {
  id: number;
  name: string;
  code: string | null;
  bio: string | null;
  bio_manual: boolean;
  bio_source: string | null;
  city: string | null;
  country: { id: number; name: string | null; iso: string | null } | null;
  aliases: string[];
  activity_periods: { start: string | null; end: string | null; label: string }[];
  subgenres: { id: number; name: string }[];
  labels: string[];
  label_logos?: Record<string, string | null>;
  eras: {
    id?: string;
    year: number;
    orientation?: string;
    slide_url?: string | null;
    portrait_url: string | null;
    landscape_url: string | null;
    icon_url: string | null;
    logo_url: string | null;
  }[];
  top_tracks: {
    title: string;
    release_date: string | null;
    cover_url: string | null;
    play_path: string | null;
    album_folder: string | null;
  }[];
  links: EntityLinksPayload;
  lineup: {
    all: LineupMember[];
    current: LineupMember[];
    founding: LineupMember[];
    former: LineupMember[];
    lineup_imported_at: string | null;
    importing: boolean;
  };
  show_lineup: boolean;
  is_solo: boolean;
  solo_performer: LineupMember | null;
  related: EntityRelatedPayload;
  media: MediaFlags;
  metadata_refreshed_at: string | null;
  library_scanned_at: string | null;
  needs_lineup_import?: boolean;
  cached?: boolean;
  is_various_artists?: boolean;
  various_artists_hub?: VariousArtistsHub | null;
};

export type VariousArtistsHub = {
  stats: {
    compilation_count: number;
    track_count: number;
    artist_count: number;
  };
  cover_urls: string[];
  featured_compilations: (AudioReleaseCard & {
    themes?: { id: number | null; name: string }[];
  })[];
  featured_tracks: {
    title: string;
    artist_name: string;
    source_band_id: number | null;
    source_in_library?: boolean;
    play_path: string;
    cover_url: string | null;
    release_date: string | null;
    album_title: string;
    navigate_band_id: number;
    navigate_release_id: string | null;
  }[];
  contributing_artists: {
    band_id: number | null;
    name: string;
    code?: string | null;
    in_library?: boolean;
    external_urls?: Record<string, string>;
    photo_url: string | null;
    icon_url: string | null;
    logo_url: string | null;
    era_year?: number | null;
    show_name_on_hover?: boolean;
    track_count: number;
    compilation_count: number;
    compilation_titles: string[];
  }[];
  themes: {
    id: number | null;
    name: string;
    compilation_count: number;
  }[];
  timeline: {
    year: number;
    compilation_count: number;
    release_ids: string[];
  }[];
};

export type LineupMember = {
  id: number;
  participation_id?: number;
  name: string;
  photo_url: string | null;
  start: string | null;
  end: string | null;
  years?: string | null;
  roles?: string[];
  is_deceased?: boolean;
  is_active?: boolean;
  is_founding?: boolean;
  is_former?: boolean;
  is_official?: boolean;
};

export type ArtistParticipationRef = {
  participation_id: number;
  band_id: number | null;
  band_db_id?: number;
  name: string;
  mbid: string | null;
  in_library: boolean;
  start: string | null;
  end: string | null;
  roles?: string[];
  is_official?: boolean;
  is_founding?: boolean;
  is_former?: boolean;
  participation_types: string | null;
  urls: Record<string, string>;
};

export type BandMembership = {
  participation_id: number;
  start: string | null;
  end: string | null;
  roles: string[];
  is_official: boolean;
  is_founding: boolean;
  is_former: boolean;
};

export type ArtistDetails = {
  id: number;
  mbid: string | null;
  name: string;
  birth_name: string | null;
  aliases: string[];
  origin: {
    city: string | null;
    country: { id: number; name: string | null; iso: string | null } | null;
  };
  birth_date: string | null;
  death_date: string | null;
  age_text: string | null;
  is_deceased: boolean;
  photo_url: string | null;
  urls: Record<string, string>;
  participations: ArtistParticipationRef[];
  band_membership: BandMembership | null;
  band_memberships?: BandMembership[];
  source: string | null;
};

export type MediaFlags = {
  has_audio: boolean;
  has_video: boolean;
  has_library: boolean;
  has_gallery: boolean;
  has_playlists?: boolean;
  audio_categories: string[];
};

export type ArtistPlaylistCard = {
  slug: string;
  name: string;
  track_count?: number | null;
  cover_url: string | null;
  show_count?: number;
  years?: string[];
};

export type PlaylistIndexPayload = {
  playlists: ArtistPlaylistCard[];
  scanned_at: string | null;
  cached: boolean;
};

export type ArtistPlaylistTrack = {
  entry_id?: number;
  title: string;
  release_date: string | null;
  cover_url: string | null;
  play_path: string | null;
  album_folder: string | null;
  album_title?: string | null;
  artist_name?: string | null;
  year?: string | null;
  play_count?: number | null;
  navigate_release_id?: string | null;
  navigate_band_id?: number | null;
  disc_url?: string | null;
  duration?: string | null;
  duration_sec?: number | null;
  unavailable?: boolean;
  youtube_query?: string | null;
  snapshot?: PlaylistSnapshotMeta | null;
};

export type ArtistPlaylistNeighbor = {
  slug: string;
  name: string;
};

export type ArtistPlaylistDetail = {
  slug: string;
  name: string;
  editable?: boolean;
  tracks_editable?: boolean;
  snapshot_filters?: boolean;
  kind?: "local" | "snapshot" | string | null;
  description?: string | null;
  cover_url?: string | null;
  has_custom_cover?: boolean;
  source?: string | null;
  spotify_id?: string | null;
  tracks: ArtistPlaylistTrack[];
  years?: string[];
  career_start_year?: number;
  show_count?: number;
  prev?: ArtistPlaylistNeighbor | null;
  next?: ArtistPlaylistNeighbor | null;
};

export type SetlistShowSummary = {
  id: string;
  event_date: string;
  date_iso: string | null;
  display_date: string;
  year: string;
  venue: string;
  city: string;
  country: string;
  country_iso: string;
  tour_name?: string | null;
  label: string;
};

export type SetlistTrackItem = ReleaseTrackItem & {
  is_tape?: boolean;
  unavailable?: boolean;
  youtube_query?: string;
  setlist_title?: string;
};

export type SetlistTracklistPayload = {
  setlist_id: string;
  tour_name?: string | null;
  show_date?: string | null;
  display_date?: string | null;
  venue?: string;
  city?: string;
  country?: string;
  country_iso?: string;
  editions: ReleaseEdition[];
};

export type AudioReleaseCard = {
  id: string;
  category: string;
  title: string;
  date_iso: string | null;
  display_date: string | null;
  official: boolean;
  cover_url: string | null;
  logo_url: string | null;
  logo_collapsed_url?: string | null;
  banner_url?: string | null;
  era_logo_url?: string | null;
  era_logo_collapsed_url?: string | null;
  era_icon_url?: string | null;
  folder_path: string;
  navigate_band_id: number;
  navigate_release_id: string;
  source_band_id: number | null;
  source_artist_name?: string | null;
  source_logo_url?: string | null;
  source_icon_url?: string | null;
  is_box_set?: boolean;
};

export type GalleryPhotoItem = {
  id: string;
  url: string;
  year: number;
  orientation: string;
  title: string;
  folder_path: string;
};

export type GalleryBrandItem = {
  id: string;
  url: string;
  kind: "logo" | "icon";
  start: number;
  end: number;
  label: string;
  folder_path: string;
};

export type GalleryIndexPayload = {
  photos: GalleryPhotoItem[];
  branding: GalleryBrandItem[];
  logos: GalleryBrandItem[];
  icons: GalleryBrandItem[];
};

export type AudioIndexPayload = {
  releases: AudioReleaseCard[];
  categories: string[];
  unofficial_by_category: Record<string, boolean>;
  box_sets_by_category?: Record<string, boolean>;
  standard_compilations_by_category?: Record<string, boolean>;
  scanned_at: string | null;
  cached: boolean;
  stale?: boolean;
};

export type ReleaseNeighbor = {
  id: string;
  title: string;
  cover_url: string | null;
};

export type TrackYoutubeVideo = {
  url: string;
  label: string;
  primary?: boolean;
};

export type ReleaseTrackItem = {
  id: string;
  number: number;
  title: string;
  play_path: string;
  duration_sec: number | null;
  duration: string | null;
  has_lrc: boolean;
  has_synced_lrc?: boolean;
  is_link: boolean;
  is_video?: boolean;
  open_url?: string | null;
  is_exclusive?: boolean;
  youtube_url?: string | null;
  youtube_videos?: TrackYoutubeVideo[];
  source_album_title?: string | null;
  navigate_release_id?: string | null;
  navigate_band_id?: number | null;
  source_date_iso?: string | null;
  source_display_date?: string | null;
  cover_url?: string | null;
  cover_animation_url?: string | null;
  canvas_url?: string | null;
  disc_url?: string | null;
  background_layers?: string[];
};

export type ReleaseTakenFrom = {
  album_title: string;
  navigate_release_id: string;
  navigate_band_id?: number;
  is_single?: boolean;
};

export type ReleaseSingleCard = {
  id: string;
  title: string;
  folder_path: string;
  cover_url: string | null;
  display_date?: string | null;
  date_iso?: string | null;
  navigate_release_id?: string;
};

export type TrackVersionItem = {
  title: string;
  play_path: string;
  album_title: string | null;
  album_folder: string | null;
  navigate_release_id?: string | null;
  navigate_band_id?: number | null;
  edition_title?: string | null;
  cover_url: string | null;
  cover_animation_url?: string | null;
  canvas_url?: string | null;
  disc_url?: string | null;
  background_layers?: string[];
  date_iso: string | null;
  display_date?: string | null;
  duration?: string | null;
  version_label?: string | null;
};

export type ReleaseTrackGroup = {
  id: string;
  kind: "disc" | "side" | "tape" | "flat" | "link" | "single" | "folder";
  label: string | null;
  single_title?: string | null;
  date_iso?: string | null;
  display_date?: string | null;
  source_single_title?: string | null;
  navigate_release_id?: string | null;
  disc_url?: string | null;
  tracks: ReleaseTrackItem[];
};

export type ReleaseEdition = {
  id: string;
  label: string;
  kind?: "edition" | "single" | "bside" | "link";
  date_iso: string | null;
  display_date?: string | null;
  groups: ReleaseTrackGroup[];
  is_link?: boolean;
  unresolved?: boolean;
  cover_url?: string | null;
  cover_animation_url?: string | null;
  canvas_url?: string | null;
  disc_url?: string | null;
  background_layers?: string[];
};

export type WordCloudTerm = {
  text: string;
  count: number;
  weight: number;
};

export type WordCloudPayload = {
  terms: WordCloudTerm[];
  track_sources: number;
  ready: boolean;
  hint: string | null;
};

export type MediaItemFile = {
  number?: number | null;
  name: string;
  title?: string | null;
  date_iso?: string | null;
  display_date?: string | null;
  path: string;
  kind: string;
  size: number;
  url?: string | null;
  duration?: string | null;
  duration_sec?: number | null;
  page_count?: number | null;
  pages?: string | null;
};

export type MediaItemGroup = {
  label: string;
  files: MediaItemFile[];
};

export type MediaItemOverview = {
  id: string;
  kind: "video" | "library";
  band_id: number;
  artist_name: string;
  title: string;
  date_iso: string | null;
  display_date?: string | null;
  folder_path: string;
  cover_url: string | null;
  disc_url?: string | null;
  logo_url?: string | null;
  era_icon_url?: string | null;
  era_logo_url?: string | null;
  release_type?: string;
  description: string | null;
  description_manual?: boolean;
  director?: string | null;
  author?: string | null;
  publisher?: string | null;
  publisher_logo_url?: string | null;
  genres?: string[];
  photocards?: {
    portrait_front: string | null;
    portrait_back: string | null;
    landscape_front: string | null;
    landscape_back: string | null;
    cover_only?: boolean;
  };
  lineup?: LineupMember[];
  show_lineup?: boolean;
  is_solo?: boolean;
  franchise_artist?: {
    band_id: number | null;
    name: string;
    photo_url: string | null;
    icon_url?: string | null;
    logo_url?: string | null;
    in_library?: boolean;
  } | null;
  franchise_items?: {
    kind?: string | null;
    title: string;
    path?: string | null;
    date_iso?: string | null;
    subseries?: string | null;
    cover_url?: string | null;
  }[];
  files: MediaItemFile[];
  groups?: MediaItemGroup[];
  open_url?: string | null;
  prev?: ReleaseNeighbor | null;
  next?: ReleaseNeighbor | null;
};

export type TrackCredits = {
  title: string;
  writers: string[];
  composers: string[];
  lyricists: string[];
  source: string | null;
};

export type MediaTabItem = {
  id: string;
  title: string;
  date_iso: string | null;
  display_date?: string | null;
  cover_url: string | null;
  banner_url?: string | null;
  era_logo_url?: string | null;
  era_logo_collapsed_url?: string | null;
  era_icon_url?: string | null;
  folder_path: string;
  /** First video or readable file — open in a new tab from the card hover action. */
  open_url?: string | null;
};

export type MediaTabCategory = {
  key: string;
  label: string;
  items: MediaTabItem[];
};

export type MediaTabIndexPayload = {
  band_id: number;
  kind: string;
  categories: MediaTabCategory[];
  scanned_at: string | null;
  cached?: boolean;
};

export type QuizScoreEntry = {
  last_score: number;
  last_total: number;
  last_time_ms?: number;
  best_score: number;
  best_total: number;
  best_time_ms?: number;
  played_at?: string;
};

export type QuizScores = {
  discography?: QuizScoreEntry;
  lineup?: QuizScoreEntry;
  songs?: QuizScoreEntry;
};

export type ReleaseTracklist = {
  release_id: string;
  title: string;
  artist_name: string | null;
  editions: ReleaseEdition[];
};

export type ReleasePlaybackArt = {
  cover_url?: string | null;
  cover_animation_url?: string | null;
  canvas_url?: string | null;
  disc_url?: string | null;
  logo_url?: string | null;
  group_kind?: string | null;
  background_layers?: string[];
};

export type ReleaseGalleryItem = {
  id: string;
  url: string;
  title: string;
  folder_path: string;
  section: string;
  year?: number;
  orientation?: string;
};

export type ReleaseGalleryPayload = {
  release_id: string;
  title: string;
  artwork: ReleaseGalleryItem[];
  photos: ReleaseGalleryItem[];
  extras: ReleaseGalleryItem[];
};

export type ReleaseOverview = {
  id: string;
  band_id: number;
  artist_name: string;
  title: string;
  category: string;
  release_type: string;
  release_type_line: string;
  date_iso: string | null;
  display_date: string | null;
  official: boolean;
  folder_path: string;
  source_artist: string | null;
  description: string | null;
  description_manual: boolean;
  description_source: string | null;
  needs_description_fetch?: boolean;
  needs_metadata_fetch?: boolean;
  subgenres: { id: number; name: string }[];
  producer: string | null;
  label: string | null;
  label_logo_url?: string | null;
  release_code: string | null;
  reviews: { label: string; url: string }[];
  metadata_refreshed_at?: string | null;
  cover_url: string | null;
  cover_animation_url?: string | null;
  canvas_url?: string | null;
  icon_url?: string | null;
  playback_kind?: "disc" | "vinyl" | "tape";
  disc_url: string | null;
  background_layers: string[];
  era_icon_url: string | null;
  era_logo_url: string | null;
  logo_url: string | null;
  spotify_url: string | null;
  qr_url: string | null;
  photocards: {
    portrait_front: string | null;
    portrait_back: string | null;
    landscape_front: string | null;
    landscape_back: string | null;
    cover_only?: boolean;
  };
  gallery_photo_url: string | null;
  lineup: LineupMember[];
  show_lineup: boolean;
  is_solo: boolean;
  is_various_artists?: boolean;
  featured_artists?: {
    band_id: number | null;
    name: string;
    photo_url: string | null;
    icon_url?: string | null;
    logo_url?: string | null;
    in_library?: boolean;
    track_count?: number;
  }[];
  singles: ReleaseSingleCard[];
  appears_on?: ReleaseSingleCard[];
  taken_from?: ReleaseTakenFrom | null;
  prev: ReleaseNeighbor | null;
  next: ReleaseNeighbor | null;
  navigate_band_id: number;
  navigate_release_id: string;
};

/** @deprecated Use AudioReleaseCard via lazy /media/audio endpoint */
export type AudioAlbum = {
  id: string;
  title: string;
  date: string | null;
  cover_url: string | null;
  folder_path: string;
  category: string;
};

export type SeriesSection =
  | "overview"
  | "series"
  | "movies"
  | "audio"
  | "library"
  | "games"
  | "gallery"
  | "episodes";

export type SeriesOverviewTab = "about" | "cast" | "links" | "related";
export type SeriesCastTab = "characters" | "staff";

export type View =
  | { kind: "hub" }
  | {
      kind: "music";
      tab?: MusicTab;
      bandId?: number;
      artistSection?: ArtistSection;
      artistOverviewTab?: ArtistOverviewTab;
      releaseId?: string;
      releaseTab?: "overview" | "tracklist" | "gallery";
      mediaItemId?: string;
      playlistSlug?: string;
      playlistId?: number;
      genreFilterId?: number;
      countryFilterId?: number;
      countryFilterName?: string;
    }
  | {
      kind: "series";
      seriesId?: number;
      franchiseId?: string;
      subseriesId?: string;
      seasonId?: string;
      section?: SeriesSection;
      overviewTab?: SeriesOverviewTab;
    }
  | { kind: "movies" }
  | { kind: "books" }
  | { kind: "games" };

export type SeriesSubseriesCard = {
  id: string;
  title: string;
  date_iso: string | null;
  display_date?: string | null;
  folder_path: string;
  cover_url: string | null;
  season_count: number;
  has_gallery?: boolean;
};

export type SeriesSeasonCard = {
  id: string;
  title: string;
  date_iso: string | null;
  display_date?: string | null;
  folder_path: string;
  cover_url: string | null;
  episode_count: number;
};

export type SeriesEpisodeItem = {
  id: string;
  number: number | null;
  title: string;
  play_path: string;
  open_url: string | null;
};

export type SeriesFranchiseCard = {
  id: string;
  name: string;
  letter: string;
  slug: string | null;
  folder_path: string;
  cover_url: string | null;
  subseries: SeriesSubseriesCard[];
  season_count: number;
  subseries_count: number;
  /** Enriched from Series DB for catalog filters */
  country_iso?: string | null;
  country_id?: number | null;
  continent_id?: number | null;
  genre_ids?: (number | string)[];
  genre_names?: string[];
  publishers?: string[];
  writers?: string[];
};

export type SeriesFranchiseDetail = SeriesFranchiseCard & {
  kind: "franchise";
  seasons: SeriesSeasonCard[];
  has_gallery: boolean;
};

export type SeriesFolderDetail = {
  id: string;
  title: string;
  date_iso: string | null;
  display_date?: string | null;
  folder_path: string;
  cover_url: string | null;
  has_gallery: boolean;
  kind: "season" | "subseries" | "folder";
  seasons: SeriesSeasonCard[];
  subseries: SeriesSubseriesCard[];
  episodes: SeriesEpisodeItem[];
  episode_count?: number;
  season_count?: number;
};

export type SeriesGalleryItem = {
  id: string;
  url: string;
  title: string;
  folder_path: string;
  section: string;
};

export type SeriesGalleryPayload = {
  folder_path: string;
  items: SeriesGalleryItem[];
};

export type FranchiseMediaEntry = {
  kind: string;
  path: string;
  title: string;
  date_iso: string | null;
  letter?: string | null;
  platform?: string | null;
  subseries?: string | null;
  franchise_display?: string | null;
  cover_url?: string | null;
  display_date?: string | null;
};

export type MediaRelatedPayload = {
  franchise: { slug: string; display_name: string } | null;
  from_path: string;
  movies: FranchiseMediaEntry[];
  series: FranchiseMediaEntry[];
  books: FranchiseMediaEntry[];
  games: FranchiseMediaEntry[];
  music: FranchiseMediaEntry[];
};

export type SeriesCatalogPayload = {
  franchises: SeriesFranchiseCard[];
  scanned_at: string | null;
};

export type SeriesDashboard = {
  top_episodes: {
    id: number;
    title: string;
    title_full?: string | null;
    franchise_id?: string | null;
    franchise_name?: string | null;
    play_count: number;
    path?: string | null;
    cover_url?: string | null;
    open_url?: string | null;
  }[];
  top_series: {
    id: string;
    name: string;
    play_count: number;
    photo_url?: string | null;
    cover_url?: string | null;
    logo_url?: string | null;
    icon_url?: string | null;
    show_name_on_hover?: boolean;
  }[];
  top_genres: {
    id: number | string;
    name: string;
    play_count: number;
    image_url?: string | null;
  }[];
  top_countries: {
    id?: number;
    name: string;
    play_count: number;
    iso: string;
  }[];
};

export const EMPTY_SERIES_DASHBOARD: SeriesDashboard = {
  top_episodes: [],
  top_series: [],
  top_genres: [],
  top_countries: [],
};

export type SeriesFilterMode =
  | "name"
  | "continent"
  | "country"
  | "start"
  | "end"
  | "genre"
  | "publisher"
  | "writer"
  | "most_played";

export type SeriesFilterOptions = {
  continents: { id: number; name: string }[];
  country_groups: {
    continent: string;
    items: { id: number; name: string; iso?: string | null }[];
  }[];
  /** Full country list for admin editors (Edit about). */
  all_country_groups?: {
    continent: string;
    items: { id: number; name: string; iso?: string | null }[];
  }[];
  subgenre_groups: {
    genre: string;
    items: { id: number; name: string; genre_id?: number | null }[];
  }[];
  /** Full taxonomy for admin editors (Edit about). */
  all_subgenre_groups?: {
    genre: string;
    items: { id: number; name: string; genre_id?: number | null }[];
  }[];
  decades: number[];
  publishers: string[];
  writers: string[];
};

export type SeriesCastPerformance = {
  language: string;
  actor_name?: string | null;
  /** All actors for this language (comma-joined on cards). */
  actor_names?: string[];
  actor_id?: number | string | null;
  photo_url?: string | null;
};

export type SeriesLanguageOption = {
  code: string;
  label: string;
  is_origin?: boolean;
  selected?: boolean;
};

export type SeriesCastMember = {
  id?: number | string | null;
  name: string;
  character?: string | null;
  photo_url?: string | null;
  /** Actor portrait shown on hover flip (character-centered cards). */
  actor_photo_url?: string | null;
  character_photo_url?: string | null;
  tmdb_photo_url?: string | null;
  performances?: SeriesCastPerformance[];
  actors?: {
    id?: number | string | null;
    name: string;
    photo_url?: string | null;
    language?: string | null;
  }[];
  roles?: string[];
  /** Empty / omitted = appears in all subseries. */
  subseries_ids?: string[];
  is_deceased?: boolean;
  manual?: boolean;
};

export type SeriesRelatedShow = {
  id?: number | string;
  tmdb_id?: number | string;
  title?: string;
  name?: string;
  date_iso?: string | null;
  poster_url?: string | null;
  cover_url?: string | null;
  overview?: string | null;
  manual?: boolean;
  hidden?: boolean;
};

export type SeriesOverviewEra = {
  orientation: string;
  portrait_url?: string | null;
  landscape_url?: string | null;
  slide_url?: string | null;
  icon_url?: string | null;
  logo_url?: string | null;
  year?: number | null;
};

export type SeriesOverview = {
  id: string;
  ser_id?: number;
  name: string;
  letter: string;
  slug?: string | null;
  folder_path: string;
  cover_url: string | null;
  bio: string | null;
  bio_manual?: boolean;
  writers: string[];
  aliases: string[];
  city?: string | null;
  country?: { id: number; name: string | null; iso?: string | null } | null;
  languages?: string[];
  origin_language?: string | null;
  language_options?: SeriesLanguageOption[];
  cast_languages?: SeriesLanguageOption[];
  activity_periods: { label: string; start?: string | null; end?: string | null }[];
  genres: { id: number | string; name: string }[];
  publishers: string[];
  status?: string | null;
  type?: string | null;
  is_animated?: boolean;
  tmdb_id?: string | null;
  eras: SeriesOverviewEra[];
  logo_url?: string | null;
  icon_url?: string | null;
  cast: {
    characters: SeriesCastMember[];
    staff: SeriesCastMember[];
    animated?: SeriesCastMember[];
    people?: SeriesCastMember[];
  };
  media: {
    has_audio: boolean;
    has_series: boolean;
    has_movies?: boolean;
    has_library: boolean;
    has_games: boolean;
    has_gallery: boolean;
  };
  links: {
    entity_type?: string;
    entity_id?: number;
    categories: { id: string; label: string; count: number }[];
    groups: Partial<
      Record<
        string,
        {
          id?: string;
          label: string;
          url: string;
          logo_url?: string;
          logo_key?: string | null;
          category?: string;
        }[]
      >
    >;
    total?: number;
  };
  subseries: SeriesSubseriesCard[];
  seasons: SeriesSeasonCard[];
  music_band_id?: number | null;
  related: {
    movies: FranchiseMediaEntry[];
    series: FranchiseMediaEntry[];
    books: FranchiseMediaEntry[];
    games: FranchiseMediaEntry[];
    music: FranchiseMediaEntry[];
    creator?: SeriesRelatedShow[];
    similar?: SeriesRelatedShow[];
    creator_count?: number;
    similar_count?: number;
  };
  metadata_refreshed_at?: string | null;
  needs_metadata?: boolean;
};

export type Health = {
  status: string;
  database_path: string;
  frontend: boolean;
  counts: Record<string, number>;
};
