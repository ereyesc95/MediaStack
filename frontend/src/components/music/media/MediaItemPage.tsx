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
import { getCachedOverview } from "../../../overviewCache";
import type {
  LineupMember,
  MediaItemFile,
  MediaItemOverview,
  ReleaseNeighbor,
} from "../../../types";
import AppMenu from "../../AppMenu";
import MediaBeatFrame from "../MediaBeatFrame";
import ArtistMemberModal from "../artist/ArtistMemberModal";
import {
  ChevronIcon,
  DEFAULT_DISC_URL,
  DEFAULT_LABEL_URL,
} from "../release/releaseTrackPanelMeta";
import {
  ReleasePhotocardGroup,
  type ReleasePhotocardSet,
} from "../release/ReleasePhotocard";
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

function splitCreditNames(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[;,]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function CreditNameList({ names }: { names: string[] }) {
  return (
    <>
      {names.map((name, i) => (
        <span key={`${name}-${i}`}>
          {i > 0 && (i === names.length - 1 ? " & " : ", ")}
          <span className="release-page__person-link">{name}</span>
        </span>
      ))}
    </>
  );
}

function FranchiseArtistCard({
  artist,
  onSelect,
}: {
  artist: NonNullable<MediaItemOverview["franchise_artist"]>;
  onSelect: () => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUrl = artist.photo_url ?? artist.icon_url ?? artist.logo_url;
  const showPhoto = photoUrl && !photoFailed;
  return (
    <button
      type="button"
      className="release-lineup-card release-lineup-card--featured-artist release-lineup-card--franchise"
      onClick={onSelect}
    >
      <span className="release-lineup-card__photo">
        {showPhoto ? (
          <img src={photoUrl!} alt="" onError={() => setPhotoFailed(true)} />
        ) : (
          <span className="release-lineup-card__initials">
            {artist.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
      <span className="release-lineup-card__name">{artist.name}</span>
    </button>
  );
}

function LineupMiniCard({
  member,
  onSelect,
}: {
  member: LineupMember;
  onSelect: (id: number) => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = member.photo_url && !photoFailed;
  return (
    <button
      type="button"
      className="release-lineup-card"
      onClick={() => onSelect(member.id)}
    >
      <span className="release-lineup-card__photo">
        {showPhoto ? (
          <img
            src={member.photo_url!}
            alt=""
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <span className="release-lineup-card__initials">
            {member.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
      <span className="release-lineup-card__name">{member.name}</span>
      {member.roles?.length ? (
        <span className="release-lineup-card__roles">
          {member.roles.join(" · ")}
        </span>
      ) : null}
    </button>
  );
}

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
  const [lineupMemberId, setLineupMemberId] = useState<number | null>(null);
  const [overviewDescExpanded, setOverviewDescExpanded] = useState(false);

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
    setLineupMemberId(null);
    setOverviewDescExpanded(false);
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
  const releaseTypeLabel =
    data?.release_type ??
    (kind === "video" ? "Video release" : "Library item");
  const displayDate =
    data?.display_date || formatTrackDate(data?.date_iso) || null;
  const discUrl = data?.disc_url || DEFAULT_DISC_URL;
  const topLogoUrl = data?.logo_url ?? null;
  const publisherLogoSrc =
    data?.publisher_logo_url || DEFAULT_LABEL_URL;

  const year = Number((data?.date_iso ?? "").slice(0, 4));
  const cachedArtist = getCachedOverview(bandId, "landscape");
  const panelArtistIcon =
    data?.era_icon_url ??
    cachedArtist?.eras?.find((e) => e.year === year)?.icon_url ??
    null;
  const panelArtistLogo =
    data?.era_logo_url ??
    cachedArtist?.eras?.find((e) => e.year === year)?.logo_url ??
    cachedArtist?.eras?.[0]?.logo_url ??
    null;

  const photocards = data?.photocards;
  const sharedCoverUrls = Boolean(
    photocards?.portrait_front &&
      photocards.portrait_front === photocards.landscape_front &&
      (photocards.portrait_back ?? photocards.portrait_front) ===
        (photocards.landscape_back ?? photocards.landscape_front)
  );
  const looksLikeCoverArt = /cover/i.test(
    decodeURIComponent(photocards?.portrait_front ?? "")
  );
  const photocardsCoverOnly = Boolean(
    photocards?.cover_only || (sharedCoverUrls && looksLikeCoverArt)
  );
  const overviewPhotocards: ReleasePhotocardSet | null = photocards
    ? {
        portrait_front: photocards.portrait_front,
        portrait_back: photocards.portrait_back,
        landscape_front: photocards.landscape_front,
        landscape_back: photocards.landscape_back,
        cover_only: photocardsCoverOnly || undefined,
      }
    : null;
  const showOverviewPhotocards = Boolean(
    overviewPhotocards &&
      (overviewPhotocards.portrait_front || overviewPhotocards.landscape_front)
  );
  const showOverviewSide = showOverviewPhotocards;

  const lineup = data?.lineup ?? [];
  const showBandLineup = Boolean(
    data?.show_lineup && !data?.is_solo && lineup.length > 0
  );
  const showSoloLineup = Boolean(data?.is_solo && lineup.length > 0);
  const showOverviewLineup = showBandLineup || showSoloLineup;
  const franchiseArtist = data?.franchise_artist ?? null;
  const franchiseItems = data?.franchise_items ?? [];
  const showFranchise = Boolean(franchiseArtist || franchiseItems.length > 0);
  const hasOverviewBottom =
    showOverviewLineup || showFranchise;

  const directorNames = splitCreditNames(data?.director);
  const authorNames = splitCreditNames(data?.author);

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
                    kind === "video" && !data.cover_url
                      ? "release-page__art-stage--disc-only"
                      : "",
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
                      <div className="release-page__brand-row">
                        {panelArtistIcon || panelArtistLogo ? (
                          <button
                            type="button"
                            className="release-page__artist-link release-page__brand-row-btn"
                            onClick={() => onOpenArtist(bandId)}
                            aria-label={`Open ${data.artist_name}`}
                          >
                            {panelArtistIcon && (
                              <MediaBeatFrame variant="logo">
                                <img
                                  src={panelArtistIcon}
                                  alt=""
                                  className="release-page__meta-icon"
                                />
                              </MediaBeatFrame>
                            )}
                            {panelArtistLogo && (
                              <MediaBeatFrame variant="logo">
                                <img
                                  src={panelArtistLogo}
                                  alt=""
                                  className="release-page__meta-logo"
                                />
                              </MediaBeatFrame>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="release-page__artist-link release-page__artist-link--text"
                            onClick={() => onOpenArtist(bandId)}
                          >
                            {data.artist_name}
                          </button>
                        )}
                      </div>
                      <div className="release-page__panel-head">
                        <h1 className="release-page__album-title">
                          {data.title}
                        </h1>
                        {displayDate ? (
                          <p className="release-page__date">{displayDate}</p>
                        ) : null}
                        <p className="release-page__type-line">
                          <button
                            type="button"
                            className="release-page__type-link"
                            onClick={onBack}
                          >
                            {releaseTypeLabel}
                          </button>{" "}
                          by{" "}
                          <button
                            type="button"
                            className="release-page__artist-link release-page__artist-link--inline"
                            onClick={() => onOpenArtist(bandId)}
                          >
                            {data.artist_name}
                          </button>
                        </p>
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
                          {directorNames.length > 0 ? (
                            <p className="release-page__producer">
                              Directed by{" "}
                              <CreditNameList names={directorNames} />
                            </p>
                          ) : null}
                          {authorNames.length > 0 ? (
                            <p className="release-page__producer">
                              Written by{" "}
                              <CreditNameList names={authorNames} />
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="release-page__panel-bottom">
                  {data.publisher ? (
                    <div className="release-page__label">
                      <span className="release-page__label-logo-btn">
                        <img
                          src={publisherLogoSrc}
                          alt={data.publisher}
                          className="release-page__label-logo"
                        />
                      </span>
                      <p className="release-page__label-name">
                        Published by{" "}
                        <span className="release-page__person-link">
                          {data.publisher}
                        </span>
                      </p>
                    </div>
                  ) : null}
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
              <div
                className={[
                  "release-page__overview",
                  hasOverviewBottom ? "" : "release-page__overview--compact-lineup",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div
                  className={[
                    "release-page__overview-top",
                    data.description ? "" : "release-page__overview-top--no-desc",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {data.description ? (
                    <div className="release-page__desc-block">
                      <div
                        className={`release-page__desc-scroll${
                          stacked
                            ? overviewDescExpanded
                              ? " release-page__desc-scroll--expanded"
                              : " release-page__desc-scroll--collapsed"
                            : ""
                        }`}
                      >
                        {data.description.split(/\n+/).map((p, i) => (
                          <p key={i} className="release-page__desc-para">
                            {p}
                          </p>
                        ))}
                      </div>
                      {stacked && (
                        <button
                          type="button"
                          className="release-page__desc-toggle"
                          onClick={() =>
                            setOverviewDescExpanded((o) => !o)
                          }
                        >
                          {overviewDescExpanded ? "Show less" : "Read more"}
                        </button>
                      )}
                    </div>
                  ) : null}

                  {showOverviewSide && overviewPhotocards ? (
                    <div className="release-page__overview-side">
                      <div
                        className={`release-page__photocards${
                          photocardsCoverOnly
                            ? " release-page__photocards--cover-only"
                            : ""
                        }`}
                      >
                        <ReleasePhotocardGroup cards={overviewPhotocards} />
                      </div>
                    </div>
                  ) : null}
                </div>

                {hasOverviewBottom ? (
                  <div className="release-page__overview-bottom">
                    {showOverviewLineup && showBandLineup ? (
                      <section className="release-page__section-glass release-page__lineup">
                        <div className="release-page__lineup-grid">
                          {lineup.map((m) => (
                            <LineupMiniCard
                              key={m.participation_id ?? m.id}
                              member={m}
                              onSelect={() => setLineupMemberId(m.id)}
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {showOverviewLineup && showSoloLineup ? (
                      <section className="release-page__section-glass release-page__lineup">
                        <div className="release-page__lineup-grid">
                          <LineupMiniCard
                            member={lineup[0]}
                            onSelect={() => setLineupMemberId(lineup[0].id)}
                          />
                        </div>
                      </section>
                    ) : null}

                    {showFranchise ? (
                      <section className="release-page__section-glass release-page__singles release-page__franchise">
                        {franchiseArtist ? (
                          <div className="release-page__featured-artists-grid" data-count="1">
                            <FranchiseArtistCard
                              artist={franchiseArtist}
                              onSelect={() => {
                                if (franchiseArtist.band_id != null) {
                                  onOpenArtist(franchiseArtist.band_id);
                                }
                              }}
                            />
                          </div>
                        ) : null}
                        {franchiseItems.length > 0 ? (
                          <div className="release-page__singles-grid">
                            {franchiseItems.map((item) => {
                              const dateLabel = formatTrackDate(
                                item.date_iso ?? null
                              );
                              return (
                                <div
                                  key={item.path ?? item.title}
                                  className="release-page__single release-page__single--static"
                                >
                                  <span className="release-page__single-title">
                                    {item.title}
                                  </span>
                                  {dateLabel ? (
                                    <span className="release-page__single-date">
                                      {dateLabel}
                                    </span>
                                  ) : null}
                                  {item.kind ? (
                                    <span className="release-page__single-date">
                                      {item.kind}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </section>
                    ) : null}
                  </div>
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

      {lineupMemberId != null && data && (
        <ArtistMemberModal
          artistId={lineupMemberId}
          bandId={bandId}
          bandName={data.artist_name}
          isAdmin={isAdmin}
          onClose={() => setLineupMemberId(null)}
          onOpenArtist={onOpenArtist}
          onDataChanged={() => void load()}
        />
      )}
    </div>
  );
}
