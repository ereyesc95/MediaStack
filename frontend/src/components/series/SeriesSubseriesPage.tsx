import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchBooksBook,
  fetchBooksBookAudio,
  fetchBooksBookOverview,
  fetchBooksFranchiseOverview,
  fetchBooksFranchiseGames,
  fetchBooksFranchiseSeries,
  fetchMoviesFilm,
  fetchMoviesFilmAudio,
  fetchMoviesFilmOverview,
  fetchMoviesFranchiseGames,
  fetchMoviesFranchiseLibrary,
  fetchMoviesFranchiseOverview,
  fetchMoviesFranchiseSeries,
  fetchSeriesFolder,
  fetchSeriesFolderExtras,
  fetchSeriesFranchiseAudio,
  fetchSeriesFranchiseGames,
  fetchSeriesFranchiseLibrary,
  fetchSeriesFranchiseMovies,
  fetchSeriesFranchiseShows,
  fetchSeriesOverview,
  fetchUniverse,
  fetchUniverseCards,
  lookupUniverse,
  refreshMoviesFilmMetadata,
  refreshSeriesMetadata,
  rescanSeriesLocalData,
  saveMoviesFilmTrailer,
} from "../../api";
import { formatTrackDate } from "../../formatDate";
import {
  applyMediaTheme,
  beginArtistPageSession,
  colorsFromImageUrl,
  isPlaybackThemeActive,
} from "../../mediaTheme";
import {
  readStoredLanguage,
  resolveLanguageLogos,
  writeStoredLanguage,
} from "../../languageLogos";
import {
  pushMoviesRoute,
  type MoviesSection,
} from "../../moviesRoute";
import { pushBooksRoute } from "../../booksRoute";
import { sortGamePlatforms } from "../../seriesGamePlatforms";
import {
  pushSeriesRoute,
  saveSeriesEntryReferrer,
} from "../../seriesRoute";
import type {
  ArtistCard as ArtistCardType,
  CardOrientation,
  MoviesFilmCard,
  MoviesFilmDetail,
  ReleaseCardLayout,
  SeriesEpisodeItem,
  SeriesFilterMode,
  SeriesFolderDetail,
  SeriesOverview,
  SeriesOverviewTab,
  SeriesRelatedShow,
  SeriesSection,
  SeriesSeasonCard,
  SeriesSubseriesCard,
  Universe,
  UniverseCard,
} from "../../types";
import {
  isMobileLandscapeLayout,
  isMobilePortraitLayout,
  isTabletLayout,
  useDeviceLayout,
} from "../../usePhoneLayout";
import AppMenu from "../AppMenu";
import AddToUniverseModal from "../AddToUniverseModal";
import ArtistCard from "../ArtistCard";
import CardOrientationPicker from "../CardOrientationPicker";
import MyStackIcon from "../MyStackIcon";
import PlaylistBoot from "../PlaylistBoot";
import ReleaseCardLayoutPicker from "../ReleaseCardLayoutPicker";
import {
  IconCardBanner,
  IconCardCover,
  IconCheck,
  IconMediaMusic,
  IconVideo,
} from "../MenuIcons";
import MediaBeatFx from "../music/MediaBeatFx";
import MediaBeatFrame from "../music/MediaBeatFrame";
import MediaInlineSearch from "../music/MediaInlineSearch";
import {
  ReleasePhotocardGroup,
  type ReleasePhotocardSet,
} from "../music/release/ReleasePhotocard";
import {
  DEFAULT_DISC_URL,
  DEFAULT_LABEL_URL,
} from "../music/release/releaseTrackPanelMeta";
import {
  getStoredReleaseCardLayout,
  saveReleaseCardLayout,
} from "../../themes";
import SeriesAboutEditModal from "./SeriesAboutEditModal";
import SeriesAudioPlayer from "./SeriesAudioPlayer";
import SeriesCast from "./SeriesCast";
import SeriesEpisodeList from "./SeriesEpisodeList";
import SeriesGalleryPanel from "./SeriesGalleryPanel";
import SeriesMediaGrid, {
  type SeriesMediaCard,
  useSeriesAudioCategories,
} from "./SeriesMediaGrid";
import SeriesOpeningsEndingsPage from "./SeriesOpeningsEndingsPage";
import SeriesRelatedPanel, {
  type SeriesRelatedTab,
} from "./SeriesRelatedPanel";
import SeriesLinks from "./SeriesLinks";

export type SubseriesTab =
  | "overview"
  | "episodes"
  | "series"
  | "movies"
  | "audio"
  | "library"
  | "games"
  | "gallery";

export type SeriesCatalogBrowseTarget = {
  mode: SeriesFilterMode;
  countryId?: number;
  subgenreId?: number;
  publisher?: string;
  writer?: string;
};

type Props = {
  franchiseId: string;
  franchiseName?: string;
  /** Franchise logo shown while subseries art loads (avoids title flash). */
  franchiseLogoUrl?: string | null;
  /** Franchise Artwork icon for stacked back control / brand fallback. */
  franchiseIconUrl?: string | null;
  subseriesId: string;
  seasonId?: string;
  section?: SeriesSection;
  overviewTab?: SeriesOverviewTab;
  universeId?: number;
  busy?: string;
  isAdmin?: boolean;
  userId?: number;
  /** Movie/book pages reuse this layout with leaf-scoped APIs. */
  variant?: "subseries" | "film" | "book";
  cardOrientation?: CardOrientation;
  onSetOrientation?: (next: CardOrientation) => void;
  /** Match related TMDb cards to on-disk titles and navigate in-app. */
  onOpenRelatedLocal?: (item: SeriesRelatedShow) => boolean;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onBack: () => void;
  onBrowseCatalog?: (target: SeriesCatalogBrowseTarget) => void;
  onOpenMusicRelease?: (bandId: number, releaseId: string) => void;
  onOpenArtist?: (bandId: number) => void;
  onOpenMoviesPath?: (path: string) => void;
  onOpenBooksPath?: (path: string) => void;
  onOpenSeriesFranchise?: (
    franchiseId: string,
    subseriesId?: string,
    universeId?: number
  ) => void;
  /** More Movies sibling navigation (film variant). */
  onOpenFilm?: (filmId: string) => void;
  /** Override back chip text (e.g. HOME when opened from a home pane). */
  backLabelOverride?: string | null;
  onOpenUniverseParent?: (universeId: number, universeName?: string) => void;
  onOpenUniverseLeaf?: (leaf: {
    module: "movies" | "series" | "books";
    franchiseId: string;
    leafId: string;
  }) => void;
  onNavigate: (patch: {
    franchiseId?: string;
    subseriesId?: string;
    seasonId?: string;
    section?: SeriesSection;
    overviewTab?: SeriesOverviewTab;
    universeId?: number;
  }) => void;
};

function filmDetailToFolder(film: MoviesFilmDetail): SeriesFolderDetail {
  return {
    id: film.id,
    title: film.title,
    date_iso: film.date_iso,
    display_date: film.display_date ?? null,
    folder_path: film.folder_path,
    cover_url: film.cover_url,
    banner_url: film.banner_url ?? null,
    cover_back_url: film.cover_back_url ?? null,
    logo_url: film.logo_url ?? null,
    icon_url: film.icon_url ?? null,
    badge_url: film.badge_url ?? null,
    has_gallery: Boolean(film.has_gallery),
    kind: "folder",
    seasons: film.seasons || [],
    subseries: film.subseries || [],
    episodes: film.episodes || [],
    movies: film.movies || [],
    photocards: film.photocards,
  };
}

function filmCardToSubseries(f: MoviesFilmCard | SeriesSubseriesCard): SeriesSubseriesCard {
  return {
    id: f.id,
    title: f.title,
    date_iso: f.date_iso,
    display_date: f.display_date ?? null,
    folder_path: f.folder_path,
    cover_url: f.cover_url,
    logo_url: f.logo_url ?? null,
    icon_url: f.icon_url ?? null,
    badge_url: f.badge_url ?? null,
    season_count:
      "season_count" in f
        ? f.season_count
        : (f as MoviesFilmCard).version_count ?? 1,
    has_gallery: "has_gallery" in f ? Boolean(f.has_gallery) : undefined,
    ...(("hub_title" in f && (f as { hub_title?: string }).hub_title)
      ? { hub_title: (f as { hub_title?: string }).hub_title }
      : {}),
  } as SeriesSubseriesCard;
}

function sectionToTab(section: SeriesSection | undefined): SubseriesTab {
  if (section === "episodes") return "episodes";
  if (section === "series") return "series";
  if (
    section === "gallery" ||
    section === "movies" ||
    section === "audio" ||
    section === "library" ||
    section === "games"
  ) {
    return section;
  }
  return "overview";
}

function tabToSection(tab: SubseriesTab): SeriesSection {
  if (tab === "episodes") return "episodes";
  if (tab === "gallery") return "gallery";
  if (
    tab === "series" ||
    tab === "movies" ||
    tab === "audio" ||
    tab === "library" ||
    tab === "games"
  ) {
    return tab;
  }
  return "overview";
}

function mapRelatedSeriesCards(
  related: Array<Record<string, unknown>>
): SeriesMediaCard[] {
  return related
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
      if (parts.length <= 3) return null;
      return {
        id: String(
          s.navigate_franchise_id || s.id || (parts[2] ? parts[2] : "")
        ),
        title: s.title || "Untitled",
        cover_url: s.portrait_url || s.cover_url || null,
        portrait_url: s.portrait_url || s.cover_url || null,
        banner_url: s.banner_url || s.cover_url || null,
        logo_url: s.logo_url || null,
        date_label: s.display_date || s.date_iso || null,
        path: s.path,
        navigate_franchise_id: s.navigate_franchise_id,
        navigate_subseries_id:
          s.navigate_subseries_id ||
          (parts.length >= 4 ? parts[3] : undefined),
      } as SeriesMediaCard;
    })
    .filter(Boolean) as SeriesMediaCard[];
}

function NeighborLink({
  label,
  direction,
  onClick,
}: {
  label: string;
  direction: "prev" | "next";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`release-page__neighbor release-page__neighbor--${direction}`}
      onClick={onClick}
    >
      {direction === "prev" ? (
        <span className="release-page__neighbor-arrow" aria-hidden>
          ‹
        </span>
      ) : null}
      <span className="release-page__neighbor-text">
        <span className="release-page__neighbor-title">{label}</span>
      </span>
      {direction === "next" ? (
        <span className="release-page__neighbor-arrow" aria-hidden>
          ›
        </span>
      ) : null}
    </button>
  );
}

/** Start–end air dates for the left panel (end only when known). */
function formatAirDateRange(
  startIso: string | null | undefined,
  startDisplay: string | null | undefined,
  periods: { start?: string | null; end?: string | null; label: string }[]
): string | null {
  const startKey = (startIso || "").slice(0, 10);
  const startYear = (startIso || "").slice(0, 4);
  const match =
    periods.find(
      (p) => p.start && startKey && p.start.slice(0, 10) === startKey
    ) ||
    periods.find(
      (p) => p.start && startYear && p.start.slice(0, 4) === startYear
    );

  const startLabel =
    (match?.start ? formatTrackDate(match.start) : null) ||
    startDisplay ||
    (startIso ? formatTrackDate(startIso) : null) ||
    null;
  if (!startLabel) return null;
  const endIso = match?.end?.trim() || "";
  if (!endIso) return startLabel;
  const endLabel = formatTrackDate(endIso);
  if (!endLabel || endLabel === startLabel) return startLabel;
  return `${startLabel} – ${endLabel}`;
}

function toMediaCards(
  items: {
    id?: string;
    title?: string;
    name?: string;
    cover_url?: string | null;
    portrait_url?: string | null;
    landscape_url?: string | null;
    banner_url?: string | null;
    logo_url?: string | null;
    path?: string;
    folder_path?: string;
    date_iso?: string | null;
    display_date?: string | null;
    platform?: string | null;
    meta?: string | null;
    open_url?: string | null;
    open_mode?: "tab" | "local" | null;
    open_label?: string | null;
    navigate_band_id?: number | null;
    navigate_release_id?: string | null;
    navigate_franchise_id?: string;
    navigate_subseries_id?: string;
    subseries_id?: string | null;
    category?: string | null;
    duration?: string | null;
    duration_sec?: number | null;
  }[]
): SeriesMediaCard[] {
  return items.map((it, i) => ({
    id: String(it.id ?? it.path ?? it.folder_path ?? i),
    title: it.title || it.name || "Untitled",
    cover_url: it.cover_url,
    portrait_url: it.portrait_url || it.cover_url || null,
    landscape_url: it.landscape_url || null,
    banner_url:
      it.banner_url || it.landscape_url || it.portrait_url || it.cover_url || null,
    logo_url: it.logo_url,
    path: it.path || it.folder_path,
    date_label: it.display_date || it.date_iso || null,
    date_iso: it.date_iso ?? null,
    display_date: it.display_date ?? null,
    platform: it.platform ?? null,
    meta: it.meta ?? undefined,
    open_url: it.open_url,
    open_mode: it.open_mode,
    open_label: it.open_label,
    navigate_band_id: it.navigate_band_id,
    navigate_release_id: it.navigate_release_id,
    navigate_franchise_id: it.navigate_franchise_id,
    navigate_subseries_id: it.navigate_subseries_id,
    subseries_id: it.subseries_id ?? null,
    category: it.category,
    duration: it.duration ?? null,
    duration_sec: it.duration_sec ?? null,
  }));
}

type SubseriesCacheEntry = {
  overview: SeriesOverview | null;
  card: SeriesSubseriesCard | null;
  detail: SeriesFolderDetail | null;
  siblings: SeriesSubseriesCard[];
  filmVersions?: MoviesFilmDetail["versions"];
  filmHasVideo?: boolean;
  trailerUrl?: string | null;
  workName?: string | null;
};
const subseriesPageCache = new Map<string, SubseriesCacheEntry>();

type SubseriesMediaCacheEntry = {
  movieCards: SeriesMediaCard[];
  seriesCards: SeriesMediaCard[];
  audioCards: SeriesMediaCard[];
  libraryCards: SeriesMediaCard[];
  gameCards: SeriesMediaCard[];
};
const subseriesMediaCache = new Map<string, SubseriesMediaCacheEntry>();

function cacheKey(isFilm: boolean, franchiseId: string, id: string) {
  return `${isFilm ? "film" : "sub"}:${franchiseId}:${id}`;
}

function extraPlayUrl(ep: SeriesEpisodeItem): string | null {
  const url = ep.open_url?.trim();
  if (url && !url.includes("/api/media/open-local")) return url;
  const path = (ep.play_path || "").trim();
  if (!path) return url || null;
  return `/api/media/file?path=${encodeURIComponent(path)}`;
}

function filterCardsForSubseries(
  cards: SeriesMediaCard[],
  subseriesTitle: string,
  subseriesPath: string
): SeriesMediaCard[] {
  const titleCf = subseriesTitle.trim().toLowerCase();
  const pathCf = (subseriesPath || "").replace(/\\/g, "/").toLowerCase();
  const pathFolder = pathCf.split("/").filter(Boolean).pop() || "";

  const titleBelongs = (cardTitle: string): boolean => {
    const t = cardTitle.trim().toLowerCase();
    if (!titleCf || !t) return false;
    if (t === titleCf) return true;
    if (
      !(
        t.startsWith(`${titleCf} `) ||
        t.startsWith(`${titleCf}:`) ||
        t.startsWith(`${titleCf} -`)
      )
    ) {
      return false;
    }
    // Don't let "Dragon Ball" claim "Dragon Ball Z/GT/Super …"
    const rest = t.slice(titleCf.length).replace(/^[\s:-]+/, "");
    const sequel = rest.match(/^(z|gt|super)\b/);
    if (sequel && !new RegExp(`\\b${sequel[1]}$`).test(titleCf)) return false;
    return true;
  };

  return cards.filter((c) => {
    const p = (c.path || "").replace(/\\/g, "/").toLowerCase();
    const t = c.title || "";
    const meta = (c.meta || "").toLowerCase();
    if (
      c.path?.startsWith("playlist:") ||
      c.category === "playlists" ||
      c.id.startsWith("series-op-ed:")
    ) {
      return false;
    }
    if (pathCf && p.includes(pathCf)) return true;
    if (
      pathFolder &&
      (p.includes(`/${pathFolder}/`) || p.endsWith(`/${pathFolder}`))
    )
      return true;
    // Match Movies/Books/Games paths that nest the same dated subseries folder name
    if (pathFolder && p.includes(pathFolder)) return true;
    if (titleCf && meta.includes(titleCf)) return true;
    if (titleBelongs(t)) return true;
    return false;
  });
}

export default function SeriesSubseriesPage({
  franchiseId,
  franchiseName,
  franchiseLogoUrl,
  franchiseIconUrl,
  subseriesId,
  seasonId,
  section = "overview",
  overviewTab = "about",
  universeId,
  busy,
  isAdmin = false,
  userId,
  variant = "subseries",
  cardOrientation = "portrait",
  onSetOrientation,
  onOpenRelatedLocal,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
  onBack,
  onBrowseCatalog,
  onOpenMusicRelease,
  onOpenArtist,
  onOpenMoviesPath,
  onOpenBooksPath,
  onOpenSeriesFranchise,
  onOpenFilm,
  backLabelOverride,
  onOpenUniverseParent,
  onOpenUniverseLeaf,
  onNavigate,
}: Props) {
  const layout = useDeviceLayout();
  const mobilePortrait = isMobilePortraitLayout(layout);
  const mobileLandscape = isMobileLandscapeLayout(layout);
  const tabletLayout = isTabletLayout(layout);
  const tabletPortrait = layout === "tablet-portrait";
  /** Banner + More info panel: phone portrait and tablet portrait. */
  const bannerLayout = mobilePortrait || tabletPortrait;
  const stacked = bannerLayout;
  const isBook = variant === "book";
  const isFilm = variant === "film" || isBook;
  const tab = sectionToTab(section);
  const pageCacheKey = cacheKey(isFilm, franchiseId, subseriesId);
  const initialCached = subseriesPageCache.get(pageCacheKey);

  const [card, setCard] = useState<SeriesSubseriesCard | null>(
    () => initialCached?.card ?? null
  );
  const [siblings, setSiblings] = useState<SeriesSubseriesCard[]>(
    () => initialCached?.siblings ?? []
  );
  const [universeInfo, setUniverseInfo] = useState<Universe | null>(null);
  const [universeCards, setUniverseCards] = useState<UniverseCard[]>([]);
  const [leafUniverses, setLeafUniverses] = useState<Universe[]>([]);
  const [addUniverseOpen, setAddUniverseOpen] = useState(false);
  const [overview, setOverview] = useState<SeriesOverview | null>(
    () => initialCached?.overview ?? null
  );
  const [detail, setDetail] = useState<SeriesFolderDetail | null>(
    () => initialCached?.detail ?? null
  );
  const [seasonEpisodes, setSeasonEpisodes] = useState<
    Record<string, SeriesEpisodeItem[]>
  >({});
  const [loading, setLoading] = useState(() => !subseriesPageCache.has(pageCacheKey));
  const [error, setError] = useState<string | null>(null);
  const [aboutEditOpen, setAboutEditOpen] = useState(false);
  const [relatedTab, setRelatedTab] = useState<SeriesRelatedTab>("creator");
  const [linkTab, setLinkTab] = useState<string>("databases");
  const [universeRevealedId, setUniverseRevealedId] = useState<string | null>(
    null
  );
  const [expandedSeasonId, setExpandedSeasonId] = useState<string | null>(null);
  const [moviesExpanded, setMoviesExpanded] = useState(false);
  const [extrasExpanded, setExtrasExpanded] = useState(false);
  const [focusCoverUrl, setFocusCoverUrl] = useState<string | null>(null);
  const [focusBgUrl, setFocusBgUrl] = useState<string | null>(null);
  const [castTab, setCastTab] = useState<"characters" | "staff">("characters");
  const [cardLayout, setCardLayout] = useState<ReleaseCardLayout>(() =>
    userId ? getStoredReleaseCardLayout(userId) : "cover"
  );
  const [gamePlatform, setGamePlatform] = useState<string>("all");
  const [movieCards, setMovieCards] = useState<SeriesMediaCard[]>(
    () => subseriesMediaCache.get(pageCacheKey)?.movieCards ?? []
  );
  const [seriesCards, setSeriesCards] = useState<SeriesMediaCard[]>(
    () => subseriesMediaCache.get(pageCacheKey)?.seriesCards ?? []
  );
  const [audioCards, setAudioCards] = useState<SeriesMediaCard[]>(
    () => subseriesMediaCache.get(pageCacheKey)?.audioCards ?? []
  );
  const [libraryCards, setLibraryCards] = useState<SeriesMediaCard[]>(
    () => subseriesMediaCache.get(pageCacheKey)?.libraryCards ?? []
  );
  const [gameCards, setGameCards] = useState<SeriesMediaCard[]>(
    () => subseriesMediaCache.get(pageCacheKey)?.gameCards ?? []
  );
  const [mediaLoading, setMediaLoading] = useState(
    () => !subseriesMediaCache.has(pageCacheKey)
  );
  const [mediaReady, setMediaReady] = useState(() =>
    subseriesMediaCache.has(pageCacheKey)
  );
  const [rescanTick, setRescanTick] = useState(0);
  const [extraVideos, setExtraVideos] = useState<SeriesEpisodeItem[]>([]);
  const [openingVideos, setOpeningVideos] = useState<SeriesEpisodeItem[]>([]);
  const [endingVideos, setEndingVideos] = useState<SeriesEpisodeItem[]>([]);
  const [seriesPlaying, setSeriesPlaying] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const [opedOpen, setOpedOpen] = useState(false);
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);
  const [gallerySectionKey, setGallerySectionKey] = useState("all");
  const [gallerySections, setGallerySections] = useState<
    { key: string; label: string }[]
  >([]);
  const [bgLayers, setBgLayers] = useState<{
    current?: string;
    outgoing?: string;
  }>({});
  const castGlassRef = useRef<HTMLElement | null>(null);
  const cachedLogoRef = useRef<string | null>(null);
  const cachedIconRef = useRef<string | null>(null);
  const stackedRef = useRef(stacked);
  stackedRef.current = stacked;
  const [overviewDescExpanded, setOverviewDescExpanded] = useState(false);
  const [castGlassMin, setCastGlassMin] = useState(0);
  const [filmVersions, setFilmVersions] = useState<
    MoviesFilmDetail["versions"]
  >(() => initialCached?.filmVersions || []);
  const [filmHasVideo, setFilmHasVideo] = useState(() =>
    Boolean(initialCached?.filmHasVideo)
  );
  const [trailerUrl, setTrailerUrl] = useState<string | null>(
    () => initialCached?.trailerUrl ?? null
  );
  const [workName, setWorkName] = useState<string | null>(
    () => initialCached?.workName ?? null
  );
  const [trailerEditorOpen, setTrailerEditorOpen] = useState(false);
  const [trailerDraft, setTrailerDraft] = useState("");
  const [trailerSaveError, setTrailerSaveError] = useState<string | null>(null);
  const [extrasMenuOpen, setExtrasMenuOpen] = useState(false);
  const [addCastOpen, setAddCastOpen] = useState(false);
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [addRelatedOpen, setAddRelatedOpen] = useState(false);
  const [activeVolumeId, setActiveVolumeId] = useState<string | null>(null);
  const [volumeDateLabel, setVolumeDateLabel] = useState<string | null>(null);
  const [bookHubFilter, setBookHubFilter] = useState("all");
  const [refreshBio, setRefreshBio] = useState(true);
  const [metadataFetching, setMetadataFetching] = useState(false);
  useEffect(() => {
    setOverviewDescExpanded(false);
    setVolumeDateLabel(null);
    setActiveVolumeId(null);
    setBookHubFilter("all");
  }, [subseriesId]);

  useEffect(() => {
    setCastGlassMin(0);
  }, [subseriesId]);

  useLayoutEffect(() => {
    if (tab !== "overview") return;
    const el = castGlassRef.current;
    if (!el) return;
    // Measure natural height without the applied minHeight so tab switches
    // cannot ratchet the glass taller forever.
    const prevMin = el.style.minHeight;
    el.style.minHeight = "0px";
    const h = Math.ceil(el.getBoundingClientRect().height);
    el.style.minHeight = prevMin;
    if (h > 0) setCastGlassMin((prev) => Math.max(prev, h));
  }, [tab, castTab, overview?.cast, subseriesId]);

  const setCardLayoutPersisted = useCallback(
    (next: ReleaseCardLayout) => {
      setCardLayout(next);
      if (userId) saveReleaseCardLayout(userId, next);
    },
    [userId]
  );

  const loadCard = useCallback(async () => {
    const key = cacheKey(isFilm, franchiseId, subseriesId);
    const cached = subseriesPageCache.get(key);
    if (cached) {
      setOverview(cached.overview);
      setCard(cached.card);
      setDetail(cached.detail);
      setSiblings(cached.siblings);
      setFilmVersions(cached.filmVersions || []);
      setFilmHasVideo(Boolean(cached.filmHasVideo));
      setTrailerUrl(cached.trailerUrl ?? null);
      setWorkName(cached.workName ?? null);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      if (isFilm) {
        const orientation = stackedRef.current ? "landscape" : "portrait";
        const [filmOv, filmDetail, workOv] = await Promise.all([
          (isBook
            ? fetchBooksBookOverview(subseriesId, orientation)
            : fetchMoviesFilmOverview(subseriesId, orientation)
          ).catch(() => null),
          isBook ? fetchBooksBook(subseriesId) : fetchMoviesFilm(subseriesId),
          (isBook
            ? fetchBooksFranchiseOverview(franchiseId, orientation)
            : fetchMoviesFranchiseOverview(franchiseId, orientation)
          ).catch(() => null),
        ]);
        const nextOverview = filmOv || workOv || null;
        setOverview(nextOverview);

        const filmList = (workOv?.films || workOv?.subseries || []) as (
          | MoviesFilmCard
          | SeriesSubseriesCard
        )[];
        const list = filmList.map(filmCardToSubseries);
        setSiblings(list);
        const found =
          list.find((s) => s.id === subseriesId) ||
          filmCardToSubseries({
            id: filmDetail.id,
            title: filmDetail.title,
            date_iso: filmDetail.date_iso,
            display_date: filmDetail.display_date ?? null,
            folder_path: filmDetail.folder_path,
            cover_url: filmDetail.cover_url,
            logo_url: filmDetail.logo_url ?? null,
            icon_url: filmDetail.icon_url ?? null,
            badge_url: filmDetail.badge_url ?? null,
            season_count: filmDetail.versions?.length || 1,
            has_gallery: filmDetail.has_gallery,
          });
        setCard(found);
        const folder = filmDetailToFolder(filmDetail);
        setDetail(folder);
        const nextVersions =
          filmDetail.versions ||
          (filmDetail as { volumes?: typeof filmDetail.versions }).volumes ||
          filmOv?.versions ||
          (filmOv as { volumes?: typeof filmDetail.versions } | null)?.volumes ||
          [];
        const nextHasVideo = Boolean(
          filmDetail.has_video ||
            (filmOv as { has_video?: boolean } | null)?.has_video ||
            nextVersions.length ||
            (filmDetail as { has_pdf?: boolean }).has_pdf
        );
        const nextTrailer =
          filmDetail.trailer_url ??
          (filmOv as { trailer_url?: string | null } | null)?.trailer_url ??
          null;
        const nextWorkName =
          filmDetail.work?.name ||
          filmOv?.work?.name ||
          workOv?.name ||
          franchiseName ||
          null;
        setFilmVersions(nextVersions);
        setFilmHasVideo(nextHasVideo);
        setTrailerUrl(nextTrailer);
        setWorkName(nextWorkName);
        subseriesPageCache.set(key, {
          overview: nextOverview,
          card: found,
          detail: folder,
          siblings: list,
          filmVersions: nextVersions,
          filmHasVideo: nextHasVideo,
          trailerUrl: nextTrailer,
          workName: nextWorkName,
        });
        return;
      }

      const [shows, ov] = await Promise.all([
        fetchSeriesFranchiseShows(franchiseId).catch(() => ({ items: [] })),
        fetchSeriesOverview(franchiseId).catch(() => null),
      ]);
      setOverview(ov);
      setFilmVersions([]);
      setFilmHasVideo(false);
      setTrailerUrl(null);
      setWorkName(null);
      const fromOverview = (ov?.subseries || []) as SeriesSubseriesCard[];
      const fromShows: SeriesSubseriesCard[] = (shows.items || [])
        .filter((s) => s.folder_path)
        .map((s) => ({
          id: s.id,
          title: s.title,
          date_iso: s.date_iso ?? null,
          display_date: s.display_date,
          folder_path: s.folder_path!,
          cover_url: s.cover_url ?? null,
          logo_url: (s as { logo_url?: string | null }).logo_url ?? null,
          icon_url: (s as { icon_url?: string | null }).icon_url ?? null,
          badge_url: (s as { badge_url?: string | null }).badge_url ?? null,
          season_count: s.season_count ?? 0,
          has_gallery: Boolean(
            (s as { has_gallery?: boolean }).has_gallery
          ),
        }));
      const list = fromOverview.length ? fromOverview : fromShows;
      setSiblings(list);
      const found = list.find((s) => s.id === subseriesId);
      if (!found?.folder_path) {
        setError("Subseries not found.");
        setCard(null);
        setDetail(null);
        return;
      }
      setCard(found);
      const folder = await fetchSeriesFolder(found.folder_path);
      setDetail(folder);
      subseriesPageCache.set(key, {
        overview: ov,
        card: found,
        detail: folder,
        siblings: list,
        filmVersions: [],
        filmHasVideo: false,
        trailerUrl: null,
        workName: null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (!cached) {
        setCard(null);
        setDetail(null);
      }
    } finally {
      setLoading(false);
    }
  }, [franchiseId, subseriesId, rescanTick, isFilm, franchiseName]);

  useEffect(() => {
    void loadCard();
  }, [loadCard]);

  useEffect(() => {
    beginArtistPageSession(userId);
  }, [userId]);

  useEffect(() => {
    if (userId) setCardLayout(getStoredReleaseCardLayout(userId));
  }, [userId]);

  useEffect(() => {
    if (isBook) {
      const moviesSection = tabToSection(tab);
      const section: import("../../booksRoute").BooksSection =
        moviesSection === "series"
          ? "overview"
          : (moviesSection as import("../../booksRoute").BooksSection);
      pushBooksRoute(
        {
          franchiseId,
          bookId: subseriesId,
          section,
          overviewTab: tab === "overview" ? overviewTab : undefined,
          universeId,
        },
        true
      );
      return;
    }
    if (isFilm) {
      const moviesSection = tabToSection(tab);
      const section: MoviesSection =
        moviesSection === "episodes" || moviesSection === "series"
          ? "overview"
          : (moviesSection as MoviesSection);
      pushMoviesRoute(
        {
          franchiseId,
          filmId: subseriesId,
          section,
          overviewTab: tab === "overview" ? overviewTab : undefined,
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
        section: tabToSection(tab),
        overviewTab: tab === "overview" ? overviewTab : undefined,
        universeId,
      },
      true
    );
  }, [franchiseId, subseriesId, seasonId, tab, isFilm, isBook, universeId, overviewTab]);

  const seasons: SeriesSeasonCard[] = useMemo(
    () => detail?.seasons || [],
    [detail]
  );

  const localMovies: SeriesEpisodeItem[] = useMemo(
    () => detail?.movies || [],
    [detail]
  );

  // Default expand season 1 (first); collapse others. URL seasonId wins once.
  useEffect(() => {
    if (!seasons.length) {
      setExpandedSeasonId(null);
      return;
    }
    if (seasonId && seasons.some((s) => s.id === seasonId)) {
      setExpandedSeasonId(seasonId);
      return;
    }
    setExpandedSeasonId((prev) => {
      if (prev && seasons.some((s) => s.id === prev)) return prev;
      return seasons[0]?.id ?? null;
    });
  }, [seasons, seasonId]);

  // Prefetch episodes for all seasons (collapsed headers still need counts)
  useEffect(() => {
    let cancelled = false;
    const missing = seasons.filter((s) => !seasonEpisodes[s.id] && s.folder_path);
    if (!missing.length) return;
    void Promise.all(
      missing.map(async (s) => {
        try {
          const d = await fetchSeriesFolder(s.folder_path);
          return [s.id, d.episodes || []] as const;
        } catch {
          return [s.id, [] as SeriesEpisodeItem[]] as const;
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      setSeasonEpisodes((prev) => {
        const next = { ...prev };
        for (const [id, eps] of pairs) next[id] = eps;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [seasons, seasonEpisodes]);

  const activeSeason = useMemo(
    () => seasons.find((s) => s.id === expandedSeasonId) || null,
    [seasons, expandedSeasonId]
  );

  const baseCoverFront =
    detail?.cover_url || card?.cover_url || overview?.cover_url || null;
  const baseCoverBanner = detail?.banner_url || baseCoverFront;
  const baseCoverBack = detail?.cover_back_url || baseCoverFront;
  const baseCover = baseCoverFront;

  const onEpisodesTab = tab === "episodes";

  const panelCoverUrl = onEpisodesTab
    ? focusCoverUrl ||
      activeSeason?.portrait_url ||
      activeSeason?.cover_url ||
      baseCoverFront
    : baseCoverFront;

  /** Wide art for mobile stacked banner panel: Banner → Landscape → Portrait. */
  const panelBannerUrl = onEpisodesTab
    ? focusBgUrl ||
      activeSeason?.banner_url ||
      activeSeason?.landscape_url ||
      activeSeason?.portrait_url ||
      activeSeason?.cover_url ||
      baseCoverBanner ||
      baseCoverFront
    : baseCoverBanner || baseCoverFront;

  const panelArtUrl = stacked ? panelBannerUrl : panelCoverUrl;

  const bgCoverUrl = onEpisodesTab
    ? focusBgUrl ||
      activeSeason?.landscape_url ||
      activeSeason?.banner_url ||
      activeSeason?.portrait_url ||
      activeSeason?.cover_url ||
      baseCoverBack
    : baseCoverBack;

  const seasonLogoUrl =
    onEpisodesTab &&
    activeSeason &&
    !moviesExpanded &&
    !extrasExpanded
      ? activeSeason.logo_url || null
      : null;

  const hideSubseriesTitle =
    onEpisodesTab &&
    Boolean(activeSeason || moviesExpanded || extrasExpanded);

  useEffect(() => {
    // Reset focused cover when subseries changes; hydrate from cache when present
    const cached = subseriesPageCache.get(
      cacheKey(isFilm, franchiseId, subseriesId)
    );
    setFocusCoverUrl(null);
    setFocusBgUrl(null);
    setMoviesExpanded(false);
    setGamePlatform("all");
    const mediaKey = cacheKey(isFilm, franchiseId, subseriesId);
    const cachedMedia = subseriesMediaCache.get(mediaKey);
    if (cachedMedia) {
      setMovieCards(cachedMedia.movieCards);
      setSeriesCards(cachedMedia.seriesCards ?? []);
      setAudioCards(cachedMedia.audioCards);
      setLibraryCards(cachedMedia.libraryCards);
      setGameCards(cachedMedia.gameCards);
      setMediaReady(true);
    } else {
      setMediaReady(false);
    }
    setSeasonEpisodes({});
    setBgLayers({});
    setExtraVideos([]);
    setOpeningVideos([]);
    setEndingVideos([]);
    setMoreInfoOpen(false);
    setTrailerEditorOpen(false);
    setExtrasMenuOpen(false);
    if (cached) {
      setOverview(cached.overview);
      setCard(cached.card);
      setDetail(cached.detail);
      setSiblings(cached.siblings);
      setFilmVersions(cached.filmVersions || []);
      setFilmHasVideo(Boolean(cached.filmHasVideo));
      setTrailerUrl(cached.trailerUrl ?? null);
      setWorkName(cached.workName ?? null);
      setLoading(false);
    } else {
      setCard(null);
      setDetail(null);
      setOverview(null);
      setSiblings([]);
      setFilmVersions([]);
      setFilmHasVideo(false);
      setTrailerUrl(null);
      setWorkName(null);
    }
  }, [subseriesId, franchiseId, isFilm]);

  useEffect(() => {
    if (rescanTick === 0) return;
    setSeasonEpisodes({});
    setMediaReady(false);
  }, [rescanTick]);

  useEffect(() => {
    const path = detail?.folder_path || card?.folder_path;
    if (!path) {
      setExtraVideos([]);
      setOpeningVideos([]);
      setEndingVideos([]);
      return;
    }
    let cancelled = false;
    void fetchSeriesFolderExtras(path)
      .then((data) => {
        if (cancelled) return;
        setOpeningVideos(data.openings || []);
        setEndingVideos(data.endings || []);
        setExtraVideos(data.extras || []);
      })
      .catch(() => {
        if (cancelled) return;
        setExtraVideos([]);
        setOpeningVideos([]);
        setEndingVideos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.folder_path, card?.folder_path, rescanTick]);

  useEffect(() => {
    if (tab !== "episodes") {
      setFocusCoverUrl(null);
      setFocusBgUrl(null);
      setMoviesExpanded(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!bgCoverUrl) {
      setBgLayers({});
      return;
    }
    setBgLayers((prev) => {
      if (prev.current === bgCoverUrl) return prev;
      return { current: bgCoverUrl, outgoing: prev.current };
    });
    const t = window.setTimeout(() => {
      setBgLayers((s) => ({ current: s.current, outgoing: undefined }));
    }, 360);
    return () => window.clearTimeout(t);
  }, [bgCoverUrl]);

  useEffect(() => {
    if (!panelArtUrl || isPlaybackThemeActive()) return;
    void colorsFromImageUrl(panelArtUrl).then((c) => {
      if (c && !isPlaybackThemeActive()) applyMediaTheme(c, userId);
    });
  }, [panelArtUrl, userId]);

  useEffect(() => {
    if (universeId == null) {
      setUniverseInfo(null);
      setUniverseCards([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      fetchUniverse(universeId).catch(() => null),
      fetchUniverseCards(universeId).catch(() => ({ items: [] as UniverseCard[] })),
    ]).then(([uni, cards]) => {
      if (cancelled) return;
      setUniverseInfo(uni);
      setUniverseCards(cards?.items || []);
    });
    return () => {
      cancelled = true;
    };
  }, [universeId]);

  useEffect(() => {
    let cancelled = false;
    const module = isBook ? "books" : isFilm ? "movies" : "series";
    void lookupUniverse(module, franchiseId, subseriesId)
      .then((res) => {
        if (cancelled) return;
        const many = res.universes?.length
          ? res.universes
          : res.universe
            ? [res.universe]
            : [];
        setLeafUniverses(many);
      })
      .catch(() => {
        if (!cancelled) setLeafUniverses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isFilm, isBook, franchiseId, subseriesId]);

  const title =
    detail?.title || card?.title || (isFilm ? overview?.name || "" : "") || "";
  const scopedMeta = overview?.subseries_meta?.[subseriesId] ?? null;
  const dateLabel = isBook
    ? volumeDateLabel ||
      detail?.display_date ||
      card?.display_date ||
      formatTrackDate(detail?.date_iso || card?.date_iso) ||
      null
    : isFilm
    ? detail?.display_date ||
      card?.display_date ||
      formatTrackDate(detail?.date_iso || card?.date_iso) ||
      null
    : formatAirDateRange(
        detail?.date_iso || card?.date_iso,
        detail?.display_date || card?.display_date || null,
        scopedMeta?.activity_periods || overview?.activity_periods || []
      );

  const universeNav =
    universeId != null && universeCards.length > 1
      ? (() => {
          const idx = universeCards.findIndex(
            (c) =>
              (c.leaf_id || c.id) === subseriesId &&
              (c.franchise_id === franchiseId ||
                !c.franchise_id ||
                c.module === (isFilm ? "movies" : "series"))
          );
          const fallback = universeCards.findIndex(
            (c) => (c.leaf_id || c.id) === subseriesId
          );
          const cur = idx >= 0 ? idx : fallback >= 0 ? fallback : 0;
          const len = universeCards.length;
          return {
            prev: universeCards[(cur - 1 + len) % len]!,
            next: universeCards[(cur + 1) % len]!,
          };
        })()
      : null;

  const siblingIndex = siblings.findIndex((s) => s.id === subseriesId);
  const n = siblings.length;
  const i = siblingIndex >= 0 ? siblingIndex : 0;
  const prevSub = universeNav
    ? null
    : n > 1
      ? siblings[(i - 1 + n) % n]
      : null;
  const nextSub = universeNav
    ? null
    : n > 1
      ? siblings[(i + 1) % n]
      : null;

  const openUniverseCard = (c: UniverseCard) => {
    const leaf = c.leaf_id || c.id || "";
    const fid = c.franchise_id || franchiseId;
    const mod = c.module || (isFilm ? "movies" : "series");
    if (onOpenUniverseLeaf) {
      onOpenUniverseLeaf({
        module: mod === "movies" ? "movies" : "series",
        franchiseId: fid,
        leafId: leaf,
      });
      return;
    }
    onNavigate({
      franchiseId: fid,
      subseriesId: leaf,
      seasonId: undefined,
      section: "overview",
      universeId,
    });
  };

  const prevNeighbor = universeNav
    ? {
        label: universeNav.prev.title || universeNav.prev.name || "Previous",
        onClick: () => openUniverseCard(universeNav.prev),
      }
    : prevSub
      ? { label: prevSub.title, onClick: () => openSibling(prevSub.id) }
      : null;
  const nextNeighbor = universeNav
    ? {
        label: universeNav.next.title || universeNav.next.name || "Next",
        onClick: () => openUniverseCard(universeNav.next),
      }
    : nextSub
      ? { label: nextSub.title, onClick: () => openSibling(nextSub.id) }
      : null;

  const galleryPath = detail?.folder_path || card?.folder_path || "";

  const writers = scopedMeta?.writers ?? overview?.writers ?? [];
  const directors =
    (overview as { directors?: string[] } | null)?.directors || [];
  const creators = isFilm ? (directors.length ? directors : writers) : writers;
  const genres = scopedMeta?.genres ?? overview?.genres ?? [];
  const publishers = scopedMeta?.publishers ?? overview?.publishers ?? [];
  const publisherFallback = publishers[0] || "";
  const country = scopedMeta?.country ?? overview?.country;
  const languages = scopedMeta?.languages ?? overview?.languages ?? [];
  const overviewBio = isFilm
    ? overview?.bio ?? scopedMeta?.bio
    : scopedMeta?.bio ?? overview?.bio;
  const languageOpts = useMemo(() => {
    const opts = overview?.language_options || [];
    const byCode = new Map(
      opts.map((o) => [o.code.toLowerCase(), o.label] as const)
    );
    const origin = (overview?.origin_language || "").toLowerCase();
    const ordered = [...languages];
    if (origin) {
      ordered.sort((a, b) => {
        const ao = a.toLowerCase() === origin ? 0 : 1;
        const bo = b.toLowerCase() === origin ? 0 : 1;
        return ao - bo;
      });
    }
    return ordered.map((code) => ({
      code,
      label: (byCode.get(code.toLowerCase()) || code).replace(
        /\s*\(origin\)\s*$/i,
        ""
      ),
    }));
  }, [languages, overview?.language_options, overview?.origin_language]);

  const storageScope = isFilm
    ? `film:${subseriesId}`
    : `sub:${franchiseId}:${subseriesId}`;

  const folderLogoState = useMemo(() => {
    const assets = detail?.logo_assets;
    if (
      assets &&
      (assets.default ||
        assets.any ||
        Object.keys(assets.variants || {}).length)
    ) {
      return resolveLanguageLogos(assets, languages);
    }
    return null;
  }, [detail?.logo_assets, languages]);

  const logosSwitchable = folderLogoState
    ? folderLogoState.logosSwitchable
    : Boolean(overview?.logos_switchable);

  const logoByLanguage = folderLogoState
    ? folderLogoState.logoByLanguage
    : overview?.logo_by_language || {};

  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);

  useEffect(() => {
    if (!languages.length) {
      setActiveLanguage(null);
      return;
    }
    const stored = readStoredLanguage(storageScope);
    const match = stored
      ? languages.find((c) => c.toLowerCase() === stored.toLowerCase())
      : null;
    const origin = overview?.origin_language;
    const next =
      match ||
      (origin &&
      languages.some((c) => c.toLowerCase() === origin.toLowerCase())
        ? origin
        : languages[0]);
    setActiveLanguage(next);
  }, [storageScope, languages, overview?.origin_language]);

  const selectLanguage = useCallback(
    (code: string) => {
      setActiveLanguage(code);
      writeStoredLanguage(storageScope, code);
    },
    [storageScope]
  );

  const distributor = useMemo(() => {
    const staff = overview?.cast?.staff || overview?.cast?.people || [];
    const origin = (overview?.origin_language || "").toLowerCase();
    const lang = (activeLanguage || origin || "").toLowerCase();
    const isOrigin = !lang || !origin || lang === origin;
    const prefer = isOrigin
      ? ["Studio", "Publisher"]
      : ["Dub Studio", "Studio", "Publisher"];
    for (const role of prefer) {
      const hit = staff.find((m) =>
        (m.roles || []).some(
          (r) => String(r).trim().toLowerCase() === role.toLowerCase()
        )
      );
      if (hit?.name) {
        return {
          name: hit.name,
          logo: hit.photo_url || null,
        };
      }
    }
    if (publisherFallback) {
      return { name: publisherFallback, logo: null as string | null };
    }
    return null;
  }, [
    overview?.cast?.staff,
    overview?.cast?.people,
    overview?.origin_language,
    activeLanguage,
    publisherFallback,
  ]);
  const publisher = distributor?.name || "";

  const langLogo =
    (activeLanguage &&
      (logoByLanguage[activeLanguage] ||
        Object.entries(logoByLanguage).find(
          ([k]) => k.toLowerCase() === activeLanguage.toLowerCase()
        )?.[1])) ||
    null;

  const photocards: ReleasePhotocardSet | null = useMemo(() => {
    const pc = detail?.photocards;
    if (pc && (pc.portrait_front || pc.landscape_front)) {
      return {
        portrait_front: pc.portrait_front || null,
        portrait_back: pc.portrait_back || pc.portrait_front || null,
        landscape_front: pc.landscape_front || null,
        landscape_back: pc.landscape_back || pc.landscape_front || null,
        cover_only: Boolean(pc.cover_only),
        landscape_back_cover: Boolean(
          (pc as { landscape_back_cover?: boolean }).landscape_back_cover
        ),
      };
    }
    const eras = (overview?.eras || []) as Array<{
      portrait_url?: string | null;
      landscape_url?: string | null;
      cover_url?: string | null;
      banner_url?: string | null;
    }>;
    const portrait =
      eras.find((e) => e.portrait_url)?.portrait_url ||
      eras.find((e) => e.cover_url)?.cover_url ||
      null;
    const landscape =
      eras.find((e) => e.landscape_url)?.landscape_url ||
      eras.find((e) => e.banner_url)?.banner_url ||
      null;
    const front = portrait || landscape || panelCoverUrl || null;
    if (!front || front === DEFAULT_DISC_URL) return null;
    const landscapeBack =
      (landscape && landscape !== portrait ? landscape : null) ||
      eras.find((e) => e.banner_url)?.banner_url ||
      portrait ||
      front;
    return {
      portrait_front: portrait || front,
      portrait_back:
        activeSeason?.cover_back_url || portrait || front,
      landscape_front: landscape || null,
      landscape_back: landscapeBack,
      cover_only: !portrait && !landscape,
      landscape_back_cover: Boolean(
        landscapeBack && landscapeBack !== landscape
      ),
    };
  }, [
    detail?.photocards,
    overview?.eras,
    panelCoverUrl,
    activeSeason?.cover_back_url,
  ]);

  const relatedMovies = useMemo(
    () => toMediaCards(overview?.related?.movies || []),
    [overview]
  );

  // Prefetch media tabs so empty ones can be hidden
  useEffect(() => {
    if (!franchiseId || !galleryPath) return;
    if (!isFilm && !title) return;
    let cancelled = false;
    const mediaKey = cacheKey(isFilm, franchiseId, subseriesId);
    const cachedMedia = subseriesMediaCache.get(mediaKey);
    if (cachedMedia && rescanTick === 0) {
      setMovieCards(cachedMedia.movieCards);
      setSeriesCards(cachedMedia.seriesCards ?? []);
      setAudioCards(cachedMedia.audioCards);
      setLibraryCards(cachedMedia.libraryCards);
      setGameCards(cachedMedia.gameCards);
      setMediaLoading(false);
      setMediaReady(true);
    } else {
      setMediaLoading(true);
    }
    const run = async () => {
      try {
        if (isFilm) {
          if (isBook) {
            const [workOv, audioData, gamesData, seriesData] = await Promise.all([
              fetchBooksFranchiseOverview(franchiseId).catch(() => null),
              fetchBooksBookAudio(subseriesId).catch(() => ({
                releases: [],
              })),
              fetchBooksFranchiseGames(franchiseId).catch(() => ({
                items: [],
              })),
              fetchBooksFranchiseSeries(franchiseId).catch(() => ({
                items: [],
              })),
            ]);
            if (cancelled) return;

            const bookItems = (
              (workOv as { films?: MoviesFilmCard[]; books?: MoviesFilmCard[] } | null)
                ?.books ||
              workOv?.films ||
              workOv?.subseries ||
              []
            ) as MoviesFilmCard[];
            const siblingBooks = bookItems.filter((f) => f.id !== subseriesId);

            // MORE BOOKS = other books in this franchise (not volumes of this leaf).
            setLibraryCards(
              toMediaCards(
                siblingBooks.map((m) => {
                  const film = m as MoviesFilmCard & {
                    portrait_url?: string | null;
                    landscape_url?: string | null;
                    hub_title?: string | null;
                  };
                  return {
                    ...film,
                    path: film.folder_path,
                    portrait_url: film.portrait_url || film.cover_url,
                    landscape_url: film.landscape_url || null,
                    banner_url:
                      film.banner_url ||
                      film.landscape_url ||
                      film.portrait_url ||
                      film.cover_url ||
                      null,
                    open_label:
                      film.open_label || (film.open_url ? "Read" : null),
                    open_mode:
                      film.open_mode ||
                      (film.open_url ? ("tab" as const) : null),
                    meta: film.hub_title || undefined,
                    subseries_id: film.hub_title || null,
                  };
                })
              )
            );

            const relatedMovies =
              (
                workOv as {
                  related?: { movies?: Array<Record<string, unknown>> };
                } | null
              )?.related?.movies || [];
            setMovieCards(
              toMediaCards(
                relatedMovies.map((m, i) => ({
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
                  display_date:
                    (m.display_date as string | null) ||
                    (m.date_iso as string | null) ||
                    null,
                  date_iso: (m.date_iso as string | null) || null,
                  path: (m.path as string | undefined) || undefined,
                  meta:
                    (m.subseries as string | undefined) ||
                    (m.hub_title as string | undefined) ||
                    undefined,
                  subseries_id:
                    (m.subseries as string | null) ||
                    (m.hub_title as string | null) ||
                    null,
                }))
              )
            );

            const relatedSeries =
              (
                workOv as {
                  related?: { series?: Array<Record<string, unknown>> };
                } | null
              )?.related?.series || [];
            let mappedSeries = mapRelatedSeriesCards(relatedSeries);
            if (!mappedSeries.length && (seriesData.items || []).length) {
              mappedSeries = mapRelatedSeriesCards(
                (seriesData.items || []) as Array<Record<string, unknown>>
              );
            }
            setSeriesCards(mappedSeries);

            const releases = (audioData.releases || []) as {
              id?: string;
              title?: string;
              name?: string;
              cover_url?: string | null;
              banner_url?: string | null;
              logo_url?: string | null;
              date_iso?: string | null;
              display_date?: string | null;
              release_date?: string | null;
              folder_path?: string | null;
              source_artist_name?: string | null;
              navigate_band_id?: number | null;
              navigate_release_id?: string | null;
              category?: string | null;
              meta?: string | null;
            }[];
            setAudioCards(
              toMediaCards(
                releases.map((r) => ({
                  id: r.id,
                  title: r.title || r.name,
                  cover_url: r.cover_url,
                  banner_url: r.banner_url,
                  logo_url: r.logo_url,
                  date_iso: r.date_iso,
                  display_date: r.display_date || r.release_date,
                  folder_path: r.folder_path || undefined,
                  path: r.folder_path || undefined,
                  meta:
                    [r.source_artist_name, r.meta].filter(Boolean).join(" · ") ||
                    undefined,
                  navigate_band_id: r.navigate_band_id,
                  navigate_release_id: r.navigate_release_id,
                  category: r.category || undefined,
                }))
              )
            );

            setGameCards(
              filterCardsForSubseries(
                toMediaCards(
                  (gamesData.items || []).map((it) => {
                    const row = it as {
                      id?: string;
                      title?: string;
                      name?: string;
                      cover_url?: string | null;
                      banner_url?: string | null;
                      logo_url?: string | null;
                      path?: string;
                      folder_path?: string;
                      date_iso?: string | null;
                      display_date?: string | null;
                      platform?: string | null;
                      open_url?: string | null;
                      open_mode?: "tab" | "local" | null;
                      open_label?: string | null;
                    };
                    return {
                      ...row,
                      open_label: row.open_label || "Play game",
                      open_mode: row.open_mode || "local",
                    };
                  })
                ),
                title,
                galleryPath
              )
            );
            setMediaReady(true);
            return;
          }

          const [workOv, audioData, libraryData, gamesData, seriesData] =
            await Promise.all([
              fetchMoviesFranchiseOverview(franchiseId).catch(() => null),
              fetchMoviesFilmAudio(subseriesId).catch(() => ({
                releases: [],
              })),
              fetchMoviesFranchiseLibrary(franchiseId).catch(() => ({
                items: [],
              })),
              fetchMoviesFranchiseGames(franchiseId).catch(() => ({
                items: [],
              })),
              fetchMoviesFranchiseSeries(franchiseId).catch(() => ({
                items: [],
              })),
            ]);
          if (cancelled) return;

          const filmItems = (workOv?.films || []) as MoviesFilmCard[];
          const siblingFilms = (
            filmItems.length
              ? filmItems
              : (workOv?.subseries || []).map((s) => ({
                  id: s.id,
                  title: s.title,
                  date_iso: s.date_iso,
                  display_date: s.display_date,
                  folder_path: s.folder_path,
                  cover_url: s.cover_url,
                  logo_url: s.logo_url,
                  open_url: null as string | null,
                  open_mode: null as "tab" | "local" | null,
                  open_label: null as string | null,
                }))
          ).filter((f) => f.id !== subseriesId);

          setMovieCards(
            toMediaCards(
              siblingFilms.map((m) => {
                const film = m as MoviesFilmCard & {
                  portrait_url?: string | null;
                  landscape_url?: string | null;
                };
                return {
                  ...film,
                  path: film.folder_path,
                  portrait_url: film.portrait_url || film.cover_url,
                  landscape_url: film.landscape_url || null,
                  banner_url:
                    film.banner_url ||
                    film.landscape_url ||
                    film.portrait_url ||
                    film.cover_url ||
                    null,
                  open_label:
                    film.open_label || (film.open_url ? "Play video" : null),
                  open_mode:
                    film.open_mode ||
                    (film.open_url ? ("local" as const) : null),
                };
              })
            )
          );

          const relatedSeries =
            (
              workOv as {
                related?: { series?: Array<Record<string, unknown>> };
              } | null
            )?.related?.series || [];
          let mappedSeries = mapRelatedSeriesCards(relatedSeries);
          if (!mappedSeries.length) {
            mappedSeries = (seriesData.items || []).map((raw) => {
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
                navigate_franchise_id: s.navigate_franchise_id || s.id,
              };
            });
          }
          setSeriesCards(mappedSeries);

          const releases = (audioData.releases || []) as {
            id?: string;
            title?: string;
            name?: string;
            cover_url?: string | null;
            banner_url?: string | null;
            logo_url?: string | null;
            date_iso?: string | null;
            display_date?: string | null;
            release_date?: string | null;
            folder_path?: string | null;
            source_artist_name?: string | null;
            navigate_band_id?: number | null;
            navigate_release_id?: string | null;
            category?: string | null;
            meta?: string | null;
          }[];
          setAudioCards(
            toMediaCards(
              releases.map((r) => ({
                id: r.id,
                title: r.title || r.name,
                cover_url: r.cover_url,
                banner_url: r.banner_url,
                logo_url: r.logo_url,
                date_iso: r.date_iso,
                display_date: r.display_date || r.release_date,
                folder_path: r.folder_path || undefined,
                path: r.folder_path || undefined,
                meta:
                  [r.source_artist_name, r.meta].filter(Boolean).join(" · ") ||
                  undefined,
                navigate_band_id: r.navigate_band_id,
                navigate_release_id: r.navigate_release_id,
                category: r.category || undefined,
              }))
            )
          );

          setLibraryCards(
            filterCardsForSubseries(
              toMediaCards(
                (libraryData.items || []).map((it) => {
                  const row = it as {
                    id?: string;
                    title?: string;
                    name?: string;
                    cover_url?: string | null;
                    banner_url?: string | null;
                    logo_url?: string | null;
                    path?: string;
                    folder_path?: string;
                    date_iso?: string | null;
                    display_date?: string | null;
                    open_url?: string | null;
                    open_mode?: "tab" | "local" | null;
                    open_label?: string | null;
                  };
                  return {
                    ...row,
                    open_label: row.open_label || "Read",
                    open_mode: row.open_mode || (row.open_url ? "tab" : null),
                  };
                })
              ),
              title,
              galleryPath
            )
          );

          setGameCards(
            filterCardsForSubseries(
              toMediaCards(
                (gamesData.items || []).map((it) => {
                  const row = it as {
                    id?: string;
                    title?: string;
                    name?: string;
                    cover_url?: string | null;
                    banner_url?: string | null;
                    logo_url?: string | null;
                    path?: string;
                    folder_path?: string;
                    date_iso?: string | null;
                    display_date?: string | null;
                    platform?: string | null;
                    open_url?: string | null;
                    open_mode?: "tab" | "local" | null;
                    open_label?: string | null;
                  };
                  return {
                    ...row,
                    open_label: row.open_label || "Play game",
                    open_mode: row.open_mode || "local",
                  };
                })
              ),
              title,
              galleryPath
            )
          );
          setMediaReady(true);
          return;
        }

        const [moviesData, audioData, libraryData, gamesData] =
          await Promise.all([
            fetchSeriesFranchiseMovies(franchiseId).catch(() => ({ items: [] })),
            fetchSeriesFranchiseAudio(franchiseId).catch(() => ({
              releases: [],
            })),
            fetchSeriesFranchiseLibrary(franchiseId).catch(() => ({
              items: [],
            })),
            fetchSeriesFranchiseGames(franchiseId).catch(() => ({ items: [] })),
          ]);
        if (cancelled) return;

        setSeriesCards([]);

        const movieItems = (moviesData.items || []) as {
          id?: string;
          title?: string;
          cover_url?: string | null;
          portrait_url?: string | null;
          landscape_url?: string | null;
          banner_url?: string | null;
          logo_url?: string | null;
          path?: string;
          date_iso?: string | null;
          display_date?: string | null;
          open_url?: string | null;
          open_mode?: "tab" | "local" | null;
          open_label?: string | null;
          duration?: string | null;
          duration_sec?: number | null;
        }[];
        setMovieCards(
          filterCardsForSubseries(
            movieItems.length
              ? toMediaCards(
                  movieItems.map((m) => ({
                    ...m,
                    portrait_url: m.portrait_url || m.cover_url,
                    landscape_url: m.landscape_url || null,
                    banner_url:
                      m.banner_url ||
                      m.landscape_url ||
                      m.portrait_url ||
                      m.cover_url ||
                      null,
                    open_label: m.open_label || "Play video",
                    open_mode: m.open_mode || (m.open_url ? "tab" : null),
                  }))
                )
              : relatedMovies.map((m) => ({
                  ...m,
                  open_label: m.open_label || "Play video",
                  open_mode: m.open_mode || (m.open_url ? "tab" : null),
                })),
            title,
            galleryPath
          )
        );

        const releases = (audioData.releases || []) as {
          id?: string;
          title?: string;
          name?: string;
          cover_url?: string | null;
          banner_url?: string | null;
          logo_url?: string | null;
          date_iso?: string | null;
          display_date?: string | null;
          release_date?: string | null;
          folder_path?: string | null;
          subseries_path?: string | null;
          subseries_title?: string | null;
          source_artist_name?: string | null;
          navigate_band_id?: number | null;
          navigate_release_id?: string | null;
          category?: string | null;
          is_series_playlist?: boolean;
          playlist_kind?: string | null;
          meta?: string | null;
        }[];
        setAudioCards(
          filterCardsForSubseries(
            toMediaCards(
              releases
                .filter((r) => !r.is_series_playlist)
                .map((r) => ({
                id: r.id,
                title: r.title || r.name,
                cover_url: r.cover_url,
                banner_url: r.banner_url,
                logo_url: r.logo_url,
                date_iso: r.date_iso,
                display_date: r.display_date || r.release_date,
                folder_path: r.folder_path || r.subseries_path || undefined,
                path: r.folder_path || r.subseries_path || undefined,
                meta:
                  [
                    r.subseries_title,
                    r.source_artist_name,
                    r.meta,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined,
                navigate_band_id: r.navigate_band_id,
                navigate_release_id: r.navigate_release_id,
                category: r.category || undefined,
              }))
            ),
            title,
            galleryPath
          )
        );

        setLibraryCards(
          filterCardsForSubseries(
            toMediaCards(
              (libraryData.items || []).map((it) => {
                const row = it as {
                  id?: string;
                  title?: string;
                  name?: string;
                  cover_url?: string | null;
                  banner_url?: string | null;
                  logo_url?: string | null;
                  path?: string;
                  folder_path?: string;
                  date_iso?: string | null;
                  display_date?: string | null;
                  open_url?: string | null;
                  open_mode?: "tab" | "local" | null;
                  open_label?: string | null;
                };
                return {
                  ...row,
                  open_label: row.open_label || "Read",
                  open_mode: row.open_mode || (row.open_url ? "tab" : null),
                };
              })
            ),
            title,
            galleryPath
          )
        );

        setGameCards(
          filterCardsForSubseries(
            toMediaCards(
              (gamesData.items || []).map((it) => {
                const row = it as {
                  id?: string;
                  title?: string;
                  name?: string;
                  cover_url?: string | null;
                  banner_url?: string | null;
                  logo_url?: string | null;
                  path?: string;
                  folder_path?: string;
                  date_iso?: string | null;
                  display_date?: string | null;
                  platform?: string | null;
                  open_url?: string | null;
                  open_mode?: "tab" | "local" | null;
                  open_label?: string | null;
                };
                return {
                  ...row,
                  open_label: row.open_label || "Play game",
                  open_mode: row.open_mode || "local",
                };
              })
            ),
            title,
            galleryPath
          )
        );
      } catch {
        /* leave previous */
      } finally {
        if (!cancelled) {
          setMediaLoading(false);
          setMediaReady(true);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    franchiseId,
    subseriesId,
    title,
    galleryPath,
    relatedMovies,
    rescanTick,
    isFilm,
    isBook,
  ]);

  useEffect(() => {
    if (!mediaReady) return;
    const key = cacheKey(isFilm, franchiseId, subseriesId);
    subseriesMediaCache.set(key, {
      movieCards,
      seriesCards,
      audioCards,
      libraryCards,
      gameCards,
    });
  }, [
    mediaReady,
    movieCards,
    seriesCards,
    audioCards,
    libraryCards,
    gameCards,
    isFilm,
    franchiseId,
    subseriesId,
  ]);

  const gamePlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const g of gameCards) {
      if (g.platform) set.add(g.platform);
    }
    return sortGamePlatforms(Array.from(set));
  }, [gameCards]);

  useEffect(() => {
    if (gamePlatform !== "all" && !gamePlatforms.includes(gamePlatform)) {
      setGamePlatform("all");
    }
  }, [gamePlatforms, gamePlatform]);

  const filteredGames = useMemo(() => {
    if (gamePlatform === "all" || !gamePlatforms.includes(gamePlatform)) {
      return gameCards;
    }
    return gameCards.filter((g) => g.platform === gamePlatform);
  }, [gameCards, gamePlatform, gamePlatforms]);

  const {
    present: audioCategories,
    categoryKey: audioCategory,
    setCategoryKey: setAudioCategory,
    filtered: filteredAudio,
  } = useSeriesAudioCategories(audioCards);

  const episodeMovies: SeriesEpisodeItem[] = useMemo(() => {
    // Prefer Movies-tab cards (franchise Movies/ paths with real open_url + duration).
    const source =
      movieCards.length > 0
        ? movieCards
        : filterCardsForSubseries(
            relatedMovies,
            title,
            detail?.folder_path || card?.folder_path || ""
          );
    if (source.length) {
      return source.map((m, i) => ({
        id: m.id || `mov-${i}`,
        number: null,
        title: m.title,
        play_path: m.path || "",
        open_url: m.open_url || null,
        kind: "movie" as const,
        cover_url: m.cover_url,
        folder_path: m.path,
        display_date: m.display_date || m.date_label || null,
        date_iso: m.date_iso || null,
        duration: m.duration || null,
        duration_sec: m.duration_sec ?? null,
      }));
    }
    return localMovies;
  }, [
    movieCards,
    relatedMovies,
    localMovies,
    title,
    detail?.folder_path,
    card?.folder_path,
  ]);

  const showMediaLayoutPicker =
    tab === "series" ||
    tab === "movies" ||
    tab === "audio" ||
    tab === "library" ||
    tab === "games";

  const hasEpisodes =
    !isFilm &&
    (seasons.length > 0 ||
      episodeMovies.length > 0 ||
      (card?.season_count ?? 0) > 0);
  const siblingMovieCount = siblings.filter((s) => s.id !== subseriesId).length;

  const bookHubOptions = useMemo(() => {
    if (!isBook) return [] as { id: string; title: string }[];
    const byTitle = new Map<string, string>();
    const addHub = (raw: string | null | undefined) => {
      const hub = (raw || "").trim();
      if (!hub) return;
      const key = hub.toLowerCase();
      if (!byTitle.has(key)) byTitle.set(key, hub);
    };
    for (const s of siblings) {
      addHub((s as { hub_title?: string }).hub_title || s.title);
    }
    for (const c of movieCards) {
      addHub(c.meta || c.subseries_id || undefined);
    }
    for (const c of libraryCards) {
      addHub(c.meta || c.subseries_id || undefined);
    }
    const hubs = Array.from(byTitle.values());
    if (hubs.length <= 1) return [];
    return [
      { id: "all", title: "All" },
      ...hubs.map((t) => ({ id: `hub:${t}`, title: t })),
    ];
  }, [isBook, siblings, movieCards, libraryCards]);

  const filterByBookHub = useCallback(
    (cards: SeriesMediaCard[]) => {
      if (!isBook || bookHubFilter === "all") return cards;
      const want = bookHubOptions
        .find((o) => o.id === bookHubFilter)
        ?.title?.toLowerCase();
      if (!want) return cards;
      return cards.filter(
        (c) => (c.meta || c.subseries_id || "").toLowerCase() === want
      );
    },
    [isBook, bookHubFilter, bookHubOptions]
  );

  const filteredLibraryCards = useMemo(
    () => filterByBookHub(libraryCards),
    [filterByBookHub, libraryCards]
  );
  const filteredMovieCards = useMemo(
    () => filterByBookHub(movieCards),
    [filterByBookHub, movieCards]
  );

  const activeBookHubOptions = useMemo(() => {
    if (!isBook || bookHubOptions.length <= 1) return [] as typeof bookHubOptions;
    const cards =
      tab === "movies"
        ? movieCards
        : tab === "library"
          ? libraryCards
          : [];
    if (!cards.length) return [] as typeof bookHubOptions;
    const hubs = bookHubOptions.filter((o) => {
      if (o.id === "all") return true;
      const want = o.title.toLowerCase();
      return cards.some(
        (c) => (c.meta || c.subseries_id || "").toLowerCase() === want
      );
    });
    return hubs.filter((o) => o.id !== "all").length > 1 ? hubs : [];
  }, [isBook, bookHubOptions, tab, movieCards, libraryCards]);

  const relatedSeriesCount = overview?.related?.series?.length ?? 0;
  const hasSeries =
    seriesCards.length > 0 ||
    Boolean(overview?.media?.has_series) ||
    relatedSeriesCount > 0;
  const hasMovies = isBook
    ? movieCards.length > 0
    : isFilm
      ? siblingMovieCount > 0 || movieCards.length > 0
      : movieCards.length > 0;
  const hasMoreBooks =
    siblingMovieCount > 0 || libraryCards.length > 0;
  const hasAudio = audioCards.length > 0;
  const hasLibrary = libraryCards.length > 0;
  const hasGames = gameCards.length > 0;
  const hasGallery = Boolean(
    detail?.has_gallery ||
      card?.has_gallery ||
      // Prefer showing Gallery while folder detail is still loading
      (loading && (card?.folder_path || detail?.folder_path))
  );

  const tabs: { id: SubseriesTab; label: string }[] = useMemo(() => {
    const all: { id: SubseriesTab; label: string }[] = isBook
      ? [
          { id: "overview", label: stacked ? "INFO" : "OVERVIEW" },
          { id: "episodes", label: stacked ? "VOLS" : "VOLUMES" },
          {
            id: "library",
            label: stacked ? "MORE" : "MORE BOOKS",
          },
          { id: "series", label: "SERIES" },
          { id: "movies", label: "MOVIES" },
          { id: "audio", label: "AUDIO" },
          { id: "games", label: "GAMES" },
          { id: "gallery", label: stacked ? "ART" : "GALLERY" },
        ]
      : isFilm
        ? [
            { id: "overview", label: stacked ? "INFO" : "OVERVIEW" },
            {
              id: "movies",
              label: stacked ? "MORE" : "MORE MOVIES",
            },
            { id: "series", label: "SERIES" },
            { id: "audio", label: "AUDIO" },
            { id: "library", label: "LIBRARY" },
            { id: "games", label: "GAMES" },
            { id: "gallery", label: stacked ? "ART" : "GALLERY" },
          ]
        : [
            { id: "overview", label: stacked ? "INFO" : "OVERVIEW" },
            { id: "episodes", label: stacked ? "EPS" : "EPISODES" },
            {
              id: "series",
              label: stacked ? "MORE" : "MORE SERIES",
            },
            { id: "movies", label: "MOVIES" },
            { id: "audio", label: "AUDIO" },
            { id: "library", label: "LIBRARY" },
            { id: "games", label: "GAMES" },
            { id: "gallery", label: stacked ? "ART" : "GALLERY" },
          ];
    return all.filter((t) => {
      if (t.id === "overview") return true;
      if (t.id === "episodes")
        return isBook
          ? filmVersions.length > 1
          : !isFilm && (hasEpisodes || loading);
      // Prefer overview media flags so empty tabs never flash before folder scans finish.
      const media = overview?.media;
      if (t.id === "gallery") {
        return (
          hasGallery ||
          Boolean(media?.has_gallery) ||
          (loading && !overview && Boolean(card?.folder_path || detail?.folder_path))
        );
      }
      if (t.id === "series" && !isFilm && !isBook) {
        return siblingMovieCount > 0;
      }
      if (t.id === "series") {
        if (!mediaReady) {
          return (
            Boolean(media?.has_series) || relatedSeriesCount > 0
          );
        }
        return hasSeries;
      }
      if (t.id === "movies" && isFilm && !isBook) {
        return siblingMovieCount > 0;
      }
      if (!mediaReady) {
        if (t.id === "movies")
          return isBook
            ? Boolean(media?.has_movies) ||
                (overview?.related?.movies?.length || 0) > 0
            : Boolean(media?.has_movies);
        if (t.id === "audio") return Boolean(media?.has_audio);
        if (t.id === "library")
          return isBook
            ? hasMoreBooks || Boolean(media?.has_library)
            : Boolean(media?.has_library);
        if (t.id === "games") return Boolean(media?.has_games);
        return false;
      }
      if (t.id === "movies") return hasMovies;
      if (t.id === "audio") return hasAudio;
      if (t.id === "library")
        return isBook ? hasMoreBooks || hasLibrary : hasLibrary;
      if (t.id === "games") return hasGames;
      return true;
    });
  }, [
    stacked,
    isBook,
    isFilm,
    hasEpisodes,
    hasGallery,
    loading,
    mediaReady,
    hasMovies,
    hasSeries,
    hasMoreBooks,
    siblingMovieCount,
    relatedSeriesCount,
    hasAudio,
    hasLibrary,
    hasGames,
    overview?.media,
    overview?.related?.movies?.length,
    overview,
    card?.folder_path,
    detail?.folder_path,
    filmVersions.length,
  ]);

  /** Leaf pages get Related when there is anything to show (universes / talent / similar). */
  const leafUniverseMemberships = useMemo(() => {
    if (leafUniverses.length) return leafUniverses;
    if (overview?.universes?.length) return overview.universes;
    if (overview?.universe) return [overview.universe];
    return [] as Universe[];
  }, [leafUniverses, overview?.universes, overview?.universe]);

  const relatedUniverseRows = useMemo(() => {
    return leafUniverseMemberships
      .map((u) => {
        const groupCount =
          overview?.related?.universe_groups?.find((g) => g.id === u.id)
            ?.count ??
          overview?.related?.universe?.filter(
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
      .filter(
        (row): row is readonly ["universe", string, number, number] =>
          row != null
      );
  }, [leafUniverseMemberships, overview?.related]);

  /** Overview about/links/related subbar: franchise hub only; standalone leaves keep it. */
  const showLeafOverviewSubbar = siblings.length <= 1;

  const showLeafRelated =
    showLeafOverviewSubbar &&
    (relatedUniverseRows.length > 0 ||
      Boolean(overview?.related?.creator_count) ||
      Boolean(overview?.related?.similar_count) ||
      Boolean(overview?.related?.creator?.length) ||
      Boolean(overview?.related?.similar?.length) ||
      Boolean(overview?.links?.categories?.length));

  useEffect(() => {
    if (showLeafOverviewSubbar) return;
    if (overviewTab === "links" || overviewTab === "related") {
      onNavigate?.({ overviewTab: "about" });
    }
  }, [showLeafOverviewSubbar, overviewTab, onNavigate]);

  useEffect(() => {
    if (overviewTab !== "related") return;
    if (relatedUniverseRows.length) {
      setRelatedTab("universe");
      return;
    }
    setRelatedTab((prev) => (prev === "universe" ? "creator" : prev));
  }, [overviewTab, relatedUniverseRows]);

  useEffect(() => {
    if (loading) return;
    if (!tabs.some((t) => t.id === tab)) {
      onNavigate({
        subseriesId,
        seasonId: expandedSeasonId || seasonId,
        section: "overview",
      });
    }
  }, [tabs, tab, onNavigate, subseriesId, expandedSeasonId, seasonId, loading]);

  const setTab = (next: SubseriesTab) => {
    onNavigate({
      subseriesId,
      seasonId: expandedSeasonId || seasonId,
      section: tabToSection(next),
    });
  };

  const openSibling = (sid: string) => {
    if (isFilm) {
      if (onOpenFilm) onOpenFilm(sid);
      else
        onNavigate({
          subseriesId: sid,
          seasonId: undefined,
          section: "overview",
        });
      return;
    }
    onNavigate({
      subseriesId: sid,
      seasonId: undefined,
      section: tabToSection(tab),
    });
  };

  const openSiblingFilm = (filmId: string) => {
    if (onOpenFilm) onOpenFilm(filmId);
    else
      onNavigate({
        subseriesId: filmId,
        seasonId: undefined,
        section: "overview",
      });
  };

  const playFilmInTab = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const filmPlayUrl = filmVersions[0]?.file_url?.trim() || null;
  const canPlayFilm = Boolean(filmPlayUrl) || filmHasVideo;
  const filmExtraItems = useMemo(
    () => [...openingVideos, ...endingVideos, ...extraVideos],
    [openingVideos, endingVideos, extraVideos]
  );

  const openTrailerEditor = () => {
    setTrailerDraft(trailerUrl || "");
    setTrailerSaveError(null);
    setTrailerEditorOpen((v) => !v);
    setExtrasMenuOpen(false);
  };

  const saveTrailer = () => {
    const trimmed = trailerDraft.trim() || null;
    setTrailerSaveError(null);
    void saveMoviesFilmTrailer(subseriesId, trimmed)
      .then((res) => {
        setTrailerUrl(res.trailer_url);
        setTrailerEditorOpen(false);
        setTrailerSaveError(null);
        const key = cacheKey(isFilm, franchiseId, subseriesId);
        const prev = subseriesPageCache.get(key);
        if (prev) {
          subseriesPageCache.set(key, {
            ...prev,
            trailerUrl: res.trailer_url,
          });
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setTrailerSaveError(msg || "Failed to save trailer");
      });
  };

  const playExtra = (ep: SeriesEpisodeItem) => {
    const mediaUrl = extraPlayUrl(ep);
    if (!mediaUrl) return;
    window.open(mediaUrl, "_blank", "noopener,noreferrer");
    setExtrasMenuOpen(false);
  };

  const toggleExtrasMenu = () => {
    if (filmExtraItems.length === 1) {
      playExtra(filmExtraItems[0]);
      return;
    }
    setExtrasMenuOpen((v) => !v);
    setTrailerEditorOpen(false);
  };

  const selectSeasonCover = (s: SeriesSeasonCard) => {
    // Desktop left panel: portrait (landscape only if no portrait).
    const portrait = s.portrait_url || s.cover_url || null;
    // Stacked/banner & background: banner → landscape → portrait.
    const wide =
      s.banner_url || s.landscape_url || s.portrait_url || s.cover_url || null;
    setFocusCoverUrl(portrait);
    setFocusBgUrl(wide);
  };

  const selectVolumeCover = (v: {
    id?: string;
    cover_url?: string | null;
    portrait_url?: string | null;
    banner_url?: string | null;
    landscape_url?: string | null;
    display_date?: string | null;
    date_iso?: string | null;
    file_url?: string | null;
    open_url?: string | null;
  }) => {
    const portrait = v.portrait_url || v.cover_url || null;
    const wide =
      v.banner_url || v.landscape_url || v.portrait_url || v.cover_url || null;
    setActiveVolumeId(v.id || null);
    setFocusCoverUrl(portrait);
    setFocusBgUrl(wide);
    if (v.display_date || v.date_iso) {
      setVolumeDateLabel(
        v.display_date || formatTrackDate(v.date_iso) || null
      );
    }
    const url = (v.file_url || v.open_url || "").trim();
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  useEffect(() => {
    if (tab !== "episodes") return;
    if (!expandedSeasonId || moviesExpanded || extrasExpanded) return;
    const s = seasons.find((x) => x.id === expandedSeasonId);
    if (s) selectSeasonCover(s);
  }, [tab, expandedSeasonId, seasons, moviesExpanded, extrasExpanded]);

  const toggleSeason = (s: SeriesSeasonCard) => {
    if (expandedSeasonId !== s.id) {
      setExpandedSeasonId(s.id);
      setMoviesExpanded(false);
      setExtrasExpanded(false);
    } else {
      setExpandedSeasonId(null);
    }
    if (tab === "episodes") selectSeasonCover(s);
    onNavigate({
      subseriesId,
      seasonId: s.id,
      section: tab === "episodes" ? "episodes" : tabToSection(tab),
    });
  };

  const selectMovieBlock = () => {
    setMoviesExpanded(true);
    setExpandedSeasonId(null);
    setExtrasExpanded(false);
    const first = localMovies[0] || relatedMovies[0];
    const url =
      (first && "cover_url" in first
        ? (first as { cover_url?: string | null }).cover_url
        : null) || baseCover;
    setFocusCoverUrl(url || null);
    setFocusBgUrl(url || null);
  };

  const toggleExtras = () => {
    setExtrasExpanded((v) => {
      const next = !v;
      if (next) {
        setMoviesExpanded(false);
        setExpandedSeasonId(null);
      }
      return next;
    });
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
    if (item.navigate_franchise_id || tab === "series") {
      const seriesId = item.navigate_franchise_id || item.id;
      if (seriesId && onOpenSeriesFranchise) {
        if (isBook || (isFilm && !isBook)) {
          saveSeriesEntryReferrer({
            kind: isBook ? "books" : "movies",
            franchiseId,
            ...(isBook ? { bookId: subseriesId } : { filmId: subseriesId }),
            section: "series",
            title: workName || franchiseName || title,
            universeId,
          });
        }
        onOpenSeriesFranchise(
          seriesId,
          item.navigate_subseries_id,
          universeId
        );
        return;
      }
    }
    const diskPath = (item.path || "").replace(/\\/g, "/");
    if (
      onOpenMoviesPath &&
      diskPath.toLowerCase().startsWith("movies/")
    ) {
      if (isBook) {
        saveSeriesEntryReferrer({
          kind: "books",
          franchiseId,
          bookId: subseriesId,
          section: "movies",
          title: workName || franchiseName || title,
          universeId,
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
    if (
      onOpenSeriesFranchise &&
      diskPath.toLowerCase().startsWith("series/")
    ) {
      const parts = diskPath.split("/").filter(Boolean);
      const seriesId = parts[2];
      const subId = parts.length >= 4 ? parts[3] : undefined;
      if (seriesId) {
        if (isBook || (isFilm && !isBook)) {
          saveSeriesEntryReferrer({
            kind: isBook ? "books" : "movies",
            franchiseId,
            ...(isBook ? { bookId: subseriesId } : { filmId: subseriesId }),
            section: "series",
            title: workName || franchiseName || title,
            universeId,
          });
        }
        onOpenSeriesFranchise(seriesId, subId, universeId);
        return;
      }
    }
    if (isFilm && !isBook && tab === "movies" && item.id) {
      openSiblingFilm(item.id);
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

  useEffect(() => {
    if (tab !== "overview") setMoreInfoOpen(false);
  }, [tab]);

  const resolvedLogoUrl =
    langLogo ||
    detail?.logo_url ||
    card?.logo_url ||
    overview?.logo_url ||
    franchiseLogoUrl ||
    null;
  const resolvedIconUrl =
    detail?.icon_url ||
    card?.icon_url ||
    overview?.icon_url ||
    franchiseIconUrl ||
    null;
  if (resolvedLogoUrl) cachedLogoRef.current = resolvedLogoUrl;
  if (resolvedIconUrl) cachedIconRef.current = resolvedIconUrl;
  const topLogoUrl = resolvedLogoUrl || cachedLogoRef.current;
  const topIconUrl = resolvedIconUrl || cachedIconRef.current;
  useEffect(() => {
    setLogoFailed(false);
    setIconFailed(false);
  }, [topLogoUrl, topIconUrl, subseriesId]);
  const showLogo = Boolean(topLogoUrl && !logoFailed);
  const showIcon = Boolean(topIconUrl && !iconFailed);
  const brandPending = loading && !showLogo && !showIcon;
  const showTitleFallback = !brandPending && !showLogo && !showIcon;
  const topIcon = showIcon ? (
    <img
      src={topIconUrl!}
      alt=""
      className="release-page__brand-icon"
      onError={() => setIconFailed(true)}
    />
  ) : null;
  const topLogo = showLogo ? (
    <img
      src={topLogoUrl!}
      alt=""
      className="release-page__brand-logo"
      onError={() => setLogoFailed(true)}
    />
  ) : null;

  const pageClass = [
    "release-page",
    "series-subseries-page",
    stacked ? "release-page--stacked" : "",
    mobilePortrait ? "series-subseries-page--mobile-portrait" : "",
    tabletPortrait ? "series-subseries-page--tablet-portrait" : "",
    mobileLandscape ? "release-page--mobile-landscape" : "",
    tabletLayout ? "release-page--tablet" : "",
    tabletPortrait ? "release-page--tablet-portrait" : "",
    tab === "overview" ? "release-page--overview" : "",
    tab === "overview" && overviewTab === "related"
      ? "release-page--related-open release-page--scroll"
      : "",
    bgLayers.current ? "release-page--has-bg" : "",
    seriesPlaying ? "release-page--beat-ready release-page--playing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const franchiseBackLabel = (
    backLabelOverride ||
    (isFilm ? workName : null) ||
    (isFilm ? franchiseName : null) ||
    overview?.name ||
    franchiseName ||
    "FRANCHISE"
  ).toUpperCase();
  const backUsesIcon = Boolean(franchiseIconUrl && stacked && !backLabelOverride);
  const backLabel = stacked
    ? backUsesIcon
      ? null
      : backLabelOverride
        ? backLabelOverride.toUpperCase()
        : "Back"
    : franchiseBackLabel;
  const backAriaLabel = `Back to ${franchiseBackLabel}`;

  if (opedOpen) {
    return (
      <SeriesOpeningsEndingsPage
        franchiseId={franchiseId}
        franchiseName={overview?.name || franchiseName}
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

  return (
    <div className={pageClass}>
      <div className="release-page__bg-stack" aria-hidden>
        {bgLayers.outgoing ? (
          <div
            className="release-page__bg release-page__bg--visible release-page__bg--out"
            style={
              {
                backgroundImage: `url("${bgLayers.outgoing}")`,
              } as CSSProperties
            }
          />
        ) : null}
        {bgLayers.current ? (
          <div
            className={`release-page__bg release-page__bg--visible${
              bgLayers.outgoing ? " release-page__bg--in" : ""
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

      <div className="release-page__chrome">
        <header className="release-page__top">
          <div className="release-page__top-left">
            <button
              type="button"
              className="release-page__back"
              onClick={onBack}
              aria-label={backAriaLabel}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M15 6l-6 6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {backUsesIcon ? (
                <img
                  src={franchiseIconUrl!}
                  alt=""
                  className="series-subseries-page__back-icon"
                />
              ) : backLabel ? (
                <span
                  className={
                    backLabel === "Back"
                      ? "series-subseries-page__back-label series-subseries-page__back-label--short"
                      : "series-subseries-page__back-label"
                  }
                >
                  {backLabel}
                </span>
              ) : null}
            </button>
          </div>
          <div className="release-page__top-center">
            {topIcon ? (
              <MediaBeatFrame variant="logo">{topIcon}</MediaBeatFrame>
            ) : null}
            {topLogo ? (
              <MediaBeatFrame variant="logo">{topLogo}</MediaBeatFrame>
            ) : null}
            {showTitleFallback ? (
              <span className="release-page__brand-name">{title}</span>
            ) : !topIcon && !topLogo ? (
              <span
                className="release-page__brand-logo release-page__brand-logo--pending"
                aria-hidden
              />
            ) : null}
          </div>
          <div className="release-page__top-right">
            {busy ? <span className="muted">{busy}</span> : null}
            {!stacked && showMediaLayoutPicker ? (
              <ReleaseCardLayoutPicker
                value={cardLayout}
                onChange={setCardLayoutPersisted}
              />
            ) : null}
            {!stacked &&
            tab === "overview" &&
            overviewTab === "related" &&
            onSetOrientation ? (
              <CardOrientationPicker
                value={cardOrientation}
                onChange={onSetOrientation}
              />
            ) : null}
            {!isFilm || hasAudio ? (
              !stacked ? (
                <SeriesAudioPlayer
                  franchiseId={franchiseId}
                  filmId={isFilm ? subseriesId : undefined}
                  enabled={!isFilm || hasAudio}
                  onPlayingChange={setSeriesPlaying}
                  open={playerOpen}
                  onOpenChange={setPlayerOpen}
                />
              ) : (
                <SeriesAudioPlayer
                  franchiseId={franchiseId}
                  filmId={isFilm ? subseriesId : undefined}
                  enabled={!isFilm || hasAudio}
                  onPlayingChange={setSeriesPlaying}
                  open={playerOpen}
                  onOpenChange={setPlayerOpen}
                  hideToggle
                />
              )
            ) : null}
            {siblings.length > 1 ? (
              <MediaInlineSearch
                mode="series-subseries"
                items={siblings.map((s) => ({ id: s.id, title: s.title }))}
                onSelectSubseries={(id) => {
                  if (id === subseriesId) return;
                  openSibling(id);
                }}
              />
            ) : null}
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              artistThemeActive
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              menuVariant="release"
              editDataLabel={
                isBook
                  ? "Update book"
                  : isFilm
                    ? "Update movie"
                    : "Update series"
              }
              editDataFlat
              onAddToUniverse={
                isAdmin ? () => setAddUniverseOpen(true) : undefined
              }
              menuChrome={
                stacked &&
                (showMediaLayoutPicker || !isFilm || hasAudio) ? (
                  <>
                    {showMediaLayoutPicker ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCardLayoutPersisted(
                            cardLayout === "cover" ? "banner" : "cover"
                          )
                        }
                      >
                        {cardLayout === "cover" ? (
                          <IconCardCover className="menu-item-icon" />
                        ) : (
                          <IconCardBanner className="menu-item-icon" />
                        )}
                        {cardLayout === "cover"
                          ? "Cover view"
                          : "Banner view"}
                      </button>
                    ) : null}
                    {(!isFilm || hasAudio) ? (
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
                ) : undefined
              }
              onEditAbout={
                isAdmin && overview
                  ? () => setAboutEditOpen(true)
                  : undefined
              }
              onAddMember={
                isAdmin
                  ? () => {
                      window.setTimeout(() => setAddCastOpen(true), 0);
                    }
                  : undefined
              }
              onAddLink={
                isAdmin &&
                showLeafOverviewSubbar &&
                tab === "overview" &&
                overviewTab === "links"
                  ? () => setAddLinkOpen(true)
                  : undefined
              }
              onAddSimilar={
                isAdmin &&
                showLeafOverviewSubbar &&
                tab === "overview" &&
                overviewTab === "related" &&
                relatedTab !== "universe"
                  ? () => setAddRelatedOpen(true)
                  : undefined
              }
              addSimilarLabel={
                relatedTab === "creator"
                  ? isBook
                    ? "Add same author book"
                    : isFilm
                      ? "Add same crew film"
                      : "Add same author series"
                  : isBook
                    ? "Add similar book"
                    : isFilm
                      ? "Add similar film"
                      : "Add similar series"
              }
              onRefreshMetadata={
                isAdmin
                  ? () => {
                      setMetadataFetching(true);
                      void (isFilm
                        ? refreshMoviesFilmMetadata(subseriesId, true)
                        : refreshSeriesMetadata(franchiseId, refreshBio)
                      )
                        .then(() => {
                          setRescanTick((t) => t + 1);
                          return loadCard();
                        })
                        .catch((e) =>
                          setError(
                            e instanceof Error ? e.message : String(e)
                          )
                        )
                        .finally(() => setMetadataFetching(false));
                    }
                  : undefined
              }
              refreshIncludeBio={!isFilm ? refreshBio : undefined}
              onRefreshIncludeBioChange={
                isAdmin && !isFilm ? setRefreshBio : undefined
              }
              onRescanLibrary={
                isAdmin
                  ? () => {
                      void rescanSeriesLocalData(true)
                        .then(() => {
                          setMediaReady(false);
                          setRescanTick((t) => t + 1);
                          void loadCard();
                        })
                        .catch(() => {});
                    }
                  : undefined
              }
            />
          </div>
        </header>

        {metadataFetching ? (
          <div
            className="release-page__fetch-overlay"
            role="status"
            aria-live="polite"
          >
            <MyStackIcon
              className="release-page__fetch-overlay-logo"
              size={52}
            />
            <p className="release-page__fetch-overlay-msg">
              Fetching data, please wait...
            </p>
          </div>
        ) : null}

        <nav className="release-page__tabs" aria-label="Subseries sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        {tab === "games" && gamePlatforms.length > 1 ? (
          <div
            className="series-section-subbar"
            role="tablist"
            aria-label="Game platforms"
          >
            <button
              type="button"
              className={gamePlatform === "all" ? "active" : ""}
              onClick={() => setGamePlatform("all")}
            >
              All
            </button>
            {gamePlatforms.map((p) => (
              <button
                key={p}
                type="button"
                className={gamePlatform === p ? "active" : ""}
                onClick={() => setGamePlatform(p)}
              >
                {p}
              </button>
            ))}
          </div>
        ) : null}

        {isBook &&
        (tab === "movies" || tab === "library") &&
        activeBookHubOptions.length > 1 ? (
          <div
            className="series-section-subbar"
            role="tablist"
            aria-label="Book hubs"
          >
            {activeBookHubOptions.map((hub) => (
              <button
                key={hub.id}
                type="button"
                className={bookHubFilter === hub.id ? "active" : ""}
                onClick={() => setBookHubFilter(hub.id)}
              >
                {hub.title}
              </button>
            ))}
          </div>
        ) : null}

        {tab === "overview" && showLeafOverviewSubbar ? (
          <nav className="artist-page__subtabs" aria-label="Overview sections">
            {(
              [
                ["about", "ABOUT"] as const,
                ...(isAdmin || overview?.links?.categories?.length
                  ? ([["links", "LINKS"]] as const)
                  : []),
                ...(showLeafRelated || isAdmin
                  ? ([["related", "RELATED"]] as const)
                  : []),
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={overviewTab === id ? "active" : ""}
                onClick={() => {
                  if (id === "related") {
                    const firstUniverse = relatedUniverseRows[0]?.[3];
                    setRelatedTab(
                      relatedUniverseRows.length ? "universe" : "creator"
                    );
                    onNavigate({
                      subseriesId,
                      seasonId: expandedSeasonId || seasonId,
                      section: "overview",
                      overviewTab: "related",
                      universeId: firstUniverse,
                    });
                    return;
                  }
                  onNavigate({
                    subseriesId,
                    seasonId: expandedSeasonId || seasonId,
                    section: "overview",
                    overviewTab: id,
                  });
                }}
              >
                {label}
              </button>
            ))}
          </nav>
        ) : null}

        {tab === "overview" &&
        showLeafOverviewSubbar &&
        overviewTab === "related" ? (
          <nav className="artist-page__subtabs artist-page__related-subtabs">
            {(
              [
                ...relatedUniverseRows,
                [
                  "creator",
                  "SAME TALENT",
                  overview?.related?.creator_count ??
                    overview?.related?.creator?.length ??
                    0,
                  null,
                ] as const,
                [
                  "similar",
                  isBook
                    ? "SIMILAR BOOKS"
                    : isFilm
                      ? "SIMILAR MOVIES"
                      : "SIMILAR SERIES",
                  overview?.related?.similar_count ??
                    overview?.related?.similar?.length ??
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
                        tabUniverseId === relatedUniverseRows[0]?.[3]))
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
                        subseriesId,
                        section: "overview",
                        overviewTab: "related",
                        universeId: tabUniverseId,
                      });
                    } else if (universeId != null) {
                      onNavigate({
                        subseriesId,
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

        {tab === "audio" && audioCategories.length > 1 ? (
          <div
            className="series-section-subbar"
            role="tablist"
            aria-label="Audio categories"
          >
            <button
              type="button"
              className={audioCategory === "all" ? "active" : ""}
              onClick={() => setAudioCategory("all")}
            >
              All
            </button>
            {audioCategories.map((c) => (
              <button
                key={c.key}
                type="button"
                className={audioCategory === c.key ? "active" : ""}
                onClick={() => setAudioCategory(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : null}

        {tab === "gallery" && gallerySections.length > 1 ? (
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
      </div>

      <div className="release-page__body">
        <aside
          className={`release-page__panel${
            stacked ? " series-subseries-page__panel--banner" : ""
          }`}
        >
          <div className="release-page__panel-content">
            <div className="release-page__art">
              <div
                className={`release-page__art-stage${
                  stacked
                    ? " release-page__art-stage--banner"
                    : " release-page__art-stage--cover-only"
                }`}
              >
                <span
                  className={`release-page__cover-wrap${
                    stacked ? " release-page__cover-wrap--banner" : ""
                  }${
                    stacked && seasonLogoUrl
                      ? " release-page__cover-wrap--season-logo"
                      : ""
                  }`}
                >
                  <img
                    key={`${panelArtUrl || "empty"}|${rescanTick}`}
                    src={
                      panelArtUrl
                        ? rescanTick > 0 && !panelArtUrl.includes("&v=")
                          ? `${panelArtUrl}${panelArtUrl.includes("?") ? "&" : "?"}_r=${rescanTick}`
                          : panelArtUrl
                        : undefined
                    }
                    alt=""
                    className={`release-page__cover${
                      stacked ? " release-page__cover--banner" : ""
                    }${panelArtUrl ? "" : " release-page__cover--placeholder"}`}
                  />
                  {stacked && seasonLogoUrl ? (
                    <span className="series-subseries-page__season-logo-glass">
                      <img
                        className="series-subseries-page__season-logo series-subseries-page__season-logo--on-banner"
                        src={seasonLogoUrl}
                        alt={activeSeason?.title || ""}
                      />
                    </span>
                  ) : null}
                </span>
              </div>
            </div>

            {stacked && tab === "overview" ? (
              <button
                type="button"
                className={`series-subseries-page__more-info release-page__more-info--release${
                  moreInfoOpen ? " is-open" : ""
                }`}
                aria-expanded={moreInfoOpen}
                onClick={() => setMoreInfoOpen((v) => !v)}
              >
                {title}
              </button>
            ) : null}

            <div
              className={`release-page__panel-meta${
                stacked ? " series-subseries-page__panel-meta--glass" : ""
              }${
                stacked && (tab !== "overview" || !moreInfoOpen)
                  ? " series-subseries-page__panel-meta--hidden"
                  : ""
              }`}
            >
              <div className="release-page__panel-body">
                <div className="release-page__panel-head">
                  {!hideSubseriesTitle ? (
                    <h1 className="release-page__album-title">{title}</h1>
                  ) : null}
                  {tab === "episodes" &&
                  activeSeason &&
                  !moviesExpanded &&
                  !extrasExpanded ? (
                    seasonLogoUrl && !stacked ? (
                      <img
                        className="series-subseries-page__season-logo"
                        src={seasonLogoUrl}
                        alt={activeSeason.title}
                      />
                    ) : !seasonLogoUrl ? (
                      <p className="series-subseries-page__season-line">
                        {activeSeason.title}
                      </p>
                    ) : null
                  ) : moviesExpanded && tab === "episodes" ? (
                    <p className="series-subseries-page__season-line">Movies</p>
                  ) : extrasExpanded && tab === "episodes" ? (
                    <p className="series-subseries-page__season-line">Extras</p>
                  ) : null}
                  {dateLabel ? (
                    <p className="release-page__date">{dateLabel}</p>
                  ) : null}
                  {(() => {
                    const leafTitle = (overview?.name || title || "").trim();
                    const parentName = (franchiseName || "").trim();
                    const nested =
                      Boolean(franchiseId) &&
                      Boolean(parentName) &&
                      Boolean(leafTitle) &&
                      parentName.toLowerCase() !== leafTitle.toLowerCase();
                    if (!nested) return null;
                    return (
                      <p className="release-page__type-line">
                        Part of the{" "}
                        <button
                          type="button"
                          className="release-page__artist-link release-page__artist-link--inline"
                          onClick={() =>
                            onNavigate({
                              franchiseId,
                              subseriesId: undefined,
                              section: "overview",
                              overviewTab: "about",
                            })
                          }
                        >
                          {parentName}
                        </button>{" "}
                        franchise
                      </p>
                    );
                  })()}
                  {universeInfo && leafUniverses.length === 0 ? (
                    <p className="release-page__type-line">
                      Part of the{" "}
                      <button
                        type="button"
                        className="release-page__artist-link release-page__artist-link--inline"
                        onClick={() =>
                          onOpenUniverseParent?.(
                            universeInfo.id,
                            universeInfo.name
                          )
                        }
                      >
                        {universeInfo.name}
                      </button>{" "}
                      universe
                    </p>
                  ) : null}
                  <p className="release-page__type-line">
                    <button
                      type="button"
                      className="release-page__type-link"
                      onClick={() =>
                        onBrowseCatalog?.({ mode: "name" })
                      }
                    >
                      {isBook
                        ? (
                            overview as
                              | (typeof overview & {
                                  content_category?: string | null;
                                })
                              | null
                          )?.content_category ||
                          overview?.type ||
                          "Book"
                        : isFilm
                          ? "Movie"
                          : "Series"}
                    </button>
                    {creators.length ? (
                      <>
                        {" "}
                        by{" "}
                        {creators.map((w, i) => (
                          <span key={w}>
                            {i > 0 ? (i === creators.length - 1 ? " and " : ", ") : null}
                            <button
                              type="button"
                              className="release-page__artist-link release-page__artist-link--inline"
                              onClick={() =>
                                onBrowseCatalog?.({ mode: "writer", writer: w })
                              }
                            >
                              {w}
                            </button>
                          </span>
                        ))}
                      </>
                    ) : null}
                  </p>
                  {(() => {
                    const memberships =
                      leafUniverses.length > 0
                        ? leafUniverses
                        : overview?.universes?.length
                          ? overview.universes
                          : overview?.universe
                            ? [overview.universe]
                            : [];
                    if (!memberships.length) return null;
                    const plural = memberships.length > 1;
                    return (
                      <p className="release-page__type-line series-subseries-page__universe-line">
                        Part of the{" "}
                        {memberships.map((u, i) => (
                          <span key={u.id}>
                            {i > 0
                              ? i === memberships.length - 1
                                ? " and "
                                : ", "
                              : null}
                            <button
                              type="button"
                              className="release-page__artist-link release-page__artist-link--inline"
                              onClick={() => {
                                onOpenUniverseParent?.(u.id, u.name);
                              }}
                            >
                              {u.name}
                            </button>
                          </span>
                        ))}{" "}
                        {plural ? "universes" : "universe"}
                      </p>
                    );
                  })()}
                </div>
                {genres.length > 0 ? (
                  <div className="release-page__panel-credits">
                    <p className="release-page__subgenres">
                      {genres.map((g, i) => (
                        <span key={String(g.id)}>
                          {i > 0 ? " · " : null}
                          <button
                            type="button"
                            className="release-page__genre-link"
                            onClick={() =>
                              onBrowseCatalog?.({
                                mode: "genre",
                                subgenreId:
                                  typeof g.id === "number" ? g.id : undefined,
                              })
                            }
                          >
                            {g.name}
                          </button>
                        </span>
                      ))}
                    </p>
                  </div>
                ) : null}
                {country?.name ? (
                  <p className="release-page__track-panel-line series-subseries-page__country">
                    <span
                      className="series-subseries-page__meta-icon"
                      aria-label="Country"
                      title="Country"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle
                          cx="12"
                          cy="12"
                          r="9"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                        />
                        <path
                          d="M3 12h18M12 3c2.5 2.8 3.75 5.8 3.75 9S14.5 18.2 12 21c-2.5-2.8-3.75-5.8-3.75-9S9.5 5.8 12 3z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                        />
                      </svg>
                    </span>{" "}
                    <button
                      type="button"
                      className="release-page__person-link series-subseries-page__country-link"
                      onClick={() =>
                        onBrowseCatalog?.({
                          mode: "country",
                          countryId: country.id,
                        })
                      }
                    >
                      {country.iso ? (
                        <span
                          className={`fi fi-${country.iso.toLowerCase()} series-subseries-page__country-flag`}
                          aria-hidden
                        />
                      ) : null}
                      {country.name}
                    </button>
                  </p>
                ) : null}
                {languageOpts.length ? (
                  <p className="release-page__track-panel-line series-subseries-page__lang-line">
                    <span
                      className="series-subseries-page__meta-icon"
                      aria-label="Languages"
                      title="Languages"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M4 6.5h9.5a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-1.5 1.5H9l-3 3v-3H4A1.5 1.5 0 012.5 13V8A1.5 1.5 0 014 6.5z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12.5 4.5H20a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-1.5 1.5h-1.5v2.5l-2.5-2.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>{" "}
                    <span className="series-subseries-page__lang-pills">
                      {languageOpts.map((o, i) => (
                        <span key={o.code}>
                          {i > 0 ? (
                            <span className="series-subseries-page__lang-sep">
                              {" "}
                              ·{" "}
                            </span>
                          ) : null}
                          {logosSwitchable ? (
                            <button
                              type="button"
                              className={`series-subseries-page__lang-pill${
                                activeLanguage &&
                                activeLanguage.toLowerCase() ===
                                  o.code.toLowerCase()
                                  ? " is-active"
                                  : ""
                              }`}
                              onClick={() => selectLanguage(o.code)}
                            >
                              {o.label}
                            </button>
                          ) : (
                            <span className="release-page__person-link--static">
                              {o.label}
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                  </p>
                ) : null}
              </div>

              <div className="release-page__panel-bottom">
                {isBook && canPlayFilm && filmPlayUrl && filmVersions.length <= 1 ? (
                  <div className="series-film-play-actions">
                    <div className="series-film-play-actions__primary">
                      <button
                        type="button"
                        className="series-film-play-actions__btn series-film-play-actions__btn--primary"
                        onClick={() => playFilmInTab(filmPlayUrl)}
                      >
                        {stacked ? "Read" : "Read"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {isFilm &&
                !isBook &&
                (canPlayFilm ||
                  filmExtraItems.length > 0 ||
                  trailerUrl ||
                  isAdmin) ? (
                  <div className="series-film-play-actions">
                    {canPlayFilm && filmPlayUrl ? (
                      <div className="series-film-play-actions__primary">
                        <button
                          type="button"
                          className="series-film-play-actions__btn series-film-play-actions__btn--primary"
                          onClick={() => playFilmInTab(filmPlayUrl)}
                        >
                          <IconVideo className="series-film-play-actions__btn-icon" />
                          {isBook
                            ? stacked
                              ? "Read"
                              : "Read"
                            : stacked
                              ? "Play"
                              : "Play video"}
                        </button>
                      </div>
                    ) : null}
                    {filmExtraItems.length > 0 ||
                    trailerUrl ||
                    isAdmin ? (
                      <div className="series-film-play-actions__secondary">
                        {filmExtraItems.length > 0 ? (
                          <div className="series-film-play-actions__extras-wrap">
                            <button
                              type="button"
                              className="series-film-play-actions__btn"
                              onClick={toggleExtrasMenu}
                            >
                              <IconVideo className="series-film-play-actions__btn-icon" />
                              {stacked ? "Extras" : "Play extras"}
                            </button>
                            {extrasMenuOpen && filmExtraItems.length > 1 ? (
                              <div className="series-film-bubble">
                                {filmExtraItems.map((ep) => (
                                  <button
                                    key={ep.id}
                                    type="button"
                                    className="series-film-bubble__item"
                                    onClick={() => playExtra(ep)}
                                  >
                                    {ep.title}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {trailerUrl ? (
                          <div className="series-film-play-actions__trailer-row">
                            <button
                              type="button"
                              className="series-film-play-actions__btn"
                              onClick={() =>
                                window.open(
                                  trailerUrl,
                                  "_blank",
                                  "noopener,noreferrer"
                                )
                              }
                            >
                              <IconVideo className="series-film-play-actions__btn-icon" />
                              {stacked ? "Trailer" : "Play trailer"}
                            </button>
                            {isAdmin ? (
                              <button
                                type="button"
                                className="series-film-play-actions__edit"
                                onClick={openTrailerEditor}
                                aria-label="Edit trailer URL"
                                title="Edit trailer URL"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path
                                    d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 2.75 2.75 1.83-1.83z"
                                    fill="currentColor"
                                  />
                                </svg>
                              </button>
                            ) : null}
                            {trailerEditorOpen ? (
                              <div className="series-film-bubble">
                                <div className="series-film-bubble__row">
                                  <input
                                    className="series-film-bubble__input"
                                    type="url"
                                    value={trailerDraft}
                                    placeholder="YouTube trailer URL"
                                    onChange={(e) =>
                                      setTrailerDraft(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveTrailer();
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="series-film-bubble__save"
                                    onClick={saveTrailer}
                                    aria-label="Save trailer URL"
                                  >
                                    <IconCheck />
                                  </button>
                                </div>
                                {trailerSaveError ? (
                                  <p className="series-film-bubble__error muted">
                                    {trailerSaveError}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : isAdmin ? (
                          <div className="series-film-play-actions__trailer-row">
                            <button
                              type="button"
                              className="series-film-play-actions__btn series-film-play-actions__btn--muted"
                              onClick={openTrailerEditor}
                            >
                              <IconVideo className="series-film-play-actions__btn-icon" />
                              Add trailer
                            </button>
                            {trailerEditorOpen ? (
                              <div className="series-film-bubble">
                                <div className="series-film-bubble__row">
                                  <input
                                    className="series-film-bubble__input"
                                    type="url"
                                    value={trailerDraft}
                                    placeholder="YouTube trailer URL"
                                    onChange={(e) =>
                                      setTrailerDraft(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveTrailer();
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="series-film-bubble__save"
                                    onClick={saveTrailer}
                                    aria-label="Save trailer URL"
                                  >
                                    <IconCheck />
                                  </button>
                                </div>
                                {trailerSaveError ? (
                                  <p className="series-film-bubble__error muted">
                                    {trailerSaveError}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {publisher ? (
                  <div className="release-page__label">
                    <button
                      type="button"
                      className="release-page__label-logo-btn"
                      onClick={() =>
                        onBrowseCatalog?.({
                          mode: "publisher",
                          publisher,
                        })
                      }
                      aria-label={`Browse ${publisher}`}
                    >
                      <img
                        src={distributor?.logo || DEFAULT_LABEL_URL}
                        alt={publisher}
                        className="release-page__label-logo"
                      />
                    </button>
                    <p className="release-page__label-name">
                      Distributed by{" "}
                      <button
                        type="button"
                        className="release-page__person-link"
                        onClick={() =>
                          onBrowseCatalog?.({
                            mode: "publisher",
                            publisher,
                          })
                        }
                      >
                        {publisher}
                      </button>
                    </p>
                  </div>
                ) : null}
                {!stacked ? (
                  <div className="release-page__panel-footer">
                    <div className="release-page__panel-bottom-bar">
                      {prevNeighbor ? (
                        <NeighborLink
                          label={prevNeighbor.label}
                          direction="prev"
                          onClick={prevNeighbor.onClick}
                        />
                      ) : (
                        <span className="release-page__neighbor-spacer" />
                      )}
                      {nextNeighbor ? (
                        <NeighborLink
                          label={nextNeighbor.label}
                          direction="next"
                          onClick={nextNeighbor.onClick}
                        />
                      ) : (
                        <span className="release-page__neighbor-spacer" />
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {stacked ? (
              <div className="release-page__panel-footer series-subseries-page__neighbors">
                <div className="release-page__panel-bottom-bar">
                  {prevNeighbor ? (
                    <NeighborLink
                      label={prevNeighbor.label}
                      direction="prev"
                      onClick={prevNeighbor.onClick}
                    />
                  ) : (
                    <span className="release-page__neighbor-spacer" />
                  )}
                  {nextNeighbor ? (
                    <NeighborLink
                      label={nextNeighbor.label}
                      direction="next"
                      onClick={nextNeighbor.onClick}
                    />
                  ) : (
                    <span className="release-page__neighbor-spacer" />
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="release-page__main">
          {loading && !card && !detail ? (
            <PlaylistBoot
              className="playlist-boot--compact"
              label={isFilm ? "Loading film…" : "Loading subseries…"}
            />
          ) : null}
          {error ? (
            <p className="error artist-section-empty">{error}</p>
          ) : null}

          {!error &&
          (card || detail || overview) &&
          tab === "overview" &&
          overviewTab === "about" ? (
            <div className="release-page__overview release-page__overview--no-singles series-subseries-overview">
              <div className="release-page__overview-top">
                <div className="release-page__desc-block">
                  <div
                    className={`release-page__desc-scroll${
                      stacked || mobileLandscape
                        ? overviewDescExpanded
                          ? " release-page__desc-scroll--expanded"
                          : " release-page__desc-scroll--collapsed"
                        : ""
                    }`}
                  >
                    {overviewBio ? (
                      overviewBio.split(/\n+/).map((p, i) => (
                        <p key={i} className="release-page__desc-para">
                          {p}
                        </p>
                      ))
                    ) : (
                      <p className="muted">No description yet.</p>
                    )}
                  </div>
                  {(stacked || mobileLandscape) && overviewBio ? (
                    <button
                      type="button"
                      className="release-page__desc-toggle"
                      onClick={() => setOverviewDescExpanded((o) => !o)}
                    >
                      {overviewDescExpanded ? "Show less" : "Read more"}
                    </button>
                  ) : null}
                </div>
                {photocards ? (
                  <div className="release-page__overview-side">
                    <div className="release-page__photocards">
                      <ReleasePhotocardGroup cards={photocards} />
                    </div>
                  </div>
                ) : null}
              </div>

              {overview ? (
                <div className="release-page__overview-bottom series-subseries-overview__cast">
                  <div className="series-subseries-overview__cast-tabs">
                    <button
                      type="button"
                      className={castTab === "characters" ? "active" : ""}
                      onClick={() => setCastTab("characters")}
                    >
                      Characters
                    </button>
                    <button
                      type="button"
                      className={castTab === "staff" ? "active" : ""}
                      onClick={() => setCastTab("staff")}
                    >
                      Staff
                    </button>
                  </div>
                  <section
                    ref={castGlassRef}
                    className="release-page__section-glass release-page__lineup"
                    style={
                      castGlassMin > 0
                        ? ({
                            ["--series-cast-glass-min" as string]: `${castGlassMin}px`,
                            minHeight: castGlassMin,
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    <SeriesCast
                      franchiseId={franchiseId}
                      franchiseName={overview.name}
                      cast={
                        overview.cast || {
                          characters: [],
                          staff: [],
                          animated: [],
                          people: [],
                        }
                      }
                      languages={languages}
                      languageOptions={
                        overview.cast_languages || overview.language_options
                      }
                      originLanguage={overview.origin_language}
                      activeLanguage={activeLanguage}
                      subseries={overview.subseries || []}
                      castSubFilter={isFilm ? "all" : subseriesId}
                      layout="row"
                      tab={castTab}
                      isAdmin={isAdmin}
                      onDataChanged={() => void loadCard()}
                      castApi={isBook ? "books" : isFilm ? "movies" : "series"}
                      filmId={isFilm || isBook ? subseriesId : undefined}
                      characterOnly={false}
                      addOpen={addCastOpen}
                      onAddClose={() => setAddCastOpen(false)}
                      onAddEmptyClick={
                        isAdmin ? () => setAddCastOpen(true) : undefined
                      }
                    />
                  </section>
                </div>
              ) : null}
            </div>
          ) : null}

          {!error &&
          overview &&
          tab === "overview" &&
          showLeafOverviewSubbar &&
          overviewTab === "links" ? (
            <>
              {(overview.links?.categories || []).length > 1 ? (
                <nav
                  className="artist-page__subtabs"
                  aria-label="Link categories"
                >
                  {(overview.links?.categories || []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={linkTab === c.id ? "active" : ""}
                      onClick={() => setLinkTab(c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </nav>
              ) : null}
              <SeriesLinks
                franchiseId={franchiseId}
                links={overview.links}
                tab={
                  linkTab ||
                  overview.links?.categories?.[0]?.id ||
                  "databases"
                }
                isAdmin={isAdmin}
                linkApi={isBook ? "books" : isFilm ? "movies" : "series"}
                leafId={isFilm || isBook ? subseriesId : null}
                addOpen={addLinkOpen}
                onAddClose={() => setAddLinkOpen(false)}
                onDataChanged={() => void loadCard()}
              />
            </>
          ) : null}

          {!error &&
          overview &&
          tab === "overview" &&
          showLeafOverviewSubbar &&
          overviewTab === "related" ? (
            relatedTab === "universe" && relatedUniverseRows.length > 0 ? (
              (() => {
                const orient: CardOrientation =
                  cardOrientation === "badge" ? "banner" : cardOrientation;
                const activeUniverseId =
                  universeId ?? relatedUniverseRows[0]?.[3] ?? null;
                const members = (overview.related?.universe || []).filter(
                  (c) =>
                    activeUniverseId == null ||
                    c.universe_id == null ||
                    c.universe_id === activeUniverseId
                );
                if (!members.length) {
                  return (
                    <p className="muted artist-section-empty">
                      No other members in this universe yet.
                    </p>
                  );
                }
                const openUniverseMember = (u: (typeof members)[number]) => {
                  const leaf = u.leaf_id || u.id || "";
                  const fid = u.franchise_id || franchiseId;
                  const mod = u.module || (isFilm ? "movies" : "series");
                  if (onOpenUniverseLeaf) {
                    onOpenUniverseLeaf({
                      module: mod === "movies" ? "movies" : "series",
                      franchiseId: fid,
                      leafId: leaf,
                    });
                    return;
                  }
                  onNavigate({
                    franchiseId: fid,
                    subseriesId: leaf,
                    seasonId: undefined,
                    section: "overview",
                    overviewTab: "about",
                    universeId: u.universe_id ?? activeUniverseId ?? undefined,
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
                        const titleText = u.title || u.name || "Untitled";
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
                        const cardItem: ArtistCardType = {
                          id: 0,
                          name: titleText,
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
                              artist={cardItem}
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
                franchiseId={franchiseId}
                creator={overview.related?.creator || []}
                similar={overview.related?.similar || []}
                tab={relatedTab === "universe" ? "creator" : relatedTab}
                orientation={
                  cardOrientation === "badge" ? "banner" : cardOrientation
                }
                tmdbKind={isFilm ? "movie" : "tv"}
                fallbackViaMembers={creators}
                talentOptions={creators}
                talentLabel={
                  isBook ? "Author" : isFilm ? "Director / writer" : "Creator"
                }
                isAdmin={isAdmin}
                relatedApi={isBook ? "books" : isFilm ? "movies" : "series"}
                leafId={isFilm || isBook ? subseriesId : null}
                addOpen={addRelatedOpen}
                onAddClose={() => setAddRelatedOpen(false)}
                onDataChanged={() => void loadCard()}
                onOpenLocal={onOpenRelatedLocal}
              />
            )
          ) : null}

          {!error && (card || detail) && tab === "episodes" && isBook ? (
            <div className="release-tracklist series-subseries-episodes series-book-volumes">
              <div className="release-tracklist__body">
                {filmVersions.length === 0 ? (
                  <p className="muted artist-section-empty">
                    No PDF volumes found in this book folder.
                  </p>
                ) : (
                  <ul className="series-book-volumes__list">
                    {filmVersions.map((v, i) => {
                      const meta = v as {
                        id: string;
                        label?: string;
                        file_name?: string;
                        file_url?: string | null;
                        display_date?: string | null;
                        number?: number | null;
                        cover_url?: string | null;
                        portrait_url?: string | null;
                        banner_url?: string | null;
                        landscape_url?: string | null;
                        page_count?: number | null;
                        pages?: string | null;
                      };
                      const pagesLabel =
                        meta.pages ||
                        (meta.page_count != null && meta.page_count > 0
                          ? `${meta.page_count} page${
                              meta.page_count === 1 ? "" : "s"
                            }`
                          : null);
                      const title =
                        meta.label ||
                        meta.file_name ||
                        `Volume ${i + 1}`;
                      const volNum =
                        meta.number != null && meta.number > 0
                          ? meta.number
                          : i + 1;
                      const active = activeVolumeId === meta.id;
                      return (
                        <li key={meta.id || String(i)}>
                          <button
                            type="button"
                            className={`series-book-volumes__row${
                              active ? " is-active" : ""
                            }`}
                            onClick={() => selectVolumeCover(meta)}
                          >
                            <span className="series-book-volumes__leading">
                              {meta.cover_url || meta.portrait_url ? (
                                <span
                                  className="series-book-volumes__cover"
                                  style={{
                                    backgroundImage: `url("${
                                      meta.cover_url || meta.portrait_url
                                    }")`,
                                  }}
                                />
                              ) : (
                                <span className="series-book-volumes__cover series-book-volumes__cover--empty" />
                              )}
                              <span className="series-book-volumes__meta">
                                <span className="series-book-volumes__title">
                                  {`${String(volNum).padStart(2, "0")}. `}
                                  {title}
                                </span>
                                {meta.display_date ? (
                                  <span className="series-book-volumes__date series-book-volumes__date--under">
                                    {meta.display_date}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                            {meta.display_date ? (
                              <span className="series-book-volumes__date series-book-volumes__date--center">
                                {meta.display_date}
                              </span>
                            ) : (
                              <span />
                            )}
                            <span className="series-book-volumes__pages">
                              {pagesLabel || ""}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          {!error && (card || detail) && tab === "episodes" && !isBook ? (
            <div className="release-tracklist series-subseries-episodes">
              <div className="release-tracklist__body">
                {seasons.length === 0 && episodeMovies.length === 0 ? (
                  <p className="muted artist-section-empty">
                    No seasons or movies found under this subseries.
                  </p>
                ) : (
                  <div className="release-tracklist__content">
                    {seasons.map((s) => {
                      const open =
                        expandedSeasonId === s.id &&
                        !moviesExpanded &&
                        !extrasExpanded;
                      const eps = seasonEpisodes[s.id] || [];
                      const count = eps.length || s.episode_count || 0;
                      const seasonDate =
                        s.display_date || formatTrackDate(s.date_iso);
                      return (
                        <div
                          key={s.id}
                          className="release-tracklist__edition-block series-season-block"
                        >
                          <button
                            type="button"
                            className={`release-tracklist__edition-title series-season-block__header${
                              open ? " is-open" : ""
                            }`}
                            onClick={() => toggleSeason(s)}
                            aria-expanded={open}
                          >
                            <span>{s.title}</span>
                            <span className="release-tracklist__title-suffix">
                              {" "}
                              · {count} episode{count === 1 ? "" : "s"}
                              {seasonDate ? ` · ${seasonDate}` : ""}
                            </span>
                          </button>
                          {open ? (
                            <SeriesEpisodeList
                              episodes={eps}
                              activeId={activeEpisodeId}
                              emptyLabel="No episode video files in this season folder."
                              onSelect={(ep) => {
                                setActiveEpisodeId(ep.id);
                                selectSeasonCover(s);
                              }}
                            />
                          ) : null}
                        </div>
                      );
                    })}

                    {episodeMovies.length > 0 ? (
                      <div className="release-tracklist__edition-block series-season-block">
                        <button
                          type="button"
                          className={`release-tracklist__edition-title series-season-block__header${
                            moviesExpanded && !extrasExpanded ? " is-open" : ""
                          }`}
                          onClick={() => {
                            if (moviesExpanded) {
                              setMoviesExpanded(false);
                              const url =
                                episodeMovies[0]?.cover_url || baseCover;
                              setFocusCoverUrl(url);
                              setFocusBgUrl(url);
                              return;
                            }
                            selectMovieBlock();
                          }}
                          aria-expanded={moviesExpanded && !extrasExpanded}
                        >
                          <span>Movies</span>
                          <span className="release-tracklist__title-suffix">
                            {" "}
                            · {episodeMovies.length}
                          </span>
                        </button>
                        {moviesExpanded && !extrasExpanded ? (
                          <SeriesEpisodeList
                            episodes={episodeMovies}
                            showReleaseDate
                            activeId={activeEpisodeId}
                            emptyLabel="No movies found."
                            onSelect={(ep) => {
                              setActiveEpisodeId(ep.id);
                              const url = ep.cover_url || baseCover;
                              setFocusCoverUrl(url);
                              setFocusBgUrl(url);
                            }}
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {(() => {
                      const allExtras = [
                        ...openingVideos,
                        ...endingVideos,
                        ...extraVideos,
                      ];
                      if (!allExtras.length) return null;
                      return (
                        <div className="release-tracklist__edition-block series-season-block">
                          <button
                            type="button"
                            className={`release-tracklist__edition-title series-season-block__header${
                              extrasExpanded ? " is-open" : ""
                            }`}
                            onClick={toggleExtras}
                            aria-expanded={extrasExpanded}
                          >
                            <span>Extras</span>
                            <span className="release-tracklist__title-suffix">
                              {" "}
                              · {allExtras.length}
                            </span>
                          </button>
                          {extrasExpanded ? (
                            <SeriesEpisodeList
                              episodes={allExtras}
                              activeId={activeEpisodeId}
                              emptyLabel="No extras found."
                              onSelect={(ep) => setActiveEpisodeId(ep.id)}
                            />
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {!error && (card || detail) && tab === "series" ? (
            <SeriesMediaGrid
              items={
                !isFilm && !isBook
                  ? siblings
                      .filter((s) => s.id !== subseriesId)
                      .slice()
                      .sort((a, b) =>
                        (a.date_iso || "9999").localeCompare(
                          b.date_iso || "9999"
                        )
                      )
                      .map((s) => ({
                        id: s.id,
                        title: s.title,
                        cover_url: s.cover_url,
                        portrait_url: s.cover_url,
                        logo_url: s.logo_url,
                        date_iso: s.date_iso,
                        display_date: s.display_date,
                        path: s.folder_path,
                      }))
                  : seriesCards
              }
              loading={
                mediaLoading &&
                (!isFilm && !isBook
                  ? siblings.length <= 1
                  : seriesCards.length === 0)
              }
              emptyMessage={
                !isFilm && !isBook
                  ? "No other series in this franchise."
                  : isFilm
                    ? "No matching Series franchise for this work name."
                    : "No series linked yet."
              }
              cardLayout={cardLayout}
              coverAspect="portrait"
              onOpen={
                !isFilm && !isBook
                  ? (item) => openSibling(item.id)
                  : openMediaCard
              }
            />
          ) : null}

          {!error && (card || detail) && tab === "movies" ? (
            <SeriesMediaGrid
              items={isBook ? filteredMovieCards : movieCards}
              loading={mediaLoading && movieCards.length === 0}
              emptyMessage={
                isBook
                  ? "No movies linked to this franchise yet."
                  : isFilm
                    ? "No other movies in this franchise."
                    : "No movies linked to this series yet."
              }
              cardLayout={cardLayout}
              coverAspect="portrait"
              onOpen={
                isFilm && !isBook
                  ? (item) => openSiblingFilm(item.id)
                  : openMediaCard
              }
            />
          ) : null}

          {!error && (card || detail) && tab === "audio" ? (
            <SeriesMediaGrid
              items={filteredAudio}
              loading={mediaLoading && filteredAudio.length === 0}
              emptyMessage={
                isFilm
                  ? "No audio for this movie."
                  : "No audio for this series."
              }
              cardLayout={cardLayout}
              squareCovers={cardLayout === "cover"}
              coverAspect="square"
              onOpen={openMediaCard}
            />
          ) : null}

          {!error && (card || detail) && tab === "library" ? (
            <SeriesMediaGrid
              items={filteredLibraryCards}
              loading={mediaLoading && libraryCards.length === 0}
              emptyMessage={
                isBook
                  ? "No other books in this franchise."
                  : isFilm
                    ? "No library items for this movie."
                    : "No library items for this series."
              }
              cardLayout={cardLayout}
              coverAspect="portrait"
              onOpen={
                isBook
                  ? (item) => openSiblingFilm(item.id)
                  : openMediaCard
              }
            />
          ) : null}

          {!error && (card || detail) && tab === "games" ? (
            <SeriesMediaGrid
              items={filteredGames}
              loading={mediaLoading && filteredGames.length === 0}
              emptyMessage={
                isFilm
                  ? "No games linked to this movie yet."
                  : "No games linked to this series yet."
              }
              cardLayout={cardLayout}
              coverAspect="portrait"
              onOpen={openMediaCard}
            />
          ) : null}

          {!error && (card || detail) && tab === "gallery" && galleryPath ? (
            <SeriesGalleryPanel
              folderPath={galleryPath}
              hideSubbar
              sectionKey={gallerySectionKey}
              onSectionKeyChange={setGallerySectionKey}
              onSectionsChange={(secs) => setGallerySections(secs)}
            />
          ) : null}
        </main>
      </div>

      {aboutEditOpen && overview ? (
        <SeriesAboutEditModal
          franchiseId={franchiseId}
          data={overview}
          subseriesId={subseriesId}
          filmId={isFilm || isBook ? subseriesId : undefined}
          variant={isBook ? "book" : isFilm ? "film" : "series"}
          onClose={() => setAboutEditOpen(false)}
          onSaved={() => {
            setAboutEditOpen(false);
            subseriesPageCache.delete(
              cacheKey(isFilm, franchiseId, subseriesId)
            );
            void loadCard();
          }}
          onCastChanged={() => void loadCard()}
          isAdmin={isAdmin}
        />
      ) : null}

      {addUniverseOpen && isAdmin ? (
        <AddToUniverseModal
          module={isFilm ? "movies" : "series"}
          franchiseId={franchiseId}
          leafId={subseriesId}
          leafLabel={title || subseriesId}
          onClose={() => setAddUniverseOpen(false)}
          onSaved={() => {
            void lookupUniverse(
              isFilm ? "movies" : "series",
              franchiseId,
              subseriesId
            )
              .then((res) =>
                setLeafUniverses(
                  res.universes?.length
                    ? res.universes
                    : res.universe
                      ? [res.universe]
                      : []
                )
              )
              .catch(() => {});
            subseriesPageCache.delete(
              cacheKey(isFilm, franchiseId, subseriesId)
            );
            void loadCard();
          }}
        />
      ) : null}
    </div>
  );
}
