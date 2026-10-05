import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchGamesCatalog,
  fetchGamesDashboard,
  fetchGamesFilterOptions,
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
import GamesHome from "./GamesHome";
import GamesMediaPage from "./GamesMediaPage";

type GamesTab = "home" | "catalog";

const FILTER_MODES: { id: SeriesFilterMode; label: string }[] = [
  { id: "name", label: "NAME" },
  { id: "genre", label: "GENRE" },
  { id: "start", label: "RELEASE DATE" },
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
    useState<SeriesCatalogScope>("platforms");
  const [franchises, setFranchises] = useState<SeriesFranchiseCard[]>([]);
  const [games, setGames] = useState<MoviesFilmCard[]>([]);
  const [platforms, setPlatforms] = useState<SeriesFranchiseCard[]>([]);
  const [universes, setUniverses] = useState<Universe[]>(
    () => getCachedUniverses() || []
  );
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
    clearMediaTheme();
    loadDashboard();
    loadCatalog();
    void fetchGamesFilterOptions()
      .then(setFilterOptions)
      .catch(() => setFilterOptions(null));
    void prefetchUniverses().then((u) => {
      if (u) setUniverses(u);
    });
  }, [loadCatalog, loadDashboard, syncTick]);

  useEffect(() => {
    if (franchiseId || gameId) setTab("catalog");
  }, [franchiseId, gameId]);

  const openFranchise = useCallback(
    (workId: string, nextGameId?: string, nextSection: GamesSection = "overview") => {
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
    [onNavigate]
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
    if (catalogScope === "shows") {
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
    return (
      <GamesMediaPage
        franchiseId={franchiseId}
        gameId={gameId}
        section={section}
        overviewTab={overviewTab}
        cardOrientation={cardOrientation}
        onSetOrientation={onSetOrientation}
        isAdmin={isAdmin}
        onImport={onImport}
        onSync={onSync}
        onChooseSource={onChooseSource}
        onSwitchProfile={onSwitchProfile}
        onEditProfile={onEditProfile}
        onBack={() => {
          pushGamesRootRoute();
          onNavigate({
            franchiseId: undefined,
            gameId: undefined,
            section: "overview",
          });
          setTab("home");
        }}
        onNavigate={(patch) => {
          const nextFid = patch.franchiseId ?? franchiseId;
          const nextGid = "gameId" in patch ? patch.gameId : gameId;
          const nextSec = patch.section ?? section;
          const nextTab = patch.overviewTab ?? overviewTab;
          pushGamesRoute({
            franchiseId: nextFid,
            gameId: nextGid,
            section: nextSec,
            overviewTab: nextTab,
            universeId,
          });
          onNavigate({
            franchiseId: nextFid,
            gameId: nextGid,
            section: nextSec,
            overviewTab: nextTab,
          });
        }}
        onOpenSeriesFranchise={onOpenSeriesFranchise}
        onOpenMoviesFranchise={onOpenMoviesFranchise}
        onOpenBooksFranchise={onOpenBooksFranchise}
        onOpenMusicRelease={onOpenMusicRelease}
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
            label: "CATALOG",
            active: tab === "catalog",
            onClick: () => {
              setTab("catalog");
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
            <CardOrientationPicker
              value={cardOrientation}
              onChange={onSetOrientation}
              includeBadge={catalogScope === "franchises"}
            />
            {tab === "catalog" ? (
              <CatalogScopeToggle
                value={catalogScope}
                onChange={(next) => {
                  setCatalogScope(next);
                  if (next !== "platforms") setPlatformFilter(null);
                }}
                itemsLabel="GAMES"
                itemsIcon={<IconMediaGames className="catalog-scope-toggle__icon" />}
                hasUniverses={universes.length > 0}
                hasPlatforms
                platformsIcon={<IconMediaGames className="catalog-scope-toggle__icon" />}
              />
            ) : null}
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              onManageCatalog={
                isAdmin ? () => setManageCatalogOpen(true) : undefined
              }
              manageCatalogLabel="Manage Games"
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
            recentGames={
              (dashboard as { recent_games?: MoviesFilmCard[] } | null)
                ?.recent_games || []
            }
            onPlatform={(platformId) => {
              const plat = platforms.find((p) => p.id === platformId);
              setTab("catalog");
              pushGamesCatalogRoute();
              setCatalogScope("franchises");
              setPlatformFilter(plat?.name || platformId);
              loadCatalog();
            }}
            onFranchise={(workId) => openFranchise(workId)}
            onGame={openGame}
            onOpenUniverse={onOpenUniverse}
          />
        </div>
      ) : (
        <div className="music-module__body">
          {platformFilter ? (
            <div className="catalog-active-filter">
              <span>Platform: {platformFilter}</span>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setPlatformFilter(null)}
              >
                Clear
              </button>
            </div>
          ) : null}
          <SeriesBrowse
            franchises={browseFranchises}
            platforms={platforms}
            universes={universes}
            orientation={cardOrientation}
            filterMode={filterMode}
            filterOptions={filterOptions}
            catalogScope={catalogScope}
            search={search}
            letter={letter}
            continentId={continentId}
            countryId={countryId}
            startDecade={startDecade}
            endDecade={endDecade}
            subgenreId={subgenreId}
            publisher={publisher}
            writer={writer}
            unitNoun="game"
            filterModes={FILTER_MODES}
            loading={catalogLoading}
            onSearchChange={setSearch}
            onLetterChange={setLetter}
            onFilterModeChange={setFilterMode}
            onContinentIdChange={setContinentId}
            onCountryIdChange={setCountryId}
            onStartDecadeChange={setStartDecade}
            onEndDecadeChange={setEndDecade}
            onSubgenreIdChange={setSubgenreId}
            onPublisherChange={setPublisher}
            onWriterChange={setWriter}
            onOpen={(fid, subId) => {
              if (catalogScope === "platforms") {
                const plat = platforms.find((p) => p.id === fid);
                setCatalogScope("franchises");
                setPlatformFilter(plat?.name || fid);
                return;
              }
              if (catalogScope === "shows") {
                openGame(subId || fid, games.find((g) => g.id === (subId || fid))?.work_id);
                return;
              }
              if (subId) openGame(subId, fid);
              else openFranchise(fid);
            }}
            onOpenUniverse={onOpenUniverse}
          />
        </div>
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
