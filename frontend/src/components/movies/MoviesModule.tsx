import { useCallback, useEffect, useState } from "react";
import {
  fetchMoviesCatalog,
  fetchMoviesDashboard,
  fetchSeriesFilterOptions,
} from "../../api";
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
  SeriesFilterMode,
  SeriesFilterOptions,
  SeriesFranchiseCard,
} from "../../types";
import {
  isMobilePortraitLayout,
  useDeviceLayout,
} from "../../usePhoneLayout";
import AppMenu from "../AppMenu";
import CardOrientationPicker from "../CardOrientationPicker";
import ModuleTopBar, { type MediaOption } from "../ModuleTopBar";
import CatalogScopeToggle from "../series/CatalogScopeToggle";
import SeriesBrowse, {
  type SeriesCatalogScope,
} from "../series/SeriesBrowse";
import PlaylistBoot from "../PlaylistBoot";
import MoviesFilmPage from "./MoviesFilmPage";
import MoviesFranchisePage from "./MoviesFranchisePage";

type MoviesTab = "home" | "catalog";

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
  onNavigate: (patch: {
    franchiseId?: string;
    filmId?: string;
    section?: MoviesSection;
    overviewTab?: MoviesOverviewTab;
  }) => void;
  onOpenSeriesFranchise?: (franchiseId: string) => void;
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
  onNavigate,
  onOpenSeriesFranchise,
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
  const [dashboard, setDashboard] = useState<{
    top_franchises: SeriesFranchiseCard[];
    top_films: MoviesFilmCard[];
    franchise_count: number;
    film_count: number;
  } | null>(null);

  const [filterMode, setFilterMode] = useState<SeriesFilterMode>("name");
  const [filterOptions, setFilterOptions] =
    useState<SeriesFilterOptions | null>(null);
  const [catalogScope, setCatalogScope] =
    useState<SeriesCatalogScope>("franchises");
  const [search, setSearch] = useState("");
  const [letter, setLetter] = useState("");
  const [continentId, setContinentId] = useState<number | "">("");
  const [countryId, setCountryId] = useState<number | "">("");
  const [startDecade, setStartDecade] = useState<number | "">("");
  const [endDecade, setEndDecade] = useState<number | "">("");
  const [subgenreId, setSubgenreId] = useState<number | "">("");
  const [publisher, setPublisher] = useState("");
  const [writer, setWriter] = useState("");

  useEffect(() => {
    clearMediaTheme(userId);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setDashLoading(true);
    void fetchMoviesDashboard()
      .then((d) => {
        if (!cancelled) setDashboard(d);
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
    void fetchSeriesFilterOptions()
      .then(setFilterOptions)
      .catch(() => setFilterOptions(null));
  }, []);

  useEffect(() => {
    if (tab === "catalog" || franchiseId) loadCatalog();
  }, [tab, franchiseId, loadCatalog]);

  const openWork = (
    workId: string,
    _sub?: string,
    shell?: { name: string; cover_url: string | null }
  ) => {
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
    });
    void shell;
  };

  if (franchiseId && filmId) {
    return (
      <MoviesFilmPage
        filmId={filmId}
        workId={franchiseId}
        overviewTab={overviewTab}
        onBack={() =>
          onNavigate({
            franchiseId,
            filmId: undefined,
            section: "movies",
          })
        }
        onOpenWork={() =>
          onNavigate({
            franchiseId,
            filmId: undefined,
            section: "overview",
            overviewTab: "about",
          })
        }
        onOpenSeriesFranchise={onOpenSeriesFranchise}
      />
    );
  }

  if (franchiseId) {
    return (
      <MoviesFranchisePage
        workId={franchiseId}
        section={section}
        overviewTab={overviewTab}
        isAdmin={isAdmin}
        userId={userId}
        onBack={() => {
          pushMoviesCatalogRoute();
          onNavigate({
            franchiseId: undefined,
            filmId: undefined,
            section: undefined,
            overviewTab: undefined,
          });
          setTab("catalog");
        }}
        onNavigate={onNavigate}
        onOpenSeriesFranchise={onOpenSeriesFranchise}
        onImport={onImport}
        onSync={onSync}
        onChooseSource={onChooseSource}
        onSwitchProfile={onSwitchProfile}
        onEditProfile={onEditProfile}
      />
    );
  }

  return (
    <div className="series-module">
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
                    onClick={() =>
                      setCatalogScope(
                        catalogScope === "franchises" ? "shows" : "franchises"
                      )
                    }
                  >
                    {catalogScope === "franchises" ? "Groups" : "Films"}
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
          {dashLoading ? (
            <PlaylistBoot className="playlist-boot--compact" label="Loading…" />
          ) : (
            <div style={{ padding: "1.25rem" }}>
              <h2 style={{ marginTop: 0 }}>Movies</h2>
              <p className="muted">
                {dashboard
                  ? `${dashboard.franchise_count} groups · ${dashboard.film_count} films`
                  : "No movies scanned yet."}
              </p>
              <div className="artist-grid artist-grid--portrait">
                {(dashboard?.top_franchises || []).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="artist-card artist-card--portrait"
                    onClick={() => openWork(f.id)}
                    style={{
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      background: f.cover_url
                        ? `center/cover url("${f.cover_url}")`
                        : "#1a1f2e",
                      minHeight: 180,
                    }}
                  >
                    <span
                      className="artist-card-footer"
                      style={{ opacity: 1, color: "#fff" }}
                    >
                      {f.name}
                    </span>
                  </button>
                ))}
              </div>
              {films.length === 0 && (dashboard?.top_films?.length || 0) > 0 ? (
                <p className="muted" style={{ marginTop: "1rem" }}>
                  Tip: open Catalog for Groups / Films browse.
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <SeriesBrowse
          franchises={
            catalogScope === "franchises"
              ? franchises
              : films.map(
                  (film) =>
                    ({
                      id: film.id,
                      name: film.title,
                      letter: film.letter || "#",
                      slug: film.work_id || film.id,
                      folder_path: film.folder_path,
                      cover_url: film.cover_url,
                      logo_url: film.logo_url ?? null,
                      icon_url: film.icon_url ?? null,
                      badge_url: film.badge_url ?? null,
                      subseries: [],
                      season_count: 1,
                      subseries_count: 0,
                    }) as SeriesFranchiseCard
                )
          }
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
          unitNoun="film"
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
          onOpen={(id, _sub, shell) => {
            if (catalogScope === "shows") {
              const film = films.find(
                (f) => f.id === id || f.work_id === id || f.title === shell?.name
              );
              if (film?.work_id) {
                onNavigate({
                  franchiseId: film.work_id,
                  filmId: film.id,
                  section: "overview",
                  overviewTab: "about",
                });
                pushMoviesRoute({
                  franchiseId: film.work_id,
                  filmId: film.id,
                  section: "overview",
                  overviewTab: "about",
                });
                return;
              }
            }
            openWork(id, _sub, shell);
          }}
        />
      )}
    </div>
  );
}
