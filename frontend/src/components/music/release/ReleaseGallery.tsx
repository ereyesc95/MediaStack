import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchReleaseGallery, fetchTrackSourceArt } from "../../../api";
import type { ReleaseGalleryItem, ReleaseGalleryPayload } from "../../../types";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "../artist/GalleryViewerModal";

type GalleryTab = "artwork" | "photos" | "extras";

export type ReleaseGalleryTab = GalleryTab;

type Props = {
  bandId: number;
  releaseId: string;
  playingPath?: string | null;
  /** When set, parent renders the sub-bar (mobile portrait). */
  galleryTab?: GalleryTab;
  onGalleryTabChange?: (tab: GalleryTab) => void;
  hideTabs?: boolean;
  onTabsMeta?: (tabs: { id: GalleryTab; label: string; count: number }[]) => void;
};

function isPhysicalMediaArtwork(item: ReleaseGalleryItem): boolean {
  const stem = item.title.trim();
  const normalized = stem.toLowerCase().replace(/[_-]+/g, " ");

  if (/^disc(\s*\d+)?$/i.test(stem) || /^disc\s+\d+/i.test(stem)) return true;
  if (normalized === "cd" || /^cd\s+\d+$/.test(normalized)) return true;
  if (/^side\s+[ab](\s+vinyl)?$/i.test(normalized)) return true;
  if (/vinyl/.test(normalized) && /side\s+[ab]/.test(normalized)) return true;
  if (/^cassette(\s+tape)?\s+[ab]$/i.test(normalized)) return true;
  if (/^tape\s+[ab]$/.test(normalized)) return true;

  return false;
}

function isGalleryBrandStyle(item: ReleaseGalleryItem): boolean {
  if (item.section === "extras") return true;
  return isPhysicalMediaArtwork(item);
}

export default function ReleaseGallery({
  bandId,
  releaseId,
  playingPath = null,
  galleryTab: galleryTabProp,
  onGalleryTabChange,
  hideTabs = false,
  onTabsMeta,
}: Props) {
  const [internalTab, setInternalTab] = useState<GalleryTab>("artwork");
  const tab = galleryTabProp ?? internalTab;
  const setTab = onGalleryTabChange ?? setInternalTab;
  const [data, setData] = useState<ReleaseGalleryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [playingArtwork, setPlayingArtwork] = useState<ReleaseGalleryItem[] | null>(null);
  const onTabsMetaRef = useRef(onTabsMeta);
  onTabsMetaRef.current = onTabsMeta;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchReleaseGallery(bandId, releaseId);
      setData(payload);
      const first =
        payload.artwork.length > 0
          ? "artwork"
          : payload.photos.length > 0
            ? "photos"
            : payload.extras.length > 0
              ? "extras"
              : "artwork";
      if (!galleryTabProp) {
        setInternalTab(first);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bandId, releaseId, galleryTabProp]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setViewerIndex(null);
  }, [tab, playingPath]);

  useEffect(() => {
    if (!playingPath) {
      setPlayingArtwork(null);
      return;
    }
    let cancelled = false;
    void fetchTrackSourceArt(bandId, releaseId, playingPath)
      .then((res) => {
        if (!cancelled) setPlayingArtwork(res.artwork);
      })
      .catch(() => {
        if (!cancelled) setPlayingArtwork(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, releaseId, playingPath]);

  const activeArtwork = useMemo(
    () =>
      playingPath && playingArtwork && playingArtwork.length > 0
        ? playingArtwork
        : data?.artwork ?? [],
    [playingPath, playingArtwork, data?.artwork]
  );

  const tabsMetaKey = useMemo(
    () =>
      data
        ? `${activeArtwork.length}:${data.photos.length}:${data.extras.length}`
        : "",
    [data, activeArtwork.length]
  );

  useEffect(() => {
    if (!tabsMetaKey || !data) return;
    onTabsMetaRef.current?.([
      { id: "artwork", label: "ARTWORK", count: activeArtwork.length },
      { id: "photos", label: "PHOTOS", count: data.photos.length },
      { id: "extras", label: "EXTRAS", count: data.extras.length },
    ]);
  }, [tabsMetaKey, data, activeArtwork.length]);

  if (loading && !data) {
    return <p className="muted release-gallery__loading">Loading gallery…</p>;
  }
  if (error) {
    return <p className="error release-gallery__error">{error}</p>;
  }
  if (!data) {
    return <p className="muted release-gallery__empty">No gallery items found.</p>;
  }

  const activeArtworkResolved =
    playingPath && playingArtwork && playingArtwork.length > 0
      ? playingArtwork
      : data.artwork;

  const items =
    tab === "artwork" ? activeArtworkResolved : tab === "photos" ? data.photos : data.extras;

  const viewerItems: GalleryViewerItem[] = items.map((item) => ({
    id: item.id,
    url: item.url,
    caption: item.title,
    subcaption:
      "year" in item && item.year != null ? String(item.year) : undefined,
  }));

  const openViewer = (id: string) => {
    const i = viewerItems.findIndex((item) => item.id === id);
    if (i >= 0) setViewerIndex(i);
  };

  const tabs = data
    ? [
        { id: "artwork" as const, label: "ARTWORK", count: activeArtworkResolved.length },
        { id: "photos" as const, label: "PHOTOS", count: data.photos.length },
        { id: "extras" as const, label: "EXTRAS", count: data.extras.length },
      ]
    : [];

  return (
    <div className="release-gallery">
      {!hideTabs && (
      <nav className="release-gallery__tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
            disabled={t.count === 0}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      )}

      {items.length === 0 ? (
        <p className="muted release-gallery__empty">No items in this section.</p>
      ) : (
        <div className="release-gallery__photo-grid">
          {items.map((item) => {
            const brandStyle = isGalleryBrandStyle(item);
            if (brandStyle) {
              return (
                <button
                  key={item.id}
                  type="button"
                  className="release-gallery__brand-card"
                  onClick={() => openViewer(item.id)}
                >
                  <span className="release-gallery__brand-stage">
                    <img src={item.url} alt="" draggable={false} />
                  </span>
                </button>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                className="release-gallery__photo-card"
                onClick={() => openViewer(item.id)}
              >
                <img src={item.url} alt="" draggable={false} />
                <span className="release-gallery__card-label">{item.title}</span>
              </button>
            );
          })}
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
