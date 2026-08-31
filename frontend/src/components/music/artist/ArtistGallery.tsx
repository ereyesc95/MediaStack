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
} from "../../../types";
import PlaylistBoot from "../../PlaylistBoot";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "./GalleryViewerModal";

export type GalleryTab = "photos" | "logos" | "animations";
export type AnimationSubtab = "covers" | "canvas";

export type ArtistGalleryState = {
  index: GalleryIndexPayload | null;
  loading: boolean;
  error: string | null;
  tab: GalleryTab;
  setTab: (tab: GalleryTab) => void;
  animationSubtab: AnimationSubtab;
  setAnimationSubtab: (tab: AnimationSubtab) => void;
  photos: GalleryPhotoItem[];
  brands: GalleryBrandItem[];
  animationCovers: GalleryAnimationItem[];
  animationCanvas: GalleryAnimationItem[];
  showPhotos: boolean;
  showLogos: boolean;
  showAnimations: boolean;
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
  ]);

  const openViewer = (id: string) => {
    const i = viewerItems.findIndex((item) => item.id === id);
    if (i >= 0) setViewerIndex(i);
  };

  useEffect(() => {
    setViewerIndex(null);
  }, [tab, animationSubtab]);

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
    photos,
    brands,
    animationCovers,
    animationCanvas,
    showPhotos,
    showLogos,
    showAnimations,
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
    tab,
    setTab,
    animationSubtab,
    setAnimationSubtab,
    animationCovers,
    animationCanvas,
  } = state;
  if (!showPhotos && !showLogos && !showAnimations) return null;
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
    showPhotos,
    showLogos,
    showAnimations,
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

  if (!index || (!showPhotos && !showLogos && !showAnimations)) {
    return (
      <p className="muted artist-section-empty">
        No gallery images found under Gallery/Photos or Gallery/Logos.
      </p>
    );
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
