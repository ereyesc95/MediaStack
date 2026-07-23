import { useEffect, useState } from "react";
import { DEFAULT_DISC_URL } from "../music/release/releaseTrackPanelMeta";

export type SeriesMediaCard = {
  id: string;
  title: string;
  cover_url?: string | null;
  meta?: string;
  date_label?: string | null;
  path?: string;
  platform?: string | null;
};

type Props = {
  items: SeriesMediaCard[];
  loading?: boolean;
  emptyMessage?: string;
  onOpen?: (item: SeriesMediaCard) => void;
};

export default function SeriesMediaGrid({
  items,
  loading,
  emptyMessage = "Nothing here yet.",
  onOpen,
}: Props) {
  if (loading) {
    return <p className="muted artist-section-empty">Loading…</p>;
  }
  if (!items.length) {
    return <p className="muted artist-section-empty">{emptyMessage}</p>;
  }
  return (
    <div className="media-release-grid series-media-grid">
      {items.map((item) => {
        const cover = item.cover_url || DEFAULT_DISC_URL;
        const className =
          "media-release-card media-release-card--portrait" +
          (onOpen
            ? " media-release-card--clickable media-release-card--button"
            : "");
        const inner = (
          <>
            <span
              className="media-release-card__cover"
              style={{ backgroundImage: `url("${cover}")` }}
            />
            <span className="media-release-card__dim" aria-hidden />
            <span className="media-release-card__hover">
              <span className="media-release-card__title-hover">{item.title}</span>
            </span>
            <span className="media-release-card__date">
              <span className="media-release-card__date-label">
                {item.date_label || item.meta || ""}
              </span>
            </span>
          </>
        );
        if (onOpen) {
          return (
            <button
              key={item.id}
              type="button"
              className={className}
              onClick={() => onOpen(item)}
              title={item.title}
            >
              {inner}
            </button>
          );
        }
        return (
          <article key={item.id} className={className} title={item.title}>
            {inner}
          </article>
        );
      })}
    </div>
  );
}

export function useAsyncItems<T>(
  loader: () => Promise<T[]>,
  deps: unknown[]
): { items: T[]; loading: boolean } {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loader()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { items, loading };
}
