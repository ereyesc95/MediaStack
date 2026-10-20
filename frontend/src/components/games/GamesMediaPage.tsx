import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchGamesFranchiseAudio,
  fetchGamesFranchiseOverview,
  fetchGamesGameAudio,
  fetchGamesGameOverview,
  launchGame,
  refreshGamesFranchiseMetadata,
  refreshGamesGameMetadata,
  resolveBooksPath,
  resolveGamesPath,
  resolveMoviesPath,
  type FranchiseQuizCatalogItem,
} from "../../api";
import { pushRecentGameId } from "../../gamesRecent";
import type { GamesOverviewTab, GamesSection } from "../../gamesRoute";
import { saveReleaseReferrer } from "../../musicRoute";
import type { CardOrientation, MoviesFilmCard } from "../../types";
import AddToUniverseModal from "../AddToUniverseModal";
import AppMenu from "../AppMenu";
import CardOrientationPicker from "../CardOrientationPicker";
import FranchiseQuiz from "../series/FranchiseQuiz";
import SeriesGalleryPanel from "../series/SeriesGalleryPanel";
import SeriesMediaGrid, {
  type SeriesMediaCard,
} from "../series/SeriesMediaGrid";
import EmbeddedLeafRelease from "../series/EmbeddedLeafRelease";
import { resolveLeafAudioEmbed } from "../series/leafAudioEmbed";

type Props = {
  franchiseId: string;
  gameId?: string;
  section?: GamesSection;
  overviewTab?: GamesOverviewTab;
  cardOrientation?: CardOrientation;
  onSetOrientation?: (next: CardOrientation) => void;
  onBack: () => void;
  backLabel?: string;
  isAdmin?: boolean;
  userId?: number;
  onImport?: () => void;
  onSync?: () => void;
  onChooseSource?: () => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onNavigate: (patch: {
    franchiseId?: string;
    gameId?: string;
    section?: GamesSection;
    overviewTab?: GamesOverviewTab;
  }) => void;
  onOpenSeriesFranchise?: (franchiseId: string, subseriesId?: string) => void;
  onOpenMoviesFranchise?: (franchiseId: string, filmId?: string) => void;
  onOpenBooksFranchise?: (franchiseId: string, bookId?: string) => void;
  onOpenMusicRelease?: (bandId: number, releaseId: string) => void;
  onOpenArtist?: (bandId: number) => void;
};

type Ov = Awaited<ReturnType<typeof fetchGamesGameOverview>>;

type RelatedItem = {
  title?: string;
  path?: string;
  navigate_franchise_id?: string;
  navigate_subseries_id?: string;
  cover_url?: string | null;
};

export default function GamesMediaPage({
  franchiseId,
  gameId,
  section = "overview",
  cardOrientation = "portrait",
  onSetOrientation,
  onBack,
  backLabel = "GAMES",
  isAdmin,
  userId,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
  onNavigate,
  onOpenSeriesFranchise,
  onOpenMoviesFranchise,
  onOpenBooksFranchise,
  onOpenMusicRelease,
  onOpenArtist,
}: Props) {
  const isLeaf = Boolean(gameId);
  const [data, setData] = useState<Ov | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [audioCards, setAudioCards] = useState<SeriesMediaCard[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [universeOpen, setUniverseOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const refreshedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = isLeaf
      ? fetchGamesGameOverview(gameId!)
      : fetchGamesFranchiseOverview(franchiseId);
    void load
      .then((ov) => {
        if (!cancelled) setData(ov);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [franchiseId, gameId, isLeaf, reloadKey]);

  useEffect(() => {
    if (gameId) pushRecentGameId(gameId);
  }, [gameId]);

  // Refresh IGDB metadata once per page identity when admin.
  useEffect(() => {
    if (!isAdmin) return;
    const key = isLeaf ? `g:${gameId}` : `f:${franchiseId}`;
    if (refreshedRef.current === key) return;
    refreshedRef.current = key;
    const refresh = isLeaf
      ? refreshGamesGameMetadata(gameId!)
      : refreshGamesFranchiseMetadata(franchiseId);
    void refresh
      .then((res) => {
        if (res.ok) setReloadKey((k) => k + 1);
      })
      .catch(() => {
        /* IGDB optional */
      });
  }, [franchiseId, gameId, isAdmin, isLeaf]);

  useEffect(() => {
    if (section !== "audio" && !data?.has_audio) return;
    let cancelled = false;
    setAudioLoading(true);
    const fetchAudio = isLeaf
      ? fetchGamesGameAudio(gameId!)
      : fetchGamesFranchiseAudio(franchiseId);
    void fetchAudio
      .then((payload) => {
        if (cancelled) return;
        const releases = (payload.releases || []) as Array<{
          id?: string;
          title?: string;
          name?: string;
          cover_url?: string | null;
          display_date?: string | null;
          release_date?: string | null;
          date_iso?: string | null;
          folder_path?: string | null;
          source_artist_name?: string | null;
          meta?: string | null;
          navigate_band_id?: number | null;
          navigate_release_id?: string | null;
          logo_url?: string | null;
          banner_url?: string | null;
          category?: string | null;
        }>;
        const cards: SeriesMediaCard[] = releases.map((r, i) => ({
          id: r.id || `audio-${i}`,
          title: r.title || r.name || "Release",
          cover_url: r.cover_url,
          logo_url: r.logo_url,
          banner_url: r.banner_url || r.cover_url,
          date_label:
            r.display_date || r.release_date || r.date_iso || r.meta || null,
          path: r.folder_path || undefined,
          meta: [r.source_artist_name, r.meta].filter(Boolean).join(" · ") || undefined,
          navigate_band_id: r.navigate_band_id,
          navigate_release_id: r.navigate_release_id,
          category: r.category || undefined,
        }));
        setAudioCards(cards);
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
  }, [section, data?.has_audio, franchiseId, gameId, isLeaf]);

  const title =
    (data as { title?: string; name?: string } | null)?.title ||
    (data as { name?: string } | null)?.name ||
    franchiseId;

  const about = (data as { about?: Record<string, unknown> } | null)?.about;

  const games = useMemo(() => {
    const raw =
      ((data as { sibling_games?: MoviesFilmCard[] })?.sibling_games as
        | MoviesFilmCard[]
        | undefined) ||
      ((data as { games?: MoviesFilmCard[] })?.games as MoviesFilmCard[] | undefined) ||
      [];
    if (platformFilter === "all") return raw;
    const want = platformFilter.toLowerCase();
    return raw.filter(
      (g) =>
        ((g as { platform?: string }).platform || "").toLowerCase() === want
    );
  }, [data, platformFilter]);

  const platforms = useMemo(() => {
    const raw =
      ((data as { sibling_games?: MoviesFilmCard[] })?.sibling_games as
        | MoviesFilmCard[]
        | undefined) ||
      ((data as { games?: MoviesFilmCard[] })?.games as MoviesFilmCard[] | undefined) ||
      [];
    const set = new Set<string>();
    for (const g of raw) {
      const p = (g as { platform?: string }).platform;
      if (p) set.add(p);
    }
    return Array.from(set).sort();
  }, [data]);

  const related = (data as { related?: Record<string, RelatedItem[]> } | null)
    ?.related;
  const folderPath =
    (data as { folder_path?: string } | null)?.folder_path || "";
  const launchPath =
    (data as { open_url?: string; rom_path?: string } | null)?.open_url ||
    (data as { rom_path?: string } | null)?.rom_path ||
    null;
  const openMode =
    (data as { open_mode?: string | null } | null)?.open_mode || null;

  const hasAudio = Boolean(data?.has_audio || audioCards.length > 0);
  const audioEmbed = useMemo(
    () => resolveLeafAudioEmbed(audioCards),
    [audioCards]
  );

  const tabs: { id: GamesSection; label: string; show: boolean }[] = [
    { id: "overview", label: "OVERVIEW", show: true },
    { id: "games", label: "GAMES", show: !isLeaf && games.length > 0 },
    {
      id: "series",
      label: "SERIES",
      show: Boolean(related?.series?.length),
    },
    {
      id: "movies",
      label: "MOVIES",
      show: Boolean(related?.movies?.length),
    },
    {
      id: "books",
      label: "BOOKS",
      show: Boolean(related?.books?.length),
    },
    { id: "audio", label: "AUDIO", show: hasAudio },
    { id: "gallery", label: "GALLERY", show: Boolean(folderPath) },
    { id: "quiz", label: "QUIZ", show: !isLeaf },
  ];

  async function onLaunch() {
    if (!launchPath || !gameId) return;
    setLaunching(true);
    try {
      if (openMode === "web") {
        window.open(launchPath, "_blank", "noopener,noreferrer");
        return;
      }
      const res = await launchGame(gameId);
      if (
        res &&
        typeof res === "object" &&
        (res as { open_mode?: string }).open_mode === "web" &&
        (res as { url?: string }).url
      ) {
        window.open(
          (res as { url: string }).url,
          "_blank",
          "noopener,noreferrer"
        );
      }
    } finally {
      setLaunching(false);
    }
  }

  async function handleRefreshMetadata() {
    setRefreshing(true);
    try {
      const refresh = isLeaf
        ? refreshGamesGameMetadata(gameId!)
        : refreshGamesFranchiseMetadata(franchiseId);
      const res = await refresh;
      if (res.ok) setReloadKey((k) => k + 1);
    } finally {
      setRefreshing(false);
    }
  }

  function openAudioCard(item: SeriesMediaCard) {
    if (item.navigate_band_id && item.navigate_release_id && onOpenMusicRelease) {
      saveReleaseReferrer({
        bandId: item.navigate_band_id,
        section: "audio",
        source: "games",
        franchiseId,
        subseriesId: gameId,
        franchiseName: String(title),
      });
      onOpenMusicRelease(item.navigate_band_id, item.navigate_release_id);
    }
  }

  function goToEmbeddedReleasePage(bandId: number, releaseId: string) {
    saveReleaseReferrer({
      bandId,
      section: "audio",
      source: "games",
      franchiseId,
      subseriesId: gameId,
      franchiseName: String(title),
    });
    onOpenMusicRelease?.(bandId, releaseId);
  }

  function openRelatedMovies(item: RelatedItem) {
    const path = (item.path || "").replace(/\\/g, "/");
    if (path.toLowerCase().startsWith("movies/")) {
      void resolveMoviesPath(path)
        .then((hit) => {
          onOpenMoviesFranchise?.(hit.work_id, hit.film_id ?? undefined);
        })
        .catch(() => {
          const fid = item.navigate_franchise_id;
          if (fid) onOpenMoviesFranchise?.(fid);
        });
      return;
    }
    const fid = item.navigate_franchise_id;
    if (fid) onOpenMoviesFranchise?.(fid, item.navigate_subseries_id);
  }

  function openRelatedBooks(item: RelatedItem) {
    const path = (item.path || "").replace(/\\/g, "/");
    if (path.toLowerCase().startsWith("books/")) {
      void resolveBooksPath(path)
        .then((hit) => {
          onOpenBooksFranchise?.(hit.work_id, hit.book_id ?? undefined);
        })
        .catch(() => {
          const fid = item.navigate_franchise_id;
          if (fid) onOpenBooksFranchise?.(fid);
        });
      return;
    }
    const fid = item.navigate_franchise_id;
    if (fid) onOpenBooksFranchise?.(fid, item.navigate_subseries_id);
  }

  function openRelatedSeries(item: RelatedItem) {
    const fid = item.navigate_franchise_id || item.path;
    if (!fid) return;
    const path = (item.path || "").replace(/\\/g, "/");
    if (path.toLowerCase().startsWith("series/")) {
      const parts = path.split("/").filter(Boolean);
      const navFid = item.navigate_franchise_id || parts[2];
      const sub = item.navigate_subseries_id || (parts.length >= 4 ? parts[3] : undefined);
      if (navFid) onOpenSeriesFranchise?.(navFid, sub);
      return;
    }
    onOpenSeriesFranchise?.(
      item.navigate_franchise_id || fid,
      item.navigate_subseries_id
    );
  }

  function openQuizCatalogItem(item: FranchiseQuizCatalogItem) {
    if (item.module === "game") {
      void resolveGamesPath(item.path)
        .then((hit) => {
          onNavigate({
            franchiseId: hit.franchise_id || franchiseId,
            gameId: hit.game_id ?? item.navigate_id,
            section: "overview",
          });
        })
        .catch(() => {
          onNavigate({
            franchiseId,
            gameId: item.navigate_id,
            section: "overview",
          });
        });
      return;
    }
    if (item.module === "series") {
      onOpenSeriesFranchise?.(item.navigate_id || franchiseId);
      return;
    }
    if (item.module === "movie") {
      openRelatedMovies({
        path: item.path,
        navigate_franchise_id: item.navigate_id,
        title: item.title,
      });
      return;
    }
    if (item.module === "book") {
      openRelatedBooks({
        path: item.path,
        navigate_franchise_id: item.navigate_id,
        title: item.title,
      });
    }
  }

  return (
    <div className="series-franchise-page games-media-page">
      <header className="header header--minimal">
        <button type="button" className="ghost-btn" onClick={onBack}>
          ← {backLabel}
        </button>
        <span className="header-title">{title}</span>
        <span className="spacer" />
        {onSetOrientation &&
        !(section === "audio" && audioEmbed.mode === "release") ? (
          <CardOrientationPicker
            value={cardOrientation}
            onChange={onSetOrientation}
            includeBadge={!isLeaf}
          />
        ) : null}
        {onImport && onSync ? (
          <AppMenu
            onImport={onImport}
            onSync={onSync}
            onChooseSource={onChooseSource}
            isAdmin={isAdmin}
            onSwitchProfile={onSwitchProfile}
            onEditProfile={onEditProfile}
            onRefreshMetadata={
              isAdmin ? () => void handleRefreshMetadata() : undefined
            }
            onAddToUniverse={
              isAdmin ? () => setUniverseOpen(true) : undefined
            }
            addToUniverseLabel="Add to universe"
          />
        ) : null}
      </header>

      <nav className="artist-page__subtabs">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              className={
                section === t.id
                  ? "artist-page__subtab artist-page__subtab--active"
                  : "artist-page__subtab"
              }
              onClick={() => onNavigate({ section: t.id })}
            >
              {t.label}
            </button>
          ))}
      </nav>

      {error ? <div className="error">{error}</div> : null}
      {loading || refreshing ? (
        <p className="muted">{refreshing ? "Refreshing metadata…" : "Loading…"}</p>
      ) : null}

      {!loading && section === "overview" ? (
        <div className="games-overview">
          <div className="games-overview__hero">
            {Boolean(data?.cover_url || data?.portrait_url) ? (
              <img
                className="games-overview__cover"
                src={String(data?.cover_url || data?.portrait_url || "")}
                alt=""
              />
            ) : null}
            <div className="games-overview__meta">
              <h1>{String(title)}</h1>
              {(data as { platform?: string } | null)?.platform ? (
                <p className="muted">
                  {String((data as { platform?: string }).platform)}
                </p>
              ) : null}
              {Array.isArray((data as { platforms?: string[] } | null)?.platforms) &&
              ((data as { platforms?: string[] }).platforms?.length || 0) > 0 ? (
                <p className="muted">
                  {((data as { platforms?: string[] }).platforms || []).join(" · ")}
                </p>
              ) : null}
              {(data as { display_date?: string } | null)?.display_date ? (
                <p className="muted">
                  {String((data as { display_date?: string }).display_date)}
                </p>
              ) : null}
              {about?.studio || about?.publisher ? (
                <p className="muted">
                  {[about.studio, about.publisher]
                    .filter(Boolean)
                    .map(String)
                    .join(" · ")}
                </p>
              ) : null}
              {typeof about?.overview === "string" && about.overview.trim() ? (
                <p className="games-overview__about">{about.overview}</p>
              ) : null}
              {isLeaf && launchPath ? (
                openMode === "web" ? (
                  <a
                    className="primary-btn"
                    href={launchPath}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Launch
                  </a>
                ) : (
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={launching}
                    onClick={() => void onLaunch()}
                  >
                    {launching ? "Launching…" : "Launch"}
                  </button>
                )
              ) : null}
              {!isLeaf && (data as { primary_game_id?: string })?.primary_game_id ? (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() =>
                    onNavigate({
                      gameId: (data as { primary_game_id?: string }).primary_game_id,
                      section: "overview",
                    })
                  }
                >
                  Open game
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {!loading && section === "games" ? (
        <div className="games-siblings">
          <div className="games-siblings__filters">
            <button
              type="button"
              className={platformFilter === "all" ? "chip chip--active" : "chip"}
              onClick={() => setPlatformFilter("all")}
            >
              All
            </button>
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                className={platformFilter === p ? "chip chip--active" : "chip"}
                onClick={() => setPlatformFilter(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="media-release-grid">
            {games.map((g) => (
              <button
                key={g.id}
                type="button"
                className="media-release-card media-release-card--portrait"
                onClick={() =>
                  onNavigate({
                    franchiseId: g.work_id || franchiseId,
                    gameId: g.id,
                    section: "overview",
                  })
                }
              >
                <span
                  className="media-release-card__cover"
                  style={
                    g.cover_url
                      ? { backgroundImage: `url("${g.cover_url}")` }
                      : undefined
                  }
                />
                <span className="media-release-card__meta">
                  <span className="media-release-card__title">{g.title}</span>
                  {(g as { platform?: string }).platform &&
                  platformFilter === "all" ? (
                    <span className="muted">
                      {(g as { platform?: string }).platform}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          {!games.length ? (
            <p className="muted">No other games in this franchise.</p>
          ) : null}
        </div>
      ) : null}

      {!loading && section === "series" ? (
        <RelatedSimple
          items={(related?.series || []) as RelatedItem[]}
          onOpen={openRelatedSeries}
        />
      ) : null}
      {!loading && section === "movies" ? (
        <RelatedSimple
          items={(related?.movies || []) as RelatedItem[]}
          onOpen={openRelatedMovies}
        />
      ) : null}
      {!loading && section === "books" ? (
        <RelatedSimple
          items={(related?.books || []) as RelatedItem[]}
          onOpen={openRelatedBooks}
        />
      ) : null}

      {!loading && section === "audio" ? (
        audioEmbed.mode === "release" && onImport && onSync ? (
          <EmbeddedLeafRelease
            bandId={audioEmbed.bandId}
            releaseId={audioEmbed.releaseId}
            isAdmin={isAdmin}
            userId={userId}
            onImport={onImport}
            onSync={onSync}
            onChooseSource={onChooseSource}
            onSwitchProfile={onSwitchProfile}
            onEditProfile={onEditProfile}
            onOpenArtist={onOpenArtist}
            onGoToReleasePage={goToEmbeddedReleasePage}
          />
        ) : (
          <SeriesMediaGrid
            items={audioCards}
            loading={audioLoading && audioCards.length === 0}
            emptyMessage="No audio for this game yet."
            squareCovers
            coverAspect="square"
            onOpen={openAudioCard}
          />
        )
      ) : null}

      {!loading && section === "gallery" && folderPath ? (
        <SeriesGalleryPanel folderPath={folderPath} />
      ) : null}

      {!loading && section === "quiz" && !isLeaf ? (
        <FranchiseQuiz
          franchiseId={franchiseId}
          onOpenCatalogItem={openQuizCatalogItem}
        />
      ) : null}

      {universeOpen && isAdmin ? (
        <AddToUniverseModal
          module="games"
          franchiseId={franchiseId}
          leafId={gameId || null}
          leafLabel={isLeaf ? String(title) : null}
          onClose={() => setUniverseOpen(false)}
          onSaved={() => {
            setReloadKey((k) => k + 1);
            setUniverseOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function RelatedSimple({
  items,
  onOpen,
}: {
  items: RelatedItem[];
  onOpen: (item: RelatedItem) => void;
}) {
  if (!items.length) return <p className="muted">Nothing related on disk.</p>;
  return (
    <ul className="games-related-list">
      {items.map((it, i) => {
        const id = it.navigate_franchise_id || it.path || String(i);
        return (
          <li key={`${id}-${i}`}>
            <button type="button" className="ghost-btn" onClick={() => onOpen(it)}>
              {it.title || id}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
