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

export type View =
  | { kind: "hub" }
  | {
      kind: "music";
      tab?: MusicTab;
      bandId?: number;
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
