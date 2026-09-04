import { useEffect, useMemo, useState } from "react";
import {
  getCachedArtistGallery,
  prefetchArtistGallery,
} from "../../../artistGalleryCache";
import type {
  GalleryAnimationItem,
  GalleryBrandItem,
  GalleryIndexPayload,
  GalleryPhotoItem,
  SeriesGalleryItem,
} from "../../../types";
import { withMediaAccess } from "../../../mediaFileUrl";
import PlaylistBoot from "../../PlaylistBoot";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "./GalleryViewerModal";

export type GalleryTab = "photos" | "logos" | "animations" | "exclusive";
export type AnimationSubtab = "covers" | "canvas";
export type ExclusiveSubtab = string;

export type ArtistGalleryState = {
  index: GalleryIndexPayload | null;
  loading: boolean;
  error: string | null;
  tab: GalleryTab;
  setTab: (tab: GalleryTab) => void;
  animationSubtab: AnimationSubtab;
  setAnimationSubtab: (tab: AnimationSubtab) => void;
  exclusiveSubtab: ExclusiveSubtab;
  setExclusiveSubtab: (tab: ExclusiveSubtab) => void;
  photos: GalleryPhotoItem[];
  brands: GalleryBrandItem[];
  animationCovers: GalleryAnimationItem[];
  animationCanvas: GalleryAnimationItem[];
  exclusiveItems: SeriesGalleryItem[];
  exclusiveSubsections: { key: string; label: string; items: SeriesGalleryItem[] }[];
  showPhotos: boolean;
  showLogos: boolean;
  showAnimations: boolean;
  showExclusive: boolean;
  viewerItems: GalleryViewerItem[];
  viewerIndex: number | null;
  setViewerIndex: (index: number | null) => void;
  openViewer: (id: string) => void;
};

function photoCaption(photo: GalleryPhotoItem): string {
  return photo.title || String(photo.year);
}

function sortPhotos(items: GalleryPhotoItem[]): GalleryPhotoItem[] {
  return [...items].sort(
    (a, b) =>
      a.year - b.year ||
      a.title.localeCompare(b.title) ||
      a.folder_path.localeCompare(b.folder_path)
  );
}

function sortBranding(items: GalleryBrandItem[]): GalleryBrandItem[] {
  const kindOrder = (kind: string) => (kind === "icon" ? 0 : 1);
  return [...items].sort(
    (a, b) =>
      a.start - b.start ||
      kindOrder(a.kind) - kindOrder(b.kind) ||
      a.end - b.end ||
      a.folder_path.localeCompare(b.folder_path)
  );
}

function sortAnimations(items: GalleryAnimationItem[]): GalleryAnimationItem[] {
  return [...items].sort(
    (a, b) =>
      (a.date_iso || "").localeCompare(b.date_iso || "") ||
      a.title.localeCompare(b.title) ||
      a.folder_path.localeCompare(b.folder_path)
  );
}

function brandingItems(index: GalleryIndexPayload): GalleryBrandItem[] {
  if (index.branding?.length) return index.branding;
  return sortBranding([...index.logos, ...index.icons]);
}

function animationBuckets(index: GalleryIndexPayload | null): {
  covers: GalleryAnimationItem[];
  canvas: GalleryAnimationItem[];
} {
  const covers = sortAnimations(index?.animations?.covers ?? []);
  const canvas = sortAnimations(index?.animations?.canvas ?? []);
  return { covers, canvas };
}

function hasExclusive(index: GalleryIndexPayload | null): boolean {
  if (!index?.exclusive) return false;
  const sec = index.exclusive;
  if (sec.items?.length) return true;
  return Boolean(sec.subsections?.some((s) => s.items.length > 0));
}

function pickInitialTab(index: GalleryIndexPayload | null): GalleryTab {
  if (!index) return "photos";
  const hasBranding =
    (index.branding?.length ?? 0) > 0 ||
    index.logos.length + index.icons.length > 0;
  const { covers, canvas } = animationBuckets(index);
  const hasAnimations = covers.length + canvas.length > 0;
  if (index.photos.length > 0) return "photos";
  if (hasBranding) return "logos";
  if (hasAnimations) return "animations";
  if (hasExclusive(index)) return "exclusive";
  return "photos";
}

function pickInitialAnimationSubtab(
  index: GalleryIndexPayload | null
): AnimationSubtab {
  const { covers, canvas } = animationBuckets(index);
  if (covers.length > 0) return "covers";
  if (canvas.length > 0) return "canvas";
  return "covers";
}

function pickInitialExclusiveSubtab(index: GalleryIndexPayload | null): string {
  const sec = index?.exclusive;
  if (!sec) return "";
  if (sec.subsections?.length) return sec.subsections[0].key;
  return "";
}

function viewerKind(
  item: SeriesGalleryItem
): "image" | "video" | "audio" {
  if (item.media_kind === "video") return "video";
  if (item.media_kind === "audio") return "audio";
  return "image";
}

export function useArtistGallery(
  bandId: number,
  enabled: boolean,
  refreshKey = 0
): ArtistGalleryState {
  const [index, setIndex] = useState<GalleryIndexPayload | null>(
    () => getCachedArtistGallery(bandId)
  );
  const [loading, setLoading] = useState(
    () => enabled && !getCachedArtistGallery(bandId)
  );
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<GalleryTab>(() =>
    pickInitialTab(getCachedArtistGallery(bandId))
  );
  const [animationSubtab, setAnimationSubtab] = useState<AnimationSubtab>(() =>
    pickInitialAnimationSubtab(getCachedArtistGallery(bandId))
  );
  const [exclusiveSubtab, setExclusiveSubtab] = useState<string>(() =>
    pickInitialExclusiveSubtab(getCachedArtistGallery(bandId))
  );
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIndex(null);
      setLoading(false);
      setError(null);
      setViewerIndex(null);
      return;
    }
    let cancelled = false;
    const cached =
      refreshKey > 0 ? null : getCachedArtistGallery(bandId);
    if (cached) {
      setIndex(cached);
      setLoading(false);
      setError(null);
      prefetchArtistGallery(bandId, { force: true })
        .then((payload) => {
          if (cancelled) return;
          setIndex(payload);
          setTab(pickInitialTab(payload));
          setAnimationSubtab(pickInitialAnimationSubtab(payload));
          setExclusiveSubtab(pickInitialExclusiveSubtab(payload));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    prefetchArtistGallery(bandId, { force: true })
      .then((payload) => {
        if (cancelled) return;
        setIndex(payload);
        setTab(pickInitialTab(payload));
        setAnimationSubtab(pickInitialAnimationSubtab(payload));
        setExclusiveSubtab(pickInitialExclusiveSubtab(payload));
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, enabled, refreshKey]);

  const photos = useMemo(
    () => (index ? sortPhotos(index.photos) : []),
    [index]
  );
  const brands = useMemo(
    () => (index ? brandingItems(index) : []),
    [index]
  );
  const { covers: animationCovers, canvas: animationCanvas } = useMemo(
    () => animationBuckets(index),
    [index]
  );

  const showPhotos = photos.length > 0;
  const showLogos = brands.length > 0;
  const showAnimations =
    animationCovers.length > 0 || animationCanvas.length > 0;
  const exclusiveSection = index?.exclusive;
  const exclusiveSubsections = exclusiveSection?.subsections ?? [];
  const showExclusive = hasExclusive(index);
  const exclusiveItems = useMemo(() => {
    if (!exclusiveSection) return [] as SeriesGalleryItem[];
    if (exclusiveSubsections.length) {
      const sub =
        exclusiveSubsections.find((s) => s.key === exclusiveSubtab) ||
        exclusiveSubsections[0];
      return sub?.items ?? [];
    }
    return exclusiveSection.items ?? [];
  }, [exclusiveSection, exclusiveSubsections, exclusiveSubtab]);

  const viewerItems: GalleryViewerItem[] = useMemo(() => {
    if (!index) return [];
    if (tab === "photos") {
      return photos.map((p) => ({
        id: p.id,
        url: p.url,
        caption: photoCaption(p),
        subcaption:
          p.orientation !== "unknown"
            ? `${p.year} · ${p.orientation}`
            : String(p.year),
        mediaType: "image" as const,
      }));
    }
    if (tab === "logos") {
      return brands.map((b) => ({
        id: b.id,
        url: b.url,
        caption: b.label,
        subcaption: b.kind === "icon" ? "Icon" : "Logo",
        mediaType: "image" as const,
      }));
    }
    if (tab === "exclusive") {
      return exclusiveItems.map((item) => ({
        id: item.id,
        url: withMediaAccess(item.url),
        caption: item.title,
        mediaType: viewerKind(item),
      }));
    }
    const motion =
      animationSubtab === "covers" ? animationCovers : animationCanvas;
    return motion.map((item) => ({
      id: item.id,
      url: item.url,
      caption: item.title,
      subcaption: item.display_date || item.date_iso || undefined,
      mediaType: "video" as const,
    }));
  }, [
    index,
    tab,
    photos,
    brands,
    animationSubtab,
    animationCovers,
    animationCanvas,
    exclusiveItems,
  ]);

  const openViewer = (id: string) => {
    const i = viewerItems.findIndex((item) => item.id === id);
    if (i >= 0) setViewerIndex(i);
  };

  useEffect(() => {
    setViewerIndex(null);
  }, [tab, animationSubtab, exclusiveSubtab]);

  useEffect(() => {
    if (tab !== "animations") return;
    if (animationSubtab === "covers" && animationCovers.length === 0 && animationCanvas.length > 0) {
      setAnimationSubtab("canvas");
    } else if (
      animationSubtab === "canvas" &&
      animationCanvas.length === 0 &&
      animationCovers.length > 0
    ) {
      setAnimationSubtab("covers");
    }
  }, [tab, animationSubtab, animationCovers.length, animationCanvas.length]);

  return {
    index,
    loading,
    error,
    tab,
    setTab,
    animationSubtab,
    setAnimationSubtab,
    exclusiveSubtab,
    setExclusiveSubtab,
    photos,
    brands,
    animationCovers,
    animationCanvas,
    exclusiveItems,
    exclusiveSubsections,
    showPhotos,
    showLogos,
    showAnimations,
    showExclusive,
    viewerItems,
    viewerIndex,
    setViewerIndex,
    openViewer,
  };
}

type BarsProps = {
  state: ArtistGalleryState;
  mobilePortrait: boolean;
};

export function ArtistGalleryBars({ state, mobilePortrait }: BarsProps) {
  const {
    showPhotos,
    showLogos,
    showAnimations,
    showExclusive,
    tab,
    setTab,
    animationSubtab,
    setAnimationSubtab,
    animationCovers,
    animationCanvas,
    exclusiveSubsections,
    exclusiveSubtab,
    setExclusiveSubtab,
  } = state;
  if (!showPhotos && !showLogos && !showAnimations && !showExclusive) return null;
  return (
    <>
      <nav className="artist-page__subtabs artist-gallery__tabs">
        {showPhotos && (
          <button
            type="button"
            className={tab === "photos" ? "active" : ""}
            onClick={() => setTab("photos")}
          >
            <span>PHOTOS</span>
          </button>
        )}
        {showLogos && (
          <button
            type="button"
            className={tab === "logos" ? "active" : ""}
            onClick={() => setTab("logos")}
          >
            <span>{mobilePortrait ? "BRANDS" : "BRANDING"}</span>
          </button>
        )}
        {showAnimations && (
          <button
            type="button"
            className={tab === "animations" ? "active" : ""}
            onClick={() => setTab("animations")}
          >
            <span>ANIMATIONS</span>
          </button>
        )}
        {showExclusive && (
          <button
            type="button"
            className={tab === "exclusive" ? "active" : ""}
            onClick={() => setTab("exclusive")}
          >
            <span>EXCLUSIVE</span>
          </button>
        )}
      </nav>
      {tab === "animations" && showAnimations ? (
        <nav className="artist-page__subtabs artist-gallery__animation-subtabs">
          {animationCovers.length > 0 && (
            <button
              type="button"
              className={animationSubtab === "covers" ? "active" : ""}
              onClick={() => setAnimationSubtab("covers")}
            >
              <span>COVERS</span>
            </button>
          )}
          {animationCanvas.length > 0 && (
            <button
              type="button"
              className={animationSubtab === "canvas" ? "active" : ""}
              onClick={() => setAnimationSubtab("canvas")}
            >
              <span>CANVAS</span>
            </button>
          )}
        </nav>
      ) : null}
      {tab === "exclusive" && showExclusive && exclusiveSubsections.length > 1 ? (
        <nav className="artist-page__subtabs artist-gallery__animation-subtabs">
          {exclusiveSubsections.map((sub) => (
            <button
              key={sub.key}
              type="button"
              className={exclusiveSubtab === sub.key ? "active" : ""}
              onClick={() => setExclusiveSubtab(sub.key)}
            >
              <span>{sub.label.toUpperCase()}</span>
            </button>
          ))}
        </nav>
      ) : null}
    </>
  );
}

type Props = {
  state: ArtistGalleryState;
};

export default function ArtistGallery({ state }: Props) {
  const {
    index,
    loading,
    error,
    tab,
    photos,
    brands,
    animationCovers,
    animationCanvas,
    animationSubtab,
    exclusiveItems,
    showPhotos,
    showLogos,
    showAnimations,
    showExclusive,
    viewerItems,
    viewerIndex,
    setViewerIndex,
    openViewer,
  } = state;

  if (loading && !index) {
    return (
      <PlaylistBoot className="playlist-boot--compact" label="Loading gallery…" />
    );
  }

  if (error) {
    return <p className="muted artist-section-empty">{error}</p>;
  }

  if (!index || (!showPhotos && !showLogos && !showAnimations && !showExclusive)) {
    return null;
  }

  const motionItems =
    animationSubtab === "covers" ? animationCovers : animationCanvas;

  return (
    <div className="artist-gallery">
      {tab === "photos" ? (
        photos.length === 0 ? (
          <p className="muted artist-gallery__empty">No items in this section.</p>
        ) : (
          <div className="artist-gallery__photo-grid">
            {photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                className="artist-gallery__photo-card"
                onClick={() => openViewer(photo.id)}
              >
                <img src={photo.url} alt="" loading="lazy" draggable={false} />
                <span className="artist-gallery__card-label">
                  {photoCaption(photo)}
                </span>
              </button>
            ))}
          </div>
        )
      ) : tab === "logos" ? (
        brands.length === 0 ? (
          <p className="muted artist-gallery__empty">No items in this section.</p>
        ) : (
          <div className="artist-gallery__brand-grid">
            {brands.map((brand) => (
              <button
                key={brand.id}
                type="button"
                className="artist-gallery__brand-card"
                onClick={() => openViewer(brand.id)}
              >
                <span className="artist-gallery__brand-stage media-beat-frame media-beat-frame--logo">
                  <img
                    src={brand.url}
                    alt=""
                    loading="lazy"
                    draggable={false}
                  />
                </span>
                <span className="artist-gallery__card-label">{brand.label}</span>
                <span className="artist-gallery__brand-kind">
                  {brand.kind === "icon" ? "ICON" : "LOGO"}
                </span>
              </button>
            ))}
          </div>
        )
      ) : tab === "exclusive" ? (
        exclusiveItems.length === 0 ? (
          <p className="muted artist-gallery__empty">No items in this section.</p>
        ) : (
          <div className="artist-gallery__photo-grid">
            {exclusiveItems.map((item) => {
              const url = withMediaAccess(item.url);
              const kind = viewerKind(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  className="artist-gallery__photo-card"
                  onClick={() => openViewer(item.id)}
                >
                  {kind === "video" ? (
                    <video
                      src={url}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      draggable={false}
                    />
                  ) : kind === "audio" ? (
                    <span className="artist-gallery__audio-card" aria-hidden>
                      ♪
                    </span>
                  ) : (
                    <img src={url} alt="" loading="lazy" draggable={false} />
                  )}
                  <span className="artist-gallery__card-label">{item.title}</span>
                </button>
              );
            })}
          </div>
        )
      ) : motionItems.length === 0 ? (
        <p className="muted artist-gallery__empty">No items in this section.</p>
      ) : (
        <div
          className={
            animationSubtab === "canvas"
              ? "artist-gallery__animation-grid artist-gallery__animation-grid--canvas"
              : "artist-gallery__animation-grid artist-gallery__animation-grid--covers"
          }
        >
          {motionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                animationSubtab === "canvas"
                  ? "artist-gallery__animation-card artist-gallery__animation-card--canvas"
                  : "artist-gallery__animation-card artist-gallery__animation-card--cover"
              }
              onClick={() => openViewer(item.id)}
            >
              <video
                src={item.url}
                muted
                loop
                playsInline
                preload="metadata"
                autoPlay
                draggable={false}
              />
              <span className="artist-gallery__card-label">
                <span className="artist-gallery__card-title">{item.title}</span>
                {item.display_date || item.date_iso ? (
                  <span className="artist-gallery__card-date">
                    {item.display_date || item.date_iso}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}

      {viewerIndex !== null && viewerItems.length > 0 && (
        <GalleryViewerModal
          items={viewerItems}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}
