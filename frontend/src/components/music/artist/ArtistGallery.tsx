import { useEffect, useMemo, useState } from "react";
import {
  getCachedArtistGallery,
  prefetchArtistGallery,
} from "../../../artistGalleryCache";
import type {
  GalleryBrandItem,
  GalleryIndexPayload,
  GalleryPhotoItem,
} from "../../../types";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "./GalleryViewerModal";

export type GalleryTab = "photos" | "logos";

export type ArtistGalleryState = {
  index: GalleryIndexPayload | null;
  loading: boolean;
  error: string | null;
  tab: GalleryTab;
  setTab: (tab: GalleryTab) => void;
  photos: GalleryPhotoItem[];
  brands: GalleryBrandItem[];
  showPhotos: boolean;
  showLogos: boolean;
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

function brandingItems(index: GalleryIndexPayload): GalleryBrandItem[] {
  if (index.branding?.length) return index.branding;
  return sortBranding([...index.logos, ...index.icons]);
}

export function useArtistGallery(
  bandId: number,
  enabled: boolean
): ArtistGalleryState {
  const [index, setIndex] = useState<GalleryIndexPayload | null>(
    () => getCachedArtistGallery(bandId)
  );
  const [loading, setLoading] = useState(
    () => enabled && !getCachedArtistGallery(bandId)
  );
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<GalleryTab>(() => {
    const cached = getCachedArtistGallery(bandId);
    if (!cached) return "photos";
    const hasBranding =
      (cached.branding?.length ?? 0) > 0 ||
      cached.logos.length + cached.icons.length > 0;
    return cached.photos.length > 0
      ? "photos"
      : hasBranding
        ? "logos"
        : "photos";
  });
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
    const cached = getCachedArtistGallery(bandId);
    if (cached) {
      setIndex(cached);
      setLoading(false);
      setError(null);
      prefetchArtistGallery(bandId, { force: true })
        .then((payload) => {
          if (cancelled) return;
          setIndex(payload);
          const hasBranding =
            (payload.branding?.length ?? 0) > 0 ||
            payload.logos.length + payload.icons.length > 0;
          const first =
            payload.photos.length > 0
              ? "photos"
              : hasBranding
                ? "logos"
                : "photos";
          setTab(first);
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
        const hasBranding =
          (payload.branding?.length ?? 0) > 0 ||
          payload.logos.length + payload.icons.length > 0;
        const first =
          payload.photos.length > 0
            ? "photos"
            : hasBranding
              ? "logos"
              : "photos";
        setTab(first);
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
  }, [bandId, enabled]);

  const photos = useMemo(
    () => (index ? sortPhotos(index.photos) : []),
    [index]
  );
  const brands = useMemo(
    () => (index ? brandingItems(index) : []),
    [index]
  );

  const showPhotos = photos.length > 0;
  const showLogos = brands.length > 0;

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
      }));
    }
    return brands.map((b) => ({
      id: b.id,
      url: b.url,
      caption: b.label,
      subcaption: b.kind === "icon" ? "Icon" : "Logo",
    }));
  }, [index, tab, photos, brands]);

  const openViewer = (id: string) => {
    const i = viewerItems.findIndex((item) => item.id === id);
    if (i >= 0) setViewerIndex(i);
  };

  useEffect(() => {
    setViewerIndex(null);
  }, [tab]);

  return {
    index,
    loading,
    error,
    tab,
    setTab,
    photos,
    brands,
    showPhotos,
    showLogos,
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
  const { showPhotos, showLogos, tab, setTab } = state;
  if (!showPhotos && !showLogos) return null;
  return (
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
    </nav>
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
    showPhotos,
    showLogos,
    viewerItems,
    viewerIndex,
    setViewerIndex,
    openViewer,
  } = state;

  if (loading && !index) {
    return <p className="muted artist-section-empty">Loading gallery…</p>;
  }

  if (error) {
    return <p className="muted artist-section-empty">{error}</p>;
  }

  if (!index || (!showPhotos && !showLogos)) {
    return (
      <p className="muted artist-section-empty">
        No gallery images found under Gallery/Photos or Gallery/Logos.
      </p>
    );
  }

  const gridItems = tab === "photos" ? photos : brands;

  return (
    <div className="artist-gallery">
      {gridItems.length === 0 ? (
        <p className="muted artist-gallery__empty">No items in this section.</p>
      ) : tab === "photos" ? (
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
                <img src={brand.url} alt="" loading="lazy" draggable={false} />
              </span>
              <span className="artist-gallery__card-label">{brand.label}</span>
              <span className="artist-gallery__brand-kind">
                {brand.kind === "icon" ? "ICON" : "LOGO"}
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
