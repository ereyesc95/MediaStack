import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchGamesCatalog,
  fetchGamesDashboard,
  fetchGamesFilterOptions,
  resolveBooksPath,
  resolveMoviesPath,
} from "../../api";
import { getCachedUniverses, prefetchUniverses } from "../../universesCache";
import { clearMediaTheme } from "../../mediaTheme";
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
import { IconMediaGames } from "../MenuIcons";
import ModuleTopBar, { type MediaOption } from "../ModuleTopBar";
import CatalogScopeToggle from "../series/CatalogScopeToggle";
import SeriesBrowse, {
  type SeriesCatalogScope,
} from "../series/SeriesBrowse";
import SeriesSubseriesPage, {
  type SeriesCatalogBrowseTarget,
} from "../series/SeriesSubseriesPage";
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
  onOpenMusicRelease?: (bandId: number, releaseId: string) => void;
  onOpenUniverse?: (universeId: number) => void;
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
  onOpenUniverse,
}: Props) {
  const [tab, setTab] = useState<GamesTab>(
    franchiseId || gameId ? "catalog" : "home"
  );
  const [manageCatalogOpen, setManageCatalogOpen] = useState(false);
  const [catalogScope, setCatalogScope] =
    useState<SeriesCatalogScope>("shows");
  const [franchises, setFranchises] = useState<SeriesFranchiseCard[]>([]);
  const [games, setGames] = useState<MoviesFilmCard[]>([]);
  const [platforms, setPlatforms] = useState<SeriesFranchiseCard[]>([]);
  const [universes, setUniverses] = useState<Universe[]>(
    () => (getCachedUniverses("games") || []).filter((u) => u.has_games)
  );
  const [developer, setDeveloper] = useState("");
  const [dashboard, setDashboard] = useState<SeriesDashboard | null>(null);
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

  const loadCatalog = useCallback(() => {
    setCatalogLoading(true);
    void fetchGamesCatalog()
      .then((c) => {
        setFranchises(c.franchises || []);
        setGames(c.games || c.films || []);
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
  }, []);

  const loadDashboard = useCallback(() => {
    setDashLoading(true);
    void fetchGamesDashboard(getRecentGameIds())
      .then((d) => setDashboard(d))
      .catch(() => setDashboard(null))
      .finally(() => setDashLoading(false));
  }, []);

  useEffect(() => {
    clearMediaTheme(userId);
    loadDashboard();
    loadCatalog();
    void Promise.all([fetchGamesFilterOptions(), fetchGamesCatalog()])
      .then(([opts, catalog]) => {
        const used = new Set(
          (catalog.games || catalog.films || [])
            .flatMap((g) => (g as { genre_names?: string[] }).genre_names || [])
            .map((n) => String(n).trim().toLowerCase())
            .filter(Boolean)
        );
        // Never fall back to all_subgenre_groups (full seed taxonomy).
        const sourceGroups = opts.subgenre_groups || [];
        const groups = used.size
          ? sourceGroups
              .map((group) => ({
                ...group,
                items: (group.items || []).filter((item) =>
                  used.has(String(item.name || "").trim().toLowerCase())
                ),
              }))
              .filter((group) => (group.items || []).length > 0)
          : sourceGroups;
        setFilterOptions({
          ...opts,
          all_subgenre_groups: groups,
          subgenre_groups: groups,
          genres: groups.flatMap((g) =>
            (g.items || []).map((item) => ({
              id: item.id,
              name: item.name || "",
            }))
          ),
        });
      })
      .catch(() => setFilterOptions(null));
    void prefetchUniverses("games", { force: true }).then((u) => {
      if (u) setUniverses(u.filter((uni) => Boolean(uni.has_games)));
    });
  }, [loadCatalog, loadDashboard, syncTick, userId]);

  useEffect(() => {
    if (franchiseId || gameId) setTab("catalog");
  }, [franchiseId, gameId]);

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
      ? franchises.filter((f) =>
          ((f as { platforms?: string[] }).platforms || []).some(
            (p) => p.toLowerCase() === platformFilter.toLowerCase()
          )
        )
      : franchises;

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
        ? games.filter(
            (g) =>
              ((g as { platform?: string }).platform || "").toLowerCase() ===
              platformFilter.toLowerCase()
          )
        : games;
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
          open_mode: (g as { open_mode?: string | null }).open_mode,
          has_rom: Boolean((g as { has_rom?: boolean }).has_rom),
          open_label: (g as { has_rom?: boolean }).has_rom
            ? "Play game"
            : null,
          subseries: [
            {
              id: g.id,
              title: g.title,
              date_iso: g.date_iso,
              display_date: g.display_date ?? null,
              folder_path: g.folder_path,
              cover_url: g.cover_url,
              season_count: 1,
            },
          ],
          subseries_count: 1,
          season_count: 1,
        } as SeriesFranchiseCard;
      });
    }
    return filteredFranchises;
  }, [catalogScope, franchises, games, platformFilter]);

  if (franchiseId) {
    if (gameId) {
      const workCard = franchises.find((f) => f.id === franchiseId);
      const game = games.find((item) => item.id === gameId);
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
          onBack={() => {
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
        backLabel="GAMES"
        onBack={() => {
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
                    platforms={platforms}
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
            />
          </>
        }
      />

      {error ? <div className="error">{error}</div> : null}

      {tab === "home" ? (
        <div className="music-module__body music-module__body--home">
          <GamesHome
            data={dashboard}
            loading={dashLoading}
            universes={universes}
            platforms={platforms}
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
          platforms={platforms}
          universes={universes}
          orientation={cardOrientation}
          filterMode={filterMode}
          filterOptions={filterOptions}
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
          filterModes={FILTER_MODES}
          loading={catalogLoading}
          onSearchChange={setSearch}
          onLetterChange={setLetter}
          onFilterModeChange={(next) => {
            setFilterMode(next);
            // Keep Platforms scope when a platform is selected (game cards + ALL filter).
            if (catalogScope === "platforms" && platformFilter) return;
            if (
              next === "developer" ||
              next === "publisher" ||
              next === "writer" ||
              next === "genre" ||
              next === "start" ||
              next === "name" ||
              next === "most_played"
            ) {
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
    </div>
  );
}
