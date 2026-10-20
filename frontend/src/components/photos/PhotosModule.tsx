import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteExclusiveLink,
  fetchExclusiveHub,
  fetchExclusiveLinks,
  fetchPhotoYears,
  resolveArtistName,
  resolveBooksPath,
  resolveGamesPath,
  resolveMoviesPath,
  type ExclusiveHubItem,
  type ExclusiveHubSource,
  type ExclusiveLinkRecord,
  type PhotosYearBucket,
} from "../../api";
import {
  defaultSectionForSource,
  saveArtistEntryReferrer,
} from "../../artistEntry";
import { withMediaAccess } from "../../mediaFileUrl";
import { seriesLeafFromFolderPath } from "../../openMediaFromPath";
import {
  consumePhotosExclusiveReturn,
  savePhotosExclusiveReturn,
} from "../../photosExclusiveReturn";
import { usePhoneLayout } from "../../usePhoneLayout";
import type { MediaOption } from "../ModuleTopBar";
import ModuleTopBar from "../ModuleTopBar";
import AppMenu from "../AppMenu";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "../music/artist/GalleryViewerModal";
import SearchableDropdown from "../SearchableDropdown";
import ExclusiveLinkModal from "./ExclusiveLinkModal";
import {
  IconAll,
  IconCamera,
  IconExternalLink,
  IconLinks,
  IconPencil,
  IconVideo,
} from "../MenuIcons";

type Props = {
  mediaOptions: MediaOption[];
  busy?: string;
  syncTick?: number;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  isAdmin?: boolean;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onSelectMedia: (opt: MediaOption) => void;
  onOpenArtist?: (bandId: number) => void;
  onOpenMovies?: (franchiseId: string, filmId?: string) => void;
  onOpenSeries?: (franchiseId: string, subseriesId?: string) => void;
  onOpenBooks?: (franchiseId: string, bookId?: string) => void;
  onOpenGames?: (franchiseId: string, gameId?: string) => void;
};

type PhotoItem = PhotosYearBucket["items"][number];
type MediaTypeFilter = "all" | "photos" | "videos" | "links";
type ViewTab = "home" | "gallery" | "exclusive";
type ExclusiveModule =
  | "photos"
  | "music"
  | "series"
  | "movies"
  | "books"
  | "games";

const GALLERY_MEDIA_ORDER: MediaTypeFilter[] = ["all", "photos", "videos"];
const MEDIA_TYPE_LABELS: Record<MediaTypeFilter, string> = {
  all: "ALL",
  photos: "PHOTOS",
  videos: "VIDEOS",
  links: "LINKS",
};

function buildExclusiveMediaOrder(hasLinks: boolean): MediaTypeFilter[] {
  if (!hasLinks) return GALLERY_MEDIA_ORDER;
  return ["all", "photos", "videos", "links"];
}

const EXCLUSIVE_MODULE_TABS: { id: ExclusiveModule; label: string }[] = [
  { id: "photos", label: "PHOTOS" },
  { id: "music", label: "MUSIC" },
  { id: "series", label: "SERIES" },
  { id: "movies", label: "MOVIES" },
  { id: "books", label: "BOOKS" },
  { id: "games", label: "GAMES" },
];

const HOME_FADE_MS = 4500;
const HOME_PREVIEW_MAX = 6;

function mediaSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return withMediaAccess(url);
}

function PhotosMediaTypeToggle({
  value,
  onChange,
  order,
}: {
  value: MediaTypeFilter;
  onChange: (next: MediaTypeFilter) => void;
  order: MediaTypeFilter[];
}) {
  const idx = Math.max(0, order.indexOf(value));
  const current = order[idx] ?? "all";
  const next = order[(idx + 1) % order.length] ?? "all";
  const label = MEDIA_TYPE_LABELS[current];
  const title = `Switch to ${MEDIA_TYPE_LABELS[next].charAt(0)}${MEDIA_TYPE_LABELS[next]
    .slice(1)
    .toLowerCase()}`;
  return (
    <button
      type="button"
      className="catalog-scope-toggle catalog-scope-toggle--switch"
      aria-label={label}
      title={title}
      onClick={() => onChange(next)}
    >
      {current === "videos" ? (
        <IconVideo className="catalog-scope-toggle__icon" />
      ) : current === "photos" ? (
        <IconCamera className="catalog-scope-toggle__icon" />
      ) : current === "links" ? (
        <IconLinks className="catalog-scope-toggle__icon" />
      ) : (
        <IconAll className="catalog-scope-toggle__icon" />
      )}
      {label}
    </button>
  );
}

function PhotosLinkTile({
  link,
  isAdmin,
  revealed,
  onReveal,
  onEdit,
  onDelete,
}: {
  link: ExclusiveLinkRecord;
  isAdmin?: boolean;
  revealed: boolean;
  onReveal: (id: number | null) => void;
  onEdit: (link: ExclusiveLinkRecord) => void;
  onDelete: (link: ExclusiveLinkRecord) => void;
}) {
  const longPressRef = useRef<number | null>(null);

  const clearLongPress = () => {
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  return (
    <div
      className={`photos-tile photos-tile--link${revealed ? " is-revealed" : ""}`}
      onMouseEnter={() => isAdmin && onReveal(link.id)}
      onMouseLeave={() => isAdmin && onReveal(null)}
      onTouchStart={() => {
        if (!isAdmin) return;
        clearLongPress();
        longPressRef.current = window.setTimeout(() => onReveal(link.id), 500);
      }}
      onTouchEnd={clearLongPress}
      onTouchCancel={clearLongPress}
    >
      <a
        className="photos-tile__main"
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="photos-tile__cover" />
        <span className="photos-tile__link-icon" aria-hidden>
          <IconExternalLink />
        </span>
        <span className="photos-tile__shade" aria-hidden />
        <span className="photos-tile__meta">
          <span className="photos-tile__title">{link.title}</span>
        </span>
      </a>
      {isAdmin ? (
        <span className="photos-tile__actions">
          <button
            type="button"
            className="photos-tile__action photos-tile__action--edit"
            aria-label="Edit link"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(link);
            }}
          >
            <IconPencil />
          </button>
          <button
            type="button"
            className="photos-tile__action photos-tile__action--delete"
            aria-label="Delete link"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(link);
            }}
          >
            ✕
          </button>
        </span>
      ) : null}
    </div>
  );
}

function PhotosTile({
  coverUrl,
  title,
  subtitle,
  onClick,
}: {
  coverUrl?: string;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="photos-tile" onClick={onClick}>
      <span
        className="photos-tile__cover"
        style={
          coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined
        }
      />
      <span className="photos-tile__shade" aria-hidden />
      <span className="photos-tile__meta">
        <span className="photos-tile__title">{title}</span>
        {subtitle ? (
          <span className="photos-tile__subtitle">{subtitle}</span>
        ) : null}
      </span>
    </button>
  );
}

/** Home folder block: crossfades between a few folder images on a shared tick. */
function HomeFolderBlock({
  label,
  urls,
  tick,
  stagger,
  onClick,
}: {
  label: string;
  urls: string[];
  tick: number;
  stagger: number;
  onClick: () => void;
}) {
  const n = urls.length;
  const idx = n > 0 ? (tick + stagger) % n : 0;
  const prev = n > 1 ? (idx - 1 + n) % n : idx;
  const frontIsA = tick % 2 === 0;

  return (
    <button
      type="button"
      className="photos-tile photos-home-block"
      onClick={onClick}
    >
      {n > 0 ? (
        <>
          <span
            className={
              frontIsA
                ? "photos-tile__cover photos-tile__cover--fade is-lit"
                : "photos-tile__cover photos-tile__cover--fade is-dim"
            }
            style={{
              backgroundImage: `url("${urls[frontIsA ? idx : prev]}")`,
            }}
          />
          <span
            className={
              !frontIsA
                ? "photos-tile__cover photos-tile__cover--fade is-lit"
                : "photos-tile__cover photos-tile__cover--fade is-dim"
            }
            style={{
              backgroundImage: `url("${urls[!frontIsA ? idx : prev]}")`,
            }}
          />
        </>
      ) : (
        <span className="photos-tile__cover" />
      )}
      <span className="photos-tile__shade" aria-hidden />
      <span className="photos-tile__meta">
        <span className="photos-tile__title">{label}</span>
      </span>
    </button>
  );
}

/** Photos: HOME folder previews · GALLERY year grids · Exclusive hub (NSFW). */
export default function PhotosModule({
  mediaOptions,
  busy: _busy,
  syncTick,
  onImport,
  onSync,
  onChooseSource,
  isAdmin,
  onSwitchProfile,
  onEditProfile,
  onSelectMedia,
  onOpenArtist,
  onOpenMovies,
  onOpenSeries,
  onOpenBooks,
  onOpenGames,
}: Props) {
  const [years, setYears] = useState<PhotosYearBucket[]>([]);
  const [exclusiveAvailable, setExclusiveAvailable] = useState(false);
  const [hubSources, setHubSources] = useState<ExclusiveHubSource[]>([]);
  const [hubModules, setHubModules] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("home");
  const [galleryFolder, setGalleryFolder] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [mediaType, setMediaType] = useState<MediaTypeFilter>("all");
  const [subfolder, setSubfolder] = useState<string>("General");
  const [exclusiveModule, setExclusiveModule] =
    useState<ExclusiveModule>("photos");
  const [exclusiveSourceId, setExclusiveSourceId] = useState<string>("__all__");
  const [homeFadeTick, setHomeFadeTick] = useState(0);
  const [exclusiveLinks, setExclusiveLinks] = useState<ExclusiveLinkRecord[]>(
    []
  );
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalEdit, setLinkModalEdit] = useState<ExclusiveLinkRecord | null>(
    null
  );
  const [revealedLinkId, setRevealedLinkId] = useState<number | null>(null);
  const [yearsReady, setYearsReady] = useState(false);
  const isPhone = usePhoneLayout();

  useEffect(() => {
    const ret = consumePhotosExclusiveReturn();
    if (!ret) return;
    setViewTab("exclusive");
    if (
      ret.exclusiveModule === "photos" ||
      ret.exclusiveModule === "music" ||
      ret.exclusiveModule === "series" ||
      ret.exclusiveModule === "movies" ||
      ret.exclusiveModule === "books" ||
      ret.exclusiveModule === "games"
    ) {
      setExclusiveModule(ret.exclusiveModule as ExclusiveModule);
    }
    if (ret.exclusiveSourceId) {
      setExclusiveSourceId(ret.exclusiveSourceId);
    }
  }, []);

  const loadYears = useCallback(() => {
    void fetchPhotoYears()
      .then((data) => {
        setYears((data.years || []).filter((y) => !y.is_exclusive));
        setExclusiveAvailable(Boolean(data.exclusive_available));
        setError(null);
      })
      .catch((e) => {
        setYears([]);
        setExclusiveAvailable(false);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setYearsReady(true));
  }, []);

  const loadHub = useCallback(() => {
    void fetchExclusiveHub()
      .then((data) => {
        setHubSources(data.sources || []);
        setHubModules(data.modules || []);
        setExclusiveAvailable(Boolean(data.available));
        const mods = data.modules || [];
        if (mods.length) {
          setExclusiveModule((prev) =>
            mods.includes(prev)
              ? prev
              : ((mods[0] as ExclusiveModule) || "photos")
          );
        }
      })
      .catch(() => {
        setHubSources([]);
        setHubModules([]);
      });
  }, []);

  useEffect(() => {
    loadYears();
  }, [loadYears, syncTick]);

  useEffect(() => {
    if (viewTab === "exclusive" || exclusiveAvailable) {
      loadHub();
    }
  }, [viewTab, exclusiveAvailable, loadHub, syncTick]);

  useEffect(() => {
    if (viewTab !== "home") return;
    const id = window.setInterval(
      () => setHomeFadeTick((t) => t + 1),
      HOME_FADE_MS
    );
    return () => window.clearInterval(id);
  }, [viewTab]);

  const yearBuckets = years;
  const yearBucket = useMemo(() => {
    if (viewTab !== "gallery" || !galleryFolder) return null;
    return years.find((y) => y.year === galleryFolder) || null;
  }, [years, viewTab, galleryFolder]);

  const personFolders = yearBucket?.subfolders || [];

  useEffect(() => {
    if (!yearBucket) return;
    setSubfolder(yearBucket.subfolders?.[0] || "General");
  }, [yearBucket?.year]);

  useEffect(() => {
    if (viewTab !== "gallery") return;
    if (!galleryFolder && yearBuckets.length) {
      setGalleryFolder(yearBuckets[0].year);
    } else if (
      galleryFolder &&
      yearBuckets.length &&
      !yearBuckets.some((y) => y.year === galleryFolder)
    ) {
      setGalleryFolder(yearBuckets[0].year);
    }
  }, [viewTab, galleryFolder, yearBuckets]);

  const moduleSources = useMemo(
    () => hubSources.filter((s) => s.module === exclusiveModule),
    [hubSources, exclusiveModule]
  );

  const selectedExclusiveSource = useMemo(
    () => moduleSources.find((s) => s.id === exclusiveSourceId),
    [moduleSources, exclusiveSourceId]
  );

  const loadExclusiveLinks = useCallback(() => {
    if (viewTab !== "exclusive") {
      setExclusiveLinks([]);
      return;
    }
    if (exclusiveSourceId === "__all__") {
      void fetchExclusiveLinks({ media_type: exclusiveModule })
        .then((data) => setExclusiveLinks(data.items || []))
        .catch(() => setExclusiveLinks([]));
      return;
    }
    const entityName = selectedExclusiveSource?.title;
    if (!entityName) {
      setExclusiveLinks([]);
      return;
    }
    void fetchExclusiveLinks({
      media_type: exclusiveModule,
      entity_name: entityName,
    })
      .then((data) => setExclusiveLinks(data.items || []))
      .catch(() => setExclusiveLinks([]));
  }, [
    viewTab,
    exclusiveModule,
    exclusiveSourceId,
    selectedExclusiveSource?.title,
  ]);

  useEffect(() => {
    loadExclusiveLinks();
  }, [loadExclusiveLinks, syncTick]);

  const exclusiveDropdownOptions = useMemo(
    () => [
      { value: "__all__", label: "All content" },
      ...moduleSources.map((s) => ({
        value: s.id,
        label: s.franchise_title
          ? `${s.title} — ${s.franchise_title}`
          : s.title,
      })),
    ],
    [moduleSources]
  );

  const exclusiveItems = useMemo((): ExclusiveHubItem[] => {
    if (mediaType === "links") return [];
    let list =
      exclusiveSourceId === "__all__"
        ? moduleSources.flatMap((s) => s.items)
        : moduleSources.find((s) => s.id === exclusiveSourceId)?.items || [];
    if (mediaType === "photos") {
      list = list.filter((it) => it.kind !== "video");
    } else if (mediaType === "videos") {
      list = list.filter((it) => it.kind === "video");
    }
    return [...list].sort((a, b) => {
      const ta = (a.source_title || "").toLowerCase();
      const tb = (b.source_title || "").toLowerCase();
      if (ta !== tb) return ta < tb ? -1 : 1;
      const fa = (a.title || "").toLowerCase();
      const fb = (b.title || "").toLowerCase();
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });
  }, [moduleSources, exclusiveSourceId, mediaType]);

  const moduleHasImages = useMemo(() => {
    const pool =
      exclusiveSourceId === "__all__"
        ? moduleSources
        : moduleSources.filter((s) => s.id === exclusiveSourceId);
    return pool.some((s) => s.has_images);
  }, [moduleSources, exclusiveSourceId]);

  const moduleHasVideos = useMemo(() => {
    const pool =
      exclusiveSourceId === "__all__"
        ? moduleSources
        : moduleSources.filter((s) => s.id === exclusiveSourceId);
    return pool.some((s) => s.has_videos);
  }, [moduleSources, exclusiveSourceId]);

  const moduleHasLinks = useMemo(() => {
    if (exclusiveSourceId !== "__all__") {
      return Boolean(
        selectedExclusiveSource?.has_links || exclusiveLinks.length > 0
      );
    }
    return moduleSources.some((s) => s.has_links);
  }, [moduleSources, exclusiveSourceId, selectedExclusiveSource, exclusiveLinks.length]);

  const exclusiveMediaOrder = useMemo(
    () => buildExclusiveMediaOrder(moduleHasLinks),
    [moduleHasLinks]
  );

  const galleryMediaOrder = GALLERY_MEDIA_ORDER;

  const mediaTypeOrder =
    viewTab === "exclusive" ? exclusiveMediaOrder : galleryMediaOrder;

  useEffect(() => {
    if (!mediaTypeOrder.includes(mediaType)) {
      setMediaType("all");
    }
  }, [mediaType, mediaTypeOrder]);

  const linkModalPrefill = useMemo(() => {
    const base = { media_type: exclusiveModule };
    if (exclusiveSourceId === "__all__" || !selectedExclusiveSource) {
      return base;
    }
    return {
      ...base,
      entity_name: selectedExclusiveSource.title,
      entity_id: selectedExclusiveSource.id,
      franchise_name: selectedExclusiveSource.franchise_title ?? null,
    };
  }, [exclusiveModule, exclusiveSourceId, selectedExclusiveSource]);

  const filteredYearItems = useMemo((): PhotoItem[] => {
    if (!yearBucket) return [];
    let list = yearBucket.items || [];
    if (personFolders.length) {
      list = list.filter((it) => (it.subfolder || "General") === subfolder);
    }
    if (mediaType === "photos") {
      list = list.filter((it) => it.kind !== "video");
    } else if (mediaType === "videos") {
      list = list.filter((it) => it.kind === "video");
    }
    return list;
  }, [yearBucket, personFolders.length, subfolder, mediaType]);

  const homeYearCards = useMemo(() => {
    return yearBuckets.filter((y) => {
      if (mediaType === "photos") return Boolean(y.has_images);
      if (mediaType === "videos") return Boolean(y.has_videos);
      return true;
    });
  }, [yearBuckets, mediaType]);

  const homePreviewUrls = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const y of homeYearCards) {
      const urls: string[] = [];
      for (const it of y.items || []) {
        if (it.kind === "video") continue;
        if (mediaType === "videos") continue;
        if (mediaType === "photos" && it.kind === "video") continue;
        const src = mediaSrc(it.thumb_url || it.url);
        if (src) urls.push(src);
        if (urls.length >= HOME_PREVIEW_MAX) break;
      }
      if (!urls.length && mediaType !== "photos") {
        for (const it of y.items || []) {
          const src = mediaSrc(it.thumb_url || it.url);
          if (src) {
            urls.push(src);
            break;
          }
        }
      }
      map.set(y.year, urls);
    }
    return map;
  }, [homeYearCards, mediaType]);

  const saveExclusiveNavigationContext = useCallback(
    (linkType: string) => {
      savePhotosExclusiveReturn({
        exclusiveModule,
        exclusiveSourceId,
      });
      if (linkType === "artist") {
        saveArtistEntryReferrer({
          source: "photos",
          section: defaultSectionForSource("photos"),
          backLabel: "EXCLUSIVE",
        });
      }
    },
    [exclusiveModule, exclusiveSourceId]
  );

  const navigateExclusiveLink = useCallback(
    async (item: ExclusiveHubItem) => {
      const link = item.link;
      if (!link) return;
      try {
        if (link.type === "artist" && link.name && onOpenArtist) {
          saveExclusiveNavigationContext("artist");
          const hit = await resolveArtistName(link.name);
          if (hit.band_id != null) onOpenArtist(hit.band_id);
          return;
        }
        if (link.type === "movie" && link.path && onOpenMovies) {
          saveExclusiveNavigationContext(link.type);
          const hit = await resolveMoviesPath(link.path);
          if (hit.work_id) onOpenMovies(hit.work_id, hit.film_id ?? undefined);
          return;
        }
        if (link.type === "series" && link.path && onOpenSeries) {
          saveExclusiveNavigationContext(link.type);
          const hit = await seriesLeafFromFolderPath(link.path);
          if (hit?.franchiseId) {
            onOpenSeries(hit.franchiseId, hit.subseriesId);
          }
          return;
        }
        if (link.type === "book" && link.path && onOpenBooks) {
          saveExclusiveNavigationContext(link.type);
          const hit = await resolveBooksPath(link.path);
          if (hit.work_id) onOpenBooks(hit.work_id, hit.book_id ?? undefined);
          return;
        }
        if (link.type === "game" && link.path && onOpenGames) {
          saveExclusiveNavigationContext(link.type);
          const hit = await resolveGamesPath(link.path);
          if (hit.franchise_id) {
            onOpenGames(hit.franchise_id, hit.game_id ?? undefined);
          }
        }
      } catch {
        /* ignore navigation failures */
      }
    },
    [
      onOpenArtist,
      onOpenMovies,
      onOpenSeries,
      onOpenBooks,
      onOpenGames,
      saveExclusiveNavigationContext,
    ]
  );

  const handleDeleteExclusiveLink = useCallback(
    (link: ExclusiveLinkRecord) => {
      if (!window.confirm(`Delete link "${link.title}"?`)) return;
      void deleteExclusiveLink(link.id)
        .then(() => {
          loadExclusiveLinks();
          loadHub();
        })
        .catch(() => {});
    },
    [loadExclusiveLinks, loadHub]
  );

  const viewerItems = useMemo((): GalleryViewerItem[] => {
    if (viewTab === "exclusive") {
      return exclusiveItems.map((it) => ({
        id: it.id,
        url: mediaSrc(it.url) || it.url,
        caption: it.source_title || it.title,
        subcaption: it.title !== it.source_title ? it.title : undefined,
        mediaType: it.kind === "video" ? "video" : "image",
        captionClickable: it.link?.type !== "photos_person",
      }));
    }
    return filteredYearItems.map((it) => ({
      id: it.id,
      url: mediaSrc(it.url) || it.url,
      caption: it.title || it.id,
      mediaType: it.kind === "video" ? "video" : "image",
    }));
  }, [viewTab, exclusiveItems, filteredYearItems]);

  const visibleExclusiveModuleTabs = EXCLUSIVE_MODULE_TABS.filter((t) =>
    hubModules.includes(t.id)
  );

  const topTabs = [
    {
      id: "home",
      label: "HOME",
      active: viewTab === "home",
      onClick: () => {
        setViewTab("home");
        setViewerOpen(false);
      },
    },
    {
      id: "gallery",
      label: "GALLERY",
      active: viewTab === "gallery",
      onClick: () => {
        setViewTab("gallery");
        setViewerOpen(false);
      },
    },
    ...(exclusiveAvailable
      ? [
          {
            id: "exclusive",
            label: "EXCLUSIVE",
            active: viewTab === "exclusive",
            onClick: () => {
              setViewTab("exclusive");
              setExclusiveSourceId("__all__");
              setMediaType("all");
              setViewerOpen(false);
            },
          },
        ]
      : []),
  ];

  const showMediaTypeToggle =
    viewTab === "home" ||
    (viewTab === "gallery" &&
      Boolean(yearBucket?.has_images && yearBucket?.has_videos)) ||
    (viewTab === "exclusive" &&
      (moduleHasImages || moduleHasVideos || moduleHasLinks)) ||
    viewTab === "gallery";

  const openGalleryFolder = (year: string) => {
    setGalleryFolder(year);
    setViewTab("gallery");
    setViewerOpen(false);
  };

  return (
    <div className="music-module photos-module">
      <ModuleTopBar
        media={
          mediaOptions.find((m) => m.kind === "photos") ?? {
            id: 700,
            kind: "photos",
            label: "Photos",
          }
        }
        mediaOptions={mediaOptions}
        onSelectMedia={onSelectMedia}
        tabs={topTabs}
        menu={
          <>
            {showMediaTypeToggle ? (
              <PhotosMediaTypeToggle
                value={mediaType}
                order={mediaTypeOrder}
                onChange={(next) => {
                  setMediaType(next);
                  setViewerOpen(false);
                }}
              />
            ) : null}
            <AppMenu
              onImport={onImport}
              onSync={() => {
                onSync();
                loadYears();
                if (viewTab === "exclusive" || exclusiveAvailable) loadHub();
                loadExclusiveLinks();
              }}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              onAddLink={
                isAdmin && viewTab === "exclusive"
                  ? () => {
                      setLinkModalEdit(null);
                      setLinkModalOpen(true);
                    }
                  : undefined
              }
            />
          </>
        }
      />

      {error && !years.length && !exclusiveAvailable ? (
        <p className="muted module-placeholder">
          Could not load Photos — {error}
        </p>
      ) : null}

      {viewTab === "home" ? (
        <>
          <div className="photos-tile-grid photos-tile-grid--home">
            {homeYearCards.map((y, i) => (
              <HomeFolderBlock
                key={y.year}
                label={y.year}
                urls={homePreviewUrls.get(y.year) || []}
                tick={homeFadeTick}
                stagger={i}
                onClick={() => openGalleryFolder(y.year)}
              />
            ))}
          </div>

          {yearsReady && !homeYearCards.length && !error ? (
            <p className="muted module-placeholder">
              No Photos/YYYY folders yet. Drop jpg/mp4 files under
              Media/Photos/YYYY/.
            </p>
          ) : null}
        </>
      ) : null}

      {viewTab === "gallery" ? (
        <div className="photos-year-view">
          <div className="photos-subbars">
            {yearBuckets.length > 0 ? (
              <nav
                className="filter-subbar filter-subbar--spread"
                aria-label="Photo folders"
              >
                {yearBuckets.map((y) => (
                  <button
                    key={y.year}
                    type="button"
                    className={galleryFolder === y.year ? "active" : ""}
                    onClick={() => {
                      setGalleryFolder(y.year);
                      setViewerOpen(false);
                    }}
                  >
                    {y.year}
                  </button>
                ))}
              </nav>
            ) : null}

            {personFolders.length > 0 ? (
              <nav
                className="filter-subbar filter-subbar--spread"
                aria-label="Subfolder"
              >
                {personFolders.map((sf) => (
                  <button
                    key={sf}
                    type="button"
                    className={subfolder === sf ? "active" : ""}
                    onClick={() => {
                      setSubfolder(sf);
                      setViewerOpen(false);
                    }}
                  >
                    {sf}
                  </button>
                ))}
              </nav>
            ) : null}
          </div>

          <div className="photos-tile-grid">
            {filteredYearItems.map((it, idx) => {
              const cover = mediaSrc(
                it.thumb_url || (it.kind !== "video" ? it.url : null)
              );
              return (
                <PhotosTile
                  key={it.id}
                  coverUrl={cover}
                  title={
                    it.title || (it.kind === "video" ? "Video" : "Photo")
                  }
                  onClick={() => {
                    setViewerIndex(idx);
                    setViewerOpen(true);
                  }}
                />
              );
            })}
          </div>

          {!filteredYearItems.length ? (
            <p className="muted module-placeholder">Nothing in this filter.</p>
          ) : null}
        </div>
      ) : null}

      {viewTab === "exclusive" ? (
        <div className="photos-year-view photos-exclusive-hub">
          <div className="photos-subbars">
            {visibleExclusiveModuleTabs.length > 0 ? (
              <nav
                className="filter-subbar filter-subbar--spread"
                aria-label="Exclusive media module"
              >
                {visibleExclusiveModuleTabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={exclusiveModule === t.id ? "active" : ""}
                    onClick={() => {
                      setExclusiveModule(t.id);
                      setExclusiveSourceId("__all__");
                      setMediaType("all");
                      setViewerOpen(false);
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            ) : null}

            <div className="filter-subbar filter-subbar--single">
              <SearchableDropdown
                options={exclusiveDropdownOptions}
                value={exclusiveSourceId}
                onChange={(v) => {
                  setExclusiveSourceId(v);
                  setViewerOpen(false);
                }}
                placeholder="All content"
                visibleRows={7}
              />
            </div>
          </div>

          <div className="photos-tile-grid">
            {mediaType !== "links"
              ? exclusiveItems.map((it, idx) => {
                  const cover = mediaSrc(
                    it.thumb_url || (it.kind !== "video" ? it.url : null)
                  );
                  return (
                    <PhotosTile
                      key={it.id}
                      coverUrl={cover}
                      title={it.title || it.source_title || "Exclusive"}
                      subtitle={
                        it.source_title && it.title !== it.source_title
                          ? it.franchise_title
                            ? `${it.source_title} · ${it.franchise_title}`
                            : it.source_title
                          : it.franchise_title || undefined
                      }
                      onClick={() => {
                        setViewerIndex(idx);
                        setViewerOpen(true);
                      }}
                    />
                  );
                })
              : null}
            {mediaType === "all" || mediaType === "links"
              ? exclusiveLinks.map((link) => (
                  <PhotosLinkTile
                    key={link.id}
                    link={link}
                    isAdmin={isAdmin}
                    revealed={isPhone && revealedLinkId === link.id}
                    onReveal={setRevealedLinkId}
                    onEdit={(row) => {
                      setLinkModalEdit(row);
                      setLinkModalOpen(true);
                    }}
                    onDelete={handleDeleteExclusiveLink}
                  />
                ))
              : null}
          </div>

          {mediaType === "links"
            ? !exclusiveLinks.length
              ? (
                  <p className="muted module-placeholder">
                    No links for this filter.
                  </p>
                )
              : null
            : !exclusiveItems.length &&
                !(mediaType === "all" && exclusiveLinks.length)
              ? (
                  <p className="muted module-placeholder">
                    No Exclusive media in this filter.
                  </p>
                )
              : null}
        </div>
      ) : null}

      {linkModalOpen ? (
        <ExclusiveLinkModal
          link={linkModalEdit}
          prefill={linkModalPrefill}
          onClose={() => {
            setLinkModalOpen(false);
            setLinkModalEdit(null);
          }}
          onSaved={() => {
            setLinkModalOpen(false);
            setLinkModalEdit(null);
            loadExclusiveLinks();
            loadHub();
          }}
        />
      ) : null}

      {viewerOpen && viewerItems.length > 0 ? (
        <GalleryViewerModal
          items={viewerItems}
          index={viewerIndex}
          onClose={() => setViewerOpen(false)}
          onIndexChange={setViewerIndex}
          onCaptionClick={
            viewTab === "exclusive"
              ? (gItem) => {
                  const hit = exclusiveItems.find((i) => i.id === gItem.id);
                  if (hit) void navigateExclusiveLink(hit);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
