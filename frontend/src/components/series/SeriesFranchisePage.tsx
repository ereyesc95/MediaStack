import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  fetchBooksFranchiseAudio,
  fetchBooksFranchiseGames,
  fetchBooksFranchiseLibrary,
  fetchBooksFranchiseOverview,
  fetchBooksFranchiseSeries,
  fetchMoviesFranchiseAudio,
  fetchMoviesFranchiseGames,
  fetchMoviesFranchiseLibrary,
  fetchMoviesFranchiseOverview,
  fetchMoviesFranchiseSeries,
  refreshMoviesWorkMetadata,
  refreshBooksWorkMetadata,
  fetchSeriesFranchiseAudio,
  fetchSeriesFranchiseGames,
  fetchSeriesFranchiseLibrary,
  fetchSeriesFranchiseMovies,
  fetchSeriesFranchiseShows,
  fetchSeriesOverview,
  refreshSeriesMetadata,
  rescanSeriesLocalData,
} from "../../api";
import {
  applyMediaTheme,
  beginArtistPageSession,
  colorsFromImageUrl,
  isPlaybackThemeActive,
} from "../../mediaTheme";
import {
  readStoredLanguage,
  writeStoredLanguage,
} from "../../languageLogos";
import { sortGamePlatforms } from "../../seriesGamePlatforms";
import {
  readSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "../../sessionCache";
import { pushBooksRoute } from "../../booksRoute";
import { pushMoviesRoute } from "../../moviesRoute";
import {
  pushSeriesRoute,
  saveSeriesEntryReferrer,
} from "../../seriesRoute";
import {
  getFranchiseHomeReferrer,
  preferredSectionForSource,
  saveFranchiseHomeReferrer,
} from "../../franchiseHome";
import type {
  CardOrientation,
  LinkCategory,
  MoviesFilmCard,
  ReleaseCardLayout,
  SeriesCastTab,
  SeriesFranchiseCard,
  SeriesOverview,
  SeriesOverviewTab,
  SeriesSection,
  SeriesSubseriesCard,
} from "../../types";
import {
  getStoredReleaseCardLayout,
  saveReleaseCardLayout,
} from "../../themes";
import {
  isMobilePortraitLayout,
  isStackedArtistLayout,
  useDeviceLayout,
} from "../../usePhoneLayout";
import AppMenu from "../AppMenu";
import ArtistCard from "../ArtistCard";
import PlaylistBoot from "../PlaylistBoot";
import CardOrientationPicker from "../CardOrientationPicker";
import ReleaseCardLayoutPicker from "../ReleaseCardLayoutPicker";
import MediaBeatFx from "../music/MediaBeatFx";
import MediaBeatFrame from "../music/MediaBeatFrame";
import MediaInlineSearch from "../music/MediaInlineSearch";
import FranchiseAboutEditModal from "./FranchiseAboutEditModal";
import SeriesAbout from "./SeriesAbout";
import SeriesAudioPlayer from "./SeriesAudioPlayer";
import SeriesCast from "./SeriesCast";
import SeriesGalleryPanel from "./SeriesGalleryPanel";
import SeriesLinks from "./SeriesLinks";
import SeriesMediaGrid, { type SeriesMediaCard } from "./SeriesMediaGrid";
import SeriesOpeningsEndingsPage from "./SeriesOpeningsEndingsPage";
import SeriesRelatedPanel, {
  type SeriesRelatedTab,
} from "./SeriesRelatedPanel";
import SeriesScopeControl from "./SeriesScopeControl";
import {
  IconCardBanner,
  IconCardCover,
  IconMediaMusic,
} from "../MenuIcons";
import type { ArtistCard as ArtistCardType } from "../../types";

export type SeriesFranchiseShell = {
  name: string;
  cover_url: string | null;
  logo_url?: string | null;
  icon_url?: string | null;
};

type Props = {
  franchiseId: string;
  /** series (default) or movies — same chrome, movies APIs + film strip. */
  module?: "series" | "movies" | "books";
  subseriesId?: string;
  seasonId?: string;
  section?: SeriesSection;
  overviewTab?: SeriesOverviewTab;
  universeId?: number;
  shell?: SeriesFranchiseShell | null;
  /** Catalog franchises for inline search (from SeriesModule cache). */
  franchises?: SeriesFranchiseCard[];
  busy?: string;
  isAdmin?: boolean;
  userId?: number;
  cardOrientation?: CardOrientation;
  onSetOrientation?: (next: CardOrientation) => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onBack: () => void;
  /** Label for the top-left back control (e.g. HOME vs CATALOG). */
  backLabel?: string;
  onNavigate: (patch: {
    franchiseId?: string;
    subseriesId?: string;
    seasonId?: string;
    section?: SeriesSection;
    overviewTab?: SeriesOverviewTab;
    universeId?: number;
  }) => void;
  onOpenFranchise?: (id: string) => void;
  onBrowseCatalog?: (target: {
    mode: "name" | "genre" | "country" | "publisher" | "writer";
    countryId?: number;
    subgenreId?: number;
    publisher?: string;
    writer?: string;
  }) => void;
  onOpenMusicRelease?: (bandId: number, releaseId: string) => void;
  onOpenArtist?: (bandId: number) => void;
  onOpenMoviesPath?: (path: string) => void;
  /** Open a Books work/book page from LIBRARY (or related book cards). */
  onOpenBooksPath?: (path: string) => void;
  /** Movies module: open a Series franchise (optionally a subseries) from the SERIES tab. */
  onOpenSeriesFranchise?: (
    franchiseId: string,
    subseriesId?: string,
    universeId?: number
  ) => void;
  /** Open a Movies franchise/film (from series universe cards). */
  onOpenMoviesFranchise?: (
    franchiseId: string,
    filmId?: string,
    universeId?: number
  ) => void;
  onShellUpdate?: (shell: SeriesFranchiseShell) => void;
  /** Admin: open Add to universe modal (Edit data menu). */
  onAddToUniverse?: () => void;
  /** Admin menu extras (layout toggles, etc.). */
  menuExtra?: ReactNode;
};

type FranchiseNavSection = {
  id: SeriesSection;
  label: string;
  mobileLabel?: string;
  flag: keyof NonNullable<SeriesOverview["media"]> | null;
};

/** Series-centered path: SERIES before MOVIES. */
const SERIES_SECTIONS: FranchiseNavSection[] = [
  { id: "overview", label: "OVERVIEW", mobileLabel: "INFO", flag: null },
  { id: "series", label: "SERIES", flag: "has_series" },
  { id: "movies", label: "MOVIES", flag: "has_movies" },
  { id: "audio", label: "AUDIO", flag: "has_audio" },
  { id: "library", label: "BOOKS", flag: "has_library" },
  { id: "games", label: "GAMES", flag: "has_games" },
  { id: "gallery", label: "GALLERY", mobileLabel: "ART", flag: "has_gallery" },
];

/** Movies-centered path: MOVIES before SERIES. */
const MOVIES_SECTIONS: FranchiseNavSection[] = [
  { id: "overview", label: "OVERVIEW", mobileLabel: "INFO", flag: null },
  { id: "movies", label: "MOVIES", flag: null },
  { id: "series", label: "SERIES", flag: "has_series" },
  { id: "audio", label: "AUDIO", flag: "has_audio" },
  { id: "library", label: "BOOKS", flag: "has_library" },
  { id: "games", label: "GAMES", flag: "has_games" },
  { id: "gallery", label: "GALLERY", mobileLabel: "ART", flag: "has_gallery" },
];

/** Books entry into a Series artwork-home: BOOKS next to Overview. */
const SERIES_FROM_BOOKS_SECTIONS: FranchiseNavSection[] = [
  { id: "overview", label: "OVERVIEW", mobileLabel: "INFO", flag: null },
  { id: "library", label: "BOOKS", flag: "has_library" },
  { id: "series", label: "SERIES", flag: "has_series" },
  { id: "movies", label: "MOVIES", flag: "has_movies" },
  { id: "audio", label: "AUDIO", flag: "has_audio" },
  { id: "games", label: "GAMES", flag: "has_games" },
  { id: "gallery", label: "GALLERY", mobileLabel: "ART", flag: "has_gallery" },
];

/** Books-centered path: BOOKS for works, then related SERIES / MOVIES. */
const BOOKS_SECTIONS: FranchiseNavSection[] = [
  { id: "overview", label: "OVERVIEW", mobileLabel: "INFO", flag: null },
  { id: "books", label: "BOOKS", flag: null },
  { id: "series", label: "SERIES", flag: "has_series" },
  { id: "movies", label: "MOVIES", flag: "has_movies" },
  { id: "audio", label: "AUDIO", flag: "has_audio" },
  { id: "games", label: "GAMES", flag: "has_games" },
  { id: "gallery", label: "GALLERY", mobileLabel: "ART", flag: "has_gallery" },
];

const EMPTY_SERIES_SHOWS: SeriesSubseriesCard[] = [];

const OVERVIEW_TABS: { id: SeriesOverviewTab; label: string }[] = [
  { id: "about", label: "ABOUT" },
  { id: "cast", label: "CAST" },
  { id: "links", label: "LINKS" },
  { id: "related", label: "RELATED" },
];

const BOOKS_OVERVIEW_TABS: { id: SeriesOverviewTab; label: string }[] = [
  { id: "about", label: "ABOUT" },
  { id: "cast", label: "CHARACTERS" },
  { id: "links", label: "LINKS" },
  { id: "related", label: "RELATED" },
];

const MEDIA_SUBBAR_SECTIONS: SeriesSection[] = [
  "books",
  "movies",
  "audio",
  "library",
  "games",
  "gallery",
];

/** Keep last overview per franchise so remount (subseries → franchise) isn't a blank boot. */
const overviewCache = new Map<string, SeriesOverview>();

function readOverviewCache(key: string): SeriesOverview | null {
  const mem = overviewCache.get(key);
  if (mem) return mem;
  const stored = readSessionEntry<SeriesOverview>(
    sessionCacheKey("franchise-overview", key)
  );
  if (stored) overviewCache.set(key, stored);
  return stored;
}

function writeOverviewCache(key: string, data: SeriesOverview) {
  overviewCache.set(key, data);
  writeSessionEntry(sessionCacheKey("franchise-overview", key), data);
}

export default function SeriesFranchisePage({
  franchiseId,
  module = "series",
  subseriesId,
  seasonId,
  section = "overview",
  overviewTab = "about",
  shell = null,
  franchises = [],
  busy,
  isAdmin = false,
  userId,
  cardOrientation = "portrait",
  onSetOrientation,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
  onBack,
  backLabel = "CATALOG",
  onNavigate,
  onOpenFranchise,
  onBrowseCatalog,
  onOpenMusicRelease,
  onOpenArtist,
  onOpenMoviesPath,
  onOpenBooksPath,
  onOpenSeriesFranchise,
  onOpenMoviesFranchise,
  onShellUpdate,
  onAddToUniverse,
  menuExtra,
  universeId,
}: Props) {
  const isBooks = module === "books";
  const isMoviesOnly = module === "movies";
  const isMovies = isMoviesOnly || isBooks; // work-module UI (movies or books)
  const layout = useDeviceLayout();
  const stacked = isStackedArtistLayout(layout);
  const mobilePortrait = isMobilePortraitLayout(layout);
  const cacheKey = `${isBooks ? "books" : isMoviesOnly ? "movies" : "series"}:${franchiseId}`;
  const [data, setData] = useState<SeriesOverview | null>(
    () => readOverviewCache(cacheKey)
  );
  const sharedSeries = Boolean(
    (data as (SeriesOverview & { shared_series?: boolean }) | null)?.shared_series
  );
  const seriesFranchiseId =
    (data as (SeriesOverview & { series_franchise_id?: string }) | null)
      ?.series_franchise_id || franchiseId;
  const seriesShowsRaw = (
    data as (SeriesOverview & { series_shows?: SeriesSubseriesCard[] }) | null
  )?.series_shows;
  const seriesShows = seriesShowsRaw ?? EMPTY_SERIES_SHOWS;
  const seriesShowsKey = useMemo(
    () => seriesShows.map((s) => s.id).join("|"),
    [seriesShows]
  );
  const homeReferrer = useMemo(() => {
    const ref = getFranchiseHomeReferrer();
    if (!ref || ref.home !== "series") return null;
    const rid = String(ref.franchiseId || "").trim().toLowerCase();
    const cur = String(franchiseId || "").trim().toLowerCase();
    if (rid && cur && rid !== cur) return null;
    return ref;
  }, [franchiseId]);
  const navSections = useMemo(() => {
    if (isBooks) return BOOKS_SECTIONS;
    if (isMoviesOnly) return MOVIES_SECTIONS;
    if (homeReferrer?.source === "movies") return MOVIES_SECTIONS;
    if (homeReferrer?.source === "books") return SERIES_FROM_BOOKS_SECTIONS;
    return SERIES_SECTIONS;
  }, [isBooks, isMoviesOnly, homeReferrer]);
  const [loading, setLoading] = useState(() => !readOverviewCache(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const artworkHomeRedirected = useRef(false);

  useEffect(() => {
    artworkHomeRedirected.current = false;
  }, [franchiseId, module]);

  // Movies/Books franchise URL whose [Artwork] lives under Series → series URL
  useEffect(() => {
    if (artworkHomeRedirected.current) return;
    if (!data || !onOpenSeriesFranchise) return;
    if (!isMoviesOnly && !isBooks) return;
    const home = String(
      (data as SeriesOverview & { artwork_home_module?: string | null })
        .artwork_home_module || ""
    ).toLowerCase();
    if (home !== "series") return;
    artworkHomeRedirected.current = true;
    const source = isBooks ? "books" : "movies";
    saveFranchiseHomeReferrer({
      source,
      home: "series",
      franchiseId,
      franchiseName: data.name,
      preferredSection: preferredSectionForSource(source),
      backLabel: isBooks ? "BOOKS" : "MOVIES",
    });
    onOpenSeriesFranchise(franchiseId);
  }, [
    data,
    franchiseId,
    isBooks,
    isMoviesOnly,
    onOpenSeriesFranchise,
  ]);

  const [eraIndex, setEraIndex] = useState(0);
  const [castTab, setCastTab] = useState<SeriesCastTab>("characters");
  const [linkTab, setLinkTab] = useState<LinkCategory | string>("databases");
  const [relatedTab, setRelatedTab] = useState<SeriesRelatedTab>(() =>
    universeId != null ? "universe" : "similar"
  );
  const [universeRevealedId, setUniverseRevealedId] = useState<string | null>(
    null
  );
  const [refreshBio, setRefreshBio] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aboutEditOpen, setAboutEditOpen] = useState(false);
  const [addCastOpen, setAddCastOpen] = useState(false);
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [addRelatedOpen, setAddRelatedOpen] = useState(false);
  const [releaseCardLayout, setReleaseCardLayout] = useState<ReleaseCardLayout>(
    () => (userId ? getStoredReleaseCardLayout(userId) : "cover")
  );
  const setReleaseCardLayoutPersisted = useCallback(
    (next: ReleaseCardLayout) => {
      setReleaseCardLayout(next);
      if (userId) saveReleaseCardLayout(userId, next);
    },
    [userId]
  );
  useEffect(() => {
    if (userId) setReleaseCardLayout(getStoredReleaseCardLayout(userId));
  }, [userId]);
  const [mediaSubFilter, setMediaSubFilter] = useState<string>("all");
  const [castSubFilter, setCastSubFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [bgLayers, setBgLayers] = useState<{
    current?: string;
    outgoing?: string;
  }>({});
  const prevBgRef = useRef<string | undefined>(undefined);
  const autoRefreshDone = useRef<string | null>(null);
  const loadGenRef = useRef(0);
  const cachedLogoRef = useRef<string | null>(null);
  const cachedIconRef = useRef<string | null>(null);

  const [audioCards, setAudioCards] = useState<SeriesMediaCard[]>([]);
  const [audioLoading, setAudioLoading] = useState(() => section === "audio");
  const [opedOpen, setOpedOpen] = useState(false);
  const [seriesPlaying, setSeriesPlaying] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [showCards, setShowCards] = useState<SeriesMediaCard[]>([]);
  const [showLoading, setShowLoading] = useState(
    () => section === "series"
  );
  const [movieCards, setMovieCards] = useState<SeriesMediaCard[]>([]);
  const [movieLoading, setMovieLoading] = useState(
    () => section === "movies" || section === "books"
  );
  const [libCards, setLibCards] = useState<SeriesMediaCard[]>([]);
  const [libLoading, setLibLoading] = useState(() => section === "library");
  const [gameCards, setGameCards] = useState<SeriesMediaCard[]>([]);
  const [gameLoading, setGameLoading] = useState(() => section === "games");
  const [gallerySectionKey, setGallerySectionKey] = useState("all");
  const [gallerySections, setGallerySections] = useState<
    { key: string; label: string }[]
  >([]);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    const cacheKey = `${isBooks ? "books" : isMoviesOnly ? "movies" : "series"}:${franchiseId}`;
    const cached = readOverviewCache(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const overview = isBooks
        ? await fetchBooksFranchiseOverview(franchiseId)
        : isMoviesOnly
          ? await fetchMoviesFranchiseOverview(franchiseId)
          : await fetchSeriesOverview(franchiseId);
      if (gen !== loadGenRef.current) return;
      writeOverviewCache(cacheKey, overview);
      setData(overview);
      setEraIndex(0);
      if (overview.is_animated || (overview.cast?.characters?.length ?? 0) > 0) {
        setCastTab("characters");
      } else {
        setCastTab("staff");
      }
      const cats = overview.links?.categories || [];
      if (cats.length) setLinkTab(cats[0].id);
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
      if (!cached) setData(null);
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [franchiseId, isBooks, isMoviesOnly]);

  useEffect(() => {
    void load();
    return () => {
      loadGenRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    setPlayerOpen(false);
    setRefreshing(false);
    setAudioCards([]);
    setMovieCards([]);
    setShowCards([]);
    setLibCards([]);
    setGameCards([]);
    setMediaSubFilter("all");
    setGallerySectionKey("all");
    setGallerySections([]);
    cachedLogoRef.current = null;
    cachedIconRef.current = null;
  }, [franchiseId]);

  useEffect(() => {
    setGallerySectionKey("all");
  }, [mediaSubFilter, section]);

  useEffect(() => {
    beginArtistPageSession(userId);
  }, [userId]);

  useEffect(() => {
    if (!onShellUpdate || !data) return;
    const logo =
      data.logo_url || data.eras?.[0]?.logo_url || shell?.logo_url || null;
    const icon =
      data.icon_url || data.eras?.[0]?.icon_url || shell?.icon_url || null;
    onShellUpdate({
      name: data.name,
      cover_url: shell?.cover_url ?? null,
      logo_url: logo,
      icon_url: icon,
    });
  }, [
    data?.name,
    data?.logo_url,
    data?.icon_url,
    data?.eras,
    onShellUpdate,
    shell?.cover_url,
    shell?.logo_url,
    shell?.icon_url,
  ]);

  useEffect(() => {
    if (isBooks) {
      pushBooksRoute(
        {
          franchiseId,
          section: section as import("../../booksRoute").BooksSection,
          overviewTab: section === "overview" ? overviewTab : undefined,
          universeId,
        },
        true
      );
      return;
    }
    if (isMoviesOnly) {
      pushMoviesRoute(
        {
          franchiseId,
          section: section as import("../../moviesRoute").MoviesSection,
          overviewTab: section === "overview" ? overviewTab : undefined,
          universeId,
        },
        true
      );
      return;
    }
    pushSeriesRoute(
      {
        franchiseId,
        subseriesId,
        seasonId,
        section,
        overviewTab: section === "overview" ? overviewTab : undefined,
        universeId,
      },
      true
    );
  }, [
    franchiseId,
    subseriesId,
    seasonId,
    section,
    overviewTab,
    isBooks,
    isMoviesOnly,
    universeId,
  ]);

  useEffect(() => {
    if (universeId != null && overviewTab === "related") {
      setRelatedTab("universe");
    }
  }, [universeId, overviewTab]);

  // Auto-fetch TMDb metadata on first visit — debounce so quick franchise
  // switches don't pile up long-running refreshes that starve the API.
  useEffect(() => {
    if (!data?.needs_metadata) return;
    if (autoRefreshDone.current === franchiseId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      autoRefreshDone.current = franchiseId;
      void (async () => {
        try {
          setRefreshing(true);
          if (isMovies) {
            await refreshMoviesWorkMetadata(franchiseId, true);
          } else {
            await refreshSeriesMetadata(franchiseId, true);
          }
          if (cancelled) return;
          await load();
        } catch {
          /* leave empty bio prompt */
        } finally {
          setRefreshing(false);
        }
      })();
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setRefreshing(false);
    };
  }, [data?.needs_metadata, franchiseId, load, isMovies]);

  const handleRefreshMetadata = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      if (isBooks) {
        await refreshBooksWorkMetadata(franchiseId);
      } else if (isMoviesOnly) {
        await refreshMoviesWorkMetadata(franchiseId, refreshBio);
      } else {
        await refreshSeriesMetadata(franchiseId, refreshBio);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [franchiseId, refreshBio, load, isBooks, isMoviesOnly]);

  const handleRescanLibrary = useCallback(async () => {
    if (isMovies) {
      await load();
      return;
    }
    setRefreshing(true);
    try {
      await rescanSeriesLocalData(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [load, isMovies]);

  useEffect(() => {
    if (section !== "audio") return;
    let cancelled = false;
    setAudioLoading(true);
    const useSeriesAudio = !isMovies;
    const audioFranchiseId = useSeriesAudio ? seriesFranchiseId : franchiseId;
    const fetchAudio = useSeriesAudio
      ? fetchSeriesFranchiseAudio(audioFranchiseId)
      : isBooks
        ? fetchBooksFranchiseAudio(franchiseId)
        : fetchMoviesFranchiseAudio(franchiseId);
    void fetchAudio
      .then((payload) => {
        if (cancelled) return;
        const releases = (payload.releases || []) as {
          id?: string;
          title?: string;
          name?: string;
          cover_url?: string | null;
          date_iso?: string | null;
          display_date?: string | null;
          release_date?: string | null;
          folder_path?: string | null;
          subseries_path?: string | null;
          subseries_title?: string | null;
          subseries_id?: string | null;
          source_artist_name?: string | null;
          is_series_playlist?: boolean;
          playlist_kind?: string | null;
          meta?: string | null;
          navigate_band_id?: number | null;
          navigate_release_id?: string | null;
          logo_url?: string | null;
          banner_url?: string | null;
          category?: string | null;
        }[];
        setAudioCards(
          releases
            .filter((r) => !(isMovies && r.is_series_playlist))
            .map((r, i) => ({
            id: r.id || `audio-${i}`,
            title: r.title || r.name || "Release",
            cover_url: r.cover_url,
            logo_url: r.logo_url,
            banner_url: r.banner_url || r.cover_url,
            date_label: r.display_date || r.release_date || r.date_iso || r.meta || null,
            path: r.folder_path || r.subseries_path || undefined,
            meta: [r.subseries_title, r.source_artist_name, r.meta]
              .filter(Boolean)
              .join(" · ") || undefined,
            subseries_id: r.subseries_id || undefined,
            navigate_band_id: r.navigate_band_id,
            navigate_release_id: r.navigate_release_id,
            category: r.is_series_playlist
              ? "playlists"
              : r.category || undefined,
            open_label: r.is_series_playlist ? "Open playlist" : undefined,
            open_mode: r.is_series_playlist ? ("tab" as const) : null,
            ...(r.is_series_playlist
              ? { path: `playlist:${r.playlist_kind || "openings-endings"}` }
              : {}),
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setAudioCards([]);
      })
      .finally(() => {
        if (!cancelled) setAudioLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, franchiseId, isMovies, sharedSeries, seriesFranchiseId]);

  useEffect(() => {
    if (section !== "movies" && section !== "books") return;
    let cancelled = false;
    setMovieLoading(true);
    // Books tab (books module) or Movies tab (movies module): leaf cards from overview.
    if ((isBooks && section === "books") || (isMoviesOnly && section === "movies")) {
      const films =
        (data as { films?: MoviesFilmCard[]; books?: MoviesFilmCard[] } | null)
          ?.books ||
        (data as { films?: MoviesFilmCard[] } | null)?.films ||
        data?.subseries ||
        [];
      setMovieCards(
        films.map((f) => {
          const film = f as MoviesFilmCard & {
            portrait_url?: string | null;
            landscape_url?: string | null;
            banner_url?: string | null;
            open_url?: string | null;
            file_url?: string | null;
            open_mode?: "tab" | "local" | null;
            open_label?: string | null;
          };
          return {
            id: film.id,
            title: film.title,
            cover_url: film.cover_url,
            portrait_url: film.portrait_url || film.cover_url,
            landscape_url: film.landscape_url || null,
            banner_url:
              film.banner_url || film.landscape_url || null,
            logo_url: film.logo_url ?? null,
            date_label: film.display_date || film.date_iso,
            path: film.folder_path,
            open_url: film.open_url || film.file_url || null,
            open_mode:
              film.open_mode ||
              (film.open_url || film.file_url ? ("tab" as const) : null),
            open_label:
              film.open_label ||
              (film.open_url || film.file_url
                ? isBooks
                  ? "Read"
                  : "Play video"
                : null),
            meta: (film as { hub_title?: string | null }).hub_title || undefined,
            subseries_id:
              (film as { hub_title?: string | null }).hub_title || null,
          };
        })
      );
      setMovieLoading(false);
      return () => {
        cancelled = true;
      };
    }
    // Related movies (series franchise, or books franchise MOVIES tab).
    if (isBooks && section === "movies") {
      const related =
        (
          data as {
            related?: { movies?: Array<Record<string, unknown>> };
          } | null
        )?.related?.movies || [];
      setMovieCards(
        related.map((m, i) => ({
          id: String(m.path || m.id || `movie-${i}`),
          title: String(m.title || "Untitled"),
          cover_url: (m.cover_url as string | null) || null,
          portrait_url:
            (m.portrait_url as string | null) ||
            (m.cover_url as string | null) ||
            null,
          landscape_url: (m.landscape_url as string | null) || null,
          banner_url:
            (m.banner_url as string | null) ||
            (m.landscape_url as string | null) ||
            null,
          logo_url: (m.logo_url as string | null) || null,
          open_url: (m.open_url as string | null) || null,
          open_mode: ((m.open_mode as "tab" | "local" | null) ||
            (m.open_url ? "tab" : null)) as "tab" | "local" | null,
          open_label: "Play video",
          date_label:
            (m.display_date as string | null) ||
            (m.date_iso as string | null) ||
            null,
          path: (m.path as string | undefined) || undefined,
          meta: (m.subseries as string | undefined) || undefined,
          subseries_id: (m.subseries as string | null) || null,
        }))
      );
      setMovieLoading(false);
      return () => {
        cancelled = true;
      };
    }
    void fetchSeriesFranchiseMovies(
      sharedSeries ? seriesFranchiseId : franchiseId
    )
      .then((payload) => {
        if (cancelled) return;
          setMovieCards(
          (payload.items || []).map((m, i) => ({
            id: m.path || `movie-${i}`,
            title: m.title,
            cover_url: m.cover_url,
            portrait_url:
              (m as { portrait_url?: string | null }).portrait_url ||
              m.cover_url ||
              null,
            landscape_url:
              (m as { landscape_url?: string | null }).landscape_url || null,
            banner_url:
              (m as { banner_url?: string | null }).banner_url ||
              (m as { landscape_url?: string | null }).landscape_url ||
              null,
            logo_url: (m as { logo_url?: string | null }).logo_url || null,
            open_url: (m as { open_url?: string | null }).open_url || null,
            open_mode:
              ((m as { open_mode?: "tab" | "local" | null }).open_mode as
                | "tab"
                | "local"
                | null) ||
              ((m as { open_url?: string | null }).open_url ? "tab" : null),
            open_label: "Play video",
            date_label: m.display_date || m.date_iso,
            path: m.path,
            meta:
              (m as { subseries?: string | null }).subseries ||
              (m as { hub_title?: string | null }).hub_title ||
              undefined,
            subseries_id:
              (m as { subseries?: string | null }).subseries ||
              (m as { hub_title?: string | null }).hub_title ||
              null,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setMovieCards([]);
      })
      .finally(() => {
        if (!cancelled) setMovieLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    section,
    franchiseId,
    isBooks,
    isMoviesOnly,
    sharedSeries,
    seriesFranchiseId,
    data,
  ]);

  useEffect(() => {
    setMediaSubFilter("all");
    setPlatformFilter("all");
  }, [section]);

  useEffect(() => {
    if (section !== "series") return;
    let cancelled = false;

    // Books: use enriched related.series (correct covers + series franchise ids).
    // Skip franchise-root cards — only dated/subseries entries.
    if (isBooks) {
      const related =
        (
          data as {
            related?: {
              series?: Array<Record<string, unknown>>;
            };
          } | null
        )?.related?.series || [];
      setShowCards(
        related
          .filter((raw) => !raw.is_franchise_root)
          .map((raw) => {
            const s = raw as {
              id?: string;
              title?: string;
              cover_url?: string | null;
              portrait_url?: string | null;
              banner_url?: string | null;
              logo_url?: string | null;
              badge_url?: string | null;
              display_date?: string | null;
              date_iso?: string | null;
              path?: string;
              navigate_franchise_id?: string;
              navigate_subseries_id?: string;
              is_franchise_root?: boolean;
            };
            const path = (s.path || "").replace(/\\/g, "/");
            const parts = path.split("/").filter(Boolean);
            // Series/Letter/Franchise[/Sub]
            const isRoot = parts.length <= 3;
            if (isRoot) return null;
            return {
              id: String(
                s.navigate_franchise_id ||
                  s.id ||
                  (parts[2] ? parts[2] : "")
              ),
              title: s.title || "Untitled",
              cover_url: s.portrait_url || s.cover_url || null,
              portrait_url: s.portrait_url || s.cover_url || null,
              banner_url: s.banner_url || s.cover_url || null,
              logo_url: s.logo_url || null,
              badge_url: s.badge_url || null,
              date_label: s.display_date || s.date_iso || null,
              path: s.path,
              navigate_franchise_id: s.navigate_franchise_id,
              navigate_subseries_id:
                s.navigate_subseries_id ||
                (parts.length >= 4 ? parts[3] : undefined),
            };
          })
          .filter(Boolean) as typeof showCards
      );
      setShowLoading(false);
      return;
    }

    // Shared movies↔series overview already includes show cards — sync without a
    // loading flash. Avoid `seriesShows` array identity in deps (|| [] flicker).
    if (isMovies && sharedSeries && seriesShowsKey) {
      setShowCards(
        seriesShows.map((s) => ({
          id: s.id,
          title: s.title,
          cover_url: s.cover_url,
          logo_url: s.logo_url ?? null,
          badge_url: s.badge_url ?? null,
          banner_url: s.cover_url,
          date_label:
            s.display_date ||
            (s.season_count
              ? `${s.season_count} season${s.season_count === 1 ? "" : "s"}`
              : s.date_iso) ||
            null,
        }))
      );
      setShowLoading(false);
      return;
    }

    setShowLoading(true);
    if (isMoviesOnly) {
      void fetchMoviesFranchiseSeries(franchiseId)
        .then((payload) => {
          if (cancelled) return;
          setShowCards(
            (payload.items || []).map((raw) => {
              const s = raw as {
                id?: string;
                title?: string;
                cover_url?: string | null;
                date_iso?: string | null;
                path?: string;
                navigate_franchise_id?: string;
              };
              return {
                id: String(s.navigate_franchise_id || s.id || ""),
                title: s.title || "Untitled",
                cover_url: s.cover_url ?? null,
                date_label: s.date_iso ?? null,
                path: s.path,
              };
            })
          );
        })
        .catch(() => {
          if (!cancelled) setShowCards([]);
        })
        .finally(() => {
          if (!cancelled) setShowLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    void fetchSeriesFranchiseShows(franchiseId)
      .then((payload) => {
        if (cancelled) return;
        setShowCards(
          (payload.items || []).map((s) => ({
            id: s.id,
            title: s.title,
            cover_url: s.cover_url,
            logo_url: (s as { logo_url?: string | null }).logo_url || null,
            badge_url: (s as { badge_url?: string | null }).badge_url || null,
            banner_url:
              (s as { banner_url?: string | null }).banner_url ||
              s.cover_url ||
              null,
            date_label:
              s.display_date ||
              (s.season_count
                ? `${s.season_count} season${s.season_count === 1 ? "" : "s"}`
                : s.date_iso) ||
              null,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setShowCards([]);
      })
      .finally(() => {
        if (!cancelled) setShowLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    section,
    franchiseId,
    isMovies,
    isMoviesOnly,
    isBooks,
    sharedSeries,
    seriesShowsKey,
    seriesShows,
    data,
  ]);

  useEffect(() => {
    if (section !== "library") return;
    let cancelled = false;
    setLibLoading(true);
    const useSeriesLib = !isMovies || sharedSeries;
    const libId = useSeriesLib ? seriesFranchiseId : franchiseId;
    const fetchLib = useSeriesLib
      ? fetchSeriesFranchiseLibrary(libId)
      : isBooks
        ? fetchBooksFranchiseLibrary(franchiseId)
        : fetchMoviesFranchiseLibrary(franchiseId);
    void fetchLib
      .then((payload) => {
        if (cancelled) return;
        setLibCards(
          (payload.items || []).map((b, i) => {
            const row = b as {
              path?: string;
              title?: string;
              cover_url?: string | null;
              banner_url?: string | null;
              logo_url?: string | null;
              display_date?: string | null;
              date_iso?: string | null;
              subseries?: string | null;
              open_url?: string | null;
              open_mode?: "tab" | "local" | null;
              open_label?: string | null;
            };
            return {
              id: row.path || `book-${i}`,
              title: row.title || "Untitled",
              cover_url: row.cover_url,
              banner_url: row.banner_url || row.cover_url || null,
              logo_url: row.logo_url || null,
              open_url: row.open_url || null,
              open_mode:
                row.open_mode || (row.open_url ? ("tab" as const) : null),
              open_label: row.open_label || "Read",
              date_label: row.display_date || row.date_iso,
              path: row.path,
              meta: row.subseries || undefined,
            };
          })
        );
      })
      .catch(() => {
        if (!cancelled) setLibCards([]);
      })
      .finally(() => {
        if (!cancelled) setLibLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, franchiseId, isMovies, isBooks, sharedSeries, seriesFranchiseId]);

  useEffect(() => {
    if (section !== "games") return;
    let cancelled = false;
    setGameLoading(true);
    const useSeriesGames = !isMovies || sharedSeries;
    const gameId = useSeriesGames ? seriesFranchiseId : franchiseId;
    const fetchGames = useSeriesGames
      ? fetchSeriesFranchiseGames(gameId)
      : isBooks
        ? fetchBooksFranchiseGames(franchiseId)
        : fetchMoviesFranchiseGames(franchiseId);
    void fetchGames
      .then((payload) => {
        if (cancelled) return;
        setGameCards(
          (payload.items || []).map((g, i) => {
            const row = g as {
              path?: string;
              title?: string;
              cover_url?: string | null;
              banner_url?: string | null;
              logo_url?: string | null;
              display_date?: string | null;
              date_iso?: string | null;
              platform?: string | null;
              subseries?: string | null;
              open_url?: string | null;
              open_mode?: "tab" | "local" | null;
              open_label?: string | null;
            };
            return {
              id: row.path || `game-${i}`,
              title: row.title || "Untitled",
              cover_url: row.cover_url,
              banner_url: row.banner_url || row.cover_url || null,
              logo_url: row.logo_url || null,
              open_url: row.open_url || null,
              open_mode: row.open_mode || ("local" as const),
              open_label: row.open_label || "Play game",
              date_label:
                row.display_date || row.date_iso || row.platform || null,
              path: row.path,
              platform: row.platform,
              meta: row.subseries || undefined,
            };
          })
        );
      })
      .catch(() => {
        if (!cancelled) setGameCards([]);
      })
      .finally(() => {
        if (!cancelled) setGameLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, franchiseId, isMovies, sharedSeries, seriesFranchiseId]);

  const title = data?.name ?? shell?.name ?? (isMovies ? "Movies" : "Series");
  // Match About carousel slides so left/right clicks advance the paired landscape bg
  const aboutSlides = useMemo(() => {
    const eras = data?.eras || [];
    if (stacked) {
      return eras.filter((e) => e.landscape_url);
    }
    return eras.filter((e) => e.portrait_url);
  }, [data?.eras, stacked]);
  const currentAboutEra =
    aboutSlides[Math.min(eraIndex, Math.max(aboutSlides.length - 1, 0))] ??
    null;
  const coverUrl = currentAboutEra?.portrait_url ?? aboutSlides[0]?.portrait_url ?? null;
  const bgUrl =
    currentAboutEra?.landscape_url ??
    aboutSlides.find((e) => e.landscape_url)?.landscape_url ??
    undefined;

  useEffect(() => {
    if (!bgUrl) {
      setBgLayers({ current: undefined, outgoing: undefined });
      prevBgRef.current = undefined;
      return;
    }
    if (bgUrl === prevBgRef.current) return;
    const outgoing = prevBgRef.current;
    prevBgRef.current = bgUrl;
    setBgLayers({ current: bgUrl, outgoing });
    const t = window.setTimeout(() => {
      setBgLayers((s) => ({ current: s.current, outgoing: undefined }));
    }, 360);
    return () => window.clearTimeout(t);
  }, [bgUrl]);

  useEffect(() => {
    const sample = coverUrl || bgUrl;
    if (!sample || isPlaybackThemeActive()) return;
    void colorsFromImageUrl(sample).then((c) => {
      if (c && !isPlaybackThemeActive()) applyMediaTheme(c, userId);
    });
  }, [coverUrl, bgUrl, userId]);

  const visibleSections = useMemo(() => {
    if (!data) return navSections.filter((s) => s.id === "overview");
    const media = data.media || ({} as SeriesOverview["media"]);
    const related = data.related;
    return navSections.filter((s) => {
      if (!s.flag) return true;
      if (media[s.flag]) return true;
      // Fallback when media flags lag behind related disk payloads
      if (s.flag === "has_series") {
        return (related?.series?.length || 0) > 0;
      }
      if (s.flag === "has_movies") {
        return (related?.movies?.length || 0) > 0;
      }
      if (s.flag === "has_library" || s.flag === "has_books") {
        if ((related?.books?.length || 0) > 0) return true;
        // Cross-module entry from BookStack: keep BOOKS tab visible
        if (homeReferrer?.source === "books") return true;
        return false;
      }
      if (s.flag === "has_games") {
        return (related?.games?.length || 0) > 0;
      }
      return false;
    });
  }, [data, navSections, homeReferrer]);

  useEffect(() => {
    if (!data) return;
    const allowed = new Set(visibleSections.map((s) => s.id));
    if (!allowed.has(section)) {
      onNavigate({ section: "overview", overviewTab: "about" });
    }
  }, [data, section, visibleSections, onNavigate]);

  const era = currentAboutEra ?? data?.eras?.[0];
  const listedLangs = useMemo(() => {
    if (!data) return [] as string[];
    const fromOpts = (data.language_options || [])
      .filter((o) => o.selected)
      .map((o) => o.code);
    if (fromOpts.length) return fromOpts;
    if (data.languages?.length) return [...data.languages];
    if (data.origin_language) return [data.origin_language];
    return [];
  }, [data]);

  const logosSwitchable = Boolean(data?.logos_switchable);
  const logoByLanguage = data?.logo_by_language || {};

  const storageScope = `${isMovies ? "movies" : "series"}:${franchiseId}`;
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);

  useEffect(() => {
    if (!listedLangs.length) {
      setActiveLanguage(null);
      return;
    }
    const stored = readStoredLanguage(storageScope);
    const match = stored
      ? listedLangs.find((c) => c.toLowerCase() === stored.toLowerCase())
      : null;
    const next =
      match ||
      (data?.origin_language &&
      listedLangs.some(
        (c) => c.toLowerCase() === data.origin_language!.toLowerCase()
      )
        ? data.origin_language
        : listedLangs[0]);
    setActiveLanguage(next);
  }, [storageScope, listedLangs, data?.origin_language]);

  const selectLanguage = useCallback(
    (code: string) => {
      setActiveLanguage(code);
      writeStoredLanguage(storageScope, code);
    },
    [storageScope]
  );

  const langLogo =
    (activeLanguage && logoByLanguage[activeLanguage]) ||
    (activeLanguage
      ? Object.entries(logoByLanguage).find(
          ([k]) => k.toLowerCase() === activeLanguage.toLowerCase()
        )?.[1]
      : null) ||
    null;

  const logoSrc = data
    ? langLogo ||
      era?.logo_url ||
      data.logo_url ||
      shell?.logo_url ||
      null
    : null;
  const iconSrc = data
    ? era?.icon_url || data.icon_url || shell?.icon_url || null
    : null;
  if (logoSrc) cachedLogoRef.current = logoSrc;
  if (iconSrc) cachedIconRef.current = iconSrc;
  const displayLogo = logoSrc || cachedLogoRef.current;
  const displayIcon = iconSrc || cachedIconRef.current;
  const topBrand = displayIcon ? (
    <img
      src={displayIcon}
      alt=""
      className="artist-page__brand-icon"
    />
  ) : null;
  const topLogo = displayLogo ? (
    <img
      src={displayLogo}
      alt=""
      className="artist-page__brand-logo"
    />
  ) : null;

  const castCounts = {
    characters:
      data?.cast?.characters?.length ?? data?.cast?.animated?.length ?? 0,
    staff: data?.cast?.staff?.length ?? data?.cast?.people?.length ?? 0,
  };

  const subseriesList = useMemo(() => {
    // Movies works map films into `data.subseries` — those are not filter scopes.
    // Prefer real Series hubs (series_shows) or film hub_title groups.
    const shows = seriesShows || [];
    const filmHubs = (() => {
      if (!isMoviesOnly && !isBooks) return [] as SeriesSubseriesCard[];
      const films =
        (data as { films?: Array<{ hub_title?: string | null; id?: string }> } | null)
          ?.films || [];
      const relatedMovies =
        (
          data as {
            related?: {
              movies?: Array<{ subseries?: string | null; hub_title?: string | null }>;
            };
          } | null
        )?.related?.movies || [];
      const byTitle = new Map<string, SeriesSubseriesCard>();
      const addHub = (titleRaw: string | null | undefined) => {
        const title = (titleRaw || "").trim();
        if (!title) return;
        const key = title.toLowerCase();
        if (byTitle.has(key)) return;
        const matched = shows.find(
          (s) => (s.title || "").trim().toLowerCase() === key
        );
        byTitle.set(
          key,
          matched ||
            ({
              id: `hub:${title}`,
              title,
            } as SeriesSubseriesCard)
        );
      };
      for (const f of films) addHub(f.hub_title);
      for (const m of relatedMovies) addHub(m.hub_title || m.subseries);
      // Books mid-tier hubs from leaf hub_title
      if (isBooks) {
        for (const s of data?.subseries || []) {
          addHub(
            (s as { hub_title?: string | null }).hub_title || s.title
          );
        }
      }
      return Array.from(byTitle.values());
    })();
    const list =
      isMoviesOnly || isBooks
        ? filmHubs.length
          ? filmHubs
          : shows
        : data?.subseries || [];
    let hubs = list.filter(
      (s) => !(s as { is_standalone?: boolean }).is_standalone
    );
    // Hide scopes that have no media in the current section (when applicable).
    const sectionItems =
      section === "movies" || section === "books"
        ? movieCards
        : section === "audio"
          ? audioCards
          : section === "library"
            ? libCards
            : section === "games"
              ? gameCards
              : null;
    if (sectionItems && hubs.length > 1) {
      hubs = hubs.filter((hub) => {
        const wantTitle = (hub.title || "").toLowerCase();
        const wantId = (hub.id || "").toLowerCase();
        const wantPath = (hub.folder_path || "")
          .replace(/\\/g, "/")
          .toLowerCase();
        return sectionItems.some((item) => {
          const sid = (item.subseries_id || "").toLowerCase().trim();
          const meta = (item.meta || "").toLowerCase().trim();
          // Exact hub title match only — "Dragon Ball" must not match "Dragon Ball GT".
          if (wantTitle && (sid === wantTitle || meta === wantTitle)) return true;
          if (
            wantId &&
            !wantId.startsWith("hub:") &&
            (sid === wantId || meta === wantId)
          )
            return true;
          const path = (item.path || "").replace(/\\/g, "/").toLowerCase();
          if (
            wantPath &&
            (path === wantPath || path.startsWith(`${wantPath}/`))
          )
            return true;
          return false;
        });
      });
    }
    return hubs.length > 1 ? hubs : [];
  }, [
    isMoviesOnly,
    isBooks,
    data,
    data?.subseries,
    seriesShows,
    section,
    movieCards,
    audioCards,
    libCards,
    gameCards,
  ]);
  const showSubseriesSubbar = subseriesList.length > 1;
  const subseriesTabs = useMemo(() => {
    if (subseriesList.length <= 1) return [];
    return [
      { id: "all", title: "All" },
      ...subseriesList.map((s) => ({ id: s.id, title: s.title })),
    ];
  }, [subseriesList]);

  const franchiseSearchItems = useMemo(
    () =>
      franchises.map((f) => ({
        id: f.id,
        name: f.name,
        logo_url: f.logo_url ?? null,
      })),
    [franchises]
  );

  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const g of gameCards) {
      if (g.platform) set.add(g.platform);
    }
    return sortGamePlatforms(Array.from(set));
  }, [gameCards]);

  const filterBySubseries = (items: SeriesMediaCard[]) => {
    if (mediaSubFilter === "all") return items;
    const wantId = mediaSubFilter.toLowerCase();
    const wantSub = subseriesList.find(
      (s) => s.id.toLowerCase() === wantId
    );
    const wantTitle = (wantSub?.title || "").toLowerCase();
    const wantPath = (wantSub?.folder_path || "")
      .replace(/\\/g, "/")
      .toLowerCase();
    return items.filter((item) => {
      // Openings & Endings only on All (when multiple subseries exist)
      if (
        item.path?.startsWith("playlist:") ||
        item.category === "playlists" ||
        item.id.startsWith("series-op-ed:")
      ) {
        return false;
      }
      const sid = (item.subseries_id || "").toLowerCase().trim();
      const meta = (item.meta || "").toLowerCase().trim();
      // Exact hub title match — avoid "Dragon Ball" matching "Dragon Ball GT".
      if (wantTitle && (sid === wantTitle || meta === wantTitle)) return true;
      if (
        wantId &&
        !wantId.startsWith("hub:") &&
        (sid === wantId || meta === wantId)
      )
        return true;
      const path = (item.path || "").replace(/\\/g, "/").toLowerCase();
      if (wantPath && (path === wantPath || path.startsWith(`${wantPath}/`)))
        return true;
      return false;
    });
  };

  const filterGames = (items: SeriesMediaCard[]) => {
    let list = filterBySubseries(items);
    if (platformFilter !== "all") {
      list = list.filter((g) => (g.platform || "") === platformFilter);
    }
    return list;
  };

  const openMediaCard = (item: SeriesMediaCard) => {
    if (item.path?.startsWith("playlist:")) {
      setOpedOpen(true);
      return;
    }
    if (item.navigate_band_id && item.navigate_release_id) {
      onOpenMusicRelease?.(item.navigate_band_id, item.navigate_release_id);
      return;
    }
    const diskPath = (item.path || "").replace(/\\/g, "/");
    if (
      onOpenMoviesPath &&
      diskPath.toLowerCase().startsWith("movies/")
    ) {
      if (isBooks) {
        saveSeriesEntryReferrer({
          kind: "books",
          franchiseId,
          section: "movies",
          title: data?.name || title,
        });
      }
      onOpenMoviesPath(diskPath);
      return;
    }
    if (
      onOpenBooksPath &&
      diskPath.toLowerCase().startsWith("books/")
    ) {
      onOpenBooksPath(diskPath);
      return;
    }
    const url = item.open_url?.trim();
    if (!url) return;
    if (item.open_mode === "local") {
      void fetch(url, { method: "POST" }).catch(() => {});
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const showMediaSubbar = MEDIA_SUBBAR_SECTIONS.includes(section);
  const pageClass = [
    "artist-page",
    "series-franchise-page",
    `artist-page--${layout}`,
    stacked ? "artist-page--stacked" : "",
    mobilePortrait ? "artist-page--mobile-portrait" : "",
    bgLayers.current ? "artist-page--has-bg" : "",
    seriesPlaying ? "artist-page--beat-ready artist-page--playing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (opedOpen) {
    return (
      <SeriesOpeningsEndingsPage
        franchiseId={franchiseId}
        franchiseName={data?.name || shell?.name}
        onBack={() => setOpedOpen(false)}
        onImport={onImport}
        onSync={onSync}
        onChooseSource={onChooseSource}
        onSwitchProfile={onSwitchProfile}
        onEditProfile={onEditProfile}
        isAdmin={isAdmin}
        userId={userId}
        onOpenMusicRelease={onOpenMusicRelease}
        onOpenArtist={onOpenArtist}
      />
    );
  }
  const bodyLineup =
    section === "overview" &&
    (overviewTab === "cast" || overviewTab === "links");

  return (
    <div className={pageClass}>
      <div className="artist-page__bg-stack" aria-hidden="true">
        {bgLayers.outgoing ? (
          <div
            className="artist-page__bg artist-page__bg--visible artist-page__bg--out"
            style={
              {
                backgroundImage: `url("${bgLayers.outgoing}")`,
              } as CSSProperties
            }
          />
        ) : null}
        {bgLayers.current ? (
          <div
            className={`artist-page__bg artist-page__bg--visible${
              bgLayers.outgoing ? " artist-page__bg--in" : ""
            }`}
            style={
              {
                backgroundImage: `url("${bgLayers.current}")`,
              } as CSSProperties
            }
          />
        ) : null}
        <MediaBeatFx />
      </div>

      <div className="artist-page__chrome">
        <header className="artist-page__top">
          <div className="artist-page__top-left">
            <button
              type="button"
              className="artist-page__catalog-back"
              onClick={onBack}
              aria-label={`Back to ${backLabel.toLowerCase()}`}
            >
              <svg
                className="artist-page__catalog-chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M15 6l-6 6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="artist-page__catalog-label">{backLabel}</span>
            </button>
          </div>
          <div className="artist-page__top-center">
            {topBrand ? (
              <MediaBeatFrame variant="logo">{topBrand}</MediaBeatFrame>
            ) : null}
            {topLogo ? (
              <MediaBeatFrame variant="logo">{topLogo}</MediaBeatFrame>
            ) : null}
            {!topBrand && !topLogo ? (
              loading ? (
                <span
                  className="artist-page__brand-logo artist-page__brand-logo--pending"
                  aria-hidden
                />
              ) : (
                <span className="artist-page__brand-name">{title}</span>
              )
            ) : null}
          </div>
          <div className="artist-page__top-right">
            {(busy || refreshing) && (
              <span className="muted">
                {refreshing
                  ? "Fetching data, please wait…"
                  : busy}
              </span>
            )}
            {!mobilePortrait &&
            showSubseriesSubbar &&
            ((section === "overview" && overviewTab === "cast") ||
              showMediaSubbar) ? (
              <SeriesScopeControl
                variant="icon"
                label="Series"
                options={subseriesTabs}
                value={
                  section === "overview" && overviewTab === "cast"
                    ? castSubFilter
                    : mediaSubFilter
                }
                onChange={
                  section === "overview" && overviewTab === "cast"
                    ? setCastSubFilter
                    : setMediaSubFilter
                }
              />
            ) : null}
            {!mobilePortrait &&
            (section === "audio" ||
              section === "movies" ||
              section === "books" ||
              section === "series" ||
              section === "library" ||
              section === "games") ? (
              <ReleaseCardLayoutPicker
                value={releaseCardLayout}
                onChange={setReleaseCardLayoutPersisted}
              />
            ) : null}
            {!mobilePortrait &&
            section === "overview" &&
            overviewTab === "related" &&
            onSetOrientation ? (
              <CardOrientationPicker
                value={cardOrientation}
                onChange={onSetOrientation}
              />
            ) : null}
            {!isMovies || sharedSeries ? (
              <SeriesAudioPlayer
                franchiseId={seriesFranchiseId}
                onPlayingChange={setSeriesPlaying}
                open={playerOpen}
                onOpenChange={setPlayerOpen}
                hideToggle={mobilePortrait}
              />
            ) : null}
            {franchiseSearchItems.length > 0 && onOpenFranchise ? (
              <MediaInlineSearch
                mode="series-franchises"
                items={franchiseSearchItems}
                onSelectFranchise={(id) => {
                  if (id === franchiseId) return;
                  onOpenFranchise(id);
                }}
              />
            ) : null}
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              adaptiveThemeActive
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              menuChrome={
                <>
                  {menuExtra}
                  {mobilePortrait ? (
                    <>
                      {(section === "audio" ||
                        section === "movies" ||
                        section === "books" ||
                        section === "series" ||
                        section === "library" ||
                        section === "games") && (
                        <button
                          type="button"
                          onClick={() =>
                            setReleaseCardLayoutPersisted(
                              releaseCardLayout === "cover" ? "banner" : "cover"
                            )
                          }
                        >
                          {releaseCardLayout === "cover" ? (
                            <IconCardCover className="menu-item-icon" />
                          ) : (
                            <IconCardBanner className="menu-item-icon" />
                          )}
                          {releaseCardLayout === "cover"
                            ? "Cover view"
                            : "Banner view"}
                        </button>
                      )}
                      {section === "overview" &&
                        overviewTab === "related" &&
                        onSetOrientation && (
                          <button
                            type="button"
                            onClick={() => {
                              const order: CardOrientation[] = [
                                "banner",
                                "landscape",
                                "portrait",
                                "icons",
                              ];
                              const i = order.indexOf(
                                cardOrientation === "badge"
                                  ? "banner"
                                  : cardOrientation
                              );
                              onSetOrientation(order[(i + 1) % order.length]!);
                            }}
                          >
                            <IconCardBanner className="menu-item-icon" />
                            Card layout:{" "}
                            {cardOrientation === "badge"
                              ? "banner"
                              : cardOrientation}
                          </button>
                        )}
                      {!isMovies || sharedSeries ? (
                        <button
                          type="button"
                          className={
                            seriesPlaying && !playerOpen
                              ? "app-menu-chrome__live"
                              : undefined
                          }
                          onClick={() => setPlayerOpen((v) => !v)}
                        >
                          <IconMediaMusic className="menu-item-icon" />
                          {playerOpen ? "Hide music" : "Play music"}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </>
              }
              menuVariant="release"
              editDataFlat
              editDataLabel="Update franchise"
              onAddToUniverse={
                isAdmin ? onAddToUniverse : undefined
              }
              addToUniverseLabel="Add to universe"
              onRefreshMetadata={
                isAdmin && section === "overview" && overviewTab === "about"
                  ? () => void handleRefreshMetadata()
                  : undefined
              }
              onRescanLibrary={
                isAdmin ? () => void handleRescanLibrary() : undefined
              }
              refreshIncludeBio={refreshBio}
              onRefreshIncludeBioChange={
                isAdmin &&
                !isBooks &&
                section === "overview" &&
                overviewTab === "about"
                  ? setRefreshBio
                  : undefined
              }
              onEditAbout={
                isAdmin &&
                section === "overview" &&
                overviewTab === "about"
                  ? () => setAboutEditOpen(true)
                  : undefined
              }
              onAddMember={
                isAdmin &&
                !isMovies &&
                section === "overview" &&
                overviewTab === "cast"
                  ? () => {
                      window.setTimeout(() => setAddCastOpen(true), 0);
                    }
                  : undefined
              }
              onAddLink={
                isAdmin &&
                section === "overview" &&
                overviewTab === "links"
                  ? () => setAddLinkOpen(true)
                  : undefined
              }
              onAddSimilar={
                isAdmin &&
                section === "overview" &&
                overviewTab === "related" &&
                relatedTab !== "universe"
                  ? () => setAddRelatedOpen(true)
                  : undefined
              }
              addSimilarLabel={
                relatedTab === "creator"
                  ? isBooks
                    ? "Add same author book"
                    : isMoviesOnly
                      ? "Add same crew film"
                      : "Add same author series"
                  : isBooks
                    ? "Add similar book"
                    : isMoviesOnly
                      ? "Add similar film"
                      : "Add similar series"
              }
              onRefreshLineup={
                isAdmin &&
                !isMovies &&
                section === "overview" &&
                overviewTab === "cast"
                  ? () => void handleRefreshMetadata()
                  : undefined
              }
              onRefreshLinks={
                isAdmin &&
                !isBooks &&
                section === "overview" &&
                overviewTab === "links"
                  ? () => void handleRefreshMetadata()
                  : undefined
              }
            />
          </div>
        </header>

        <nav className="artist-page__sections" aria-label="Series sections">
          {visibleSections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? "active" : ""}
              onClick={() =>
                onNavigate({
                  section: s.id,
                  overviewTab: s.id === "overview" ? overviewTab : overviewTab,
                })
              }
            >
              <span>
                {mobilePortrait && s.mobileLabel ? s.mobileLabel : s.label}
              </span>
            </button>
          ))}
        </nav>

        {section === "overview" ? (
          <nav className="artist-page__subtabs" aria-label="Overview">
            {(isBooks
              ? BOOKS_OVERVIEW_TABS.filter((t) => {
                  if (t.id !== "cast") return true;
                  const c = data?.cast;
                  const n =
                    (c?.characters?.length || 0) +
                    (c?.staff?.length || 0) +
                    (c?.animated?.length || 0) +
                    (c?.people?.length || 0);
                  return n > 0;
                })
              : OVERVIEW_TABS
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                className={overviewTab === t.id ? "active" : ""}
                onClick={() => onNavigate({ section: "overview", overviewTab: t.id })}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        ) : null}

        {mobilePortrait &&
        section === "overview" &&
        overviewTab === "cast" &&
        showSubseriesSubbar ? (
          <div className="series-scope-bar" aria-label="Cast series">
            <SeriesScopeControl
              label="Series"
              options={subseriesTabs}
              value={castSubFilter}
              onChange={setCastSubFilter}
            />
          </div>
        ) : null}

        {section === "overview" && overviewTab === "cast" && !isBooks ? (
          <nav className="artist-page__subtabs artist-page__lineup-subtabs">
            {(
              [
                ["characters", "CHARACTERS", castCounts.characters],
                ["staff", "STAFF", castCounts.staff],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                className={castTab === id ? "active" : ""}
                onClick={() => setCastTab(id)}
              >
                <span>
                  {label}
                  <span className="artist-page__lineup-count">{count}</span>
                </span>
              </button>
            ))}
          </nav>
        ) : null}

        {mobilePortrait && showMediaSubbar && showSubseriesSubbar ? (
          <div className="series-scope-bar" aria-label="Media series">
            <SeriesScopeControl
              label="Series"
              options={subseriesTabs}
              value={mediaSubFilter}
              onChange={setMediaSubFilter}
            />
          </div>
        ) : null}

        {section === "games" && platforms.length > 0 ? (
          <div className="series-section-subbar" role="tablist" aria-label="Platform">
            <button
              type="button"
              className={platformFilter === "all" ? "active" : ""}
              onClick={() => setPlatformFilter("all")}
            >
              All platforms
            </button>
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                className={platformFilter === p ? "active" : ""}
                onClick={() => setPlatformFilter(p)}
              >
                {p}
              </button>
            ))}
          </div>
        ) : null}

        {section === "gallery" && gallerySections.length > 1 ? (
          <div
            className="series-section-subbar"
            role="tablist"
            aria-label="Gallery folders"
          >
            <button
              type="button"
              className={gallerySectionKey === "all" ? "active" : ""}
              onClick={() => setGallerySectionKey("all")}
            >
              All
            </button>
            {gallerySections.map((s) => (
              <button
                key={s.key}
                type="button"
                className={gallerySectionKey === s.key ? "active" : ""}
                onClick={() => setGallerySectionKey(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}

        {section === "overview" && overviewTab === "related" ? (
          <nav className="artist-page__subtabs artist-page__related-subtabs">
            {(
              [
                ...((data?.universes?.length
                  ? data.universes
                  : data?.universe
                    ? [data.universe]
                    : []
                )
                  .map((u) => {
                    const groupCount =
                      data?.related?.universe_groups?.find((g) => g.id === u.id)
                        ?.count ??
                      data?.related?.universe?.filter(
                        (c) => c.universe_id == null || c.universe_id === u.id
                      ).length ??
                      0;
                    if (groupCount <= 0) return null;
                    return [
                      "universe",
                      u.name.toLocaleUpperCase(),
                      groupCount,
                      u.id,
                    ] as const;
                  })
                  .filter((row): row is readonly ["universe", string, number, number] =>
                    row != null
                  )),
                [
                  "creator",
                  "SAME TALENT",
                  data?.related?.creator_count ??
                    data?.related?.creator?.length ??
                    0,
                  null,
                ] as const,
                [
                  "similar",
                  isBooks
                    ? "SIMILAR BOOKS"
                    : isMoviesOnly
                      ? "SIMILAR MOVIES"
                      : "SIMILAR SERIES",
                  data?.related?.similar_count ??
                    data?.related?.similar?.length ??
                    0,
                  null,
                ] as const,
              ] as const
            ).map((row) => {
              const [id, label, count, tabUniverseId] = row;
              const active =
                id === "universe"
                  ? relatedTab === "universe" &&
                    (universeId === tabUniverseId ||
                      (universeId == null &&
                        tabUniverseId ===
                          (data?.universes?.[0]?.id ?? data?.universe?.id)))
                  : relatedTab === id;
              return (
              <button
                key={id === "universe" ? `universe-${tabUniverseId}` : id}
                type="button"
                className={active ? "active" : ""}
                onClick={() => {
                  setRelatedTab(id);
                  if (id === "universe" && tabUniverseId != null) {
                    onNavigate({
                      section: "overview",
                      overviewTab: "related",
                      universeId: tabUniverseId,
                    });
                  } else if (universeId != null) {
                    onNavigate({
                      section: "overview",
                      overviewTab: "related",
                      universeId: undefined,
                    });
                  }
                }}
              >
                <span>
                  {label}
                  <span className="artist-page__lineup-count">{count}</span>
                </span>
              </button>
              );
            })}
          </nav>
        ) : null}

        {section === "overview" &&
        overviewTab === "links" &&
        (data?.links?.categories?.length ?? 0) > 0 ? (
          <nav className="artist-page__subtabs artist-page__links-subtabs">
            {data!.links.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={linkTab === c.id ? "active" : ""}
                onClick={() => setLinkTab(c.id)}
              >
                <span>
                  {c.label}
                  <span className="artist-page__lineup-count">{c.count}</span>
                </span>
              </button>
            ))}
          </nav>
        ) : null}
      </div>

      <div
        className={`artist-page__body${
          bodyLineup ? " artist-page__body--lineup" : ""
        }`}
      >
        {loading && !data ? (
          <PlaylistBoot className="playlist-boot--compact" label="Loading franchise…" />
        ) : null}
        {error ? <p className="error artist-section-empty">{error}</p> : null}

        {data && section === "overview" && overviewTab === "about" ? (
          <SeriesAbout
            data={data}
            eraIndex={eraIndex}
            stacked={stacked}
            onEraChange={setEraIndex}
            onOpenSubseries={(sub: SeriesSubseriesCard) =>
              onNavigate({
                section: "overview",
                subseriesId: sub.id,
                seasonId: undefined,
              })
            }
            writersLabel="Authors"
            onGenre={(id) =>
              onBrowseCatalog?.({
                mode: "genre",
                subgenreId: typeof id === "number" ? id : undefined,
              })
            }
            onPublisher={(name) =>
              onBrowseCatalog?.({ mode: "publisher", publisher: name })
            }
            onCountry={(c) =>
              onBrowseCatalog?.({
                mode: "country",
                countryId: c.id,
              })
            }
            onWriter={(name) =>
              onBrowseCatalog?.({ mode: "writer", writer: name })
            }
            activeLanguage={activeLanguage}
            logosSwitchable={logosSwitchable}
            onLanguageSelect={selectLanguage}
          />
        ) : null}

        {data && section === "overview" && overviewTab === "cast" ? (
          <SeriesCast
            franchiseId={sharedSeries ? seriesFranchiseId : franchiseId}
            franchiseName={data.name}
            cast={data.cast}
            languages={data.languages}
            languageOptions={data.language_options}
            originLanguage={data.origin_language}
            activeLanguage={activeLanguage}
            subseries={subseriesList}
            castSubFilter={castSubFilter}
            tab={castTab}
            isAdmin={isAdmin}
            addOpen={addCastOpen}
            onAddClose={() => setAddCastOpen(false)}
            onAddEmptyClick={
              isAdmin ? () => setAddCastOpen(true) : undefined
            }
            onDataChanged={() => void load()}
            onOpenCastProject={({ subseriesId: id }) => {
              if (!id) return;
              onNavigate({
                subseriesId: id,
                section: "overview",
                overviewTab: "about",
              });
            }}
          />
        ) : null}

        {data && section === "overview" && overviewTab === "links" ? (
          <SeriesLinks
            franchiseId={franchiseId}
            links={data.links}
            tab={linkTab}
            isAdmin={isAdmin}
            linkApi={
              isBooks ? "books" : isMoviesOnly && !sharedSeries ? "movies" : "series"
            }
            addOpen={addLinkOpen}
            onAddClose={() => setAddLinkOpen(false)}
            onDataChanged={() => void load()}
          />
        ) : null}

        {data && section === "overview" && overviewTab === "related" ? (
          relatedTab === "universe" ? (
            (() => {
              const orient: CardOrientation =
                cardOrientation === "badge" ? "banner" : cardOrientation;
              const activeUniverseId =
                universeId ??
                data.universes?.[0]?.id ??
                data.universe?.id ??
                null;
              const members = (data.related?.universe || []).filter(
                (c) =>
                  activeUniverseId == null ||
                  c.universe_id == null ||
                  c.universe_id === activeUniverseId
              );
              if (!members.length) {
                return (
                  <p className="muted artist-section-empty">
                    No universe members yet.
                  </p>
                );
              }
              const openUniverseMember = (u: (typeof members)[number]) => {
                const leaf = u.leaf_id || u.id || "";
                const fid = u.franchise_id || "";
                const mod = u.module || (isMovies ? "movies" : "series");
                const uid = u.universe_id ?? activeUniverseId ?? undefined;
                if (mod === "movies") {
                  if (isMovies) {
                    onNavigate({
                      subseriesId: leaf,
                      seasonId: undefined,
                      section: "overview",
                      universeId: uid,
                    });
                  } else {
                    onOpenMoviesFranchise?.(fid, leaf, uid);
                  }
                  return;
                }
                if (isMovies) {
                  saveSeriesEntryReferrer({
                    kind: "movies",
                    franchiseId,
                    section: "overview",
                    overviewTab: "related",
                    universeId: uid,
                  });
                  onOpenSeriesFranchise?.(fid, leaf, uid);
                  return;
                }
                onNavigate({
                  franchiseId: fid,
                  subseriesId: leaf === fid ? undefined : leaf,
                  seasonId: undefined,
                  section: "overview",
                  universeId: uid,
                });
              };
              return (
                <div className="series-related artist-related">
                  <div
                    className={`artist-grid artist-grid--${orient} artist-related__grid`}
                  >
                    {members.map((u) => {
                      const leaf = u.leaf_id || u.id || "";
                      const fid = u.franchise_id || "";
                      const cardId = `${u.module}:${fid}:${leaf}`;
                      const title = u.title || u.name || "Untitled";
                      const portrait =
                        u.portrait_url || u.cover_url || null;
                      const landscape =
                        u.landscape_url || u.banner_url || portrait;
                      const banner =
                        u.banner_url || u.landscape_url || portrait;
                      const photo =
                        orient === "banner"
                          ? banner
                          : orient === "landscape"
                            ? landscape
                            : orient === "icons"
                              ? null
                              : portrait;
                      const year =
                        u.date_iso && u.date_iso.length >= 4
                          ? Number(u.date_iso.slice(0, 4)) || null
                          : null;
                      const card: ArtistCardType = {
                        id: 0,
                        name: title,
                        photo_url: photo,
                        logo_url: u.logo_url || null,
                        icon_url: null,
                        era_year: year,
                        show_name_on_hover: true,
                        starting_dates: u.date_iso || null,
                      };
                      return (
                        <div
                          key={cardId}
                          className="artist-related-card-wrap"
                        >
                          <ArtistCard
                            artist={card}
                            orientation={orient}
                            showDateOnHover
                            tapReveal={mobilePortrait}
                            revealed={
                              mobilePortrait &&
                              universeRevealedId === cardId
                            }
                            onClick={() => {
                              if (mobilePortrait) {
                                if (universeRevealedId === cardId) {
                                  openUniverseMember(u);
                                } else {
                                  setUniverseRevealedId(cardId);
                                }
                                return;
                              }
                              openUniverseMember(u);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : (
            <SeriesRelatedPanel
              franchiseId={sharedSeries ? seriesFranchiseId : franchiseId}
              creator={data.related?.creator || []}
              similar={data.related?.similar || []}
              tab={relatedTab}
              orientation={
                cardOrientation === "badge" ? "banner" : cardOrientation
              }
              tmdbKind={isMoviesOnly && !sharedSeries ? "movie" : "tv"}
              fallbackViaMembers={data.writers || []}
              talentOptions={data.writers || []}
              talentLabel={
                isBooks ? "Author" : isMoviesOnly ? "Director / writer" : "Creator"
              }
              isAdmin={isAdmin}
              relatedApi={
                isBooks ? "books" : isMoviesOnly && !sharedSeries ? "movies" : "series"
              }
              addOpen={addRelatedOpen}
              onAddClose={() => setAddRelatedOpen(false)}
              onDataChanged={() => void load()}
              onOpenLocal={(it) => {
                const title = (it.title || it.name || "").trim().toLowerCase();
                if (!title) return false;
                const shows = data?.subseries || [];
                const hit = shows.find(
                  (s) => (s.title || "").trim().toLowerCase() === title
                );
                if (hit) {
                  onNavigate({
                    section: "overview",
                    subseriesId: hit.id,
                    seasonId: undefined,
                    overviewTab: "about",
                  });
                  return true;
                }
                return false;
              }}
            />
          )
        ) : null}

        {section === "audio" ? (
          <SeriesMediaGrid
            items={filterBySubseries(audioCards)}
            loading={loading || (audioLoading && audioCards.length === 0)}
            emptyMessage={
              isMovies
                ? "No audio for this franchise yet."
                : "No audio for this series."
            }
            cardLayout={releaseCardLayout}
            squareCovers={releaseCardLayout === "cover"}
            coverAspect="square"
            onOpen={openMediaCard}
          />
        ) : null}

        {section === "movies" || section === "books" ? (
          <SeriesMediaGrid
            items={filterBySubseries(movieCards)}
            loading={loading || (movieLoading && movieCards.length === 0)}
            emptyMessage={
              section === "books"
                ? "No book folders under this work yet."
                : isMoviesOnly
                  ? mediaSubFilter !== "all"
                    ? "No movies linked to this series yet."
                    : "No film folders under this work yet."
                  : mediaSubFilter !== "all"
                    ? "No movies linked to this series yet."
                    : "No movies linked to this franchise yet."
            }
            cardLayout={releaseCardLayout}
            coverAspect="portrait"
            onOpen={
              (isBooks && section === "books") || isMoviesOnly
                ? (item) => {
                    if (isBooks && section === "books") {
                      pushBooksRoute({
                        franchiseId,
                        franchiseName: title,
                        bookId: item.id,
                        bookTitle: item.title,
                        section: "overview",
                        overviewTab: "about",
                        universeId,
                      });
                    } else {
                      pushMoviesRoute({
                        franchiseId,
                        franchiseName: title,
                        filmId: item.id,
                        filmTitle: item.title,
                        section: "overview",
                        overviewTab: "about",
                        universeId,
                      });
                    }
                    onNavigate({
                      section: "overview",
                      subseriesId: item.id,
                      seasonId: undefined,
                    });
                  }
                : openMediaCard
            }
          />
        ) : null}

        {section === "series" ? (
          <SeriesMediaGrid
            items={showCards}
            loading={loading || (showLoading && showCards.length === 0)}
            emptyMessage={
              isMovies
                ? "No matching Series franchise for this work name."
                : "No subseries found."
            }
            cardLayout={releaseCardLayout}
            coverAspect="portrait"
            onOpen={(item) => {
              if (isBooks) {
                const seriesId =
                  item.navigate_franchise_id || item.id;
                saveSeriesEntryReferrer({
                  kind: "books",
                  franchiseId,
                  section: "series",
                  title: data?.name || title,
                });
                onOpenSeriesFranchise?.(
                  seriesId,
                  item.navigate_subseries_id
                );
                return;
              }
              if (isMovies && sharedSeries) {
                saveSeriesEntryReferrer({
                  kind: "movies",
                  franchiseId,
                  section: "series",
                  title: data?.name || title,
                });
                onOpenSeriesFranchise?.(seriesFranchiseId, item.id);
                return;
              }
              if (isMovies) {
                saveSeriesEntryReferrer({
                  kind: "movies",
                  franchiseId,
                  section: "series",
                  title: data?.name || title,
                });
                onOpenSeriesFranchise?.(item.id);
                return;
              }
              onNavigate({
                section: "overview",
                subseriesId: item.id,
                seasonId: undefined,
              });
            }}
          />
        ) : null}

        {section === "library" ? (
          <SeriesMediaGrid
            items={filterBySubseries(libCards)}
            loading={loading || (libLoading && libCards.length === 0)}
            emptyMessage="No books linked to this franchise yet."
            cardLayout={releaseCardLayout}
            coverAspect="portrait"
            onOpen={openMediaCard}
          />
        ) : null}

        {section === "games" ? (
          <SeriesMediaGrid
            items={filterGames(gameCards)}
            loading={loading || (gameLoading && gameCards.length === 0)}
            emptyMessage="No games linked to this franchise yet."
            cardLayout={releaseCardLayout}
            coverAspect="portrait"
            onOpen={openMediaCard}
          />
        ) : null}

        {section === "gallery" && data ? (
          <SeriesGalleryPanel
            folderPaths={
              mediaSubFilter === "all"
                ? [
                    data.folder_path,
                    ...(data.subseries || [])
                      .map((s) => s.folder_path)
                      .filter(
                        (p): p is string =>
                          Boolean(p) && p !== data.folder_path
                      ),
                  ]
                : [
                    (data.subseries || []).find((s) => s.id === mediaSubFilter)
                      ?.folder_path || data.folder_path,
                  ]
            }
            hideSubbar
            sectionKey={gallerySectionKey}
            onSectionKeyChange={setGallerySectionKey}
            onSectionsChange={(secs) => setGallerySections(secs)}
          />
        ) : null}
      </div>

      {aboutEditOpen && data ? (
        <FranchiseAboutEditModal
          module={isBooks ? "books" : isMoviesOnly ? "movies" : "series"}
          franchiseId={franchiseId}
          data={data}
          onClose={() => setAboutEditOpen(false)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
