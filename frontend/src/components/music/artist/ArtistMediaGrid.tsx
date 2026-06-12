import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBandLibraryIndex, fetchBandVideoIndex } from "../../../api";
import type { MediaTabCategory, MediaTabIndexPayload } from "../../../types";

type Props = {
  bandId: number;
  kind: "video" | "library";
  onOpenItem?: (itemId: string) => void;
};

export function useArtistMediaTab(bandId: number, kind: "video" | "library", enabled: boolean) {
  const [data, setData] = useState<MediaTabIndexPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload =
        kind === "video"
          ? await fetchBandVideoIndex(bandId)
          : await fetchBandLibraryIndex(bandId);
      setData(payload);
      setCategoryKey(payload.categories[0]?.key ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bandId, kind]);

  useEffect(() => {
    if (!enabled) {
      setData(null);
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
  const { loading, error, category, categories, categoryKey, setCategoryKey } = useArtistMediaTab(
    bandId,
    kind,
    true
  );

  if (loading && !category) {
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
      <div className="artist-media-grid__items">
        {(category?.items ?? []).map((item) => (
          <button
            key={item.id}
            type="button"
            className="media-release-card artist-media-grid__card"
            onClick={() => onOpenItem?.(item.id)}
          >
            <div
              className="media-release-card__art"
              style={
                item.cover_url
                  ? { backgroundImage: `url("${item.cover_url}")` }
                  : undefined
              }
            />
            <span className="media-release-card__title">{item.title}</span>
            {item.date_iso && (
              <span className="media-release-card__date">{item.date_iso}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
