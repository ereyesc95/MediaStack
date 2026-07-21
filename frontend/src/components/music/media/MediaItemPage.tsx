import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMediaItemGallery } from "../../../api";
import { pushArtistRoute } from "../../../musicRoute";
import {
  clearMediaItemOverviewCache,
  getCachedMediaItemOverview,
  prefetchMediaItemOverview,
  setCachedMediaItemOverview,
} from "../../../mediaItemOverviewCache";
import { formatTrackDate } from "../../../formatDate";
import {
  beginAlbumPageSession,
  beginArtistPageSession,
  clearAlbumTheme,
  colorsFromImageUrl,
  applyAlbumTheme,
} from "../../../mediaTheme";
import {
  isMobileLandscapeLayout,
  isMobilePortraitLayout,
  isTabletLayout,
  useDeviceLayout,
} from "../../../usePhoneLayout";
import type { MediaItemFile, MediaItemOverview, ReleaseNeighbor } from "../../../types";
import AppMenu from "../../AppMenu";
import MediaBeatFrame from "../MediaBeatFrame";
import {
  ChevronIcon,
  DEFAULT_DISC_URL,
} from "../release/releaseTrackPanelMeta";
import MediaItemAboutEditModal from "./MediaItemAboutEditModal";
import MediaItemGallery from "./MediaItemGallery";

type Props = {
  bandId: number;
  kind: "video" | "library";
  itemId: string;
  onBack: () => void;
  onOpenArtist: (id: number) => void;
  onOpenItem?: (itemId: string) => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  isAdmin?: boolean;
  userId?: number;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
};

type ItemTab = "overview" | "list" | "gallery";
type GalleryTab = "artwork" | "photos" | "extras";

function MediaNeighborLink({
  neighbor,
  direction,
  onClick,
}: {
  neighbor: ReleaseNeighbor;
  direction: "prev" | "next";
  onClick: () => void;
}) {
  const compact = neighbor.title.length > 18;
  return (
    <button
      type="button"
      className={`release-page__neighbor release-page__neighbor--${direction}${
        compact ? " release-page__neighbor--compact" : ""
      }`}
      onClick={onClick}
      title={neighbor.title}
    >
      {direction === "prev" && (
        <span className="release-page__neighbor-arrow" aria-hidden>
          <ChevronIcon direction="left" />
        </span>
      )}
      <span className="release-page__neighbor-text">{neighbor.title}</span>
      {direction === "next" && (
        <span className="release-page__neighbor-arrow" aria-hidden>
          <ChevronIcon direction="right" />
        </span>
      )}
    </button>
  );
}

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
  onOpenItem,
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
  const [tab, setTab] = useState<ItemTab>("overview");
  const [galleryTab, setGalleryTab] = useState<GalleryTab>("artwork");
  const [galleryTabsMeta, setGalleryTabsMeta] = useState<
    { id: GalleryTab; label: string; count: number }[]
  >([]);
  const [showGalleryTab, setShowGalleryTab] = useState(false);
  const [aboutEditOpen, setAboutEditOpen] = useState(false);

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
        setData(
          await prefetchMediaItemOverview(bandId, kind, itemId, { force: true })
        );
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
    setTab("overview");
    setGalleryTab("artwork");
    setAboutEditOpen(false);
  }, [itemId]);

  const openNeighbor = (neighborId: string) => {
    if (onOpenItem) {
      onOpenItem(neighborId);
      return;
    }
    pushArtistRoute({
      bandId,
      section: kind,
      overviewTab: "about",
      mediaItemId: neighborId,
    });
  };

  useEffect(() => {
    pushArtistRoute(
      { bandId, section: kind, overviewTab: "about", mediaItemId: itemId },
      true
    );
  }, [bandId, kind, itemId]);

  useEffect(() => {
    beginArtistPageSession(userId);
    beginAlbumPageSession();
  }, [userId]);

  useEffect(() => {
    return () => clearAlbumTheme(userId);
  }, [userId]);

  useEffect(() => {
    const themeSampleUrl = data?.cover_url ?? undefined;
    if (!themeSampleUrl) return;
    void colorsFromImageUrl(themeSampleUrl).then((c) => {
      if (c) applyAlbumTheme(c);
    });
  }, [data?.cover_url]);

  useEffect(() => {
    let cancelled = false;
    void fetchMediaItemGallery(bandId, kind, itemId)
      .then((payload) => {
        if (cancelled) return;
        const show = Boolean(
          payload.artwork.length ||
            payload.photos.length ||
            payload.extras.length
        );
        setShowGalleryTab(show);
        if (!show) {
          setTab((prev) => (prev === "gallery" ? "list" : prev));
        }
      })
      .catch(() => {
        if (!cancelled) setShowGalleryTab(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, kind, itemId]);

  const groups = useMemo(() => {
    if (!data) return [];
    if (data.groups?.length) return data.groups;
    if (data.files?.length) return [{ label: "Contents", files: data.files }];
    return [];
  }, [data]);

  const hasDateColumn = useMemo(
    () =>
      groups.some((g) => g.files.some((f) => Boolean(f.display_date || f.date_iso))),
    [groups]
  );
  const showDurationColumn = kind === "video";
  const showPagesColumn = useMemo(
    () =>
      kind === "library" &&
      groups.some((g) => g.files.some((f) => Boolean(f.pages || f.page_count))),
    [groups, kind]
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

  const pageTabs = useMemo(() => {
    const tabs: { id: ItemTab; label: string }[] = [
      { id: "overview", label: "OVERVIEW" },
      { id: "list", label: listTabLabel },
    ];
    if (showGalleryTab) tabs.push({ id: "gallery", label: "GALLERY" });
    return tabs;
  }, [listTabLabel, showGalleryTab]);

  const handleRefresh = useCallback(() => {
    clearMediaItemOverviewCache(bandId, kind, itemId);
    void load(true);
  }, [bandId, kind, itemId, load]);

  const pageClass = [
    "release-page",
    "media-item-page",
    kind === "video" ? "media-item-page--video" : "media-item-page--library",
    tab === "overview" ? "release-page--overview" : "",
    tab === "gallery" ? "release-page--tab-gallery" : "",
    stacked ? "release-page--stacked" : "",
    tablet ? "release-page--tablet" : "",
    layout === "tablet-portrait" ? "release-page--tablet-portrait" : "",
    mobileLandscape ? "release-page--mobile-landscape" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const hasPanelCredits = Boolean(
    data?.director ||
      data?.author ||
      data?.publisher ||
      (data?.genres && data.genres.length > 0)
  );

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
              menuVariant="media-item"
              artistThemeActive
              onEditAbout={isAdmin ? () => setAboutEditOpen(true) : undefined}
              onRefreshTracklist={() => handleRefresh()}
            />
          </div>
        </header>

        <nav className="release-page__tabs" aria-label={`${sectionLabel} views`}>
          {pageTabs.map((t) => (
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

        {tab === "gallery" && galleryTabsMeta.length > 1 && (
          <nav
            className="release-page__subtabs release-page__subtabs--gallery"
            aria-label="Gallery sections"
          >
            {galleryTabsMeta.map((t) => (
              <button
                key={t.id}
                type="button"
                className={galleryTab === t.id ? "active" : ""}
                onClick={() => setGalleryTab(t.id)}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>

      {loading && !data && (
        <p className="muted artist-section-empty">Loading…</p>
      )}
      {error && <p className="error artist-section-empty">{error}</p>}

      {data && (
        <div className="release-page__body">
          <aside className="release-page__panel">
            <div className="release-page__panel-content">
              <div className="release-page__art">
                <div
                  className={[
                    "release-page__art-stage",
                    kind === "library" ? "release-page__art-stage--cover-only" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
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
                  {kind === "video" ? (
                    <img
                      src={discUrl}
                      alt=""
                      className="release-page__disc"
                      draggable={false}
                    />
                  ) : null}
                </div>
              </div>
              <div className="release-page__panel-meta">
                <div className="release-page__panel-fit">
                  <div className="release-page__panel-fit-inner">
                    <div className="release-page__panel-body">
                      <button
                        type="button"
                        className="release-page__artist-link release-page__artist-link--text"
                        onClick={() => onOpenArtist(bandId)}
                      >
                        {data.artist_name}
                      </button>
                      <div className="release-page__panel-head">
                        <h1 className="release-page__album-title">
                          {data.title}
                        </h1>
                        {displayDate ? (
                          <p className="release-page__date">{displayDate}</p>
                        ) : null}
                        <p className="release-page__type-line">{typeLine}</p>
                      </div>
                      {hasPanelCredits ? (
                        <div className="release-page__panel-credits media-item-page__panel-credits">
                          {data.genres && data.genres.length > 0 ? (
                            <p className="release-page__subgenres">
                              {data.genres.map((name, i) => (
                                <span key={`${name}-${i}`}>
                                  {i > 0 && " · "}
                                  <span className="release-page__genre-link">
                                    {name}
                                  </span>
                                </span>
                              ))}
                            </p>
                          ) : null}
                          {data.director ? (
                            <p className="release-page__producer">
                              Directed by{" "}
                              <span className="release-page__person-link">
                                {data.director}
                              </span>
                            </p>
                          ) : null}
                          {data.author ? (
                            <p className="release-page__producer">
                              Written by{" "}
                              <span className="release-page__person-link">
                                {data.author}
                              </span>
                            </p>
                          ) : null}
                          {data.publisher ? (
                            <p className="release-page__producer">
                              Published by{" "}
                              <span className="release-page__person-link">
                                {data.publisher}
                              </span>
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="release-page__panel-bottom">
                  <div className="release-page__panel-bottom-bar">
                    {data.prev ? (
                      <MediaNeighborLink
                        neighbor={data.prev}
                        direction="prev"
                        onClick={() => openNeighbor(data.prev!.id)}
                      />
                    ) : (
                      <span className="release-page__neighbor-spacer" />
                    )}
                    {data.next ? (
                      <MediaNeighborLink
                        neighbor={data.next}
                        direction="next"
                        onClick={() => openNeighbor(data.next!.id)}
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
            {tab === "overview" ? (
              <div className="release-page__overview">
                {data.description ? (
                  <section className="release-page__desc-block">
                    <div className="release-page__desc-scroll">
                      {data.description.split(/\n+/).map((p, i) => (
                        <p key={i} className="release-page__desc-para">
                          {p}
                        </p>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : tab === "gallery" ? (
              <MediaItemGallery
                bandId={bandId}
                kind={kind}
                itemId={itemId}
                galleryTab={
                  galleryTabsMeta.length > 1 ? galleryTab : undefined
                }
                onGalleryTabChange={setGalleryTab}
                hideTabs={galleryTabsMeta.length > 1}
                onTabsMeta={setGalleryTabsMeta}
              />
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
                        const metaRight = showDurationColumn
                          ? file.duration ?? ""
                          : showPagesColumn
                            ? file.pages ??
                              (file.page_count
                                ? `${file.page_count} ${
                                    file.page_count === 1 ? "page" : "pages"
                                  }`
                                : "")
                            : "";
                        const playClass = [
                          "release-tracklist__play",
                          "media-item-tracklist__play",
                          hasDateColumn
                            ? "media-item-tracklist__play--date"
                            : "",
                          showDurationColumn || showPagesColumn
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
                              {showDurationColumn || showPagesColumn ? (
                                <span className="release-tracklist__duration">
                                  {metaRight}
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

      {aboutEditOpen && data && (
        <MediaItemAboutEditModal
          bandId={bandId}
          kind={kind}
          itemId={itemId}
          data={data}
          onClose={() => setAboutEditOpen(false)}
          onSaved={(updated) => {
            setCachedMediaItemOverview(bandId, kind, itemId, updated);
            setData(updated);
          }}
        />
      )}
    </div>
  );
}
