import { useCallback, useEffect, useState } from "react";
import {
  fetchMoviesFranchise,
  fetchMoviesFranchiseSeries,
  refreshMoviesUniverse,
} from "../../api";
import type { MoviesFilmCard, MoviesWorkDetail } from "../../types";
import {
  pushMoviesRoute,
  type MoviesOverviewTab,
  type MoviesSection,
} from "../../moviesRoute";
import AppMenu from "../AppMenu";
import PlaylistBoot from "../PlaylistBoot";
import ArtistCard from "../ArtistCard";

type Props = {
  workId: string;
  section?: MoviesSection;
  overviewTab?: MoviesOverviewTab;
  isAdmin?: boolean;
  onBack: () => void;
  onNavigate: (patch: {
    franchiseId?: string;
    filmId?: string;
    section?: MoviesSection;
    overviewTab?: MoviesOverviewTab;
  }) => void;
  onOpenSeriesFranchise?: (franchiseId: string) => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  userId?: number;
};

const SECTIONS: { id: MoviesSection; label: string }[] = [
  { id: "overview", label: "OVERVIEW" },
  { id: "movies", label: "MOVIES" },
  { id: "series", label: "SERIES" },
  { id: "audio", label: "AUDIO" },
  { id: "library", label: "LIBRARY" },
  { id: "games", label: "GAMES" },
  { id: "gallery", label: "GALLERY" },
];

export default function MoviesFranchisePage({
  workId,
  section = "overview",
  overviewTab = "about",
  isAdmin,
  onBack,
  onNavigate,
  onOpenSeriesFranchise,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
  userId,
}: Props) {
  const [data, setData] = useState<MoviesWorkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seriesItems, setSeriesItems] = useState<
    { id: string; title: string; navigate_franchise_id?: string }[]
  >([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchMoviesFranchise(workId)
      .then((res) => setData(res))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [workId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    pushMoviesRoute(
      {
        franchiseId: workId,
        section,
        overviewTab: section === "overview" ? overviewTab : undefined,
      },
      true
    );
  }, [workId, section, overviewTab]);

  useEffect(() => {
    if (section !== "series") return;
    void fetchMoviesFranchiseSeries(workId)
      .then((res) => setSeriesItems(res.items || []))
      .catch(() => setSeriesItems([]));
  }, [section, workId]);

  const openFilm = (film: MoviesFilmCard) => {
    onNavigate({
      franchiseId: workId,
      filmId: film.id,
      section: "overview",
      overviewTab: "about",
    });
  };

  if (loading && !data) {
    return <PlaylistBoot label="Loading franchise…" />;
  }
  if (error || !data) {
    return (
      <PlaylistBoot
        error={error ?? "Not found"}
        onBack={onBack}
        backLabel="← Catalog"
      />
    );
  }

  const films = data.films || [];

  return (
    <div className="artist-page artist-page--stacked movies-franchise-page">
      <div className="artist-page__top">
        <div className="artist-page__top-left">
          <button
            type="button"
            className="artist-page__catalog-back"
            onClick={onBack}
            aria-label="Back to catalog"
          >
            ←
          </button>
        </div>
        <div className="artist-page__top-center">
          {data.logo_url || data.icon_url ? (
            <img
              src={(data.logo_url || data.icon_url)!}
              alt=""
              className="artist-page__brand-logo"
            />
          ) : (
            <span className="artist-page__brand-name">{data.name}</span>
          )}
        </div>
        <div className="artist-page__top-right">
          {busy ? <span className="muted">{busy}</span> : null}
          <AppMenu
            onImport={onImport}
            onSync={onSync}
            onChooseSource={onChooseSource}
            isAdmin={isAdmin}
            userId={userId}
            onSwitchProfile={onSwitchProfile}
            onEditProfile={onEditProfile}
            menuChrome={
              isAdmin ? (
                <button
                  type="button"
                  onClick={() => {
                    setBusy("Seeding universe…");
                    void refreshMoviesUniverse(workId)
                      .then(() => load())
                      .catch((e) =>
                        setError(e instanceof Error ? e.message : String(e))
                      )
                      .finally(() => setBusy(null));
                  }}
                >
                  Refresh universe (TMDb)
                </button>
              ) : null
            }
          />
        </div>
      </div>

      <nav className="artist-page__sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={section === s.id ? "active" : ""}
            onClick={() =>
              onNavigate({
                franchiseId: workId,
                section: s.id,
                overviewTab: s.id === "overview" ? "about" : undefined,
                filmId: undefined,
              })
            }
          >
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      <div className="artist-page__body" style={{ padding: "1rem 1.25rem 2rem" }}>
        {section === "overview" || section === "movies" ? (
          <>
            {data.universe ? (
              <p className="muted" style={{ marginTop: 0 }}>
                Universe: <strong>{data.universe.name}</strong>
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                No universe linked yet
                {isAdmin ? " — use menu → Refresh universe (TMDb)." : "."}
              </p>
            )}
            <div className="artist-grid artist-grid--portrait">
              {films.map((film) => (
                <ArtistCard
                  key={film.id}
                  orientation="portrait"
                  artist={{
                    id: 0,
                    name: film.title,
                    photo_url: film.cover_url,
                    logo_url: film.logo_url ?? null,
                    icon_url: film.icon_url ?? null,
                    logo_collapsed_url: null,
                    era_year: film.date_iso
                      ? Number(film.date_iso.slice(0, 4)) || null
                      : null,
                    show_name_on_hover: !film.logo_url && !film.icon_url,
                  }}
                  onClick={() => openFilm(film)}
                />
              ))}
            </div>
            {!films.length ? (
              <p className="muted">No film folders under this work yet.</p>
            ) : null}
          </>
        ) : null}

        {section === "series" ? (
          <div>
            {seriesItems.length ? (
              <ul style={{ listStyle: "none", padding: 0 }}>
                {seriesItems.map((item) => (
                  <li key={item.id} style={{ marginBottom: "0.5rem" }}>
                    <button
                      type="button"
                      className="release-page__person-link"
                      onClick={() =>
                        onOpenSeriesFranchise?.(
                          item.navigate_franchise_id || workId
                        )
                      }
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                No matching Series franchise for this work name. Related TV will
                appear when a Series folder shares the same name.
              </p>
            )}
          </div>
        ) : null}

        {section === "audio" ||
        section === "library" ||
        section === "games" ||
        section === "gallery" ? (
          <p className="muted">
            {section} for Movies franchises will reuse Series media grids in a
            follow-up pass. Cross-module Related already uses the franchise index.
          </p>
        ) : null}
      </div>
    </div>
  );
}
