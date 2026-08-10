import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
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

type LoopThumb = {
  item: GalleryViewerItem;
  realIndex: number;
  key: string;
  copy: number;
};

export default function GalleryViewerModal({
  items,
  index,
  onIndexChange,
  onClose,
}: Props) {
  const item = items[index];
  const hasMany = items.length > 1;
  const loop = hasMany && items.length >= 2;
  const thumbsRef = useRef<HTMLDivElement | null>(null);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);
  const jumpRef = useRef(false);
  const prevIndexRef = useRef(index);

  const loopThumbs: LoopThumb[] = useMemo(() => {
    if (!loop) {
      return items.map((it, i) => ({
        item: it,
        realIndex: i,
        key: `0-${i}`,
        copy: 0,
      }));
    }
    // Triple the strip so the active thumb can sit in the middle copy forever.
    return [0, 1, 2].flatMap((copy) =>
      items.map((it, i) => ({
        item: it,
        realIndex: i,
        key: `${copy}-${i}`,
        copy,
      }))
    );
  }, [items, loop]);

  const activeKey = loop ? `1-${index}` : `0-${index}`;

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

  const centerOn = (thumb: HTMLElement, smooth: boolean) => {
    const scroller = thumbsRef.current;
    if (!scroller) return;
    const left =
      thumb.offsetLeft - scroller.clientWidth / 2 + thumb.offsetWidth / 2;
    scroller.scrollTo({
      left,
      behavior: smooth && !jumpRef.current ? "smooth" : "auto",
    });
    jumpRef.current = false;
  };

  // Keep the middle copy centered whenever the logical index changes.
  useLayoutEffect(() => {
    const scroller = thumbsRef.current;
    const active = activeThumbRef.current;
    if (!scroller || !active) return;

    const prev = prevIndexRef.current;
    prevIndexRef.current = index;

    if (!loop) {
      centerOn(active, true);
      return;
    }

    // Prefer animating across the wrap by targeting an adjacent copy, then
    // silently snap back to the middle copy so the strip never ends.
    const n = items.length;
    const wrappedForward = prev === n - 1 && index === 0;
    const wrappedBackward = prev === 0 && index === n - 1;

    if (wrappedForward || wrappedBackward) {
      const edgeCopy = wrappedForward ? 2 : 0;
      const edge = scroller.querySelector(
        `[data-thumb-key="${edgeCopy}-${index}"]`
      ) as HTMLElement | null;
      if (edge) {
        centerOn(edge, true);
        window.setTimeout(() => {
          jumpRef.current = true;
          const mid = scroller.querySelector(
            `[data-thumb-key="1-${index}"]`
          ) as HTMLElement | null;
          if (mid) centerOn(mid, false);
        }, 280);
        return;
      }
    }

    centerOn(active, true);
  }, [index, loop, items.length, activeKey]);

  // Initial position: middle copy, no animation.
  useLayoutEffect(() => {
    if (!loop) return;
    const scroller = thumbsRef.current;
    if (!scroller) return;
    const mid = scroller.querySelector(
      `[data-thumb-key="1-${index}"]`
    ) as HTMLElement | null;
    if (!mid) return;
    jumpRef.current = true;
    centerOn(mid, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / item-set only
  }, [loop, items.length]);

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
        <div className="gallery-viewer__footer">
          {hasMany ? (
            <div
              className={`gallery-viewer__thumbs${
                loop ? " gallery-viewer__thumbs--loop" : ""
              }`}
              ref={thumbsRef}
            >
              {loopThumbs.map((t) => {
                const isActive = t.key === activeKey;
                return (
                  <button
                    key={t.key}
                    type="button"
                    data-thumb-key={t.key}
                    ref={isActive ? activeThumbRef : undefined}
                    className={`gallery-viewer__thumb${
                      isActive ? " is-active" : ""
                    }`}
                    onClick={() => onIndexChange(t.realIndex)}
                    title={t.item.caption}
                    aria-label={`Show ${t.item.caption || `image ${t.realIndex + 1}`}`}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <img src={t.item.url} alt="" draggable={false} />
                  </button>
                );
              })}
            </div>
          ) : null}
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
      </div>
    </ModalPortal>
  );
}
