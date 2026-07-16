import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMediaItemGallery } from "../../../api";
import type { ReleaseGalleryItem, ReleaseGalleryPayload } from "../../../types";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "../artist/GalleryViewerModal";

type GalleryTab = "artwork" | "photos" | "extras";

type Props = {
  bandId: number;
  kind: "video" | "library";
  itemId: string;
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
  return false;
}

export default function MediaItemGallery({
  bandId,
  kind,
  itemId,
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
  const onTabsMetaRef = useRef(onTabsMeta);
  onTabsMetaRef.current = onTabsMeta;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchMediaItemGallery(bandId, kind, itemId);
      setData(payload);
      const first =
        payload.artwork.length > 0
          ? "artwork"
          : payload.photos.length > 0
            ? "photos"
            : payload.extras.length > 0
              ? "extras"
              : "artwork";
      if (!galleryTabProp) setInternalTab(first);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bandId, kind, itemId, galleryTabProp]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setViewerIndex(null);
  }, [tab]);

  useEffect(() => {
    if (!data) return;
    const allTabs = [
      { id: "artwork" as const, label: "ARTWORK", count: data.artwork.length },
      { id: "photos" as const, label: "PHOTOS", count: data.photos.length },
      { id: "extras" as const, label: "EXTRAS", count: data.extras.length },
    ];
    onTabsMetaRef.current?.(allTabs.filter((t) => t.count > 0));
  }, [data]);

  const visibleTabs = useMemo(() => {
    if (!data) return [] as { id: GalleryTab; label: string; count: number }[];
    return [
      { id: "artwork" as const, label: "ARTWORK", count: data.artwork.length },
      { id: "photos" as const, label: "PHOTOS", count: data.photos.length },
      { id: "extras" as const, label: "EXTRAS", count: data.extras.length },
    ].filter((t) => t.count > 0);
  }, [data]);

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [visibleTabs, tab, setTab]);

  if (loading && !data) {
    return <p className="muted release-gallery__loading">Loading gallery…</p>;
  }
  if (error) {
    return <p className="error release-gallery__error">{error}</p>;
  }
  if (!data || visibleTabs.length === 0) {
    return <p className="muted release-gallery__empty">No gallery items found.</p>;
  }

  const items =
    tab === "artwork"
      ? data.artwork
      : tab === "photos"
        ? data.photos
        : data.extras;

  const viewerItems: GalleryViewerItem[] = items.map((item) => ({
    id: item.id,
    url: item.url,
    caption: item.title,
    subcaption:
      "year" in item && item.year != null ? String(item.year) : undefined,
  }));

  return (
    <div className="release-gallery">
      {!hideTabs && visibleTabs.length > 1 && (
        <nav className="release-gallery__tabs">
          {visibleTabs.map((t) => (
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
      )}

      {items.length === 0 ? (
        <p className="muted release-gallery__empty">No items in this section.</p>
      ) : (
        <div className="release-gallery__photo-grid">
          {items.map((item) => {
            const brandStyle =
              item.section === "extras" || isPhysicalMediaArtwork(item);
            if (brandStyle) {
              return (
                <button
                  key={item.id}
                  type="button"
                  className="release-gallery__brand-card"
                  onClick={() => {
                    const i = viewerItems.findIndex((v) => v.id === item.id);
                    if (i >= 0) setViewerIndex(i);
                  }}
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
                onClick={() => {
                  const i = viewerItems.findIndex((v) => v.id === item.id);
                  if (i >= 0) setViewerIndex(i);
                }}
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
