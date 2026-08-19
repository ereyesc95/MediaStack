import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchMediaItemGallery, patchMediaItemOverview } from "../../../api";
import { pushArtistRoute } from "../../../musicRoute";
import {
  clearMediaItemOverviewCache,
  getCachedMediaItemOverview,
  prefetchMediaItemOverview,
  setCachedMediaItemOverview,
} from "../../../mediaItemOverviewCache";
import { formatTrackDate } from "../../../formatDate";
import {
  applyMediaTheme,
  beginAdaptivePageSession,
  clearAlbumTheme,
  colorsFromImageUrl,
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
  SeriesOverview,
} from "../../../types";
import AppMenu from "../../AppMenu";
import { IconZoom } from "../../MenuIcons";
import PlaylistBoot from "../../PlaylistBoot";
import MediaBeatFrame from "../MediaBeatFrame";
import ArtistMemberModal from "../artist/ArtistMemberModal";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "../artist/GalleryViewerModal";
import {
  ChevronIcon,
  DEFAULT_LABEL_URL,
} from "../release/releaseTrackPanelMeta";
import {
  ReleasePhotocardGroup,
  type ReleasePhotocardSet,
} from "../release/ReleasePhotocard";
import { fitOverviewPhotocards } from "../../../fitOverviewPhotocards";
import { screenKindLabel } from "../../../screenKindLabel";
import SeriesAboutEditModal from "../../series/SeriesAboutEditModal";
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

function mediaItemAsFilmOverview(data: MediaItemOverview): SeriesOverview {
  const directors = splitCreditNames(data.director);
  const genres = (data.genres || []).map((name) => ({ id: name, name }));
  return {
    id: data.id,
    name: data.title,
    letter: "",
    folder_path: data.folder_path,
    cover_url: data.cover_url,
    bio: data.description,
    writers: directors,
    aliases: [],
    country: data.country_iso
      ? { id: 0, name: null, iso: data.country_iso }
      : null,
    languages: data.languages || [],
    activity_periods: data.date_iso
      ? [{ label: "", start: data.date_iso, end: data.date_iso }]
      : [],
    genres,
    parent_genre_names: data.parent_genre_names,
    kind_label: data.kind_label,
    publishers: data.publisher ? [data.publisher] : [],
    eras: [],
    cast: { characters: [], staff: [] },
    media: {
      has_audio: false,
      has_series: false,
      has_library: false,
      has_games: false,
      has_gallery: false,
    },
    links: { categories: [], groups: {} },
    subseries: [],
    seasons: [],
    related: { movies: [], series: [], books: [], games: [], music: [] },
    directors,
  } as SeriesOverview & { directors: string[] };
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
  const mobilePortrait = isMobilePortraitLayout(layout);
  const tabletPortrait = layout === "tablet-portrait";
  /** Banner + More info panel: phone portrait and tablet portrait. */
  const bannerLayout = mobilePortrait || tabletPortrait;
  const stacked = bannerLayout;
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
  const [overviewSub, setOverviewSub] = useState<"lineup" | "staff">("lineup");
  const [galleryTab, setGalleryTab] = useState<GalleryTab>("artwork");
  const [galleryTabsMeta, setGalleryTabsMeta] = useState<
    { id: GalleryTab; label: string; count: number }[]
  >([]);
  const [showGalleryTab, setShowGalleryTab] = useState(false);
  const [aboutEditOpen, setAboutEditOpen] = useState(false);
  const [lineupMemberId, setLineupMemberId] = useState<number | null>(null);
  const [overviewDescExpanded, setOverviewDescExpanded] = useState(false);
  const overviewTopRef = useRef<HTMLDivElement>(null);
  const overviewPhotocardsRef = useRef<HTMLDivElement>(null);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [coverFlipped, setCoverFlipped] = useState(false);
  const [coverViewerItems, setCoverViewerItems] = useState<GalleryViewerItem[]>(
    []
  );
  const [coverViewerIndex, setCoverViewerIndex] = useState(0);

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
    setMoreInfoOpen(false);
    setExpandedGroupId(null);
    setActiveFilePath(null);
    setOverviewSub("lineup");
  }, [itemId]);

  useEffect(() => {
    if (tab !== "overview") setMoreInfoOpen(false);
  }, [tab]);

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
      {
        bandId,
        artistName: data?.artist_name ?? undefined,
        section: kind,
        overviewTab: "about",
        mediaItemId: itemId,
        mediaItemTitle: data?.title ?? undefined,
      },
      true
    );
  }, [bandId, kind, itemId, data?.artist_name, data?.title]);

  useEffect(() => {
    beginAdaptivePageSession(userId);
    return () => clearAlbumTheme(userId);
  }, [userId]);

  useEffect(() => {
    const themeSampleUrl = data?.cover_url ?? undefined;
    if (!themeSampleUrl) return;
    void colorsFromImageUrl(themeSampleUrl).then((c) => {
      if (c) applyMediaTheme(c, userId);
    });
  }, [data?.cover_url, userId]);

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

  const groupKey = (label: string, index: number) => `${index}:${label}`;

  const showGroupHeader = (label: string) =>
    groups.length > 1 || label !== "Contents";

  // Default expand first labeled group; follow active file into its group
  useEffect(() => {
    if (!groups.length) {
      setExpandedGroupId(null);
      return;
    }
    if (activeFilePath) {
      const idx = groups.findIndex((g) =>
        g.files.some((f) => f.path === activeFilePath)
      );
      if (idx >= 0) {
        setExpandedGroupId(groupKey(groups[idx]!.label, idx));
        return;
      }
    }
    setExpandedGroupId((prev) => {
      if (prev && groups.some((g, i) => groupKey(g.label, i) === prev)) {
        return prev;
      }
      const first = groups.findIndex(
        (g) => groups.length > 1 || g.label !== "Contents"
      );
      const i = first >= 0 ? first : 0;
      return groupKey(groups[i]!.label, i);
    });
  }, [groups, activeFilePath]);

  const toggleGroup = (id: string) => {
    setExpandedGroupId((prev) => (prev === id ? null : id));
  };

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
    kind === "video"
      ? screenKindLabel("film", {
          kindLabel: data?.kind_label,
          parentGenreNames: data?.parent_genre_names,
          genres: data?.genres,
        })
      : data?.content_category ||
        data?.release_type ||
        "Book";
  const displayDate =
    data?.display_date || formatTrackDate(data?.date_iso) || null;
  const coverFrontUrl = data?.cover_url || null;
  const coverBackUrl = data?.cover_back_url || null;
  const canFlipCover = Boolean(
    coverFrontUrl && coverBackUrl && coverBackUrl !== coverFrontUrl
  );
  const topLogoUrl = data?.logo_url ?? null;
  const publisherLogoSrc =
    data?.publisher_logo_url || DEFAULT_LABEL_URL;

  const openCoverArtworkViewer = useCallback(async () => {
    try {
      const payload = await fetchMediaItemGallery(bandId, kind, itemId);
      const artwork = payload?.artwork || [];
      if (!artwork.length) return;
      const items: GalleryViewerItem[] = artwork.map((item) => ({
        id: item.id,
        url: item.url,
        caption: item.title,
        subcaption:
          "year" in item && item.year != null ? String(item.year) : undefined,
      }));
      let start = 0;
      if (coverFrontUrl) {
        const hit = items.findIndex(
          (it) =>
            it.url === coverFrontUrl ||
            /cover/i.test(it.caption || "") ||
            /front/i.test(it.caption || "")
        );
        if (hit >= 0) start = hit;
      }
      setCoverViewerItems(items);
      setCoverViewerIndex(start);
    } catch {
      /* no artwork */
    }
  }, [bandId, coverFrontUrl, itemId, kind]);

  useEffect(() => {
    setCoverFlipped(false);
  }, [bandId, kind, itemId, coverFrontUrl]);

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
  const hasOverviewBottom = true;

  useLayoutEffect(() => {
    const top = overviewTopRef.current;
    const cards = overviewPhotocardsRef.current;
    if (stacked || mobileLandscape || tab !== "overview") {
      top?.style.removeProperty("--overview-photocard-scale");
      return;
    }
    const measure = () => fitOverviewPhotocards(top, cards);
    measure();
    if (!top) return;
    const ro = new ResizeObserver(measure);
    ro.observe(top);
    if (cards) ro.observe(cards);
    return () => ro.disconnect();
  }, [
    stacked,
    mobileLandscape,
    tab,
    overviewPhotocards?.portrait_front,
    overviewPhotocards?.landscape_front,
    data?.description,
    hasOverviewBottom,
  ]);

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
    bannerLayout ? "release-page--banner-layout" : "",
    tablet ? "release-page--tablet" : "",
    tabletPortrait ? "release-page--tablet-portrait" : "",
    mobileLandscape ? "release-page--mobile-landscape" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const hasPanelCredits = Boolean(
    data?.director ||
      data?.author ||
      (data?.genres && data.genres.length > 0)
  );

  const bannerBgUrl = data
    ? data.banner_url ||
      data.gallery_photo_url ||
      data.photocards?.landscape_front ||
      data.cover_url ||
      null
    : null;

  const bannerMetaHidden = bannerLayout && !moreInfoOpen;
  const hasNeighbors = Boolean(data?.prev || data?.next);

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
              adaptiveThemeActive
              editDataLabel={kind === "library" ? "Edit book" : "Edit Release"}
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
        <PlaylistBoot className="playlist-boot--compact" label="Loading…" />
      )}
      {error && <p className="error artist-section-empty">{error}</p>}

      {data && (
        <div className="release-page__body">
          <aside
            className={`release-page__panel${
              bannerLayout ? " release-page__panel--banner" : ""
            }`}
          >
            <div className="release-page__panel-content">
              <div className="release-page__art">
                <div
                  className={[
                    "release-page__art-stage",
                    bannerLayout
                      ? "release-page__art-stage--banner"
                      : "release-page__art-stage--cover-only",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {bannerLayout ? (
                    <span
                      className="release-page__banner-bg"
                      style={{
                        backgroundImage: bannerBgUrl
                          ? `url("${bannerBgUrl}")`
                          : undefined,
                      }}
                      aria-hidden
                    />
                  ) : null}
                  {coverFrontUrl ? (
                    <span
                      className={`release-page__cover-wrap${
                        bannerLayout
                          ? " release-page__cover-wrap--banner-cover release-page__cover-wrap--banner-cover-portrait"
                          : ""
                      }${canFlipCover ? " release-page__cover-wrap--flippable" : ""}${
                        coverFlipped ? " release-page__cover-wrap--flipped" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="release-page__cover-flip"
                        onClick={(e) => {
                          if (canFlipCover) setCoverFlipped((f) => !f);
                          e.currentTarget.blur();
                        }}
                        aria-label={canFlipCover ? "Flip cover" : undefined}
                        disabled={!canFlipCover}
                      >
                        <span className="release-page__cover-scene">
                          <span className="release-page__cover-face release-page__cover-face--front">
                            <img
                              src={coverFrontUrl}
                              alt=""
                              className="release-page__cover"
                              draggable={false}
                            />
                          </span>
                          {canFlipCover && coverBackUrl ? (
                            <span className="release-page__cover-face release-page__cover-face--back">
                              <img
                                src={coverBackUrl}
                                alt=""
                                className="release-page__cover release-page__cover--back"
                                draggable={false}
                              />
                            </span>
                          ) : null}
                        </span>
                      </button>
                      {!coverFlipped ? (
                        <button
                          type="button"
                          className="release-page__cover-zoom"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openCoverArtworkViewer();
                          }}
                          aria-label="Browse artwork"
                        >
                          <IconZoom />
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </div>

              {bannerLayout ? (
                <button
                  type="button"
                  className={`release-page__more-info release-page__more-info--release${
                    moreInfoOpen ? " is-open" : ""
                  }`}
                  onClick={() => setMoreInfoOpen((o) => !o)}
                  aria-expanded={moreInfoOpen}
                >
                  {data.title}
                </button>
              ) : null}

              <div
                className={`release-page__panel-meta${
                  bannerLayout ? " release-page__panel-meta--glass" : ""
                }${bannerMetaHidden ? " release-page__panel-meta--hidden" : ""}`}
              >
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
                {!bannerLayout ? (
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
                ) : data.publisher ? (
                  <div className="release-page__panel-bottom">
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
                  </div>
                ) : null}
              </div>

              {bannerLayout && hasNeighbors ? (
                <div className="release-page__panel-dock">
                  <div className="release-page__panel-footer">
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
              ) : null}
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
                  ref={overviewTopRef}
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
                        ref={overviewPhotocardsRef}
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
                  <div className="release-page__overview-bottom series-subseries-overview__cast">
                    <div className="series-subseries-overview__cast-tabs">
                      <button
                        type="button"
                        className={overviewSub === "lineup" ? "active" : ""}
                        onClick={() => setOverviewSub("lineup")}
                      >
                        Lineup
                      </button>
                      <button
                        type="button"
                        className={overviewSub === "staff" ? "active" : ""}
                        onClick={() => setOverviewSub("staff")}
                      >
                        Staff
                      </button>
                    </div>
                    {overviewSub === "staff" ? (
                      <section className="release-page__section-glass release-page__lineup">
                        <div className="media-item-page__staff">
                          {kind === "library" && authorNames.length > 0 ? (
                            <p className="release-page__producer">
                              Written by{" "}
                              <CreditNameList names={authorNames} />
                            </p>
                          ) : null}
                          {kind === "video" && directorNames.length > 0 ? (
                            <p className="release-page__producer">
                              Directed by{" "}
                              <CreditNameList names={directorNames} />
                            </p>
                          ) : null}
                          {data.publisher ? (
                            <p className="release-page__producer">
                              Distributed by{" "}
                              <span className="release-page__person-link">
                                {data.publisher}
                              </span>
                            </p>
                          ) : null}
                          {!(
                            (kind === "library" && authorNames.length) ||
                            (kind === "video" && directorNames.length) ||
                            data.publisher
                          ) ? (
                            <p className="muted artist-section-empty">
                              No staff credits yet
                              {isAdmin
                                ? " — use Edit to add credits."
                                : "."}
                            </p>
                          ) : null}
                        </div>
                      </section>
                    ) : null}

                    {overviewSub === "lineup" &&
                    showOverviewLineup &&
                    showBandLineup ? (
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

                    {overviewSub === "lineup" &&
                    showOverviewLineup &&
                    showSoloLineup ? (
                      <section className="release-page__section-glass release-page__lineup">
                        <div className="release-page__lineup-grid">
                          <LineupMiniCard
                            member={lineup[0]}
                            onSelect={() => setLineupMemberId(lineup[0].id)}
                          />
                        </div>
                      </section>
                    ) : null}

                    {overviewSub === "lineup" && !showOverviewLineup ? (
                      <p className="muted artist-section-empty">
                        No lineup for this item.
                      </p>
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
                {groups.map((group, groupIndex) => {
                  const gId = groupKey(group.label, groupIndex);
                  const header = showGroupHeader(group.label);
                  const open = !header || expandedGroupId === gId;
                  return (
                    <div key={gId} className="release-tracklist__group">
                      {header ? (
                        <button
                          type="button"
                          className={`release-tracklist__group-label series-season-block__header${
                            open ? " is-open" : ""
                          }`}
                          onClick={() => toggleGroup(gId)}
                          aria-expanded={open}
                        >
                          {group.label}
                        </button>
                      ) : null}
                      {open ? (
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
                                        file.page_count === 1
                                          ? "page"
                                          : "pages"
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
                            const active = activeFilePath === file.path;
                            return (
                              <li
                                key={file.path}
                                className={
                                  active
                                    ? "release-tracklist__row active"
                                    : "release-tracklist__row"
                                }
                              >
                                <button
                                  type="button"
                                  className={playClass}
                                  onClick={() => {
                                    setActiveFilePath(file.path);
                                    openFile(file);
                                  }}
                                >
                                  <span className="release-tracklist__num">
                                    {file.number ?? index + 1}
                                  </span>
                                  {kind === "library" ? (
                                    <span
                                      className={`media-item-tracklist__cover${
                                        file.cover_url
                                          ? ""
                                          : " media-item-tracklist__cover--empty"
                                      }`}
                                      style={
                                        file.cover_url
                                          ? {
                                              backgroundImage: `url("${file.cover_url}")`,
                                            }
                                          : undefined
                                      }
                                      aria-hidden
                                    />
                                  ) : null}
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
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">
                No playable or readable files found in this folder.
              </p>
            )}
          </main>
        </div>
      )}

      {aboutEditOpen && data && kind === "video" ? (
        <SeriesAboutEditModal
          variant="film"
          franchiseId=""
          filmId={itemId}
          data={mediaItemAsFilmOverview(data)}
          title="Edit movie"
          isAdmin={isAdmin}
          onClose={() => setAboutEditOpen(false)}
          onSaveAbout={async (payload) => {
            const updated = await patchMediaItemOverview(bandId, kind, itemId, {
              description: payload.bio,
              director: payload.directors.join("; ") || payload.writers,
              publisher: payload.publishers,
              country_iso: payload.country_iso,
              languages: payload.languages,
              genres: payload.genres.map((g) => g.name),
            });
            setCachedMediaItemOverview(bandId, kind, itemId, updated);
            setData(updated);
          }}
          onSaved={() => setAboutEditOpen(false)}
        />
      ) : aboutEditOpen && data ? (
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
      ) : null}

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

      {coverViewerItems.length > 0 ? (
        <GalleryViewerModal
          items={coverViewerItems}
          index={coverViewerIndex}
          onIndexChange={setCoverViewerIndex}
          onClose={() => setCoverViewerItems([])}
        />
      ) : null}
    </div>
  );
}
