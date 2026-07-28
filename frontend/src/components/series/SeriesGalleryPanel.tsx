import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSeriesGallery } from "../../api";
import type { SeriesGalleryItem, SeriesGallerySection } from "../../types";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "../music/artist/GalleryViewerModal";

type SectionMeta = { key: string; label: string };

type Props = {
  folderPath: string;
  sectionKey?: string;
  onSectionKeyChange?: (key: string) => void;
  onSectionsChange?: (sections: SectionMeta[], hasMultiple: boolean) => void;
  hideSubbar?: boolean;
};

export default function SeriesGalleryPanel({
  folderPath,
  sectionKey: controlledKey,
  onSectionKeyChange,
  onSectionsChange,
  hideSubbar = false,
}: Props) {
  const [sections, setSections] = useState<SeriesGallerySection[]>([]);
  const [items, setItems] = useState<SeriesGalleryItem[]>([]);
  const [internalKey, setInternalKey] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const onSectionsChangeRef = useRef(onSectionsChange);
  const onSectionKeyChangeRef = useRef(onSectionKeyChange);
  onSectionsChangeRef.current = onSectionsChange;
  onSectionKeyChangeRef.current = onSectionKeyChange;

  const sectionKey = controlledKey ?? internalKey;
  const setSectionKey = (key: string) => {
    if (onSectionKeyChangeRef.current) onSectionKeyChangeRef.current(key);
    else setInternalKey(key);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSeriesGallery(folderPath);
      const secs = data.sections?.length
        ? data.sections
        : data.items.length
          ? [{ key: "covers", label: "Covers", items: data.items }]
          : [];
      setSections(secs);
      setItems(data.items);
      onSectionsChangeRef.current?.(
        secs.map((s) => ({ key: s.key, label: s.label })),
        secs.length > 1
      );
      const keys = new Set<string>(["all", ...secs.map((s) => s.key)]);
      const current = controlledKey ?? internalKey;
      if (!keys.has(current)) {
        const preferred = secs.length > 1 ? "all" : secs[0]?.key || "all";
        if (onSectionKeyChangeRef.current) {
          onSectionKeyChangeRef.current(preferred);
        } else {
          setInternalKey(preferred);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      onSectionsChangeRef.current?.([], false);
    } finally {
      setLoading(false);
    }
  }, [folderPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (sectionKey === "all") return items;
    const sec = sections.find((s) => s.key === sectionKey);
    return sec?.items || [];
  }, [items, sections, sectionKey]);

  const viewerItems: GalleryViewerItem[] = useMemo(
    () =>
      visible.map((it) => ({
        id: it.id,
        url: it.url,
        caption: it.title,
      })),
    [visible]
  );

  if (loading) {
    return <p className="muted artist-section-empty">Loading gallery…</p>;
  }
  if (error) {
    return <p className="error artist-section-empty">{error}</p>;
  }
  if (!items.length) {
    return <p className="muted artist-section-empty">No images found.</p>;
  }

  return (
    <div className="series-gallery">
      {!hideSubbar && sections.length > 1 ? (
        <nav
          className="series-section-subbar"
          role="tablist"
          aria-label="Gallery folders"
        >
          <button
            type="button"
            className={sectionKey === "all" ? "active" : ""}
            onClick={() => setSectionKey("all")}
          >
            All
          </button>
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              className={sectionKey === s.key ? "active" : ""}
              onClick={() => setSectionKey(s.key)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      ) : null}
      <div className="artist-gallery__photo-grid series-gallery__grid">
        {visible.map((it, i) => (
          <button
            key={it.id}
            type="button"
            className="artist-gallery__photo-card"
            onClick={() => setViewerIndex(i)}
            title={it.title}
          >
            <img src={it.url} alt={it.title} loading="lazy" draggable={false} />
            <span className="artist-gallery__card-label">{it.title}</span>
          </button>
        ))}
      </div>
      {viewerIndex != null ? (
        <GalleryViewerModal
          items={viewerItems}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
        />
      ) : null}
    </div>
  );
}
