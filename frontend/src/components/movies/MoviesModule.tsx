import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchMoviesCatalog,
  fetchMoviesDashboard,
  fetchMoviesFilterOptions,
  fetchUniverses,
  resolveMoviesPath,
} from "../../api";
import { getMediaEntrySource, setMediaEntrySource } from "../../mediaEntry";
import {
  catalogBackgroundIso,
  catalogBackgroundUrl,
} from "../../catalogBackdrop";
import { clearMediaTheme } from "../../mediaTheme";
import {
  pushMoviesCatalogRoute,
  pushMoviesRootRoute,
  pushMoviesRoute,
  type MoviesOverviewTab,
  type MoviesSection,
} from "../../moviesRoute";
import type {
  CardOrientation,
  MoviesFilmCard,
  SeriesDashboard,
  SeriesFilterMode,
  SeriesFilterOptions,
  SeriesFranchiseCard,
  SeriesSection,
  Universe,
} from "../../types";
import {
  isMobilePortraitLayout,
  useDeviceLayout,
} from "../../usePhoneLayout";
import AppMenu from "../AppMenu";
import CardOrientationPicker from "../CardOrientationPicker";
import { IconUniverse } from "../MenuIcons";
import ModuleTopBar, { type MediaOption } from "../ModuleTopBar";
import CatalogScopeToggle from "../series/CatalogScopeToggle";
import SeriesBrowse, {
  type SeriesCatalogScope,
} from "../series/SeriesBrowse";
import SeriesSubseriesPage from "../series/SeriesSubseriesPage";
import MoviesFranchisePage from "./MoviesFranchisePage";
import MoviesHome from "./MoviesHome";

type MoviesTab = "home" | "catalog";

const MOVIES_FILTER_MODES_GROUPS: { id: SeriesFilterMode; label: string }[] = [
  { id: "name", label: "NAME" },
  { id: "continent", label: "CONTINENT" },
  { id: "country", label: "COUNTRY" },
  { id: "start", label: "START DATE" },
  { id: "end", label: "END DATE" },
  { id: "genre", label: "GENRE" },
  { id: "publisher", label: "PUBLISHER" },
  { id: "writer", label: "WRITER" },
  { id: "most_played", label: "MOST PLAYED" },
];

const MOVIES_FILTER_MODES_FILMS: { id: SeriesFilterMode; label: string }[] = [
  { id: "name", label: "NAME" },
  { id: "continent", label: "CONTINENT" },
  { id: "country", label: "COUNTRY" },
  { id: "start", label: "RELEASE DATE" },
  { id: "genre", label: "GENRE" },
  { id: "publisher", label: "PUBLISHER" },
  { id: "writer", label: "WRITER" },
  { id: "most_played", label: "MOST PLAYED" },
];

type Props = {
  mediaOptions: MediaOption[];
  busy?: string;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  isAdmin?: boolean;
  userId?: number;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onSelectMedia: (opt: MediaOption) => void;
  cardOrientation?: CardOrientation;
  onSetOrientation?: (next: CardOrientation) => void;
  franchiseId?: string;
  filmId?: string;
  section?: MoviesSection;
  overviewTab?: MoviesOverviewTab;
  universeId?: number;
  onNavigate: (patch: {
    franchiseId?: string;
    filmId?: string;
    section?: MoviesSection;
    overviewTab?: MoviesOverviewTab;
    universeId?: number;
  }) => void;
  onOpenSeriesFranchise?: (
    franchiseId: string,
    subseriesId?: string,
    universeId?: number
  ) => void;
  onOpenMusicRelease?: (bandId: number, releaseId: string) => void;
  onOpenUniversePage?: (
    universeId: number,
    from: "home" | "catalog"
  ) => void;
};

export default function MoviesModule({
  mediaOptions,
  busy,
  onImport,
  onSync,
  onChooseSource,
  isAdmin,
  userId,
  onSwitchProfile,
  onEditProfile,
  onSelectMedia,
  cardOrientation = "portrait",
  onSetOrientation,
  franchiseId,
  filmId,
  section = "overview",
  overviewTab = "about",
  universeId,
  onNavigate,
  onOpenSeriesFranchise,
  onOpenMusicRelease,
  onOpenUniversePage,
}: Props) {
  const deviceLayout = useDeviceLayout();
  const portraitMenuChrome =
    isMobilePortraitLayout(deviceLayout) ||
    deviceLayout === "tablet-portrait";

  const [tab, setTab] = useState<MoviesTab>("home");
  const [franchises, setFranchises] = useState<SeriesFranchiseCard[]>([]);
  const [films, setFilms] = useState<MoviesFilmCard[]>([]);
  const [dashLoading, setDashLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<
    | (SeriesDashboard & {
        franchise_count?: number;
        film_count?: number;
        top_franchises?: SeriesFranchiseCard[];
        top_films?: MoviesFilmCard[];
      })
    | null
  >(null);

  const [filterMode, setFilterMode] = useState<SeriesFilterMode>("name");
  const [filterOptions, setFilterOptions] =
    useState<SeriesFilterOptions | null>(null);
  const [catalogScope, setCatalogScope] =
    useState<SeriesCatalogScope>("franchises");
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [search, setSearch] = useState("");
  const [letter, setLetter] = useState("");
  const [continentId, setContinentId] = useState<number | "">("");
  const [countryId, setCountryId] = useState<number | "">("");
  const [startDecade, setStartDecade] = useState<number | "">("");
  const [endDecade, setEndDecade] = useState<number | "">("");
  const [subgenreId, setSubgenreId] = useState<number | "">("");
  const [publisher, setPublisher] = useState("");
  const [writer, setWriter] = useState("");
  const [entrySource, setEntrySource] = useState<"home" | "catalog">("catalog");

  useEffect(() => {
    clearMediaTheme(userId);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setDashLoading(true);
    void Promise.all([
      fetchMoviesDashboard(),
      fetchUniverses().catch(() => ({ universes: [] as Universe[] })),
    ])
      .then(([d, u]) => {
        if (cancelled) return;
        setDashboard(d);
        setUniverses(u.universes || []);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setDashLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadCatalog = useCallback(() => {
    setCatalogLoading(true);
    void fetchMoviesCatalog()
      .then((res) => {
        setFranchises(res.franchises || []);
        setFilms(res.films || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCatalogLoading(false));
    void fetchMoviesFilterOptions()
      .then(setFilterOptions)
      .catch(() => setFilterOptions(null));
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (tab === "catalog" || franchiseId) loadCatalog();
  }, [tab, franchiseId, loadCatalog]);

  const openUniverseLanding = useCallback(
    (id: number, from: "home" | "catalog" = "catalog") => {
      setMediaEntrySource(from);
      setEntrySource(from);
      onOpenUniversePage?.(id, from);
    },
    [onOpenUniversePage]
  );

  useEffect(() => {
    if (universeId != null) {
      setEntrySource(getMediaEntrySource());
    }
  }, [universeId]);

  useEffect(() => {
    if (catalogScope === "shows" && filterMode === "end") {
      setFilterMode("start");
      setEndDecade("");
    }
  }, [catalogScope, filterMode]);

  const backgroundIso = useMemo(
    () => catalogBackgroundIso(filterMode, countryId, filterOptions),
    [filterMode, countryId, filterOptions]
  );
  const backgroundUrl = useMemo(
    () =>
      catalogBackgroundUrl(filterMode, {
        continentId,
        subgenreId,
        startDecade,
        endDecade,
        filterOptions,
      }),
    [
      filterMode,
      continentId,
      subgenreId,
      startDecade,
      endDecade,
      filterOptions,
    ]
  );

  const moduleBackdrop =
    tab === "catalog" &&
    !franchiseId &&
    Boolean(backgroundUrl || backgroundIso);

  const browseFranchises = useMemo((): SeriesFranchiseCard[] => {
    if (catalogScope === "franchises") {
      return franchises
        .filter((f) => !(f as SeriesFranchiseCard & { is_standalone?: boolean }).is_standalone)
        .map((f) => {
        const workFilms =
          (f as SeriesFranchiseCard & { films?: MoviesFilmCard[] }).films ||
          films.filter((film) => film.work_id === f.id);
        return {
          ...f,
          subseries: workFilms.map((film) => ({
            id: film.id,
            title: film.title,
            date_iso: film.date_iso,
            display_date: film.display_date ?? null,
            folder_path: film.folder_path,
            cover_url: film.cover_url,
            logo_url: film.logo_url ?? null,
            icon_url: film.icon_url ?? null,
            badge_url: film.badge_url ?? null,
            season_count: film.version_count ?? 1,
          })),
          subseries_count: workFilms.length,
          season_count: workFilms.length || f.season_count || 0,
        };
      });
    }
    if (catalogScope === "universes") {
      // Work-level cards so universe member slugs resolve continent/date filters.
      return franchises.map((f) => {
        const workFilms = films.filter((film) => film.work_id === f.id);
        const enrichedFilms = workFilms as (MoviesFilmCard & {
          country_iso?: string | null;
          country_id?: number | null;
          continent_id?: number | null;
        })[];
        const first = enrichedFilms[0];
        return {
          ...f,
          country_iso: f.country_iso ?? first?.country_iso ?? null,
          country_id: f.country_id ?? first?.country_id ?? null,
          continent_id: f.continent_id ?? first?.continent_id ?? null,
          subseries: workFilms.map((film) => ({
            id: film.id,
            title: film.title,
            date_iso: film.date_iso,
            display_date: film.display_date ?? null,
            folder_path: film.folder_path,
            cover_url: film.cover_url,
            season_count: 1,
          })),
          subseries_count: workFilms.length,
          season_count: workFilms.length || 1,
        } as SeriesFranchiseCard;
      });
    }
    return films.map((film) => {
      const enriched = film as MoviesFilmCard & {
        country_iso?: string | null;
        country_id?: number | null;
        continent_id?: number | null;
        genre_ids?: (number | string)[];
        genre_names?: string[];
        publishers?: string[];
        writers?: string[];
      };
      const titleLetter = (() => {
        const ch = (film.title || "").trim().charAt(0).toUpperCase();
        return ch && ch >= "A" && ch <= "Z" ? ch : "#";
      })();
      return {
        id: film.id,
        name: film.title,
        letter: titleLetter,
        slug: film.work_id || film.id,
        folder_path: film.folder_path,
        cover_url: film.cover_url,
        logo_url: film.logo_url ?? null,
        icon_url: film.icon_url ?? null,
        badge_url: film.badge_url ?? null,
        country_iso: enriched.country_iso ?? null,
        country_id: enriched.country_id ?? null,
        continent_id: enriched.continent_id ?? null,
        genre_ids: enriched.genre_ids ?? [],
        genre_names: enriched.genre_names ?? [],
        publishers: enriched.publishers ?? [],
        writers: enriched.writers ?? [],
        subseries: [
          {
            id: film.id,
            title: film.title,
            date_iso: film.date_iso,
            display_date: film.display_date ?? null,
            folder_path: film.folder_path,
            cover_url: film.cover_url,
            season_count: 1,
          },
        ],
        season_count: 1,
        subseries_count: 1,
      } as SeriesFranchiseCard;
    });
  }, [catalogScope, franchises, films]);

  const openWork = (
    workId: string,
    _sub?: string,
    shell?: { name: string; cover_url: string | null },
    from: "home" | "catalog" = "catalog"
  ) => {
    setMediaEntrySource(from);
    setEntrySource(from);
    const card = franchises.find((f) => f.id === workId) as
      | (SeriesFranchiseCard & {
          is_standalone?: boolean;
          primary_film_id?: string | null;
        })
      | undefined;
    if (card?.is_standalone && card.primary_film_id) {
      pushMoviesRoute({
        franchiseId: workId,
        filmId: card.primary_film_id,
        section: "overview",
        overviewTab: "about",
      });
      onNavigate({
        franchiseId: workId,
        filmId: card.primary_film_id,
        section: "overview",
        overviewTab: "about",
        universeId: undefined,
      });
      return;
    }
    pushMoviesRoute({
      franchiseId: workId,
      section: "overview",
      overviewTab: "about",
    });
    onNavigate({
      franchiseId: workId,
      filmId: undefined,
      section: "overview",
      overviewTab: "about",
      universeId: undefined,
    });
    void shell;
  };

  const openFilm = (
    nextFilmId: string,
    workId?: string | null,
    from: "home" | "catalog" = "catalog"
  ) => {
    setMediaEntrySource(from);
    setEntrySource(from);
    const film = films.find((f) => f.id === nextFilmId);
    const wid = workId || film?.work_id;
    if (!wid) return;
    pushMoviesRoute({
      franchiseId: wid,
      filmId: nextFilmId,
      section: "overview",
      overviewTab: "about",
    });
    onNavigate({
      franchiseId: wid,
      filmId: nextFilmId,
      section: "overview",
      overviewTab: "about",
      universeId: undefined,
    });
  };

  const backToMoviesHome = () => {
    clearMediaTheme(userId);
    pushMoviesRootRoute();
    onNavigate({
      franchiseId: undefined,
      filmId: undefined,
      section: undefined,
      overviewTab: undefined,
      universeId: undefined,
    });
    setTab("home");
  };

  const backToMoviesCatalog = () => {
    clearMediaTheme(userId);
    pushMoviesCatalogRoute();
    onNavigate({
      franchiseId: undefined,
      filmId: undefined,
      section: undefined,
      overviewTab: undefined,
      universeId: undefined,
    });
    setTab("catalog");
  };

  if (franchiseId && filmId) {
    const workName =
      franchises.find((f) => f.id === franchiseId)?.name ||
      films.find((f) => f.id === filmId)?.work_name ||
      undefined;
    const workCard = franchises.find((f) => f.id === franchiseId);
    const filmSection: SeriesSection =
      section === "series" ? "overview" : (section as SeriesSection);
    return (
      <SeriesSubseriesPage
        variant="film"
        franchiseId={franchiseId}
        franchiseName={workName}
        franchiseLogoUrl={workCard?.logo_url}
        franchiseIconUrl={workCard?.icon_url}
        subseriesId={filmId}
        section={filmSection}
        overviewTab={overviewTab}
        universeId={universeId}
        busy={busy}
        isAdmin={isAdmin}
        userId={userId}
        cardOrientation={cardOrientation}
        onSetOrientation={onSetOrientation}
        onOpenRelatedLocal={(it) => {
          const title = (it.title || it.name || "").trim().toLowerCase();
          if (!title) return false;
          const film = films.find(
            (f) => (f.title || "").trim().toLowerCase() === title
          );
          if (film) {
            openFilm(film.id, film.work_id);
            return true;
          }
          const work = franchises.find(
            (f) => (f.name || "").trim().toLowerCase() === title
          );
          if (work) {
            openWork(work.id);
            return true;
          }
          return false;
        }}
        onImport={onImport}
        onSync={onSync}
        onChooseSource={onChooseSource}
        onSwitchProfile={onSwitchProfile}
        onEditProfile={onEditProfile}
        onBack={() => {
          const from = getMediaEntrySource() || entrySource;
          if (universeId != null) {
            onOpenUniversePage?.(universeId, from);
            return;
          }
          // Standalones have no franchise hub to return to.
          const work = franchises.find((f) => f.id === franchiseId) as
            | (SeriesFranchiseCard & { is_standalone?: boolean })
            | undefined;
          const filmCount = films.filter((f) => f.work_id === franchiseId).length;
          const isStandalone =
            Boolean(work?.is_standalone) || filmCount <= 1;
          if (isStandalone) {
            if (from === "home") backToMoviesHome();
            else backToMoviesCatalog();
            return;
          }
          if (from === "home") {
            backToMoviesHome();
            return;
          }
          onNavigate({
            franchiseId,
            filmId: undefined,
            section: "movies",
          });
        }}
        backLabelOverride={
          universeId != null
            ? "UNIVERSE"
            : Boolean(
                  (franchises.find((f) => f.id === franchiseId) as
                    | { is_standalone?: boolean }
                    | undefined)?.is_standalone
                ) ||
                films.filter((f) => f.work_id === franchiseId).length <= 1
              ? (getMediaEntrySource() || entrySource) === "home"
                ? "HOME"
                : "CATALOG"
              : entrySource === "home"
                ? "HOME"
                : undefined
        }
        onBrowseCatalog={(target) => {
          setEntrySource("catalog");
          setTab("catalog");
          pushMoviesCatalogRoute();
          onNavigate({
            franchiseId: undefined,
            filmId: undefined,
            section: undefined,
            overviewTab: undefined,
            universeId: undefined,
          });
          if (target.mode) setFilterMode(target.mode);
          if (target.countryId != null) setCountryId(target.countryId);
          if (target.subgenreId != null) setSubgenreId(target.subgenreId);
          if (target.publisher) setPublisher(target.publisher);
          if (target.writer) setWriter(target.writer);
          loadCatalog();
        }}
        onOpenMusicRelease={onOpenMusicRelease}
        onOpenFilm={(id) => {
          pushMoviesRoute({
            franchiseId,
            filmId: id,
            section: "overview",
            overviewTab: "about",
            universeId,
          });
          onNavigate({
            franchiseId,
            filmId: id,
            section: "overview",
            overviewTab: "about",
            universeId,
          });
        }}
        onOpenUniverseLeaf={(leaf) => {
          if (leaf.module === "series") {
            onOpenSeriesFranchise?.(
              leaf.franchiseId,
              leaf.leafId === leaf.franchiseId ? undefined : leaf.leafId,
              universeId
            );
            return;
          }
          pushMoviesRoute({
            franchiseId: leaf.franchiseId,
            filmId: leaf.leafId,
            section: "overview",
            overviewTab: "about",
            universeId,
          });
          onNavigate({
            franchiseId: leaf.franchiseId,
            filmId: leaf.leafId,
            section: "overview",
            overviewTab: "about",
            universeId,
          });
        }}
        onOpenUniverseParent={() => {
          if (universeId == null) return;
          onOpenUniversePage?.(
            universeId,
            getMediaEntrySource() || entrySource
          );
        }}
        onOpenMoviesPath={(path) => {
          void resolveMoviesPath(path)
            .then((hit) => {
              pushMoviesRoute({
                franchiseId: hit.work_id,
                filmId: hit.film_id ?? undefined,
                section: "overview",
                overviewTab: "about",
                universeId,
              });
              onNavigate({
                franchiseId: hit.work_id,
                filmId: hit.film_id ?? undefined,
                section: "overview",
                overviewTab: "about",
                universeId,
              });
            })
            .catch(() => {});
        }}
        onNavigate={(patch) => {
          const nextFilmId =
            "subseriesId" in patch ? patch.subseriesId : filmId;
          const rawSection = (patch.section || section) as string;
          const nextSection: MoviesSection =
            rawSection === "episodes" || rawSection === "series"
              ? "overview"
              : (rawSection as MoviesSection);
          const nextFranchise =
            "franchiseId" in patch && patch.franchiseId
              ? patch.franchiseId
              : franchiseId;
          const nextUniverseId =
            "universeId" in patch ? patch.universeId : universeId;
          const nextOverviewTab =
            "overviewTab" in patch && patch.overviewTab != null
              ? patch.overviewTab
              : nextUniverseId != null && !nextFilmId
                ? "related"
                : !patch.section || patch.section === "overview"
                  ? "about"
                  : overviewTab;
          pushMoviesRoute({
            franchiseId: nextFranchise,
            filmId: nextFilmId,
            section: nextSection,
            overviewTab: nextOverviewTab,
            universeId: nextUniverseId,
          });
          onNavigate({
            franchiseId: nextFranchise,
            filmId: nextFilmId,
            section: nextSection,
            overviewTab: nextOverviewTab,
            universeId: nextUniverseId,
          });
        }}
      />
    );
  }

  if (franchiseId) {
    return (
      <MoviesFranchisePage
        workId={franchiseId}
        section={section}
        overviewTab={overviewTab}
        universeId={universeId}
        isAdmin={isAdmin}
        userId={userId}
        cardOrientation={cardOrientation}
        onSetOrientation={onSetOrientation}
        onBack={() => {
          const from = getMediaEntrySource() || entrySource;
          if (entrySource !== from) setEntrySource(from);
          if (universeId != null) {
            onOpenUniversePage?.(universeId, from);
            return;
          }
          if (from === "home") backToMoviesHome();
          else backToMoviesCatalog();
        }}
        backLabel={
          universeId != null
            ? "UNIVERSE"
            : (getMediaEntrySource() || entrySource) === "home"
              ? "HOME"
              : "CATALOG"
        }
        onNavigate={(patch) => {
          const next: {
            franchiseId?: string;
            filmId?: string;
            section?: typeof section;
            overviewTab?: typeof overviewTab;
            universeId?: number;
          } = {
            section: patch.section ?? section,
            overviewTab: patch.overviewTab ?? overviewTab,
          };
          // Preserve franchise context unless the patch explicitly changes it.
          if ("franchiseId" in patch) next.franchiseId = patch.franchiseId;
          else next.franchiseId = franchiseId;
          if ("filmId" in patch) next.filmId = patch.filmId;
          if ("universeId" in patch) next.universeId = patch.universeId;
          else next.universeId = universeId;
          onNavigate(next);
        }}
        onOpenSeriesFranchise={onOpenSeriesFranchise}
        onOpenMusicRelease={onOpenMusicRelease}
        onImport={onImport}
        onSync={onSync}
        onChooseSource={onChooseSource}
        onSwitchProfile={onSwitchProfile}
        onEditProfile={onEditProfile}
      />
    );
  }

  return (
    <div
      className={`series-module${
        moduleBackdrop ? " music-module--backdrop" : ""
      }`}
    >
      {moduleBackdrop ? (
        <div className="music-module__backdrop" aria-hidden>
          {backgroundIso ? (
            <span
              className={`music-module__backdrop-flag fi fi-${backgroundIso}`}
            />
          ) : backgroundUrl ? (
            <div
              className="music-module__backdrop-image"
              style={{ backgroundImage: `url(${backgroundUrl})` }}
            />
          ) : null}
          <div className="music-module__backdrop-overlay" />
        </div>
      ) : null}
      <ModuleTopBar
        media={
          mediaOptions.find((m) => m.kind === "movies") ?? {
            id: 300,
            kind: "movies",
            label: "Movies",
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
              pushMoviesRootRoute();
            },
          },
          {
            id: "catalog",
            label: "CATALOG",
            active: tab === "catalog",
            onClick: () => {
              setTab("catalog");
              pushMoviesCatalogRoute();
              loadCatalog();
            },
          },
        ]}
        menu={
          <>
            {busy ? (
              <span className="status-bar module-top-bar__status">{busy}</span>
            ) : null}
            {tab === "catalog" && !portraitMenuChrome ? (
              <CatalogScopeToggle
                value={catalogScope}
                onChange={setCatalogScope}
                itemsLabel="FILMS"
                hasUniverses={universes.length > 0}
              />
            ) : null}
            {tab === "catalog" && onSetOrientation ? (
              <CardOrientationPicker
                value={cardOrientation}
                onChange={onSetOrientation}
                includeBadge
              />
            ) : null}
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              menuChrome={
                portraitMenuChrome && tab === "catalog" ? (
                  <button
                    type="button"
                    onClick={() => {
                      const order: SeriesCatalogScope[] =
                        universes.length > 0
                          ? ["franchises", "shows", "universes"]
                          : ["franchises", "shows"];
                      const current =
                        catalogScope === "universes" && universes.length === 0
                          ? "franchises"
                          : catalogScope;
                      const i = Math.max(0, order.indexOf(current));
                      setCatalogScope(order[(i + 1) % order.length]!);
                    }}
                  >
                    {catalogScope === "universes" ? (
                      <IconUniverse className="menu-item-icon" />
                    ) : null}
                    {catalogScope === "franchises"
                      ? "Groups"
                      : catalogScope === "universes"
                        ? "Universes"
                        : "Films"}
                  </button>
                ) : null
              }
            />
          </>
        }
      />

      {error ? <div className="error">{error}</div> : null}

      {tab === "home" ? (
        <div className="music-module__body music-module__body--home">
          <MoviesHome
            data={dashboard}
            loading={dashLoading}
            universes={universes}
            onFranchise={(workId) => {
              if (!franchises.length) loadCatalog();
              openWork(workId, undefined, undefined, "home");
            }}
            onFilm={(id, workId) => {
              if (!films.length) loadCatalog();
              openFilm(id, workId, "home");
            }}
            onOpenUniverse={(id) => openUniverseLanding(id, "home")}
            onGenre={(id) => {
              setTab("catalog");
              pushMoviesCatalogRoute();
              setFilterMode("genre");
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
              setSubgenreId(numeric === "" || Number.isNaN(numeric) ? "" : numeric);
              loadCatalog();
            }}
            onCountry={(c) => {
              setTab("catalog");
              pushMoviesCatalogRoute();
              setFilterMode("country");
              setContinentId("");
              setSubgenreId("");
              setStartDecade("");
              setEndDecade("");
              setCountryId(c.id ?? "");
              loadCatalog();
            }}
          />
        </div>
      ) : (
        <SeriesBrowse
          franchises={browseFranchises}
          universes={universes}
          orientation={cardOrientation}
          filterMode={filterMode}
          filterOptions={filterOptions}
          catalogScope={catalogScope}
          filterModes={
            catalogScope === "franchises"
              ? MOVIES_FILTER_MODES_GROUPS
              : MOVIES_FILTER_MODES_FILMS
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
          unitNoun="film"
          loading={catalogLoading}
          onSearchChange={setSearch}
          onLetterChange={setLetter}
          onFilterModeChange={(m) => {
            setFilterMode(m);
            setSearch("");
            setLetter(m === "name" ? "A" : "");
            setContinentId("");
            setCountryId("");
            setStartDecade("");
            setEndDecade("");
            setSubgenreId("");
            setPublisher("");
            setWriter("");
          }}
          onContinentIdChange={setContinentId}
          onCountryIdChange={setCountryId}
          onStartDecadeChange={setStartDecade}
          onEndDecadeChange={setEndDecade}
          onSubgenreIdChange={setSubgenreId}
          onPublisherChange={setPublisher}
          onWriterChange={setWriter}
          onOpenUniverse={(id) => openUniverseLanding(id, "catalog")}
          onOpen={(id, _sub, shell) => {
            if (catalogScope === "shows") {
              const film = films.find(
                (f) => f.id === id || f.work_id === id || f.title === shell?.name
              );
              if (film?.work_id) {
                openFilm(film.id, film.work_id, "catalog");
                return;
              }
            }
            openWork(id, undefined, shell, "catalog");
          }}
        />
      )}
    </div>
  );
}
