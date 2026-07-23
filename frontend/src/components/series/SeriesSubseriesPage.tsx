import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchSeriesFolder,
  fetchSeriesFranchiseShows,
  fetchSeriesOverview,
} from "../../api";
import {
  applyMediaTheme,
  beginArtistPageSession,
  colorsFromImageUrl,
  isPlaybackThemeActive,
} from "../../mediaTheme";
import { pushSeriesRoute } from "../../seriesRoute";
import type {
  SeriesFolderDetail,
  SeriesSection,
  SeriesSeasonCard,
  SeriesSubseriesCard,
} from "../../types";
import {
  isMobilePortraitLayout,
  isStackedArtistLayout,
  useDeviceLayout,
} from "../../usePhoneLayout";
import AppMenu from "../AppMenu";
import MediaBeatFx from "../music/MediaBeatFx";
import { DEFAULT_DISC_URL } from "../music/release/releaseTrackPanelMeta";
import SeriesEpisodeList from "./SeriesEpisodeList";
import SeriesGalleryPanel from "./SeriesGalleryPanel";

export type SubseriesTab = "overview" | "episodes" | "gallery";

type Props = {
  franchiseId: string;
  franchiseName?: string;
  subseriesId: string;
  seasonId?: string;
  section?: SeriesSection;
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
  }) => void;
};

function sectionToTab(section: SeriesSection | undefined): SubseriesTab {
  if (section === "episodes" || section === "series") return "episodes";
  if (section === "gallery") return "gallery";
  return "overview";
}

function tabToSection(tab: SubseriesTab): SeriesSection {
  if (tab === "episodes") return "episodes";
  if (tab === "gallery") return "gallery";
  return "overview";
}

function NeighborLink({
  label,
  direction,
  onClick,
}: {
  label: string;
  direction: "prev" | "next";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`release-page__neighbor release-page__neighbor--${direction}`}
      onClick={onClick}
    >
      {direction === "prev" ? (
        <span className="release-page__neighbor-arrow" aria-hidden>
          ‹
        </span>
      ) : null}
      <span className="release-page__neighbor-text">{label}</span>
      {direction === "next" ? (
        <span className="release-page__neighbor-arrow" aria-hidden>
          ›
        </span>
      ) : null}
    </button>
  );
}

export default function SeriesSubseriesPage({
  franchiseId,
  franchiseName,
  subseriesId,
  seasonId,
  section = "overview",
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
  const tab = sectionToTab(section);

  const [card, setCard] = useState<SeriesSubseriesCard | null>(null);
  const [detail, setDetail] = useState<SeriesFolderDetail | null>(null);
  const [seasonDetail, setSeasonDetail] = useState<SeriesFolderDetail | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [franchiseTitle, setFranchiseTitle] = useState(franchiseName || "");
  const [bgLayers, setBgLayers] = useState<{
    current?: string;
    outgoing?: string;
  }>({});

  const loadCard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [shows, overview] = await Promise.all([
        fetchSeriesFranchiseShows(franchiseId).catch(() => ({ items: [] })),
        fetchSeriesOverview(franchiseId).catch(() => null),
      ]);
      if (overview?.name) setFranchiseTitle(overview.name);
      const fromShowsRaw = (shows.items || []).find((s) => s.id === subseriesId);
      const fromOverview = (overview?.subseries || []).find(
        (s) => s.id === subseriesId
      );
      const found: SeriesSubseriesCard | undefined = fromOverview
        ? fromOverview
        : fromShowsRaw?.folder_path
          ? {
              id: fromShowsRaw.id,
              title: fromShowsRaw.title,
              date_iso: fromShowsRaw.date_iso ?? null,
              display_date: fromShowsRaw.display_date,
              folder_path: fromShowsRaw.folder_path,
              cover_url: fromShowsRaw.cover_url ?? null,
              season_count: fromShowsRaw.season_count ?? 0,
            }
          : undefined;
      if (!found?.folder_path) {
        setError("Subseries not found.");
        setCard(null);
        setDetail(null);
        return;
      }
      setCard(found);
      const folder = await fetchSeriesFolder(found.folder_path);
      setDetail(folder);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCard(null);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [franchiseId, subseriesId]);

  useEffect(() => {
    void loadCard();
  }, [loadCard]);

  useEffect(() => {
    beginArtistPageSession(userId);
  }, [userId]);

  useEffect(() => {
    pushSeriesRoute(
      {
        franchiseId,
        subseriesId,
        seasonId,
        section: tabToSection(tab),
        overviewTab: tab === "overview" ? "about" : undefined,
      },
      true
    );
  }, [franchiseId, subseriesId, seasonId, tab]);

  const seasons: SeriesSeasonCard[] = useMemo(
    () => detail?.seasons || [],
    [detail]
  );

  const activeSeasonId = useMemo(() => {
    if (seasonId && seasons.some((s) => s.id === seasonId)) return seasonId;
    return seasons[0]?.id;
  }, [seasonId, seasons]);

  const activeSeason = useMemo(
    () => seasons.find((s) => s.id === activeSeasonId) || null,
    [seasons, activeSeasonId]
  );

  useEffect(() => {
    if (!activeSeason?.folder_path) {
      setSeasonDetail(null);
      return;
    }
    let cancelled = false;
    void fetchSeriesFolder(activeSeason.folder_path)
      .then((d) => {
        if (!cancelled) setSeasonDetail(d);
      })
      .catch(() => {
        if (!cancelled) setSeasonDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSeason?.folder_path]);

  const coverUrl =
    activeSeason?.cover_url ||
    detail?.cover_url ||
    card?.cover_url ||
    DEFAULT_DISC_URL;

  useEffect(() => {
    if (!coverUrl) {
      setBgLayers({});
      return;
    }
    setBgLayers((prev) => {
      if (prev.current === coverUrl) return prev;
      return { current: coverUrl, outgoing: prev.current };
    });
    const t = window.setTimeout(() => {
      setBgLayers((s) => ({ current: s.current, outgoing: undefined }));
    }, 360);
    return () => window.clearTimeout(t);
  }, [coverUrl]);

  useEffect(() => {
    if (!coverUrl || isPlaybackThemeActive()) return;
    void colorsFromImageUrl(coverUrl).then((c) => {
      if (c && !isPlaybackThemeActive()) applyMediaTheme(c, userId);
    });
  }, [coverUrl, userId]);

  const title = detail?.title || card?.title || subseriesId;
  const dateLabel =
    detail?.display_date ||
    card?.display_date ||
    detail?.date_iso ||
    card?.date_iso ||
    null;
  const seasonCount = seasons.length || card?.season_count || 0;
  const episodeCount =
    seasonDetail?.episodes?.length ??
    activeSeason?.episode_count ??
    0;

  const seasonIndex = seasons.findIndex((s) => s.id === activeSeasonId);
  const prevSeason =
    seasonIndex > 0 ? seasons[seasonIndex - 1] : null;
  const nextSeason =
    seasonIndex >= 0 && seasonIndex < seasons.length - 1
      ? seasons[seasonIndex + 1]
      : null;

  const hasGallery = Boolean(
    detail?.has_gallery || card?.has_gallery || activeSeason?.cover_url
  );

  const tabs: { id: SubseriesTab; label: string }[] = [
    { id: "overview", label: "OVERVIEW" },
    { id: "episodes", label: "EPISODES" },
    ...(hasGallery || tab === "gallery"
      ? [{ id: "gallery" as const, label: "GALLERY" }]
      : []),
  ];

  const setTab = (next: SubseriesTab) => {
    onNavigate({
      subseriesId,
      seasonId: next === "episodes" ? activeSeasonId : seasonId,
      section: tabToSection(next),
    });
  };

  const openSeason = (sid: string, goEpisodes = true) => {
    onNavigate({
      subseriesId,
      seasonId: sid,
      section: goEpisodes ? "episodes" : tabToSection(tab),
    });
  };

  const pageClass = [
    "release-page",
    "series-subseries-page",
    `release-page--${layout}`,
    stacked ? "release-page--stacked" : "",
    mobilePortrait ? "release-page--mobile-portrait" : "",
    bgLayers.current ? "release-page--has-bg" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const galleryPath =
    activeSeason?.folder_path || detail?.folder_path || card?.folder_path || "";

  return (
    <div className={pageClass}>
      <div className="release-page__bg-stack" aria-hidden>
        {bgLayers.outgoing ? (
          <div
            className="release-page__bg release-page__bg--visible release-page__bg--out"
            style={
              {
                backgroundImage: `url("${bgLayers.outgoing}")`,
              } as CSSProperties
            }
          />
        ) : null}
        {bgLayers.current ? (
          <div
            className={`release-page__bg release-page__bg--visible${
              bgLayers.outgoing ? " release-page__bg--in" : ""
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

      <div className="release-page__chrome">
        <header className="release-page__top">
          <div className="release-page__top-left">
            <button
              type="button"
              className="release-page__catalog-back"
              onClick={onBack}
              aria-label="Back to franchise"
            >
              <svg
                className="release-page__catalog-chevron"
                viewBox="0 0 24 24"
                aria-hidden
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
              <span className="release-page__catalog-label">
                {franchiseTitle || "FRANCHISE"}
              </span>
            </button>
          </div>
          <div className="release-page__top-center">
            <span className="release-page__brand-name">{title}</span>
          </div>
          <div className="release-page__top-right">
            {busy ? <span className="muted">{busy}</span> : null}
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              artistThemeActive
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
            />
          </div>
        </header>

        <nav className="release-page__tabs" aria-label="Subseries sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        {tab === "episodes" && seasons.length > 1 ? (
          <div
            className="series-section-subbar"
            role="tablist"
            aria-label="Seasons"
          >
            {seasons.map((s) => (
              <button
                key={s.id}
                type="button"
                className={activeSeasonId === s.id ? "active" : ""}
                onClick={() => openSeason(s.id, true)}
              >
                {s.title}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="release-page__body">
        <aside className="release-page__panel">
          <div className="release-page__panel-content">
            <div className="release-page__art">
              <div className="release-page__art-stage">
                <span className="release-page__cover-wrap">
                  <img
                    src={coverUrl || DEFAULT_DISC_URL}
                    alt=""
                    className="release-page__cover"
                  />
                </span>
              </div>
            </div>
            <div className="release-page__panel-meta">
              <div className="release-page__panel-body">
                {franchiseTitle ? (
                  <button
                    type="button"
                    className="release-page__artist-link release-page__artist-link--text"
                    onClick={onBack}
                  >
                    {franchiseTitle}
                  </button>
                ) : null}
                <h1 className="release-page__album-title">{title}</h1>
                {dateLabel ? (
                  <p className="release-page__album-date">{dateLabel}</p>
                ) : null}
                <p className="release-page__album-type">
                  {seasonCount
                    ? `${seasonCount} season${seasonCount === 1 ? "" : "s"}`
                    : "Subseries"}
                  {tab === "episodes" && episodeCount
                    ? ` · ${episodeCount} episode${episodeCount === 1 ? "" : "s"}`
                    : ""}
                </p>
                {activeSeason && tab === "episodes" ? (
                  <p className="muted" style={{ marginTop: "0.35rem" }}>
                    {activeSeason.title}
                  </p>
                ) : null}
              </div>
              <div className="release-page__panel-footer">
                <div className="release-page__panel-bottom-bar">
                  {prevSeason ? (
                    <NeighborLink
                      label={prevSeason.title}
                      direction="prev"
                      onClick={() => openSeason(prevSeason.id, true)}
                    />
                  ) : (
                    <span className="release-page__neighbor-spacer" />
                  )}
                  {nextSeason ? (
                    <NeighborLink
                      label={nextSeason.title}
                      direction="next"
                      onClick={() => openSeason(nextSeason.id, true)}
                    />
                  ) : (
                    <span className="release-page__neighbor-spacer" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="release-page__main">
          {loading ? (
            <p className="muted artist-section-empty">Loading subseries…</p>
          ) : null}
          {error ? (
            <p className="error artist-section-empty">{error}</p>
          ) : null}

          {!loading && !error && tab === "overview" ? (
            <div className="release-page__overview series-subseries-overview">
              <section className="release-page__overview-block">
                <h2 className="release-page__overview-heading">Seasons</h2>
                {seasons.length === 0 ? (
                  <p className="muted">
                    No season folders found under this subseries.
                  </p>
                ) : (
                  <div className="media-release-grid series-subseries-overview__grid">
                    {seasons.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="media-release-card media-release-card--portrait"
                        title={s.title}
                        onClick={() => openSeason(s.id, true)}
                      >
                        <span
                          className="media-release-card__cover"
                          style={{
                            backgroundImage: `url("${
                              s.cover_url || coverUrl || DEFAULT_DISC_URL
                            }")`,
                          }}
                        />
                        <span className="media-release-card__dim" aria-hidden />
                        <span className="media-release-card__hover">
                          <span className="media-release-card__title-hover">
                            {s.title}
                          </span>
                        </span>
                        <span className="media-release-card__date">
                          <span className="media-release-card__date-label">
                            {s.episode_count
                              ? `${s.episode_count} ep`
                              : s.display_date || s.date_iso || ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {!loading && !error && tab === "episodes" ? (
            <div className="release-tracklist series-subseries-episodes">
              <div className="release-tracklist__body">
                {seasons.length === 0 ? (
                  <p className="muted artist-section-empty">
                    No seasons with episodes yet.
                  </p>
                ) : (
                  <div className="release-tracklist__edition-block">
                    {seasons.length > 1 && activeSeason ? (
                      <h3 className="release-tracklist__edition-title">
                        {activeSeason.title}
                        {episodeCount ? (
                          <span className="release-tracklist__title-suffix">
                            {" "}
                            · {episodeCount} episodes
                          </span>
                        ) : null}
                      </h3>
                    ) : null}
                    <SeriesEpisodeList
                      episodes={seasonDetail?.episodes || []}
                      emptyLabel="No episode video files in this season folder."
                    />
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {!loading && !error && tab === "gallery" && galleryPath ? (
            <SeriesGalleryPanel folderPath={galleryPath} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
