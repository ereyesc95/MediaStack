import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchSeriesFolder,
  fetchSeriesFranchise,
} from "../../api";
import type {
  SeriesFolderDetail,
  SeriesFranchiseDetail,
  SeriesSeasonCard,
  SeriesSection,
  SeriesSubseriesCard,
} from "../../types";
import { DEFAULT_DISC_URL } from "../music/release/releaseTrackPanelMeta";
import SeriesEpisodeList from "./SeriesEpisodeList";
import SeriesGalleryPanel from "./SeriesGalleryPanel";
import SeriesRelatedPanel from "./SeriesRelatedPanel";

type Props = {
  franchiseId: string;
  subseriesId?: string;
  seasonId?: string;
  section?: SeriesSection;
  onBack: () => void;
  onNavigate: (patch: {
    subseriesId?: string;
    seasonId?: string;
    section?: SeriesSection;
  }) => void;
};

function PortraitCard({
  title,
  coverUrl,
  meta,
  onClick,
}: {
  title: string;
  coverUrl: string | null;
  meta: string;
  onClick?: () => void;
}) {
  const cover = coverUrl || DEFAULT_DISC_URL;
  const className =
    "media-release-card media-release-card--portrait" +
    (onClick
      ? " media-release-card--clickable media-release-card--button"
      : "");
  const inner = (
    <>
      <span
        className="media-release-card__cover"
        style={{ backgroundImage: `url("${cover}")` }}
      />
      <span className="media-release-card__dim" aria-hidden />
      <span className="media-release-card__hover">
        <span className="media-release-card__title-hover">{title}</span>
      </span>
      <span className="media-release-card__date">
        <span className="media-release-card__date-label">{meta}</span>
      </span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        title={title}
      >
        {inner}
      </button>
    );
  }
  return (
    <article className={className} title={title}>
      {inner}
    </article>
  );
}

export default function SeriesFranchisePage({
  franchiseId,
  subseriesId,
  seasonId,
  section = "overview",
  onBack,
  onNavigate,
}: Props) {
  const [franchise, setFranchise] = useState<SeriesFranchiseDetail | null>(
    null
  );
  const [folder, setFolder] = useState<SeriesFolderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFranchise = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFranchise(await fetchSeriesFranchise(franchiseId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFranchise(null);
    } finally {
      setLoading(false);
    }
  }, [franchiseId]);

  useEffect(() => {
    void loadFranchise();
  }, [loadFranchise]);

  const activeSubseries = useMemo(() => {
    if (!franchise || !subseriesId) return null;
    return (
      franchise.subseries.find((s) => s.id === subseriesId) ??
      null
    );
  }, [franchise, subseriesId]);

  const folderPathForDrill = useMemo(() => {
    if (!franchise) return null;
    if (seasonId && activeSubseries) {
      return `${activeSubseries.folder_path}/${seasonId}`;
    }
    if (seasonId) {
      const direct = franchise.seasons.find((s) => s.id === seasonId);
      return direct?.folder_path ?? `${franchise.folder_path}/${seasonId}`;
    }
    if (activeSubseries) return activeSubseries.folder_path;
    return null;
  }, [franchise, activeSubseries, seasonId]);

  useEffect(() => {
    if (!folderPathForDrill) {
      setFolder(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSeriesFolder(folderPathForDrill)
      .then((detail) => {
        if (!cancelled) setFolder(detail);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setFolder(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folderPathForDrill]);

  const galleryPath =
    folder?.folder_path ??
    activeSubseries?.folder_path ??
    franchise?.folder_path ??
    null;

  const relatedPath = galleryPath;

  const title =
    folder?.kind === "season"
      ? folder.title
      : activeSubseries?.title ?? franchise?.name ?? "Series";

  const coverUrl =
    folder?.cover_url ??
    activeSubseries?.cover_url ??
    franchise?.cover_url ??
    null;

  const breadcrumbBack = () => {
    if (seasonId) {
      onNavigate({
        seasonId: undefined,
        subseriesId,
        section: "overview",
      });
      return;
    }
    if (subseriesId) {
      onNavigate({
        subseriesId: undefined,
        seasonId: undefined,
        section: "overview",
      });
      return;
    }
    onBack();
  };

  const backLabel = seasonId
    ? `← ${activeSubseries?.title ?? franchise?.name ?? "Back"}`
    : subseriesId
      ? `← ${franchise?.name ?? "Series"}`
      : "← Series";

  const seasons: SeriesSeasonCard[] = folder?.seasons?.length
    ? folder.seasons
    : !subseriesId && !seasonId
      ? franchise?.seasons ?? []
      : [];

  const subseries: SeriesSubseriesCard[] =
    !subseriesId && !seasonId ? franchise?.subseries ?? [] : [];

  const episodes =
    folder?.kind === "season" ? folder.episodes ?? [] : [];

  if (!franchise && loading) {
    return <p className="muted artist-section-empty">Loading franchise…</p>;
  }
  if (!franchise && error) {
    return <p className="error artist-section-empty">{error}</p>;
  }
  if (!franchise) return null;

  return (
    <div className="series-franchise">
      <button
        type="button"
        className="series-franchise__back"
        onClick={breadcrumbBack}
      >
        {backLabel}
      </button>

      <header className="series-franchise__head">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="series-franchise__cover" />
        ) : null}
        <div>
          <h1 className="series-franchise__title">{title}</h1>
          <p className="muted series-franchise__path">
            {folder?.folder_path ??
              activeSubseries?.folder_path ??
              franchise.folder_path}
          </p>
        </div>
      </header>

      <nav className="series-franchise__tabs" aria-label="Series sections">
        {(
          [
            ["overview", "OVERVIEW"],
            ["gallery", "GALLERY"],
            ["related", "RELATED"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={section === id ? "active" : ""}
            onClick={() => onNavigate({ section: id })}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && folderPathForDrill ? (
        <p className="error artist-section-empty">{error}</p>
      ) : null}

      {section === "overview" ? (
        <div className="series-franchise__overview">
          {loading && folderPathForDrill && !folder ? (
            <p className="muted artist-section-empty">Loading…</p>
          ) : null}

          {episodes.length > 0 || folder?.kind === "season" ? (
            <section className="series-franchise__section">
              <h2>Episodes</h2>
              <SeriesEpisodeList episodes={episodes} />
            </section>
          ) : null}

          {subseries.length > 0 ? (
            <section className="series-franchise__section">
              <h2>Subseries</h2>
              <div className="media-release-grid">
                {subseries.map((s) => (
                  <PortraitCard
                    key={s.id}
                    title={s.title}
                    coverUrl={s.cover_url}
                    meta={`${s.season_count} season${
                      s.season_count === 1 ? "" : "s"
                    }${s.display_date ? ` · ${s.display_date}` : ""}`}
                    onClick={() =>
                      onNavigate({
                        subseriesId: s.id,
                        seasonId: undefined,
                        section: "overview",
                      })
                    }
                  />
                ))}
              </div>
            </section>
          ) : null}

          {seasons.length > 0 ? (
            <section className="series-franchise__section">
              <h2>Seasons</h2>
              <div className="media-release-grid">
                {seasons.map((s) => (
                  <PortraitCard
                    key={s.id}
                    title={s.title}
                    coverUrl={s.cover_url || coverUrl}
                    meta={`${s.episode_count} episode${
                      s.episode_count === 1 ? "" : "s"
                    }${s.display_date ? ` · ${s.display_date}` : ""}`}
                    onClick={() =>
                      onNavigate({
                        subseriesId,
                        seasonId: s.id,
                        section: "overview",
                      })
                    }
                  />
                ))}
              </div>
            </section>
          ) : null}

          {!loading &&
          !episodes.length &&
          !subseries.length &&
          !seasons.length &&
          folder?.kind !== "season" ? (
            <p className="muted artist-section-empty">
              No seasons or subseries found. Add dated season folders under this
              show.
            </p>
          ) : null}
        </div>
      ) : null}

      {section === "gallery" && galleryPath ? (
        <SeriesGalleryPanel folderPath={galleryPath} />
      ) : null}

      {section === "related" && relatedPath ? (
        <SeriesRelatedPanel folderPath={relatedPath} />
      ) : null}
    </div>
  );
}
