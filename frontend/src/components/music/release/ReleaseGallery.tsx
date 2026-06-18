import { useCallback, useEffect, useState } from "react";
import { fetchReleaseGallery, fetchTrackSourceArt } from "../../../api";
import type { ReleaseGalleryItem, ReleaseGalleryPayload } from "../../../types";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "../artist/GalleryViewerModal";

type GalleryTab = "artwork" | "photos" | "extras";

type Props = {
  bandId: number;
  releaseId: string;
  playingPath?: string | null;
};

export default function ReleaseGallery({ bandId, releaseId, playingPath = null }: Props) {
  const [data, setData] = useState<ReleaseGalleryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<GalleryTab>("artwork");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [playingArtwork, setPlayingArtwork] = useState<ReleaseGalleryItem[] | null>(null);

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
      setTab(first);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bandId, releaseId]);

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

  if (loading && !data) {
    return <p className="muted release-gallery__loading">Loading gallery…</p>;
  }
  if (error) {
    return <p className="error release-gallery__error">{error}</p>;
  }
  if (!data) {
    return <p className="muted release-gallery__empty">No gallery items found.</p>;
  }

  const activeArtwork =
    playingPath && playingArtwork && playingArtwork.length > 0
      ? playingArtwork
      : data.artwork;

  const items =
    tab === "artwork" ? activeArtwork : tab === "photos" ? data.photos : data.extras;

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

  const tabs: { id: GalleryTab; label: string; count: number }[] = [
    { id: "artwork", label: "ARTWORK", count: activeArtwork.length },
    { id: "photos", label: "PHOTOS", count: data.photos.length },
    { id: "extras", label: "EXTRAS", count: data.extras.length },
  ];

  return (
    <div className="release-gallery">
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

      {items.length === 0 ? (
        <p className="muted release-gallery__empty">No items in this section.</p>
      ) : (
        <div className="release-gallery__photo-grid">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="release-gallery__photo-card"
              onClick={() => openViewer(item.id)}
            >
              <img src={item.url} alt="" draggable={false} />
              <span className="release-gallery__card-label">{item.title}</span>
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
