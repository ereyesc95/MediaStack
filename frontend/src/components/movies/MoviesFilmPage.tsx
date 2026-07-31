import { useEffect, useState } from "react";
import { fetchMoviesFilm } from "../../api";
import type { MoviesFilmDetail } from "../../types";
import type { MoviesOverviewTab } from "../../moviesRoute";
import PlaylistBoot from "../PlaylistBoot";

type Props = {
  filmId: string;
  workId: string;
  overviewTab?: MoviesOverviewTab;
  onBack: () => void;
  onOpenWork: () => void;
  onOpenSeriesFranchise?: (franchiseId: string) => void;
};

export default function MoviesFilmPage({
  filmId,
  workId,
  onBack,
  onOpenWork,
  onOpenSeriesFranchise,
}: Props) {
  const [data, setData] = useState<MoviesFilmDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchMoviesFilm(filmId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filmId]);

  if (loading && !data) {
    return <PlaylistBoot label="Loading film…" />;
  }
  if (error || !data) {
    return (
      <PlaylistBoot
        error={error ?? "Film not found"}
        onBack={onBack}
        backLabel="← Catalog"
      />
    );
  }

  const cover = data.cover_url || data.work.cover_url;

  return (
    <div className="artist-page artist-page--stacked movies-film-page">
      <div className="artist-page__top">
        <div className="artist-page__top-left">
          <button
            type="button"
            className="artist-page__catalog-back"
            onClick={onBack}
            aria-label="Back"
          >
            ←
          </button>
        </div>
        <div className="artist-page__top-center">
          <span className="artist-page__brand-name">{data.title}</span>
        </div>
        <div className="artist-page__top-right" />
      </div>

      <div className="artist-page__body" style={{ padding: "1rem 1.25rem 2rem" }}>
        <div
          className="movies-film-page__hero"
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "minmax(0, 12rem) minmax(0, 1fr)",
            alignItems: "start",
          }}
        >
          {cover ? (
            <img
              src={cover}
              alt=""
              style={{
                width: "100%",
                borderRadius: 4,
                aspectRatio: "2 / 3",
                objectFit: "cover",
                background: "#1a1f2e",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "2 / 3",
                background: "linear-gradient(135deg, #1a1f2e, #2d3548)",
                borderRadius: 4,
              }}
            />
          )}
          <div>
            <p className="muted" style={{ margin: "0 0 0.35rem" }}>
              <button
                type="button"
                className="release-page__person-link"
                onClick={onOpenWork}
              >
                {data.work.name}
              </button>
              {data.display_date ? ` · ${data.display_date}` : null}
            </p>
            <h1 style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
              {data.title}
            </h1>
            {data.universe ? (
              <p className="muted" style={{ margin: "0 0 0.75rem" }}>
                Universe: <strong>{data.universe.name}</strong>
                {onOpenSeriesFranchise && data.work.id ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="release-page__person-link"
                      onClick={() => onOpenSeriesFranchise(data.work.id)}
                    >
                      Open in Series
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
            {data.versions.length > 0 ? (
              <div>
                <h2 style={{ fontSize: "0.85rem", letterSpacing: "0.06em" }}>
                  VERSIONS
                </h2>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {data.versions.map((v) => (
                    <li key={v.id} style={{ marginBottom: "0.4rem" }}>
                      <a
                        href={v.file_url || `#${v.play_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {v.label}
                      </a>
                      <span className="muted"> · {v.file_name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted">
                No video file in this folder yet. Add the feature under{" "}
                <code>{data.folder_path}</code>.
              </p>
            )}
            <p className="muted" style={{ marginTop: "1rem", fontSize: "0.78rem" }}>
              Work id: {workId}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
