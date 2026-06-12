import { useEffect } from "react";
import ModalPortal from "../../ModalPortal";

export type GalleryViewerItem = {
  id: string;
  url: string;
  caption: string;
  subcaption?: string;
};

type Props = {
  items: GalleryViewerItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

export default function GalleryViewerModal({
  items,
  index,
  onIndexChange,
  onClose,
}: Props) {
  const item = items[index];
  const hasMany = items.length > 1;

  const step = (dir: -1 | 1) => {
    if (!items.length) return;
    const next = (index + dir + items.length) % items.length;
    onIndexChange(next);
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose]);

  if (!item) return null;

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="gallery-viewer"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Gallery image viewer"
      >
        <button
          type="button"
          className="gallery-viewer__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        {hasMany && (
          <button
            type="button"
            className="gallery-viewer__nav gallery-viewer__nav--prev"
            onClick={() => step(-1)}
            aria-label="Previous"
          >
            ‹
          </button>
        )}
        <div
          className="gallery-viewer__stage"
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (hasMany) step(x < rect.width / 2 ? -1 : 1);
          }}
        >
          <img
            src={item.url}
            alt=""
            className="gallery-viewer__image media-beat-glow"
          />
        </div>
        {hasMany && (
          <button
            type="button"
            className="gallery-viewer__nav gallery-viewer__nav--next"
            onClick={() => step(1)}
            aria-label="Next"
          >
            ›
          </button>
        )}
        <div className="gallery-viewer__caption">
          <span>{item.caption}</span>
          {item.subcaption && (
            <span className="gallery-viewer__sub">{item.subcaption}</span>
          )}
          {hasMany && (
            <span className="gallery-viewer__count">
              {index + 1} / {items.length}
            </span>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
