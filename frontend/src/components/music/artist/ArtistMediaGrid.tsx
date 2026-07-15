import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCachedArtistMediaTab,
  prefetchArtistMediaTab,
} from "../../../artistMediaTabCache";
import type { MediaTabCategory, MediaTabIndexPayload } from "../../../types";

type Props = {
  bandId: number;
  kind: "video" | "library";
  onOpenItem?: (itemId: string) => void;
};

export function useArtistMediaTab(bandId: number, kind: "video" | "library", enabled: boolean) {
  const [data, setData] = useState<MediaTabIndexPayload | null>(
    () => getCachedArtistMediaTab(bandId, kind)
  );
  const [loading, setLoading] = useState(
    () => enabled && !getCachedArtistMediaTab(bandId, kind)
  );
  const [error, setError] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState(
    () => getCachedArtistMediaTab(bandId, kind)?.categories[0]?.key ?? ""
  );

  const load = useCallback(
    async (force = false) => {
      const cached = !force ? getCachedArtistMediaTab(bandId, kind) : null;
      if (cached) {
        setData(cached);
        setCategoryKey(cached.categories[0]?.key ?? "");
        setLoading(false);
        setError(null);
        prefetchArtistMediaTab(bandId, kind, { force: true })
          .then((payload) => {
            setData(payload);
            setCategoryKey((prev) => prev || payload.categories[0]?.key || "");
          })
          .catch(() => {});
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const payload = await prefetchArtistMediaTab(bandId, kind, { force: true });
        setData(payload);
        setCategoryKey(payload.categories[0]?.key ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [bandId, kind]
  );

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    void load();
  }, [enabled, load]);

  const category: MediaTabCategory | null = useMemo(
    () => data?.categories.find((c) => c.key === categoryKey) ?? data?.categories[0] ?? null,
    [data, categoryKey]
  );

  return { data, loading, error, categoryKey, setCategoryKey, category, categories: data?.categories ?? [] };
}

export default function ArtistMediaGrid({ bandId, kind, onOpenItem }: Props) {
  const { data, loading, error, category, categories, categoryKey, setCategoryKey } =
    useArtistMediaTab(bandId, kind, true);

  if (loading && !data) {
    return <p className="muted artist-section-empty">Loading…</p>;
  }
  if (error) {
    return <p className="error artist-section-empty">{error}</p>;
  }
  if (!categories.length) {
    return (
      <p className="muted artist-section-empty">
        No {kind === "video" ? "video" : "library"} folders found.
      </p>
    );
  }

  return (
    <div className="artist-media-grid">
      {categories.length > 1 && (
        <nav className="artist-page__subtabs artist-media-grid__tabs">
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              className={categoryKey === c.key ? "active" : ""}
              onClick={() => setCategoryKey(c.key)}
            >
              <span>{c.label.toUpperCase()}</span>
            </button>
          ))}
        </nav>
      )}
      <div className="artist-media-grid__items artist-media-grid__items--portrait">
        {(category?.items ?? []).map((item) => (
          <button
            key={item.id}
            type="button"
            className="media-release-card media-release-card--clickable artist-media-grid__card media-release-card--portrait media-beat-frame media-beat-frame--cover"
            onClick={() => onOpenItem?.(item.id)}
            title={item.title}
          >
            <span
              className="media-release-card__cover"
              style={
                item.cover_url
                  ? { backgroundImage: `url("${item.cover_url}")` }
                  : undefined
              }
            />
            <span className="media-release-card__dim" aria-hidden />
            <span className="media-release-card__hover">
              <span className="media-release-card__title-hover">{item.title}</span>
            </span>
            {item.date_iso ? (
              <span className="media-release-card__date">
                <span className="media-release-card__date-label">{item.date_iso}</span>
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
