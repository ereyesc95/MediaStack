import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchSeriesFranchiseAudio,
  fetchSeriesFranchiseGames,
  fetchSeriesFranchiseLibrary,
  fetchSeriesFranchiseMovies,
  fetchSeriesFranchiseShows,
  fetchSeriesOverview,
  refreshSeriesMetadata,
} from "../../api";
import {
  applyMediaTheme,
  beginArtistPageSession,
  colorsFromImageUrl,
  isPlaybackThemeActive,
} from "../../mediaTheme";
import { pushSeriesRoute } from "../../seriesRoute";
import type {
  LinkCategory,
  ReleaseCardLayout,
  SeriesCastTab,
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
import ReleaseCardLayoutPicker from "../ReleaseCardLayoutPicker";
import MediaBeatFx from "../music/MediaBeatFx";
import MediaBeatFrame from "../music/MediaBeatFrame";
import SeriesAbout from "./SeriesAbout";
import SeriesAboutEditModal from "./SeriesAboutEditModal";
import SeriesCast from "./SeriesCast";
import SeriesGalleryPanel from "./SeriesGalleryPanel";
import SeriesLinks from "./SeriesLinks";
import SeriesMediaGrid, { type SeriesMediaCard } from "./SeriesMediaGrid";
import SeriesRelatedPanel, {
  type SeriesRelatedTab,
} from "./SeriesRelatedPanel";

export type SeriesFranchiseShell = {
  name: string;
  cover_url: string | null;
  logo_url?: string | null;
  icon_url?: string | null;
};

type Props = {
  franchiseId: string;
  subseriesId?: string;
  seasonId?: string;
  section?: SeriesSection;
  overviewTab?: SeriesOverviewTab;
  shell?: SeriesFranchiseShell | null;
  busy?: string;
  isAdmin?: boolean;
  userId?: number;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onBack: () => void;
  onNavigate: (patch: {
    subseriesId?: string;
    seasonId?: string;
    section?: SeriesSection;
    overviewTab?: SeriesOverviewTab;
  }) => void;
};

const SECTIONS: {
  id: SeriesSection;
  label: string;
  flag: keyof NonNullable<SeriesOverview["media"]> | null;
}[] = [
  { id: "overview", label: "OVERVIEW", flag: null },
  { id: "series", label: "SERIES", flag: "has_series" },
  // Always show after SERIES (empty states when nothing linked yet)
  { id: "movies", label: "MOVIES", flag: null },
  { id: "audio", label: "AUDIO", flag: null },
  { id: "library", label: "LIBRARY", flag: "has_library" },
  { id: "games", label: "GAMES", flag: "has_games" },
  { id: "gallery", label: "GALLERY", flag: "has_gallery" },
];

const OVERVIEW_TABS: { id: SeriesOverviewTab; label: string }[] = [
  { id: "about", label: "ABOUT" },
  { id: "cast", label: "CAST" },
  { id: "links", label: "LINKS" },
  { id: "related", label: "RELATED" },
];

const MEDIA_SUBBAR_SECTIONS: SeriesSection[] = [
  "movies",
  "audio",
  "library",
  "games",
  "gallery",
];

export default function SeriesFranchisePage({
  franchiseId,
  subseriesId,
  seasonId,
  section = "overview",
  overviewTab = "about",
  shell = null,
  busy,
  isAdmin = false,
  userId,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
  onBack,
  onNavigate,
}: Props) {
  const layout = useDeviceLayout();
  const stacked = isStackedArtistLayout(layout);
  const mobilePortrait = isMobilePortraitLayout(layout);
  const [data, setData] = useState<SeriesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eraIndex, setEraIndex] = useState(0);
  const [castTab, setCastTab] = useState<SeriesCastTab>("characters");
  const [linkTab, setLinkTab] = useState<LinkCategory | string>("databases");
  const [relatedTab, setRelatedTab] = useState<SeriesRelatedTab>("creator");
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

  const [audioCards, setAudioCards] = useState<SeriesMediaCard[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [showCards, setShowCards] = useState<SeriesMediaCard[]>([]);
  const [showLoading, setShowLoading] = useState(false);
  const [movieCards, setMovieCards] = useState<SeriesMediaCard[]>([]);
  const [movieLoading, setMovieLoading] = useState(false);
  const [libCards, setLibCards] = useState<SeriesMediaCard[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [gameCards, setGameCards] = useState<SeriesMediaCard[]>([]);
  const [gameLoading, setGameLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await fetchSeriesOverview(franchiseId);
      setData(overview);
      setEraIndex(0);
      if (overview.is_animated) setCastTab("characters");
      else setCastTab("staff");
      const cats = overview.links?.categories || [];
      if (cats.length) setLinkTab(cats[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [franchiseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    beginArtistPageSession(userId);
  }, [userId]);

  useEffect(() => {
    pushSeriesRoute(
      {
        franchiseId,
        subseriesId,
        seasonId,
        section,
        overviewTab: section === "overview" ? overviewTab : undefined,
      },
      true
    );
  }, [franchiseId, subseriesId, seasonId, section, overviewTab]);

  // Auto-fetch TMDb metadata on first visit
  useEffect(() => {
    if (!data?.needs_metadata) return;
    if (autoRefreshDone.current === franchiseId) return;
    autoRefreshDone.current = franchiseId;
    void (async () => {
      try {
        setRefreshing(true);
        await refreshSeriesMetadata(franchiseId, true);
        await load();
      } catch {
        /* leave empty bio prompt */
      } finally {
        setRefreshing(false);
      }
    })();
  }, [data?.needs_metadata, franchiseId, load]);

  const handleRefreshMetadata = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSeriesMetadata(franchiseId, refreshBio);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [franchiseId, refreshBio, load]);

  useEffect(() => {
    if (section !== "audio") return;
    let cancelled = false;
    setAudioLoading(true);
    void fetchSeriesFranchiseAudio(franchiseId)
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
        }[];
        setAudioCards(
          releases.map((r, i) => ({
            id: r.id || `audio-${i}`,
            title: r.title || r.name || "Release",
            cover_url: r.cover_url,
            date_label: r.display_date || r.release_date || r.date_iso || null,
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
  }, [section, franchiseId]);

  useEffect(() => {
    if (section !== "movies") return;
    let cancelled = false;
    setMovieLoading(true);
    void fetchSeriesFranchiseMovies(franchiseId)
      .then((payload) => {
        if (cancelled) return;
        setMovieCards(
          (payload.items || []).map((m, i) => ({
            id: m.path || `movie-${i}`,
            title: m.title,
            cover_url: m.cover_url,
            date_label: m.display_date || m.date_iso,
            path: m.path,
            meta: m.subseries || undefined,
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
  }, [section, franchiseId]);

  useEffect(() => {
    setMediaSubFilter("all");
    setPlatformFilter("all");
  }, [section]);

  useEffect(() => {
    if (section !== "series") return;
    let cancelled = false;
    setShowLoading(true);
    void fetchSeriesFranchiseShows(franchiseId)
      .then((payload) => {
        if (cancelled) return;
        setShowCards(
          (payload.items || []).map((s) => ({
            id: s.id,
            title: s.title,
            cover_url: s.cover_url,
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
  }, [section, franchiseId]);

  useEffect(() => {
    if (section !== "library") return;
    let cancelled = false;
    setLibLoading(true);
    void fetchSeriesFranchiseLibrary(franchiseId)
      .then((payload) => {
        if (cancelled) return;
        setLibCards(
          (payload.items || []).map((b, i) => ({
            id: b.path || `book-${i}`,
            title: b.title,
            cover_url: b.cover_url,
            date_label: b.display_date || b.date_iso,
            path: b.path,
            meta: b.subseries || undefined,
          }))
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
  }, [section, franchiseId]);

  useEffect(() => {
    if (section !== "games") return;
    let cancelled = false;
    setGameLoading(true);
    void fetchSeriesFranchiseGames(franchiseId)
      .then((payload) => {
        if (cancelled) return;
        setGameCards(
          (payload.items || []).map((g, i) => ({
            id: g.path || `game-${i}`,
            title: g.title,
            cover_url: g.cover_url,
            date_label: g.display_date || g.date_iso || g.platform || null,
            path: g.path,
            platform: g.platform,
            meta: g.subseries || undefined,
          }))
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
  }, [section, franchiseId]);

  const title = data?.name ?? shell?.name ?? "Series";
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
    if (!data) return SECTIONS.filter((s) => s.id === "overview");
    return SECTIONS.filter((s) => !s.flag || data.media[s.flag]);
  }, [data]);

  const era = currentAboutEra ?? data?.eras?.[0];
  const topBrand = (era?.icon_url || data?.icon_url || shell?.icon_url) ? (
    <img
      src={(era?.icon_url || data?.icon_url || shell?.icon_url)!}
      alt=""
      className="artist-page__brand-icon"
    />
  ) : null;
  const topLogo = (era?.logo_url || data?.logo_url || shell?.logo_url) ? (
    <img
      src={(era?.logo_url || data?.logo_url || shell?.logo_url)!}
      alt=""
      className="artist-page__brand-logo"
    />
  ) : null;

  const castCounts = {
    characters:
      data?.cast?.characters?.length ?? data?.cast?.animated?.length ?? 0,
    staff: data?.cast?.staff?.length ?? data?.cast?.people?.length ?? 0,
  };

  const subseriesTabs = useMemo(() => {
    const list = data?.subseries || [];
    return [{ id: "all", title: "All" }, ...list.map((s) => ({ id: s.id, title: s.title }))];
  }, [data?.subseries]);

  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const g of gameCards) {
      if (g.platform) set.add(g.platform);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [gameCards]);

  const filterBySubseries = (items: SeriesMediaCard[]) => {
    if (mediaSubFilter === "all") return items;
    const key = mediaSubFilter.toLowerCase();
    return items.filter((item) => {
      const hay = `${item.meta || ""} ${item.path || ""} ${item.id}`.toLowerCase();
      return hay.includes(key);
    });
  };

  const filterGames = (items: SeriesMediaCard[]) => {
    let list = filterBySubseries(items);
    if (platformFilter !== "all") {
      list = list.filter((g) => (g.platform || "") === platformFilter);
    }
    return list;
  };

  const showMediaSubbar = MEDIA_SUBBAR_SECTIONS.includes(section);
  const pageClass = [
    "artist-page",
    "series-franchise-page",
    `artist-page--${layout}`,
    stacked ? "artist-page--stacked" : "",
    mobilePortrait ? "artist-page--mobile-portrait" : "",
    bgLayers.current ? "artist-page--has-bg" : "",
  ]
    .filter(Boolean)
    .join(" ");
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
              aria-label="Back to catalog"
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
              <span className="artist-page__catalog-label">CATALOG</span>
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
              <span className="artist-page__brand-name">{title}</span>
            ) : null}
          </div>
          <div className="artist-page__top-right">
            {(busy || refreshing) && (
              <span className="muted">{refreshing ? "Refreshing…" : busy}</span>
            )}
            {(section === "audio" ||
              section === "movies" ||
              section === "series" ||
              section === "library" ||
              section === "games") && (
              <ReleaseCardLayoutPicker
                value={releaseCardLayout}
                onChange={setReleaseCardLayoutPersisted}
              />
            )}
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              artistThemeActive
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              onRefreshMetadata={
                isAdmin && section === "overview" && overviewTab === "about"
                  ? () => void handleRefreshMetadata()
                  : undefined
              }
              refreshIncludeBio={refreshBio}
              onRefreshIncludeBioChange={
                isAdmin && section === "overview" && overviewTab === "about"
                  ? setRefreshBio
                  : undefined
              }
              onEditAbout={
                isAdmin && section === "overview" && overviewTab === "about"
                  ? () => setAboutEditOpen(true)
                  : undefined
              }
              onAddMember={
                isAdmin && section === "overview" && overviewTab === "cast"
                  ? () => setAddCastOpen(true)
                  : undefined
              }
              onAddLink={
                isAdmin && section === "overview" && overviewTab === "links"
                  ? () => setAddLinkOpen(true)
                  : undefined
              }
              onAddSimilar={
                isAdmin && section === "overview" && overviewTab === "related"
                  ? () => setAddRelatedOpen(true)
                  : undefined
              }
              addSimilarLabel={
                relatedTab === "creator"
                  ? "Add same author series"
                  : "Add similar series"
              }
              onRefreshLineup={
                isAdmin && section === "overview" && overviewTab === "cast"
                  ? () => void handleRefreshMetadata()
                  : undefined
              }
              onRefreshLinks={
                isAdmin && section === "overview" && overviewTab === "links"
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
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        {section === "overview" ? (
          <nav className="artist-page__subtabs" aria-label="Overview">
            {OVERVIEW_TABS.map((t) => (
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

        {section === "overview" && overviewTab === "cast" && subseriesTabs.length > 1 ? (
          <div className="series-section-subbar" role="tablist" aria-label="Cast subseries">
            {subseriesTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={castSubFilter === t.id ? "active" : ""}
                onClick={() => setCastSubFilter(t.id)}
              >
                {t.title}
              </button>
            ))}
          </div>
        ) : null}

        {section === "overview" && overviewTab === "cast" ? (
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

        {showMediaSubbar && subseriesTabs.length > 1 ? (
          <div className="series-section-subbar" role="tablist" aria-label="Subseries">
            {subseriesTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={mediaSubFilter === t.id ? "active" : ""}
                onClick={() => setMediaSubFilter(t.id)}
              >
                {t.title}
              </button>
            ))}
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

        {section === "overview" && overviewTab === "related" ? (
          <nav className="artist-page__subtabs artist-page__related-subtabs">
            {(
              [
                ["creator", "SAME AUTHOR", data?.related?.creator_count ?? data?.related?.creator?.length ?? 0],
                ["similar", "SIMILAR SERIES", data?.related?.similar_count ?? data?.related?.similar?.length ?? 0],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                className={relatedTab === id ? "active" : ""}
                onClick={() => setRelatedTab(id)}
              >
                <span>
                  {label}
                  <span className="artist-page__lineup-count">{count}</span>
                </span>
              </button>
            ))}
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
          <p className="muted artist-section-empty">Loading franchise…</p>
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
          />
        ) : null}

        {data && section === "overview" && overviewTab === "cast" ? (
          <SeriesCast
            franchiseId={franchiseId}
            franchiseName={data.name}
            cast={data.cast}
            languages={data.languages}
            languageOptions={data.language_options}
            originLanguage={data.origin_language}
            subseries={data.subseries || []}
            castSubFilter={castSubFilter}
            tab={castTab}
            isAdmin={isAdmin}
            addOpen={addCastOpen}
            onAddClose={() => setAddCastOpen(false)}
            onDataChanged={() => void load()}
          />
        ) : null}

        {data && section === "overview" && overviewTab === "links" ? (
          <SeriesLinks
            franchiseId={franchiseId}
            links={data.links}
            tab={linkTab}
            isAdmin={isAdmin}
            addOpen={addLinkOpen}
            onAddClose={() => setAddLinkOpen(false)}
            onDataChanged={() => void load()}
          />
        ) : null}

        {data && section === "overview" && overviewTab === "related" ? (
          <SeriesRelatedPanel
            franchiseId={franchiseId}
            creator={data.related?.creator || []}
            similar={data.related?.similar || []}
            tab={relatedTab}
            isAdmin={isAdmin}
            addOpen={addRelatedOpen}
            onAddClose={() => setAddRelatedOpen(false)}
            onDataChanged={() => void load()}
          />
        ) : null}

        {section === "audio" ? (
          <SeriesMediaGrid
            items={filterBySubseries(audioCards)}
            loading={audioLoading}
            emptyMessage="No matching Music artist audio for this franchise."
            cardLayout={releaseCardLayout}
          />
        ) : null}

        {section === "movies" ? (
          <SeriesMediaGrid
            items={filterBySubseries(movieCards)}
            loading={movieLoading}
            emptyMessage="No movies linked to this franchise yet."
            cardLayout={releaseCardLayout}
          />
        ) : null}

        {section === "series" ? (
          <SeriesMediaGrid
            items={showCards}
            loading={showLoading}
            emptyMessage="No subseries found."
            cardLayout={releaseCardLayout}
            onOpen={(item) =>
              onNavigate({
                section: "overview",
                subseriesId: item.id,
                seasonId: undefined,
              })
            }
          />
        ) : null}

        {section === "library" ? (
          <SeriesMediaGrid
            items={filterBySubseries(libCards)}
            loading={libLoading}
            emptyMessage="No books linked to this franchise yet."
            cardLayout={releaseCardLayout}
          />
        ) : null}

        {section === "games" ? (
          <SeriesMediaGrid
            items={filterGames(gameCards)}
            loading={gameLoading}
            emptyMessage="No games linked to this franchise yet."
            cardLayout={releaseCardLayout}
          />
        ) : null}

        {section === "gallery" && data ? (
          <SeriesGalleryPanel folderPath={data.folder_path} />
        ) : null}
      </div>

      {aboutEditOpen && data ? (
        <SeriesAboutEditModal
          franchiseId={franchiseId}
          data={data}
          onClose={() => setAboutEditOpen(false)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
