import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchGamesCatalog,
  fetchGamesFilterOptions,
  regenerateGamesPlatformIcons,
  resolveBooksPath,
  resolveMoviesPath,
} from "../../api";
import {
  getCachedGamesDashboard,
  prefetchGamesDashboard,
} from "../../gamesDashboardCache";
import { getCachedUniverses, prefetchUniverses } from "../../universesCache";
import {
  loadOwnershipIndex,
  markLeafCards,
  type OwnershipIndex,
} from "../../leafOwnership";
import { clearMediaTheme } from "../../mediaTheme";
import { takePendingCatalogBrowse } from "../../mediaEntry";
import { shouldReturnToPhotosExclusive } from "../../photosExclusiveReturn";
import {
  defaultSectionForSource,
  saveArtistEntryReferrer,
} from "../../artistEntry";
import {
  moduleHomePlaybackClassNames,
  PlaybackCoverAtmosphere,
} from "../../usePlaybackCoverBg";
import {
  pushGamesCatalogRoute,
  pushGamesRootRoute,
  pushGamesRoute,
  type GamesOverviewTab,
  type GamesSection,
} from "../../gamesRoute";
import { getRecentGameIds } from "../../gamesRecent";
import {
  artworkHomeModule,
  isArtworkHomeElsewhere,
  preferredSectionForSource,
  saveFranchiseHomeReferrer,
} from "../../franchiseHome";
import type {
  CardOrientation,
  MoviesFilmCard,
  SeriesDashboard,
  SeriesFilterMode,
  SeriesFilterOptions,
  SeriesFranchiseCard,
  Universe,
} from "../../types";
import AppMenu from "../AppMenu";
import CardOrientationPicker from "../CardOrientationPicker";
import ManageCatalogModal from "../ManageCatalogModal";
import OrganizeLooseRomsModal from "./OrganizeLooseRomsModal";
import { IconMediaGames } from "../MenuIcons";
import ModuleHomeAudioPlayer from "../ModuleHomeAudioPlayer";
import ModuleTopBar, { type MediaOption } from "../ModuleTopBar";
import CatalogScopeToggle from "../series/CatalogScopeToggle";
import SeriesBrowse, {
  type SeriesCatalogScope,
} from "../series/SeriesBrowse";
import SeriesSubseriesPage, {
  type SeriesCatalogBrowseTarget,
} from "../series/SeriesSubseriesPage";
import {
  filterMobileAllowedPlatforms,
  gameHasMobileAllowedPlatform,
  isGamesMobileGated,
  isMobileAllowedPlatform,
} from "../../gamesMobile";
import { useDeviceLayout } from "../../usePhoneLayout";
import GamesHome from "./GamesHome";
import GamesFranchisePage from "./GamesFranchisePage";
import GamesPlatformFilter from "./GamesPlatformFilter";

type GamesTab = "home" | "catalog";

const FILTER_MODES: { id: SeriesFilterMode; label: string }[] = [
  { id: "name", label: "TITLE" },
  { id: "genre", label: "GENRE" },
  { id: "start", label: "RELEASE DATE" },
  { id: "developer", label: "DEVELOPER" },
  { id: "publisher", label: "PUBLISHER" },
  { id: "writer", label: "DIRECTOR" },
  { id: "most_played", label: "MOST PLAYED" },
];

type Props = {
  mediaOptions: MediaOption[];
  busy?: string;
  syncTick?: number;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  isAdmin?: boolean;
  userId?: number;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onSelectMedia: (opt: MediaOption) => void;
  franchiseId?: string;
  gameId?: string;
  section?: GamesSection;
  overviewTab?: GamesOverviewTab;
  universeId?: number;
  cardOrientation?: CardOrientation;
  onSetOrientation: (next: CardOrientation) => void;
  onNavigate: (patch: {
    franchiseId?: string;
    gameId?: string;
    section?: GamesSection;
    overviewTab?: GamesOverviewTab;
    universeId?: number;
  }) => void;
  onOpenSeriesFranchise?: (franchiseId: string, subseriesId?: string) => void;
  onOpenMoviesFranchise?: (franchiseId: string, filmId?: string) => void;
  onOpenBooksFranchise?: (franchiseId: string, bookId?: string) => void;
  onOpenMusicRelease?: (
    bandId: number,
    releaseId: string,
    ctx?: {
      franchiseId?: string;
      subseriesId?: string;
      franchiseName?: string;
      franchiseIconUrl?: string | null;
      fromTab?: "home" | "catalog";
      catalogLetter?: string;
    }
  ) => void;
  onOpenArtist?: (bandId: number, artistSection?: string) => void;
  onOpenUniverse?: (universeId: number) => void;
  onBackToPhotos?: () => void;
};

export default function GamesModule({
  mediaOptions,
  busy,
  syncTick,
  onImport,
  onSync,
  onChooseSource,
  isAdmin,
  userId,
  onSwitchProfile,
  onEditProfile,
  onSelectMedia,
  franchiseId,
  gameId,
  section = "overview",
  overviewTab = "about",
  universeId,
  cardOrientation = "portrait",
  onSetOrientation,
  onNavigate,
  onOpenSeriesFranchise,
  onOpenMoviesFranchise,
  onOpenBooksFranchise,
  onOpenMusicRelease,
  onOpenArtist,
  onOpenUniverse,
  onBackToPhotos,
}: Props) {
  const [homeAudioPlaying, setHomeAudioPlaying] = useState(false);
  const [homeAudioHasSrc, setHomeAudioHasSrc] = useState(false);
  const [homeAudioCover, setHomeAudioCover] = useState<string | null>(null);
  const [tab, setTab] = useState<GamesTab>(
    franchiseId || gameId ? "catalog" : "home"
  );
  const [manageCatalogOpen, setManageCatalogOpen] = useState(false);
  const [organizeRomsOpen, setOrganizeRomsOpen] = useState(false);
  const [catalogScope, setCatalogScope] =
    useState<SeriesCatalogScope>("shows");
  const [franchises, setFranchises] = useState<SeriesFranchiseCard[]>([]);
  const [catalogLetters, setCatalogLetters] = useState<string[]>([]);
  const [games, setGames] = useState<MoviesFilmCard[]>([]);
  const [platforms, setPlatforms] = useState<SeriesFranchiseCard[]>([]);
  const [universes, setUniverses] = useState<Universe[]>(
    () => (getCachedUniverses("games") || []).filter((u) => u.has_games)
  );
  const [developer, setDeveloper] = useState("");
  const [dashboard, setDashboard] = useState<SeriesDashboard | null>(
    () => getCachedGamesDashboard()
  );
  const [dashLoading, setDashLoading] = useState(false);
  const [filterOptions, setFilterOptions] =
    useState<SeriesFilterOptions | null>(null);
  const [filterMode, setFilterMode] = useState<SeriesFilterMode>("name");
  const [search, setSearch] = useState("");
  const [letter, setLetter] = useState("A");
  const [continentId, setContinentId] = useState<number | "">("");
  const [countryId, setCountryId] = useState<number | "">("");
  const [startDecade, setStartDecade] = useState<number | "">("");
  const [endDecade, setEndDecade] = useState<number | "">("");
  const [subgenreId, setSubgenreId] = useState<number | "">("");
  const [publisher, setPublisher] = useState("");
  const [writer, setWriter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [ownership, setOwnership] = useState<OwnershipIndex | null>(null);
  const deviceLayout = useDeviceLayout();
  const mobileGated = isGamesMobileGated(deviceLayout);

  useEffect(() => {
    if (!userId) {
      setOwnership(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      void loadOwnershipIndex("games")
        .then((idx) => {
          if (!cancelled) setOwnership(idx);
        })
        .catch(() => {
          if (!cancelled) setOwnership(null);
        });
    };
    load();
    const onChanged = (e: Event) => {
      const mod = (e as CustomEvent<{ module?: string }>).detail?.module;
      if (mod && mod !== "games") return;
      load();
    };
    window.addEventListener("leaf-ownership-changed", onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("leaf-ownership-changed", onChanged);
    };
  }, [userId, syncTick]);

  const visiblePlatforms = useMemo(
    () => (mobileGated ? filterMobileAllowedPlatforms(platforms) : platforms),
    [mobileGated, platforms]
  );

  const visibleGames = useMemo(() => {
    if (!mobileGated) return games;
    return games.filter((g) =>
      gameHasMobileAllowedPlatform({
        platform: (g as { platform?: string }).platform,
        platforms: (g as { platforms?: string[] }).platforms,
      })
    );
  }, [games, mobileGated]);

  const visibleFranchises = useMemo(() => {
    if (!mobileGated) return franchises;
    return franchises.filter((f) => {
      const plats = (f as { platforms?: string[] }).platforms || [];
      if (plats.some((p) => isMobileAllowedPlatform(p))) return true;
      return visibleGames.some((g) => g.work_id === f.id);
    });
  }, [franchises, mobileGated, visibleGames]);

  const ownedGames = useMemo(
    () => markLeafCards(visibleGames, ownership),
    [visibleGames, ownership]
  );

  useEffect(() => {
    if (!mobileGated || !platformFilter) return;
    if (!isMobileAllowedPlatform(platformFilter)) {
      setPlatformFilter(visiblePlatforms[0]?.name || null);
    }
  }, [mobileGated, platformFilter, visiblePlatforms]);

  const gamesFilterModes = useMemo(() => {
    const modes = [...FILTER_MODES];
    const leafScope =
      catalogScope === "shows" ||
      (catalogScope === "platforms" && Boolean(platformFilter));
    if (leafScope && (ownership?.counts.owned ?? 0) > 0) {
      modes.push({ id: "owned", label: "OWNED" });
    }
    return modes;
  }, [catalogScope, platformFilter, ownership]);

  useEffect(() => {
    const leafScope =
      catalogScope === "shows" ||
      (catalogScope === "platforms" && Boolean(platformFilter));
    if (!leafScope && filterMode === "owned") {
      setFilterMode("name");
    }
  }, [catalogScope, platformFilter, filterMode]);

  const loadCatalog = useCallback(() => {
    setCatalogLoading(true);
    const letterScoped = filterMode === "name" && Boolean(letter);
    void fetchGamesCatalog(letterScoped ? { letter } : undefined)
      .then((c) => {
        setFranchises(c.franchises || []);
        setGames(c.games || c.films || []);
        if (c.letters?.length) setCatalogLetters(c.letters);
        setPlatforms(
          (c.platforms || []).map((p) => ({
            ...p,
            subseries: [],
            subseries_count: 0,
            season_count:
              (p as { game_count?: number }).game_count ||
              p.season_count ||
              0,
            letter: (p.name || "?").charAt(0).toUpperCase(),
          }))
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCatalogLoading(false));
  }, [filterMode, letter]);

  const loadDashboard = useCallback((force = false) => {
    const cached = !force ? getCachedGamesDashboard() : null;
    if (cached) {
      setDashboard(cached);
      setDashLoading(false);
    } else {
      setDashLoading(true);
    }
    void prefetchGamesDashboard({
      force,
      recentIds: getRecentGameIds(),
    })
      .then((d) => setDashboard(d))
      .catch(() => {
        if (!cached) setDashboard(null);
      })
      .finally(() => setDashLoading(false));
  }, []);

  useEffect(() => {
    clearMediaTheme(userId);
    loadDashboard(syncTick > 0);
    // Defer full catalog/filter work until Catalog is opened, except when we
    // already need franchises for a deep link — keep prior light home path.
    if (tab === "catalog" || franchiseId || gameId) {
      loadCatalog();
      // Filter options already include used-genre trimming server-side.
      void fetchGamesFilterOptions()
        .then(setFilterOptions)
        .catch(() => setFilterOptions(null));
    }
    void prefetchUniverses("games").then((u) => {
      if (u) setUniverses(u.filter((uni) => Boolean(uni.has_games)));
    });
  }, [loadCatalog, loadDashboard, syncTick, userId, tab, franchiseId, gameId]);

  useEffect(() => {
    if (franchiseId || gameId) setTab("catalog");
  }, [franchiseId, gameId]);

  useEffect(() => {
    const pending = takePendingCatalogBrowse("games");
    if (!pending) return;
    setTab("catalog");
    setFilterMode(pending.mode === "genre" ? "genre" : "name");
    if (pending.letter) setLetter(pending.letter);
    pushGamesCatalogRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot pending browse
  }, []);

  const openFranchise = useCallback(
    (
      workId: string,
      nextGameId?: string,
      nextSection: GamesSection = "overview",
      from: "home" | "catalog" = "catalog"
    ) => {
      const card = (
        franchises.find((f) => f.id === workId) ||
        dashboard?.top_franchises?.find((f) => f.id === workId)
      ) as SeriesFranchiseCard | undefined;
      // Franchise hub whose [Artwork] lives under Series/Movies/Books → home
      // module (same pattern as MoviesModule). Leaf game pages stay in Games.
      if (!nextGameId && card && isArtworkHomeElsewhere(card, "games")) {
        const home = artworkHomeModule(card)!;
        saveFranchiseHomeReferrer({
          source: "games",
          home,
          fromTab: from,
          catalogLetter: from === "catalog" ? letter || "A" : undefined,
          franchiseId: workId,
          franchiseName: card.name,
          preferredSection: preferredSectionForSource("games"),
          backLabel: "GAMES",
        });
        if (home === "series") {
          onOpenSeriesFranchise?.(workId);
          return;
        }
        if (home === "movies") {
          onOpenMoviesFranchise?.(workId);
          return;
        }
        if (home === "books") {
          onOpenBooksFranchise?.(workId);
          return;
        }
      }
      if (!nextGameId) {
        saveFranchiseHomeReferrer({
          source: "games",
          home: "games",
          fromTab: from,
          catalogLetter: from === "catalog" ? letter || "A" : undefined,
          franchiseId: workId,
          franchiseName: card?.name,
          preferredSection: preferredSectionForSource("games"),
          backLabel: "GAMES",
        });
      }
      pushGamesRoute({
        franchiseId: workId,
        gameId: nextGameId,
        section: nextSection,
        overviewTab: "about",
      });
      onNavigate({
        franchiseId: workId,
        gameId: nextGameId,
        section: nextSection,
        overviewTab: "about",
      });
    },
    [
      dashboard?.top_franchises,
      franchises,
      letter,
      onNavigate,
      onOpenBooksFranchise,
      onOpenMoviesFranchise,
      onOpenSeriesFranchise,
    ]
  );

  const openGame = useCallback(
    (id: string, workId?: string) => {
      const fid = workId || franchises.find((f) =>
        ((f as SeriesFranchiseCard & { films?: MoviesFilmCard[] }).films || []).some(
          (g) => g.id === id
        )
      )?.id || games.find((g) => g.id === id)?.work_id || "game";
      openFranchise(fid, id, "overview");
    },
    [franchises, games, openFranchise]
  );

  const browseFranchises = useMemo((): SeriesFranchiseCard[] => {
    const filteredFranchises = platformFilter
      ? visibleFranchises.filter((f) =>
          ((f as { platforms?: string[] }).platforms || []).some(
            (p) => p.toLowerCase() === platformFilter.toLowerCase()
          )
        )
      : visibleFranchises;

    if (catalogScope === "franchises") {
      return filteredFranchises
        .filter(
          (f) =>
            !(f as SeriesFranchiseCard & { is_standalone?: boolean }).is_standalone
        )
        .map((f) => {
          const workGames =
            (f as SeriesFranchiseCard & { films?: MoviesFilmCard[]; games?: MoviesFilmCard[] })
              .games ||
            (f as SeriesFranchiseCard & { films?: MoviesFilmCard[] }).films ||
            games.filter((g) => g.work_id === f.id);
          return {
            ...f,
            subseries: workGames.map((g) => ({
              id: g.id,
              title: g.title,
              date_iso: g.date_iso,
              display_date: g.display_date ?? null,
              folder_path: g.folder_path,
              cover_url: g.cover_url,
              logo_url: g.logo_url ?? null,
              icon_url: g.icon_url ?? null,
              badge_url: null,
              season_count: 1,
            })),
            subseries_count: workGames.length,
            season_count: workGames.length || f.season_count || 0,
          };
        });
    }
    // Platforms scope with a selected platform → game cards (same as GAMES view).
    if (
      catalogScope === "shows" ||
      (catalogScope === "platforms" && platformFilter)
    ) {
      const list = platformFilter
        ? ownedGames.filter(
            (g) =>
              ((g as { platform?: string }).platform || "").toLowerCase() ===
              platformFilter.toLowerCase()
          )
        : ownedGames;
      return list.map((g) => {
        const titleLetter = (() => {
          const ch = (g.title || "").trim().charAt(0).toUpperCase();
          return ch && ch >= "A" && ch <= "Z" ? ch : "#";
        })();
        const genreNames =
          (g as { genre_names?: string[] }).genre_names || [];
        const developers =
          (g as { developers?: string[] }).developers || [];
        const publishers =
          (g as { publishers?: string[] }).publishers || [];
        const directors =
          (g as { directors?: string[]; writers?: string[] }).directors ||
          (g as { writers?: string[] }).writers ||
          [];
        const owned = Boolean((g as { owned?: boolean }).owned);
        return {
          id: g.id,
          name: g.title,
          letter: titleLetter,
          slug: g.work_id || g.id,
          folder_path: g.folder_path,
          cover_url: g.cover_url,
          portrait_url: g.portrait_url,
          landscape_url: g.landscape_url,
          banner_url: g.banner_url,
          logo_url: g.logo_url ?? null,
          icon_url: g.icon_url ?? null,
          badge_url: null,
          genre_names: genreNames,
          developers,
          publishers,
          writers: directors,
          platforms: (g as { platform?: string }).platform
            ? [(g as { platform?: string }).platform as string]
            : [],
          open_url: (g as { open_url?: string | null }).open_url,
          open_mode:
            (g as { open_mode?: string | null }).open_mode ||
            ((g as { open_url?: string | null }).open_url &&
            /^https?:\/\//i.test(
              String((g as { open_url?: string | null }).open_url || "")
            )
              ? "web"
              : null),
          rom_bytes: (g as { rom_bytes?: number | null }).rom_bytes ?? null,
          rom_filename:
            (g as { rom_filename?: string | null }).rom_filename ?? null,
          has_rom: Boolean((g as { has_rom?: boolean }).has_rom),
          open_label:
            (g as { has_rom?: boolean }).has_rom ||
            (g as { open_url?: string | null }).open_url
              ? "Play game"
              : null,
          owned,
          subseries: [
            {
              id: g.id,
              title: g.title,
              date_iso: g.date_iso,
              display_date: g.display_date ?? null,
              folder_path: g.folder_path,
              cover_url: g.cover_url,
              season_count: 1,
              owned,
            },
          ],
          subseries_count: 1,
          season_count: 1,
        } as SeriesFranchiseCard;
      });
    }
    return filteredFranchises;
  }, [catalogScope, visibleFranchises, ownedGames, platformFilter]);

  const gatedGameUnavailable = useMemo(() => {
    if (!mobileGated || !gameId) return false;
    if (!games.length && catalogLoading) return false;
    const game = games.find((item) => item.id === gameId);
    if (!game) return false;
    return !gameHasMobileAllowedPlatform({
      platform: (game as { platform?: string }).platform,
      platforms: (game as { platforms?: string[] }).platforms,
    });
  }, [mobileGated, gameId, games, catalogLoading]);

  const homeDashboard = useMemo(() => {
    if (!dashboard || !mobileGated) return dashboard;
    const dashExtra = dashboard as SeriesDashboard & {
      top_games?: MoviesFilmCard[];
    };
    const rawTop: MoviesFilmCard[] = Array.isArray(dashExtra.top_games)
      ? dashExtra.top_games
      : Array.isArray(dashboard.top_series)
        ? (dashboard.top_series as unknown as MoviesFilmCard[])
        : [];
    const topGames = rawTop.filter((g) =>
      gameHasMobileAllowedPlatform({
        platform: (g as { platform?: string }).platform,
        platforms: (g as { platforms?: string[] }).platforms,
      })
    );
    const topFranchises = (dashboard.top_franchises || []).filter((f) => {
      const plats = (f as { platforms?: string[] }).platforms || [];
      if (plats.some((p) => isMobileAllowedPlatform(p))) return true;
      return topGames.some((g) => g.work_id === f.id);
    });
    return {
      ...dashboard,
      top_franchises: topFranchises,
      top_games: topGames,
      platforms: filterMobileAllowedPlatforms(
        ((dashboard as { platforms?: SeriesFranchiseCard[] }).platforms ||
          []) as SeriesFranchiseCard[]
      ),
    };
  }, [dashboard, mobileGated]);

  if (franchiseId) {
    if (gameId) {
      const workCard = visibleFranchises.find((f) => f.id === franchiseId)
        || franchises.find((f) => f.id === franchiseId);
      const game = games.find((item) => item.id === gameId);
      if (gatedGameUnavailable) {
        return (
          <div className="music-module">
            <ModuleTopBar
              media={
                mediaOptions.find((m) => m.kind === "games") ?? {
                  id: 600,
                  kind: "games",
                  label: "Games",
                }
              }
              mediaOptions={mediaOptions}
              onSelectMedia={onSelectMedia}
              tabs={[
                {
                  id: "back",
                  label: "GAMES",
                  active: false,
                  onClick: () => {
                    pushGamesCatalogRoute();
                    onNavigate({
                      franchiseId: undefined,
                      gameId: undefined,
                      section: undefined,
                      overviewTab: undefined,
                      universeId: undefined,
                    });
                    setTab("catalog");
                  },
                },
              ]}
              menu={
                <AppMenu
                  isAdmin={isAdmin}
                  onImport={onImport}
                  onSync={onSync}
                  onChooseSource={onChooseSource}
                  onSwitchProfile={onSwitchProfile}
                  onEditProfile={onEditProfile}
                />
              }
            />
            <div className="artist-browse-empty" style={{ padding: "2rem 1.25rem" }}>
              <p>
                {game?.title || "This game"} is not available on this device.
              </p>
              <p className="muted">
                Mobile play is limited to RetroArch-friendly platforms and
                Browser / Flash. Open this title on a PC or large tablet, or use
                Launch on PC from an allowed game.
              </p>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  pushGamesCatalogRoute();
                  onNavigate({
                    franchiseId: undefined,
                    gameId: undefined,
                    section: undefined,
                    overviewTab: undefined,
                    universeId: undefined,
                  });
                  setTab("catalog");
                }}
              >
                Back to Games
              </button>
            </div>
          </div>
        );
      }
      return (
        <SeriesSubseriesPage
          variant="game"
          franchiseId={franchiseId}
          franchiseName={workCard?.name || game?.work_name}
          franchiseLogoUrl={workCard?.logo_url}
          franchiseIconUrl={workCard?.icon_url}
          subseriesId={gameId}
          section={section as import("../../types").SeriesSection}
          overviewTab={overviewTab}
          universeId={universeId}
          busy={busy}
          isAdmin={isAdmin}
          userId={userId}
          cardOrientation={cardOrientation}
          onSetOrientation={onSetOrientation}
          onImport={onImport}
          onSync={onSync}
          onChooseSource={onChooseSource}
          onSwitchProfile={onSwitchProfile}
          onEditProfile={onEditProfile}
          backLabelOverride={
            shouldReturnToPhotosExclusive() ? "EXCLUSIVE" : undefined
          }
          onBack={() => {
            if (shouldReturnToPhotosExclusive() && onBackToPhotos) {
              onBackToPhotos();
              return;
            }
            clearMediaTheme(userId);
            pushGamesCatalogRoute();
            onNavigate({
              franchiseId: undefined,
              gameId: undefined,
              section: undefined,
              overviewTab: undefined,
              universeId: undefined,
            });
            setTab("catalog");
            setCatalogScope("shows");
            setFilterMode("name");
          }}
          onBrowseCatalog={(target: SeriesCatalogBrowseTarget) => {
            setTab("catalog");
            setCatalogScope("shows");
            setFilterMode(target.mode);
            setSearch("");
            setLetter(target.mode === "name" ? "A" : "");
            setPlatformFilter(null);
            let nextSubgenre: number | "" = target.subgenreId ?? "";
            if (
              nextSubgenre === "" &&
              target.genreName &&
              filterOptions?.subgenre_groups
            ) {
              const want = target.genreName.trim().toLowerCase();
              for (const group of filterOptions.subgenre_groups) {
                const hit = (group.items || []).find(
                  (item) => (item.name || "").trim().toLowerCase() === want
                );
                if (hit?.id != null) {
                  nextSubgenre = hit.id;
                  break;
                }
              }
            }
            setSubgenreId(nextSubgenre);
            setDeveloper(target.developer ?? "");
            setPublisher(target.publisher ?? "");
            setWriter(target.writer ?? "");
            setContinentId("");
            setCountryId("");
            setStartDecade("");
            setEndDecade("");
            pushGamesCatalogRoute();
            onNavigate({
              franchiseId: undefined,
              gameId: undefined,
              section: undefined,
              overviewTab: undefined,
              universeId: undefined,
            });
          }}
          onOpenFilm={(id) => openGame(id, franchiseId)}
          onOpenMusicRelease={onOpenMusicRelease}
          onOpenArtist={
            onOpenArtist
              ? (bandId) => {
                  saveArtistEntryReferrer({
                    source: "games",
                    section: defaultSectionForSource("games"),
                    fromTab: "catalog",
                    franchiseId,
                    gameId,
                    franchiseName: workCard?.name || game?.work_name,
                    backLabel:
                      (workCard?.name || game?.title || "GAMES").toLocaleUpperCase(),
                  });
                  onOpenArtist(bandId);
                }
              : undefined
          }
          onOpenSeriesFranchise={onOpenSeriesFranchise}
          onOpenMoviesPath={(path) => {
            void resolveMoviesPath(path)
              .then((hit) => {
                onOpenMoviesFranchise?.(hit.work_id, hit.film_id ?? undefined);
              })
              .catch(() => undefined);
          }}
          onOpenBooksPath={(path) => {
            void resolveBooksPath(path)
              .then((hit) => {
                onOpenBooksFranchise?.(hit.work_id, hit.book_id ?? undefined);
              })
              .catch(() => undefined);
          }}
          onNavigate={(patch) => {
            const nextFid = patch.franchiseId ?? franchiseId;
            const nextGid =
              "subseriesId" in patch ? patch.subseriesId : gameId;
            const nextSection = (patch.section === "library"
              ? "books"
              : patch.section) as GamesSection | undefined;
            if (!nextGid && nextFid) {
              clearMediaTheme(userId);
              const home = artworkHomeModule(workCard) || "games";
              saveFranchiseHomeReferrer({
                source: "games",
                home,
                franchiseId: nextFid,
                franchiseName: workCard?.name || game?.work_name,
                preferredSection: "games",
                backLabel: "GAMES",
              });
              if (home === "series") {
                onOpenSeriesFranchise?.(nextFid);
                return;
              }
              if (home === "movies") {
                onOpenMoviesFranchise?.(nextFid);
                return;
              }
              if (home === "books") {
                onOpenBooksFranchise?.(nextFid);
                return;
              }
            }
            pushGamesRoute({
              franchiseId: nextFid,
              franchiseName: workCard?.name || game?.work_name,
              gameId: nextGid,
              section: nextSection ?? "overview",
              overviewTab: patch.overviewTab as GamesOverviewTab | undefined,
              universeId: patch.universeId,
            });
            onNavigate({
              franchiseId: nextFid,
              gameId: nextGid,
              section: nextSection,
              overviewTab: patch.overviewTab as GamesOverviewTab | undefined,
              universeId: patch.universeId,
            });
          }}
        />
      );
    }
    return (
      <GamesFranchisePage
        workId={franchiseId}
        section={section}
        overviewTab={overviewTab}
        universeId={universeId}
        cardOrientation={cardOrientation}
        onSetOrientation={onSetOrientation}
        isAdmin={isAdmin}
        userId={userId}
        onImport={onImport}
        onSync={onSync}
        onChooseSource={onChooseSource}
        onSwitchProfile={onSwitchProfile}
        onEditProfile={onEditProfile}
        backLabel={
          shouldReturnToPhotosExclusive() ? "EXCLUSIVE" : "GAMES"
        }
        onBack={() => {
          if (shouldReturnToPhotosExclusive() && onBackToPhotos) {
            onBackToPhotos();
            return;
          }
          clearMediaTheme(userId);
          pushGamesRootRoute();
          onNavigate({
            franchiseId: undefined,
            gameId: undefined,
            section: undefined,
            overviewTab: undefined,
          });
          setTab("home");
        }}
        onNavigate={(patch) => {
          const nextFid = patch.franchiseId ?? franchiseId;
          const nextGid = "gameId" in patch ? patch.gameId : undefined;
          const nextSec = patch.section ?? section;
          const nextTab = patch.overviewTab ?? overviewTab;
          if (!nextGid && nextFid) {
            const card = franchises.find((f) => f.id === nextFid) as
              | SeriesFranchiseCard
              | undefined;
            if (card && isArtworkHomeElsewhere(card, "games")) {
              const home = artworkHomeModule(card)!;
              saveFranchiseHomeReferrer({
                source: "games",
                home,
                franchiseId: nextFid,
                franchiseName: card.name,
                preferredSection: preferredSectionForSource("games"),
                backLabel: "GAMES",
              });
              if (home === "series") {
                onOpenSeriesFranchise?.(nextFid);
                return;
              }
              if (home === "movies") {
                onOpenMoviesFranchise?.(nextFid);
                return;
              }
              if (home === "books") {
                onOpenBooksFranchise?.(nextFid);
                return;
              }
            }
          }
          pushGamesRoute({
            franchiseId: nextFid,
            gameId: nextGid,
            section: nextSec,
            overviewTab: nextTab,
            universeId: patch.universeId ?? universeId,
          });
          onNavigate({
            franchiseId: nextFid,
            gameId: nextGid,
            section: nextSec,
            overviewTab: nextTab,
            universeId: patch.universeId ?? universeId,
          });
        }}
        onOpenSeriesFranchise={onOpenSeriesFranchise}
        onOpenMusicRelease={onOpenMusicRelease}
        onOpenMoviesPath={(path) => {
          void resolveMoviesPath(path)
            .then((hit) => {
              onOpenMoviesFranchise?.(hit.work_id, hit.film_id ?? undefined);
            })
            .catch(() => undefined);
        }}
        onOpenBooksPath={(path) => {
          void resolveBooksPath(path)
            .then((hit) => {
              onOpenBooksFranchise?.(hit.work_id, hit.book_id ?? undefined);
            })
            .catch(() => undefined);
        }}
        onBrowseCatalog={(target) => {
          setTab("catalog");
          setCatalogScope("shows");
          setFilterMode(target.mode);
          setSearch("");
          setLetter(target.mode === "name" ? "A" : "");
          setPlatformFilter(null);
          setSubgenreId(target.subgenreId ?? "");
          setDeveloper(
            (target as { developer?: string }).developer ?? ""
          );
          setPublisher(target.publisher ?? "");
          setWriter(target.writer ?? "");
          pushGamesCatalogRoute();
          onNavigate({
            franchiseId: undefined,
            gameId: undefined,
            section: undefined,
            overviewTab: undefined,
            universeId: undefined,
          });
        }}
      />
    );
  }

  const showHomePlaybackBg = Boolean(homeAudioPlaying && homeAudioCover);
  const openMusicRelease = (bandId: number, releaseId: string) => {
    if (!onOpenMusicRelease) return;
    onOpenMusicRelease(bandId, releaseId, {
      franchiseId: franchiseId || undefined,
      subseriesId: gameId,
      fromTab: !franchiseId ? tab : undefined,
      catalogLetter:
        !franchiseId && tab === "catalog" ? letter || "A" : undefined,
    });
  };

  return (
    <div
      className={`music-module${moduleHomePlaybackClassNames({
        showPlaybackBg: showHomePlaybackBg,
        hasSrc: homeAudioHasSrc,
        playing: homeAudioPlaying,
      })}`}
    >
      {showHomePlaybackBg || homeAudioPlaying || homeAudioHasSrc ? (
        <PlaybackCoverAtmosphere
          playing={homeAudioPlaying}
          hasSrc={homeAudioHasSrc}
          coverUrl={homeAudioCover}
        />
      ) : null}
      <ModuleTopBar
        media={
          mediaOptions.find((m) => m.kind === "games") ?? {
            id: 600,
            kind: "games",
            label: "Games",
          }
        }
        mediaOptions={mediaOptions}
        onSelectMedia={onSelectMedia}
        tabs={[
          {
            id: "home",
            label: "HOME",
            active: tab === "home",
            onClick: () => {
              setTab("home");
              pushGamesRootRoute();
            },
          },
          {
            id: "catalog",
            label: "GAMES",
            active: tab === "catalog",
            onClick: () => {
              setTab("catalog");
              setCatalogScope("shows");
              setFilterMode("name");
              setPlatformFilter(null);
              pushGamesCatalogRoute();
              loadCatalog();
            },
          },
        ]}
        menu={
          <>
            {busy ? (
              <span className="status-bar module-top-bar__status">{busy}</span>
            ) : null}
            {tab === "catalog" ? (
              <>
                {catalogScope === "platforms" ? (
                  <GamesPlatformFilter
                    platforms={visiblePlatforms}
                    value={platformFilter}
                    onChange={(name) => {
                      setPlatformFilter(name);
                      setFilterMode("name");
                      setLetter("A");
                    }}
                  />
                ) : null}
                <CatalogScopeToggle
                  value={catalogScope}
                  onChange={(next) => {
                    setCatalogScope(next);
                    if (next === "platforms") {
                      setFilterMode("name");
                      // Default to first platform — not ALL (which dumps every game).
                      const first =
                        visiblePlatforms[0]?.name ||
                        visiblePlatforms[0]?.id ||
                        null;
                      setPlatformFilter(first);
                      setLetter("A");
                    } else {
                      setPlatformFilter(null);
                    }
                  }}
                  itemsLabel="GAMES"
                  itemsIcon={
                    <IconMediaGames className="catalog-scope-toggle__icon" />
                  }
                  hasUniverses={universes.length > 0}
                  hasPlatforms
                  platformsIcon={
                    <IconMediaGames className="catalog-scope-toggle__icon" />
                  }
                />
                <CardOrientationPicker
                  value={cardOrientation}
                  onChange={onSetOrientation}
                  includeBadge={catalogScope === "franchises"}
                />
              </>
            ) : null}
            <ModuleHomeAudioPlayer
              module="games"
              userId={userId}
              onPlayingChange={setHomeAudioPlaying}
              onCoverChange={setHomeAudioCover}
              onHasSrcChange={setHomeAudioHasSrc}
              onOpenMusicRelease={openMusicRelease}
              onOpenMusicArtist={
                onOpenArtist
                  ? (bandId) => {
                      saveArtistEntryReferrer({
                        source: "games",
                        section: defaultSectionForSource("games"),
                        fromTab: tab,
                        catalogLetter:
                          tab === "catalog" ? letter || "A" : undefined,
                        backLabel: "GAMES",
                      });
                      onOpenArtist(bandId, "overview");
                    }
                  : undefined
              }
            />
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              onManageCatalog={
                isAdmin && tab === "catalog"
                  ? () => setManageCatalogOpen(true)
                  : undefined
              }
              manageCatalogLabel="My games"
              onOrganizeLooseRoms={
                isAdmin && tab === "catalog"
                  ? () => setOrganizeRomsOpen(true)
                  : undefined
              }
              onLocalPlatformIcons={
                isAdmin
                  ? () => {
                      void regenerateGamesPlatformIcons(false)
                        .then(() => {
                          loadCatalog();
                          loadDashboard();
                        })
                        .catch(() => undefined);
                    }
                  : undefined
              }
            />
          </>
        }
      />

      {error ? <div className="error">{error}</div> : null}

      {tab === "home" ? (
        <div className="music-module__body music-module__body--home">
          <GamesHome
            data={homeDashboard}
            loading={dashLoading}
            universes={universes}
            platforms={visiblePlatforms}
            onPlatform={(_platformId, platformName) => {
              setTab("catalog");
              pushGamesCatalogRoute();
              setCatalogScope("platforms");
              setFilterMode("name");
              setPlatformFilter(platformName || _platformId);
              setSubgenreId("");
              setLetter("A");
              loadCatalog();
            }}
            onFranchise={(workId) => openFranchise(workId, undefined, "overview", "home")}
            onGame={openGame}
            onOpenUniverse={onOpenUniverse}
            onGenre={(id) => {
              setTab("catalog");
              pushGamesCatalogRoute();
              setCatalogScope("shows");
              setFilterMode("genre");
              setPlatformFilter(null);
              setContinentId("");
              setCountryId("");
              setStartDecade("");
              setEndDecade("");
              const numeric =
                typeof id === "number"
                  ? id
                  : typeof id === "string" && /^\d+$/.test(id)
                    ? Number(id)
                    : "";
              setSubgenreId(
                numeric === "" || Number.isNaN(numeric) ? "" : numeric
              );
              loadCatalog();
            }}
          />
        </div>
      ) : (
        <SeriesBrowse
          franchises={browseFranchises}
          platforms={visiblePlatforms}
          universes={universes}
          catalogLetters={catalogLetters}
          orientation={cardOrientation}
          filterMode={filterMode}
          filterOptions={
            mobileGated && filterOptions
              ? {
                  ...filterOptions,
                  platforms: (filterOptions.platforms || []).filter((p) =>
                    isMobileAllowedPlatform(p.name)
                  ),
                }
              : filterOptions
          }
          catalogScope={
            catalogScope === "platforms" && platformFilter
              ? "shows"
              : catalogScope
          }
          search={search}
          letter={letter}
          continentId={continentId}
          countryId={countryId}
          startDecade={startDecade}
          endDecade={endDecade}
          subgenreId={subgenreId}
          publisher={publisher}
          writer={writer}
          developer={developer}
          platformName={platformFilter || ""}
          unitNoun="game"
          filterModes={gamesFilterModes}
          loading={catalogLoading}
          onSearchChange={setSearch}
          onLetterChange={setLetter}
          onFilterModeChange={(next) => {
            setFilterMode(next);
            // Stay on Franchises / Platforms when filtering — only force GAMES
            // from Universes (or Platforms with no selection).
            if (catalogScope === "franchises") return;
            if (catalogScope === "platforms" && platformFilter) return;
            if (catalogScope === "universes") {
              setCatalogScope("shows");
            }
          }}
          onContinentIdChange={setContinentId}
          onCountryIdChange={setCountryId}
          onStartDecadeChange={setStartDecade}
          onEndDecadeChange={setEndDecade}
          onSubgenreIdChange={setSubgenreId}
          onPublisherChange={setPublisher}
          onWriterChange={setWriter}
          onDeveloperChange={setDeveloper}
          onPlatformNameChange={(name) => {
            setPlatformFilter(name || null);
            if (name) {
              setCatalogScope("shows");
              setFilterMode("name");
            }
          }}
          onOpen={(fid, subId) => {
            if (catalogScope === "platforms" && !platformFilter) {
              const plat = platforms.find((p) => p.id === fid);
              setFilterMode("name");
              setPlatformFilter(plat?.name || fid);
              setLetter("A");
              return;
            }
            if (catalogScope === "shows") {
              openGame(
                subId || fid,
                games.find((g) => g.id === (subId || fid))?.work_id
              );
              return;
            }
            if (subId) openGame(subId, fid);
            else openFranchise(fid);
          }}
          onOpenUniverse={onOpenUniverse}
        />
      )}

      {manageCatalogOpen && isAdmin ? (
        <ManageCatalogModal
          module="games"
          onClose={() => setManageCatalogOpen(false)}
          onChanged={() => {
            loadCatalog();
            loadDashboard();
          }}
        />
      ) : null}
      {organizeRomsOpen && isAdmin ? (
        <OrganizeLooseRomsModal
          onClose={() => setOrganizeRomsOpen(false)}
          onDone={() => {
            loadCatalog();
            loadDashboard();
          }}
        />
      ) : null}
    </div>
  );
}
