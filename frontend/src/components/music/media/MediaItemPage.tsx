import { useCallback, useEffect, useMemo, useState } from "react";
import { pushArtistRoute } from "../../../musicRoute";
import {
  getCachedMediaItemOverview,
  prefetchMediaItemOverview,
} from "../../../mediaItemOverviewCache";
import { formatTrackDate } from "../../../formatDate";
import {
  isMobileLandscapeLayout,
  isMobilePortraitLayout,
  isTabletLayout,
  useDeviceLayout,
} from "../../../usePhoneLayout";
import type { MediaItemFile, MediaItemOverview } from "../../../types";
import AppMenu from "../../AppMenu";
import MediaBeatFrame from "../MediaBeatFrame";
import { DEFAULT_DISC_URL } from "../release/releaseTrackPanelMeta";

type Props = {
  bandId: number;
  kind: "video" | "library";
  itemId: string;
  onBack: () => void;
  onOpenArtist: (id: number) => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  isAdmin?: boolean;
  userId?: number;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
};

type ItemTab = "overview" | "list";

function openFile(file: MediaItemFile) {
  const url =
    file.url ||
    (file.path ? `/api/media/file?path=${encodeURIComponent(file.path)}` : null);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function MediaItemPage({
  bandId,
  kind,
  itemId,
  onBack,
  onOpenArtist,
  onImport,
  onSync,
  onChooseSource,
  isAdmin,
  userId,
  onSwitchProfile,
  onEditProfile,
}: Props) {
  const layout = useDeviceLayout();
  const stacked = isMobilePortraitLayout(layout);
  const tablet = isTabletLayout(layout);
  const mobileLandscape = isMobileLandscapeLayout(layout);

  const [data, setData] = useState<MediaItemOverview | null>(() =>
    getCachedMediaItemOverview(bandId, kind, itemId)
  );
  const [loading, setLoading] = useState(
    () => !getCachedMediaItemOverview(bandId, kind, itemId)
  );
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ItemTab>("list");

  const load = useCallback(
    async (force = false) => {
      const cached = !force
        ? getCachedMediaItemOverview(bandId, kind, itemId)
        : null;
      if (cached) {
        setData(cached);
        setLoading(false);
        setError(null);
        prefetchMediaItemOverview(bandId, kind, itemId, { force: true })
          .then(setData)
          .catch(() => {});
        return;
      }
      setLoading(true);
      setError(null);
      try {
        setData(await prefetchMediaItemOverview(bandId, kind, itemId, { force: true }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [bandId, kind, itemId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    pushArtistRoute(
      { bandId, section: kind, overviewTab: "about", mediaItemId: itemId },
      true
    );
  }, [bandId, kind, itemId]);

  const groups = useMemo(() => {
    if (!data) return [];
    if (data.groups?.length) return data.groups;
    if (data.files?.length) return [{ label: "Contents", files: data.files }];
    return [];
  }, [data]);

  const hasDateColumn = useMemo(
    () => groups.some((g) => g.files.some((f) => Boolean(f.display_date || f.date_iso))),
    [groups]
  );
  const hasDurationColumn = useMemo(
    () => groups.some((g) => g.files.some((f) => Boolean(f.duration))),
    [groups]
  );

  const sectionLabel = kind === "video" ? "Video" : "Library";
  const listTabLabel = kind === "video" ? "VIDEOS" : "VOLUMES";
  const typeLine =
    kind === "video"
      ? `Video release by ${data?.artist_name ?? "Artist"}`
      : `Library item by ${data?.artist_name ?? "Artist"}`;
  const displayDate =
    data?.display_date || formatTrackDate(data?.date_iso) || null;
  const discUrl = data?.disc_url || DEFAULT_DISC_URL;
  const topLogoUrl = data?.logo_url ?? null;

  const pageClass = [
    "release-page",
    "media-item-page",
    "release-page--overview",
    stacked ? "release-page--stacked" : "",
    tablet ? "release-page--tablet" : "",
    layout === "tablet-portrait" ? "release-page--tablet-portrait" : "",
    mobileLandscape ? "release-page--mobile-landscape" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={pageClass}>
      {data?.cover_url ? (
        <div className="release-page__bg-stack" aria-hidden>
          <div
            className="release-page__bg release-page__bg--visible"
            style={{ backgroundImage: `url("${data.cover_url}")` }}
          />
        </div>
      ) : null}

      <div className="release-page__chrome">
        <header className="release-page__top">
          <div className="release-page__top-left">
            <button
              type="button"
              className="release-page__back"
              onClick={onBack}
              aria-label={`Back to ${data?.artist_name ?? "Artist"}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M15 6l-6 6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{data?.artist_name ?? "Artist"}</span>
            </button>
          </div>
          <div className="release-page__top-center">
            {topLogoUrl ? (
              <MediaBeatFrame variant="logo">
                <img
                  src={topLogoUrl}
                  alt=""
                  className="release-page__brand-logo"
                  draggable={false}
                />
              </MediaBeatFrame>
            ) : (
              data && (
                <span className="release-page__title-center release-page__title-center--lg">
                  {data.title}
                </span>
              )
            )}
          </div>
          <div className="release-page__top-right">
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              menuVariant="release"
              artistThemeActive
            />
          </div>
        </header>

        <nav className="release-page__tabs" aria-label={`${sectionLabel} views`}>
          <button
            type="button"
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            OVERVIEW
          </button>
          <button
            type="button"
            className={tab === "list" ? "active" : ""}
            onClick={() => setTab("list")}
          >
            {listTabLabel}
          </button>
        </nav>

        {loading && !data && (
          <p className="muted artist-section-empty">Loading…</p>
        )}
        {error && <p className="error artist-section-empty">{error}</p>}

        {data && (
          <div className="release-page__body">
            <aside className="release-page__panel">
              <div className="release-page__panel-content">
                <div className="release-page__art">
                  <div className="release-page__art-stage">
                    {data.cover_url ? (
                      <div className="release-page__cover-wrap">
                        <img
                          src={data.cover_url}
                          alt=""
                          className="release-page__cover"
                          draggable={false}
                        />
                      </div>
                    ) : null}
                    <img
                      src={discUrl}
                      alt=""
                      className="release-page__disc"
                      draggable={false}
                    />
                  </div>
                </div>
                <div className="release-page__panel-meta">
                  <div className="release-page__panel-fit">
                    <div className="release-page__panel-body">
                      <button
                        type="button"
                        className="release-page__artist-link release-page__artist-link--text"
                        onClick={() => onOpenArtist(bandId)}
                      >
                        {data.artist_name}
                      </button>
                      <div className="release-page__panel-head">
                        <h1 className="release-page__album-title">{data.title}</h1>
                        {displayDate ? (
                          <p className="release-page__date">{displayDate}</p>
                        ) : null}
                        <p className="release-page__type-line">{typeLine}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            <main className="release-page__main">
              {tab === "overview" ? (
                <div className="release-page__overview">
                  {data.description ? (
                    <section className="release-page__desc-block">
                      <h2>Overview</h2>
                      <p>{data.description}</p>
                    </section>
                  ) : (
                    <p className="muted">No description file in this folder.</p>
                  )}
                </div>
              ) : groups.length > 0 ? (
                <div className="release-tracklist__content media-item-tracklist">
                  {groups.map((group) => (
                    <div key={group.label} className="release-tracklist__group">
                      {(groups.length > 1 || group.label !== "Contents") && (
                        <h3 className="release-tracklist__group-label">
                          {group.label}
                        </h3>
                      )}
                      <ol className="release-tracklist__tracks">
                        {group.files.map((file, index) => {
                          const title = file.title?.trim() || file.name;
                          const rowDate =
                            file.display_date ||
                            formatTrackDate(file.date_iso) ||
                            "";
                          const playClass = [
                            "release-tracklist__play",
                            "media-item-tracklist__play",
                            hasDateColumn ? "media-item-tracklist__play--date" : "",
                            hasDurationColumn
                              ? "media-item-tracklist__play--duration"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          return (
                            <li
                              key={file.path}
                              className="release-tracklist__row"
                            >
                              <button
                                type="button"
                                className={playClass}
                                onClick={() => openFile(file)}
                              >
                                <span className="release-tracklist__num">
                                  {file.number ?? index + 1}
                                </span>
                                <span className="release-tracklist__title-wrap">
                                  <span className="release-tracklist__title">
                                    {title}
                                  </span>
                                </span>
                                {hasDateColumn ? (
                                  <span className="media-item-tracklist__date">
                                    {rowDate}
                                  </span>
                                ) : null}
                                {hasDurationColumn ? (
                                  <span className="release-tracklist__duration">
                                    {file.duration ?? ""}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  No playable or readable files found in this folder.
                </p>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
