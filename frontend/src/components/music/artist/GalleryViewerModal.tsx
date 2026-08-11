import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const thumbsRef = useRef<HTMLDivElement | null>(null);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);
  const jumpRef = useRef(false);
  const prevIndexRef = useRef(index);
  const [overflows, setOverflows] = useState(false);

  // Endless carousel only when the strip cannot fit on one row.
  const loop = hasMany && overflows && items.length >= 2;

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

  // Measure whether thumbs overflow the row (before enabling loop dupes).
  useLayoutEffect(() => {
    const scroller = thumbsRef.current;
    if (!scroller) return;
    const measure = () => {
      // Measure against a non-loop strip width estimate.
      const pad = 8;
      const gap = 0.45 * 16;
      const thumbW = 3.1 * 16;
      const need = items.length * thumbW + Math.max(0, items.length - 1) * gap + pad;
      setOverflows(need > scroller.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [items.length]);

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
      return;
    }

    // Jumping from last→first or first→last via arrows: animate toward the
    // edge copy, then silently snap back to the middle copy so the strip never ends.
    const wrapped =
      (prev === items.length - 1 && index === 0) ||
      (prev === 0 && index === items.length - 1);
    if (wrapped) {
      const edgeCopy = index === 0 ? 2 : 0;
      const edge = scroller.querySelector(
        `[data-gallery-thumb="${edgeCopy}-${index}"]`
      ) as HTMLElement | null;
      if (edge) {
        centerOn(edge, true);
        window.setTimeout(() => {
          jumpRef.current = true;
          const mid = scroller.querySelector(
            `[data-gallery-thumb="1-${index}"]`
          ) as HTMLElement | null;
          if (mid) centerOn(mid, false);
        }, 280);
        return;
      }
    }

    centerOn(active, true);
  }, [index, loop, items.length, activeKey]);

  useLayoutEffect(() => {
    if (!loop) return;
    const scroller = thumbsRef.current;
    if (!scroller) return;
    jumpRef.current = true;
    const mid = scroller.querySelector(
      `[data-gallery-thumb="1-${index}"]`
    ) as HTMLElement | null;
    if (mid) centerOn(mid, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop, items.length]);

  if (!item) return null;

  return (
    <ModalPortal onClose={onClose}>
      <div className="gallery-viewer" onMouseDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="gallery-viewer__close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        <div className="gallery-viewer__stage">
          {hasMany ? (
            <button
              type="button"
              className="gallery-viewer__nav gallery-viewer__nav--prev"
              aria-label="Previous"
              onClick={() => step(-1)}
            >
              ‹
            </button>
          ) : null}
          <img src={item.url} alt={item.caption} className="gallery-viewer__img" />
          {hasMany ? (
            <button
              type="button"
              className="gallery-viewer__nav gallery-viewer__nav--next"
              aria-label="Next"
              onClick={() => step(1)}
            >
              ›
            </button>
          ) : null}
        </div>
        <div className="gallery-viewer__footer">
          <p className="gallery-viewer__caption">
            {item.caption}
            {item.subcaption ? (
              <span className="gallery-viewer__subcaption">
                {" "}
                {item.subcaption}
              </span>
            ) : null}
            {hasMany ? (
              <span className="gallery-viewer__count">
                {" "}
                {index + 1} / {items.length}
              </span>
            ) : null}
          </p>
          {hasMany ? (
            <div
              className={`gallery-viewer__thumbs${
                loop ? " gallery-viewer__thumbs--loop" : " gallery-viewer__thumbs--centered"
              }`}
              ref={thumbsRef}
            >
              {loopThumbs.map((t) => {
                const active = t.realIndex === index && (!loop || t.copy === 1);
                return (
                  <button
                    key={t.key}
                    type="button"
                    data-gallery-thumb={t.key}
                    ref={active ? activeThumbRef : undefined}
                    className={`gallery-viewer__thumb${
                      active ? " is-active" : ""
                    }`}
                    onClick={() => onIndexChange(t.realIndex)}
                  >
                    <img src={t.item.url} alt="" />
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  );
}
