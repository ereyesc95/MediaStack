import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchSeriesFolder,
  fetchSeriesFranchiseAudio,
  fetchSeriesFranchiseGames,
  fetchSeriesFranchiseLibrary,
  fetchSeriesFranchiseMovies,
  fetchSeriesFranchiseShows,
  fetchSeriesOverview,
} from "../../api";
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
  isMobilePortraitLayout,
  isStackedArtistLayout,
  useDeviceLayout,
} from "../../usePhoneLayout";
import AppMenu from "../AppMenu";
import ReleaseCardLayoutPicker from "../ReleaseCardLayoutPicker";
import MediaBeatFx from "../music/MediaBeatFx";
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
import SeriesCast from "./SeriesCast";
import SeriesEpisodeList from "./SeriesEpisodeList";
import SeriesGalleryPanel from "./SeriesGalleryPanel";
import SeriesMediaGrid, { type SeriesMediaCard } from "./SeriesMediaGrid";

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
      <span className="release-page__neighbor-text">{label}</span>
      {direction === "next" ? (
        <span className="release-page__neighbor-arrow" aria-hidden>
          ›
        </span>
      ) : null}
    </button>
  );
}

function toMediaCards(
  items: {
    id?: string;
    title?: string;
    name?: string;
    cover_url?: string | null;
    banner_url?: string | null;
    path?: string;
    folder_path?: string;
    date_iso?: string | null;
    display_date?: string | null;
    platform?: string | null;
  }[]
): SeriesMediaCard[] {
  return items.map((it, i) => ({
    id: String(it.id ?? it.path ?? it.folder_path ?? i),
    title: it.title || it.name || "Untitled",
    cover_url: it.cover_url,
    banner_url: it.banner_url,
    path: it.path || it.folder_path,
    date_label: it.display_date || it.date_iso || null,
    platform: it.platform ?? null,
  }));
}

function filterCardsForSubseries(
  cards: SeriesMediaCard[],
  subseriesTitle: string,
  subseriesPath: string
): SeriesMediaCard[] {
  const titleCf = subseriesTitle.toLowerCase();
  const pathCf = (subseriesPath || "").replace(/\\/g, "/").toLowerCase();
  const matched = cards.filter((c) => {
    const p = (c.path || "").replace(/\\/g, "/").toLowerCase();
    const t = (c.title || "").toLowerCase();
    if (pathCf && p.includes(pathCf)) return true;
    if (titleCf && (p.includes(titleCf) || t.includes(titleCf))) return true;
    return false;
  });
  return matched.length ? matched : cards;
}

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
  onNavigate,
}: Props) {
  const layout = useDeviceLayout();
  const stacked = isStackedArtistLayout(layout);
  const mobilePortrait = isMobilePortraitLayout(layout);
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
  const [focusCoverUrl, setFocusCoverUrl] = useState<string | null>(null);
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
  const [bgLayers, setBgLayers] = useState<{
    current?: string;
    outgoing?: string;
  }>({});

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
  }, [franchiseId, subseriesId]);

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

  const baseCover =
    detail?.cover_url || card?.cover_url || overview?.cover_url || DEFAULT_DISC_URL;

  const coverUrl =
    focusCoverUrl ||
    activeSeason?.cover_url ||
    baseCover;

  useEffect(() => {
    // Reset focused cover when subseries changes
    setFocusCoverUrl(null);
    setMoviesExpanded(false);
  }, [subseriesId]);

  useEffect(() => {
    if (!coverUrl) {
      setBgLayers({});
      return;
    }
    setBgLayers((prev) => {
      if (prev.current === coverUrl) return prev;
      return { current: coverUrl, outgoing: prev.current };
    });
    const t = window.setTimeout(() => {
      setBgLayers((s) => ({ current: s.current, outgoing: undefined }));
    }, 360);
    return () => window.clearTimeout(t);
  }, [coverUrl]);

  useEffect(() => {
    if (!coverUrl || isPlaybackThemeActive()) return;
    void colorsFromImageUrl(coverUrl).then((c) => {
      if (c && !isPlaybackThemeActive()) applyMediaTheme(c, userId);
    });
  }, [coverUrl, userId]);

  const title = detail?.title || card?.title || subseriesId;
  const dateLabel =
    detail?.display_date ||
    card?.display_date ||
    detail?.date_iso ||
    card?.date_iso ||
    null;

  const siblingIndex = siblings.findIndex((s) => s.id === subseriesId);
  const prevSub =
    siblingIndex > 0 ? siblings[siblingIndex - 1] : null;
  const nextSub =
    siblingIndex >= 0 && siblingIndex < siblings.length - 1
      ? siblings[siblingIndex + 1]
      : null;

  const galleryPath = detail?.folder_path || card?.folder_path || "";

  const writers = overview?.writers || [];
  const genres = overview?.genres || [];
  const publishers = overview?.publishers || [];
  const publisher = publishers[0] || "";
  const country = overview?.country;
  const languages = overview?.languages || [];
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
    const eras = overview?.eras || [];
    const portrait = eras.find((e) => e.portrait_url)?.portrait_url || null;
    const landscape = eras.find((e) => e.landscape_url)?.landscape_url || null;
    const front = portrait || landscape || coverUrl || null;
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
  }, [overview?.eras, coverUrl, activeSeason?.cover_back_url]);

  const relatedMovies = useMemo(
    () => toMediaCards(overview?.related?.movies || []),
    [overview]
  );

  // Lazy-load media tabs scoped later
  useEffect(() => {
    if (tab !== "movies" && tab !== "audio" && tab !== "library" && tab !== "games") {
      return;
    }
    let cancelled = false;
    setMediaLoading(true);
    const run = async () => {
      try {
        if (tab === "movies") {
          const data = await fetchSeriesFranchiseMovies(franchiseId);
          if (!cancelled) {
            const items = (data.items || []) as {
              id?: string;
              title?: string;
              cover_url?: string | null;
              banner_url?: string | null;
              path?: string;
              date_iso?: string | null;
              display_date?: string | null;
            }[];
            setMovieCards(
              filterCardsForSubseries(
                toMediaCards(items.length ? items : relatedMovies),
                title,
                galleryPath
              )
            );
          }
        } else if (tab === "audio") {
          const data = await fetchSeriesFranchiseAudio(franchiseId);
          if (!cancelled) {
            const releases = (data.releases || []) as {
              id?: string;
              title?: string;
              name?: string;
              cover_url?: string | null;
              date_iso?: string | null;
              display_date?: string | null;
              release_date?: string | null;
            }[];
            setAudioCards(
              filterCardsForSubseries(
                toMediaCards(
                  releases.map((r) => ({
                    id: r.id,
                    title: r.title || r.name,
                    cover_url: r.cover_url,
                    date_iso: r.date_iso,
                    display_date: r.display_date || r.release_date,
                  }))
                ),
                title,
                galleryPath
              )
            );
          }
        } else if (tab === "library") {
          const data = await fetchSeriesFranchiseLibrary(franchiseId);
          if (!cancelled) {
            setLibraryCards(
              filterCardsForSubseries(
                toMediaCards(data.items || []),
                title,
                galleryPath
              )
            );
          }
        } else if (tab === "games") {
          const data = await fetchSeriesFranchiseGames(franchiseId);
          if (!cancelled) {
            setGameCards(
              filterCardsForSubseries(
                toMediaCards(data.items || []),
                title,
                galleryPath
              )
            );
          }
        }
      } catch {
        /* leave previous */
      } finally {
        if (!cancelled) setMediaLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [tab, franchiseId, title, galleryPath, relatedMovies]);

  const gamePlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const g of gameCards) {
      if (g.platform) set.add(g.platform);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [gameCards]);

  const filteredGames = useMemo(() => {
    if (gamePlatform === "all") return gameCards;
    return gameCards.filter((g) => g.platform === gamePlatform);
  }, [gameCards, gamePlatform]);

  const showMediaLayoutPicker =
    tab === "movies" || tab === "audio" || tab === "library" || tab === "games";

  const tabs: { id: SubseriesTab; label: string }[] = [
    { id: "overview", label: "OVERVIEW" },
    { id: "episodes", label: "EPISODES" },
    { id: "movies", label: "MOVIES" },
    { id: "audio", label: "AUDIO" },
    { id: "library", label: "LIBRARY" },
    { id: "games", label: "GAMES" },
    { id: "gallery", label: "GALLERY" },
  ];

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
      section: "overview",
    });
  };

  const selectSeasonCover = (s: SeriesSeasonCard) => {
    setFocusCoverUrl(s.cover_url || null);
  };

  const toggleSeason = (s: SeriesSeasonCard) => {
    if (expandedSeasonId !== s.id) {
      setExpandedSeasonId(s.id);
      setMoviesExpanded(false);
    }
    selectSeasonCover(s);
    onNavigate({
      subseriesId,
      seasonId: s.id,
      section: tab === "episodes" ? "episodes" : tabToSection(tab),
    });
  };

  const selectMovieBlock = () => {
    setMoviesExpanded(true);
    setExpandedSeasonId(null);
    const first = localMovies[0] || relatedMovies[0];
    const url =
      (first && "cover_url" in first
        ? (first as { cover_url?: string | null }).cover_url
        : null) || baseCover;
    setFocusCoverUrl(url || null);
  };

  const pageClass = [
    "release-page",
    "series-subseries-page",
    `release-page--${layout}`,
    stacked ? "release-page--stacked" : "",
    mobilePortrait ? "release-page--mobile-portrait" : "",
    bgLayers.current ? "release-page--has-bg" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const backLabel = (
    franchiseName ||
    overview?.name ||
    "FRANCHISE"
  ).toUpperCase();

  const episodeMovies: SeriesEpisodeItem[] = useMemo(() => {
    if (localMovies.length) return localMovies;
    // Related franchise movies as list rows when no local Movies folder
    return relatedMovies.map((m, i) => ({
      id: m.id || `rel-mov-${i}`,
      number: null,
      title: m.title,
      play_path: m.path || "",
      open_url: m.path
        ? `/api/media/file?path=${encodeURIComponent(m.path)}`
        : null,
      kind: "movie" as const,
      cover_url: m.cover_url,
      folder_path: m.path,
    }));
  }, [localMovies, relatedMovies]);

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
              <span>{backLabel}</span>
            </button>
          </div>
          <div className="release-page__top-center">
            <span className="release-page__brand-name">{title}</span>
          </div>
          <div className="release-page__top-right">
            {busy ? <span className="muted">{busy}</span> : null}
            {showMediaLayoutPicker ? (
              <ReleaseCardLayoutPicker
                value={cardLayout}
                onChange={setCardLayoutPersisted}
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
              onEditAbout={
                isAdmin && overview ? () => setAboutEditOpen(true) : undefined
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
      </div>

      <div className="release-page__body">
        <aside className="release-page__panel">
          <div className="release-page__panel-content">
            <div className="release-page__art">
              <div className="release-page__art-stage release-page__art-stage--cover-only">
                <span className="release-page__cover-wrap">
                  <img
                    src={coverUrl || DEFAULT_DISC_URL}
                    alt=""
                    className="release-page__cover"
                  />
                </span>
              </div>
            </div>
            <div className="release-page__panel-meta">
              <div className="release-page__panel-body">
                <div className="release-page__panel-head">
                  <h1 className="release-page__album-title">{title}</h1>
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
                    Country{" "}
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
                    Languages{" "}
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
                        direction="prev"
                        onClick={() => openSibling(prevSub.id)}
                      />
                    ) : (
                      <span className="release-page__neighbor-spacer" />
                    )}
                    {nextSub ? (
                      <NeighborLink
                        label={nextSub.title}
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
                    {overview?.bio ? (
                      overview.bio.split(/\n+/).map((p, i) => (
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
                  <section className="release-page__section-glass release-page__lineup">
                    <SeriesCast
                      franchiseId={franchiseId}
                      franchiseName={overview.name}
                      cast={overview.cast}
                      languages={overview.languages}
                      languageOptions={overview.cast_languages || overview.language_options}
                      originLanguage={overview.origin_language}
                      subseries={overview.subseries || []}
                      castSubFilter={subseriesId}
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
                      const open = expandedSeasonId === s.id && !moviesExpanded;
                      const eps = seasonEpisodes[s.id] || [];
                      const count = eps.length || s.episode_count || 0;
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
                            </span>
                          </button>
                          {open ? (
                            <SeriesEpisodeList
                              episodes={eps}
                              emptyLabel="No episode video files in this season folder."
                              onSelect={() =>
                                setFocusCoverUrl(s.cover_url || null)
                              }
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
                            moviesExpanded ? " is-open" : ""
                          }`}
                          onClick={() => {
                            if (moviesExpanded) {
                              setFocusCoverUrl(
                                episodeMovies[0]?.cover_url || baseCover
                              );
                              return;
                            }
                            selectMovieBlock();
                          }}
                          aria-expanded={moviesExpanded}
                        >
                          <span>Movies</span>
                          <span className="release-tracklist__title-suffix">
                            {" "}
                            · {episodeMovies.length}
                          </span>
                        </button>
                        {moviesExpanded ? (
                          <SeriesEpisodeList
                            episodes={episodeMovies}
                            emptyLabel="No movies found."
                            onSelect={(ep) =>
                              setFocusCoverUrl(ep.cover_url || baseCover)
                            }
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {!loading && !error && tab === "movies" ? (
            <SeriesMediaGrid
              items={movieCards.length ? movieCards : relatedMovies}
              loading={mediaLoading}
              emptyMessage="No movies linked to this franchise yet."
              cardLayout={cardLayout}
            />
          ) : null}

          {!loading && !error && tab === "audio" ? (
            <SeriesMediaGrid
              items={audioCards}
              loading={mediaLoading}
              emptyMessage="No matching audio for this franchise."
              cardLayout={cardLayout}
            />
          ) : null}

          {!loading && !error && tab === "library" ? (
            <SeriesMediaGrid
              items={libraryCards}
              loading={mediaLoading}
              emptyMessage="No library items for this franchise."
              cardLayout={cardLayout}
            />
          ) : null}

          {!loading && !error && tab === "games" ? (
            <SeriesMediaGrid
              items={filteredGames}
              loading={mediaLoading}
              emptyMessage="No games linked to this franchise yet."
              cardLayout={cardLayout}
            />
          ) : null}

          {!loading && !error && tab === "gallery" && galleryPath ? (
            <SeriesGalleryPanel folderPath={galleryPath} />
          ) : null}
        </main>
      </div>

      {aboutEditOpen && overview ? (
        <SeriesAboutEditModal
          franchiseId={franchiseId}
          data={overview}
          onClose={() => setAboutEditOpen(false)}
          onSaved={() => {
            setAboutEditOpen(false);
            void loadCard();
          }}
        />
      ) : null}
    </div>
  );
}
