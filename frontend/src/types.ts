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
};

export type MusicDashboard = {
  top_tracks: DashboardTrack[];
  top_artists: ArtistCard[];
  top_genres: { id: number | string; name: string; play_count: number }[];
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
};

export type PlaylistTrack = {
  id: number;
  title: string;
  artist: string;
  release: string;
  path: string;
};

export type CardOrientation = "landscape" | "portrait";

export type MusicTab = "home" | "artists" | "playlists";

export type ArtistSection = "overview" | "audio" | "video" | "library" | "gallery";
export type ArtistOverviewTab = "about" | "lineup" | "links" | "related";

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
  audio: Record<string, AudioAlbum[]>;
  metadata_refreshed_at: string | null;
  library_scanned_at: string | null;
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

export type AudioAlbum = {
  id: string;
  title: string;
  date: string | null;
  cover_url: string | null;
  folder_path: string;
  category: string;
};

export type View =
  | { kind: "hub" }
  | {
      kind: "music";
      tab?: MusicTab;
      bandId?: number;
      artistSection?: ArtistSection;
      artistOverviewTab?: ArtistOverviewTab;
      playlistId?: number;
      genreFilterId?: number;
      countryFilterId?: number;
      countryFilterName?: string;
    }
  | { kind: "series"; seriesId?: number }
  | { kind: "movies" }
  | { kind: "books" }
  | { kind: "games" };

export type Health = {
  status: string;
  database_path: string;
  frontend: boolean;
  counts: Record<string, number>;
};
