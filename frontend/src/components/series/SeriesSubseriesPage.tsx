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
  fetchSeriesFolder,
  fetchSeriesFolderExtras,
  fetchSeriesFranchiseAudio,
  fetchSeriesFranchiseGames,
  fetchSeriesFranchiseLibrary,
  fetchSeriesFranchiseMovies,
  fetchSeriesFranchiseShows,
  fetchSeriesOverview,
  rescanSeriesLocalData,
} from "../../api";
import { formatTrackDate } from "../../formatDate";
import {
  applyMediaTheme,
  beginArtistPageSession,
  colorsFromImageUrl,
  isPlaybackThemeActive,
} from "../../mediaTheme";
import { pushSeriesRoute } from "../../seriesRoute";
import type {
  ReleaseCardLayout,
  SeriesEpisodeItem,
  SeriesFilterMode,
  SeriesFolderDetail,
  SeriesOverview,
  SeriesSection,
  SeriesSeasonCard,
  SeriesSubseriesCard,
} from "../../types";
import {
  isMobileLandscapeLayout,
  isMobilePortraitLayout,
  isTabletLayout,
  useDeviceLayout,
} from "../../usePhoneLayout";
import AppMenu from "../AppMenu";
import ReleaseCardLayoutPicker from "../ReleaseCardLayoutPicker";
import MediaBeatFx from "../music/MediaBeatFx";
import MediaBeatFrame from "../music/MediaBeatFrame";
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

export type SubseriesTab =
  | "overview"
  | "episodes"
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
  subseriesId: string;
  seasonId?: string;
  section?: SeriesSection;
  busy?: string;
  isAdmin?: boolean;
  userId?: number;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onBack: () => void;
  onBrowseCatalog?: (target: SeriesCatalogBrowseTarget) => void;
  onOpenMusicRelease?: (bandId: number, releaseId: string) => void;
  onNavigate: (patch: {
    subseriesId?: string;
    seasonId?: string;
    section?: SeriesSection;
  }) => void;
};

function sectionToTab(section: SeriesSection | undefined): SubseriesTab {
  if (section === "episodes" || section === "series") return "episodes";
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
  if (tab === "movies" || tab === "audio" || tab === "library" || tab === "games") {
    return tab;
  }
  return "overview";
}

function NeighborLink({
  label,
  year,
  direction,
  onClick,
}: {
  label: string;
  year?: string | null;
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
        {year ? (
          <span className="release-page__neighbor-date">({year})</span>
        ) : null}
      </span>
      {direction === "next" ? (
        <span className="release-page__neighbor-arrow" aria-hidden>
          ›
        </span>
      ) : null}
    </button>
  );
}

function neighborYear(s: {
  date_iso?: string | null;
  display_date?: string | null;
}): string | null {
  const iso = s.date_iso || "";
  if (iso.length >= 4 && /^\d{4}/.test(iso)) return iso.slice(0, 4);
  const disp = s.display_date || "";
  const m = disp.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : null;
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
    category?: string | null;
    duration?: string | null;
    duration_sec?: number | null;
  }[]
): SeriesMediaCard[] {
  return items.map((it, i) => ({
    id: String(it.id ?? it.path ?? it.folder_path ?? i),
    title: it.title || it.name || "Untitled",
    cover_url: it.cover_url,
    banner_url: it.banner_url,
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
    category: it.category,
    duration: it.duration ?? null,
    duration_sec: it.duration_sec ?? null,
  }));
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
      return true;
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

const GAME_PLATFORM_ERA: Record<string, number> = {
  Arcade: 1971,
  "Commodore 64": 1982,
  Amiga: 1985,
  "Nintendo Entertainment System": 1983,
  "Sega Master System": 1985,
  "Game Boy": 1989,
  "Game Boy Color": 1998,
  "Game Boy Advance": 2001,
  "Nintendo DS": 2004,
  "Nintendo 3DS": 2011,
  "Sega Genesis": 1988,
  "Sega CD": 1991,
  "Sega 32X": 1994,
  "Sega Saturn": 1994,
  "Sega Dreamcast": 1998,
  "Nintendo 64": 1996,
  "Nintendo GameCube": 2001,
  "Nintendo Wii": 2006,
  "Nintendo Wii U": 2012,
  "Nintendo Switch": 2017,
  PlayStation: 1994,
  "PlayStation 2": 2000,
  "PlayStation 3": 2006,
  "PlayStation 4": 2013,
  "PlayStation 5": 2020,
  "PlayStation Portable": 2004,
  "PlayStation Vita": 2011,
  Xbox: 2001,
  "Xbox 360": 2005,
  "Xbox One": 2013,
  "Xbox Series": 2020,
  Flash: 1996,
  Browser: 1995,
  PC: 1981,
  Mac: 1984,
};

export default function SeriesSubseriesPage({
  franchiseId,
  franchiseName,
  subseriesId,
  seasonId,
  section = "overview",
  busy,
  isAdmin = false,
  userId,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
  onBack,
  onBrowseCatalog,
  onOpenMusicRelease,
  onNavigate,
}: Props) {
  const layout = useDeviceLayout();
  const stacked = isMobilePortraitLayout(layout);
  const mobileLandscape = isMobileLandscapeLayout(layout);
  const tabletLayout = isTabletLayout(layout);
  const tabletPortrait = layout === "tablet-portrait";
  const tab = sectionToTab(section);

  const [card, setCard] = useState<SeriesSubseriesCard | null>(null);
  const [siblings, setSiblings] = useState<SeriesSubseriesCard[]>([]);
  const [overview, setOverview] = useState<SeriesOverview | null>(null);
  const [detail, setDetail] = useState<SeriesFolderDetail | null>(null);
  const [seasonEpisodes, setSeasonEpisodes] = useState<
    Record<string, SeriesEpisodeItem[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aboutEditOpen, setAboutEditOpen] = useState(false);
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
  const [movieCards, setMovieCards] = useState<SeriesMediaCard[]>([]);
  const [audioCards, setAudioCards] = useState<SeriesMediaCard[]>([]);
  const [libraryCards, setLibraryCards] = useState<SeriesMediaCard[]>([]);
  const [gameCards, setGameCards] = useState<SeriesMediaCard[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [rescanTick, setRescanTick] = useState(0);
  const [extraVideos, setExtraVideos] = useState<SeriesEpisodeItem[]>([]);
  const [openingVideos, setOpeningVideos] = useState<SeriesEpisodeItem[]>([]);
  const [endingVideos, setEndingVideos] = useState<SeriesEpisodeItem[]>([]);
  const [seriesPlaying, setSeriesPlaying] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [opedOpen, setOpedOpen] = useState(false);
  const [gallerySectionKey, setGallerySectionKey] = useState("all");
  const [gallerySections, setGallerySections] = useState<
    { key: string; label: string }[]
  >([]);
  const [bgLayers, setBgLayers] = useState<{
    current?: string;
    outgoing?: string;
  }>({});
  const castGlassRef = useRef<HTMLElement | null>(null);
  const [castMinHeight, setCastMinHeight] = useState(0);

  useEffect(() => {
    setCastMinHeight(0);
  }, [subseriesId]);

  useLayoutEffect(() => {
    if (tab !== "overview") return;
    const el = castGlassRef.current;
    if (!el) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    if (h > 0) setCastMinHeight((prev) => Math.max(prev, h));
  }, [tab, castTab, overview?.cast, subseriesId]);

  const setCardLayoutPersisted = useCallback(
    (next: ReleaseCardLayout) => {
      setCardLayout(next);
      if (userId) saveReleaseCardLayout(userId, next);
    },
    [userId]
  );

  const loadCard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [shows, ov] = await Promise.all([
        fetchSeriesFranchiseShows(franchiseId).catch(() => ({ items: [] })),
        fetchSeriesOverview(franchiseId).catch(() => null),
      ]);
      setOverview(ov);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCard(null);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [franchiseId, subseriesId, rescanTick]);

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
    pushSeriesRoute(
      {
        franchiseId,
        subseriesId,
        seasonId,
        section: tabToSection(tab),
        overviewTab: tab === "overview" ? "about" : undefined,
      },
      true
    );
  }, [franchiseId, subseriesId, seasonId, tab]);

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
  const baseCoverBack = detail?.cover_back_url || baseCoverFront;
  const baseCover = baseCoverFront;

  const onEpisodesTab = tab === "episodes";

  const panelCoverUrl = onEpisodesTab
    ? focusCoverUrl ||
      activeSeason?.portrait_url ||
      activeSeason?.cover_url ||
      baseCoverFront
    : baseCoverFront;

  const bgCoverUrl = onEpisodesTab
    ? focusBgUrl ||
      activeSeason?.landscape_url ||
      activeSeason?.portrait_url ||
      activeSeason?.cover_url ||
      baseCoverBack
    : baseCoverBack;

  useEffect(() => {
    // Reset focused cover when subseries changes
    setFocusCoverUrl(null);
    setFocusBgUrl(null);
    setMoviesExpanded(false);
    setGamePlatform("all");
    setMediaReady(false);
    setCard(null);
    setDetail(null);
    setSeasonEpisodes({});
    setBgLayers({});
    setExtraVideos([]);
    setOpeningVideos([]);
    setEndingVideos([]);
    setPanelCollapsed(false);
  }, [subseriesId]);

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
    if (!panelCoverUrl || isPlaybackThemeActive()) return;
    void colorsFromImageUrl(panelCoverUrl).then((c) => {
      if (c && !isPlaybackThemeActive()) applyMediaTheme(c, userId);
    });
  }, [panelCoverUrl, userId]);

  const title = detail?.title || card?.title || subseriesId;
  const scopedMeta = overview?.subseries_meta?.[subseriesId] ?? null;
  const dateLabel = formatAirDateRange(
    detail?.date_iso || card?.date_iso,
    detail?.display_date || card?.display_date || null,
    scopedMeta?.activity_periods || overview?.activity_periods || []
  );

  const siblingIndex = siblings.findIndex((s) => s.id === subseriesId);
  const n = siblings.length;
  const i = siblingIndex >= 0 ? siblingIndex : 0;
  const prevSub = n > 1 ? siblings[(i - 1 + n) % n] : null;
  const nextSub = n > 1 ? siblings[(i + 1) % n] : null;

  const galleryPath = detail?.folder_path || card?.folder_path || "";

  const writers = scopedMeta?.writers ?? overview?.writers ?? [];
  const genres = scopedMeta?.genres ?? overview?.genres ?? [];
  const publishers = scopedMeta?.publishers ?? overview?.publishers ?? [];
  const publisher = publishers[0] || "";
  const country = scopedMeta?.country ?? overview?.country;
  const languages = scopedMeta?.languages ?? overview?.languages ?? [];
  const overviewBio = scopedMeta?.bio ?? overview?.bio;
  const languageLabels = useMemo(() => {
    const opts = overview?.language_options || [];
    const byCode = new Map(
      opts.map((o) => [o.code.toLowerCase(), o.label] as const)
    );
    return languages.map(
      (code) =>
        (byCode.get(code.toLowerCase()) || code).replace(
          /\s*\(origin\)\s*$/i,
          ""
        )
    );
  }, [languages, overview?.language_options]);

  const photocards: ReleasePhotocardSet | null = useMemo(() => {
    const pc = detail?.photocards;
    if (pc && (pc.portrait_front || pc.landscape_front)) {
      return {
        portrait_front: pc.portrait_front || null,
        portrait_back: pc.portrait_back || pc.portrait_front || null,
        landscape_front: pc.landscape_front || null,
        landscape_back: pc.landscape_back || pc.landscape_front || null,
        cover_only: Boolean(pc.cover_only),
      };
    }
    const eras = overview?.eras || [];
    const portrait = eras.find((e) => e.portrait_url)?.portrait_url || null;
    const landscape = eras.find((e) => e.landscape_url)?.landscape_url || null;
    const front = portrait || landscape || panelCoverUrl || null;
    if (!front || front === DEFAULT_DISC_URL) return null;
    const back =
      activeSeason?.cover_back_url ||
      eras.find((e) => e.landscape_url && e.landscape_url !== front)
        ?.landscape_url ||
      front;
    return {
      portrait_front: portrait || front,
      portrait_back: back,
      landscape_front: landscape,
      landscape_back: back,
      cover_only: !portrait && !landscape,
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
    if (!franchiseId || !title || !galleryPath) return;
    let cancelled = false;
    setMediaLoading(true);
    const run = async () => {
      try {
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

        const movieItems = (moviesData.items || []) as {
          id?: string;
          title?: string;
          cover_url?: string | null;
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
              releases.map((r) => ({
                id: r.id,
                title: r.title || r.name,
                cover_url: r.cover_url,
                banner_url: r.banner_url,
                logo_url: r.logo_url,
                date_iso: r.date_iso,
                display_date: r.display_date || r.release_date,
                folder_path: r.folder_path || r.subseries_path || undefined,
                path: r.is_series_playlist
                  ? `playlist:${r.playlist_kind || "openings-endings"}`
                  : r.folder_path || r.subseries_path || undefined,
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
                category: r.is_series_playlist
                  ? "playlists"
                  : r.category || undefined,
                open_label: r.is_series_playlist ? "Open playlist" : undefined,
                open_mode: r.is_series_playlist ? ("tab" as const) : null,
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
  }, [franchiseId, title, galleryPath, relatedMovies, rescanTick]);

  const gamePlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const g of gameCards) {
      if (g.platform) set.add(g.platform);
    }
    return Array.from(set).sort((a, b) => {
      const ea = GAME_PLATFORM_ERA[a] ?? 9999;
      const eb = GAME_PLATFORM_ERA[b] ?? 9999;
      if (ea !== eb) return ea - eb;
      return a.localeCompare(b);
    });
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
    tab === "movies" || tab === "audio" || tab === "library" || tab === "games";

  const hasEpisodes =
    seasons.length > 0 ||
    episodeMovies.length > 0 ||
    (card?.season_count ?? 0) > 0;
  const hasMovies = movieCards.length > 0;
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
    const all: { id: SubseriesTab; label: string }[] = [
      { id: "overview", label: stacked ? "INFO" : "OVERVIEW" },
      { id: "episodes", label: stacked ? "EPS" : "EPISODES" },
      { id: "movies", label: "MOVIES" },
      { id: "audio", label: "AUDIO" },
      { id: "library", label: "LIBRARY" },
      { id: "games", label: "GAMES" },
      { id: "gallery", label: "GALLERY" },
    ];
    return all.filter((t) => {
      if (t.id === "overview") return true;
      if (t.id === "episodes") return hasEpisodes || loading;
      if (t.id === "gallery") return hasGallery || loading;
      if (!mediaReady) return true;
      if (t.id === "movies") return hasMovies;
      if (t.id === "audio") return hasAudio;
      if (t.id === "library") return hasLibrary;
      if (t.id === "games") return hasGames;
      return true;
    });
  }, [
    stacked,
    hasEpisodes,
    hasGallery,
    loading,
    mediaReady,
    hasMovies,
    hasAudio,
    hasLibrary,
    hasGames,
  ]);

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
    onNavigate({
      subseriesId: sid,
      seasonId: undefined,
      section: tabToSection(tab),
    });
  };

  const selectSeasonCover = (s: SeriesSeasonCard) => {
    setFocusCoverUrl(s.portrait_url || s.cover_url || null);
    setFocusBgUrl(
      s.landscape_url || s.portrait_url || s.cover_url || null
    );
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
    const url = item.open_url?.trim();
    if (!url) return;
    if (item.open_mode === "local") {
      void fetch(url, { method: "POST" }).catch(() => {});
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const topLogoUrl = detail?.logo_url || card?.logo_url || null;
  const topLogo = topLogoUrl ? (
    <img src={topLogoUrl} alt="" className="release-page__brand-logo" />
  ) : null;

  const pageClass = [
    "release-page",
    "series-subseries-page",
    stacked ? "release-page--stacked" : "",
    stacked ? "release-page--scroll" : "",
    mobileLandscape ? "release-page--mobile-landscape" : "",
    tabletLayout ? "release-page--tablet" : "",
    tabletPortrait ? "release-page--tablet-portrait" : "",
    tab === "overview" ? "release-page--overview" : "",
    bgLayers.current ? "release-page--has-bg" : "",
    seriesPlaying ? "release-page--beat-ready release-page--playing" : "",
    stacked && panelCollapsed ? "series-subseries-page--panel-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const backLabel = (overview?.name || franchiseName || "FRANCHISE").toUpperCase();

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
              aria-label={`Back to ${backLabel}`}
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
              <span className="series-subseries-page__back-label">{backLabel}</span>
            </button>
          </div>
          <div className="release-page__top-center">
            {topLogo ? (
              <MediaBeatFrame variant="logo">{topLogo}</MediaBeatFrame>
            ) : (
              <span className="release-page__brand-name">{title}</span>
            )}
          </div>
          <div className="release-page__top-right">
            {busy ? <span className="muted">{busy}</span> : null}
            {showMediaLayoutPicker ? (
              <ReleaseCardLayoutPicker
                value={cardLayout}
                onChange={setCardLayoutPersisted}
              />
            ) : null}
            <SeriesAudioPlayer
              franchiseId={franchiseId}
              onPlayingChange={setSeriesPlaying}
            />
            {stacked ? (
              <button
                type="button"
                className={`series-subseries-page__cover-toggle${
                  panelCollapsed ? "" : " is-active"
                }`}
                aria-pressed={!panelCollapsed}
                aria-label={panelCollapsed ? "Show cover" : "Hide cover"}
                title={panelCollapsed ? "Show cover" : "Hide cover"}
                onClick={() => setPanelCollapsed((v) => !v)}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h14V7H5zm2 2h4v6H7V9zm5 0h5v2h-5V9zm0 3h5v2h-5v-2z"
                  />
                </svg>
              </button>
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
              editDataLabel="Edit series"
              editDataFlat
              refreshLocalFlat
              onEditAbout={
                isAdmin && overview
                  ? () => setAboutEditOpen(true)
                  : undefined
              }
              onRescanLibrary={
                isAdmin
                  ? () => {
                      void rescanSeriesLocalData(true)
                        .then(() => {
                          setMediaReady(false);
                          setRescanTick((t) => t + 1);
                        })
                        .catch(() => {});
                    }
                  : undefined
              }
            />
          </div>
        </header>

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
            stacked && panelCollapsed ? " release-page__panel--collapsed" : ""
          }`}
        >
          <div className="release-page__panel-content">
            <div className="release-page__art">
              <div className="release-page__art-stage release-page__art-stage--cover-only">
                <span className="release-page__cover-wrap">
                  <img
                    key={`${panelCoverUrl || "empty"}|${rescanTick}`}
                    src={
                      panelCoverUrl
                        ? rescanTick > 0 && !panelCoverUrl.includes("&v=")
                          ? `${panelCoverUrl}${panelCoverUrl.includes("?") ? "&" : "?"}_r=${rescanTick}`
                          : panelCoverUrl
                        : undefined
                    }
                    alt=""
                    className={`release-page__cover${
                      panelCoverUrl ? "" : " release-page__cover--placeholder"
                    }`}
                  />
                </span>
              </div>
            </div>
            <div className="release-page__panel-meta">
              <div className="release-page__panel-body">
                <div className="release-page__panel-head">
                  <h1 className="release-page__album-title">{title}</h1>
                  {tab === "episodes" &&
                  activeSeason &&
                  !moviesExpanded &&
                  !extrasExpanded ? (
                    <p className="series-subseries-page__season-line">
                      {activeSeason.title}
                    </p>
                  ) : moviesExpanded && tab === "episodes" ? (
                    <p className="series-subseries-page__season-line">Movies</p>
                  ) : extrasExpanded && tab === "episodes" ? (
                    <p className="series-subseries-page__season-line">Extras</p>
                  ) : null}
                  {dateLabel ? (
                    <p className="release-page__date">{dateLabel}</p>
                  ) : null}
                  <p className="release-page__type-line">
                    <button
                      type="button"
                      className="release-page__type-link"
                      onClick={() =>
                        onBrowseCatalog?.({ mode: "name" })
                      }
                    >
                      Series
                    </button>
                    {writers.length ? (
                      <>
                        {" "}
                        by{" "}
                        {writers.map((w, i) => (
                          <span key={w}>
                            {i > 0 ? (i === writers.length - 1 ? " and " : ", ") : null}
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
                {languageLabels.length ? (
                  <p className="release-page__track-panel-line">
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
                    <span className="release-page__person-link--static">
                      {languageLabels.join(" · ")}
                    </span>
                  </p>
                ) : null}
              </div>

              <div className="release-page__panel-bottom">
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
                        src={DEFAULT_LABEL_URL}
                        alt={publisher}
                        className="release-page__label-logo"
                      />
                    </button>
                    <p className="release-page__label-name">
                      Published by{" "}
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
                <div className="release-page__panel-footer">
                  <div className="release-page__panel-bottom-bar">
                    {prevSub ? (
                      <NeighborLink
                        label={prevSub.title}
                        year={neighborYear(prevSub)}
                        direction="prev"
                        onClick={() => openSibling(prevSub.id)}
                      />
                    ) : (
                      <span className="release-page__neighbor-spacer" />
                    )}
                    {nextSub ? (
                      <NeighborLink
                        label={nextSub.title}
                        year={neighborYear(nextSub)}
                        direction="next"
                        onClick={() => openSibling(nextSub.id)}
                      />
                    ) : (
                      <span className="release-page__neighbor-spacer" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="release-page__main">
          {loading ? (
            <p className="muted artist-section-empty">Loading subseries…</p>
          ) : null}
          {error ? (
            <p className="error artist-section-empty">{error}</p>
          ) : null}

          {!loading && !error && tab === "overview" ? (
            <div className="release-page__overview release-page__overview--no-singles series-subseries-overview">
              <div className="release-page__overview-top">
                <div className="release-page__desc-block">
                  <div className="release-page__desc-scroll">
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
                </div>
                {photocards ? (
                  <div className="release-page__overview-side">
                    <div className="release-page__photocards">
                      <ReleasePhotocardGroup cards={photocards} />
                    </div>
                  </div>
                ) : null}
              </div>

              {overview?.cast ? (
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
                      castMinHeight > 0
                        ? { minHeight: castMinHeight }
                        : undefined
                    }
                  >
                    <SeriesCast
                      franchiseId={franchiseId}
                      franchiseName={overview.name}
                      cast={overview.cast}
                      languages={languages}
                      languageOptions={
                        overview.cast_languages || overview.language_options
                      }
                      originLanguage={overview.origin_language}
                      subseries={overview.subseries || []}
                      castSubFilter={subseriesId}
                      layout="row"
                      tab={castTab}
                      isAdmin={isAdmin}
                      onDataChanged={() => void loadCard()}
                    />
                  </section>
                </div>
              ) : null}
            </div>
          ) : null}

          {!loading && !error && tab === "episodes" ? (
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
                              emptyLabel="No episode video files in this season folder."
                              onSelect={() => {
                                setFocusCoverUrl(
                                  s.portrait_url || s.cover_url || null
                                );
                                setFocusBgUrl(
                                  s.landscape_url ||
                                    s.portrait_url ||
                                    s.cover_url ||
                                    null
                                );
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
                            emptyLabel="No movies found."
                            onSelect={(ep) => {
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
                              emptyLabel="No extras found."
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

          {!loading && !error && tab === "movies" ? (
            <SeriesMediaGrid
              items={movieCards}
              loading={mediaLoading}
              emptyMessage="No movies linked to this series yet."
              cardLayout={cardLayout}
              onOpen={openMediaCard}
            />
          ) : null}

          {!loading && !error && tab === "audio" ? (
            <SeriesMediaGrid
              items={filteredAudio}
              loading={mediaLoading}
              emptyMessage="No audio for this series."
              cardLayout={cardLayout}
              squareCovers={cardLayout === "cover"}
              onOpen={openMediaCard}
            />
          ) : null}

          {!loading && !error && tab === "library" ? (
            <SeriesMediaGrid
              items={libraryCards}
              loading={mediaLoading}
              emptyMessage="No library items for this series."
              cardLayout={cardLayout}
              onOpen={openMediaCard}
            />
          ) : null}

          {!loading && !error && tab === "games" ? (
            <SeriesMediaGrid
              items={filteredGames}
              loading={mediaLoading}
              emptyMessage="No games linked to this series yet."
              cardLayout={cardLayout}
              onOpen={openMediaCard}
            />
          ) : null}

          {!loading && !error && tab === "gallery" && galleryPath ? (
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
          onClose={() => setAboutEditOpen(false)}
          onSaved={() => {
            setAboutEditOpen(false);
            void loadCard();
          }}
          onCastChanged={() => void loadCard()}
          isAdmin={isAdmin}
        />
      ) : null}
    </div>
  );
}
