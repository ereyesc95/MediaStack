import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSeriesGallery } from "../../api";
import type { SeriesGalleryItem } from "../../types";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "../music/artist/GalleryViewerModal";

type Props = {
  folderPath: string;
};

export default function SeriesGalleryPanel({ folderPath }: Props) {
  const [items, setItems] = useState<SeriesGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSeriesGallery(folderPath);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [folderPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const viewerItems: GalleryViewerItem[] = useMemo(
    () =>
      items.map((it) => ({
        id: it.id,
        url: it.url,
        caption: it.title,
      })),
    [items]
  );

  if (loading) {
    return <p className="muted artist-section-empty">Loading gallery…</p>;
  }
  if (error) {
    return <p className="error artist-section-empty">{error}</p>;
  }
  if (!items.length) {
    return (
      <p className="muted artist-section-empty">
        No images in <code>[Artwork]</code> for this folder.
      </p>
    );
  }

  return (
    <div className="series-gallery">
      <div className="series-gallery__grid">
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            className="series-gallery__thumb"
            onClick={() => setViewerIndex(i)}
            title={it.title}
          >
            <img src={it.url} alt={it.title} loading="lazy" />
          </button>
        ))}
      </div>
      {viewerIndex != null ? (
        <GalleryViewerModal
          items={viewerItems}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </div>
  );
}
