import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMediaRelated } from "../../api";
import type { FranchiseMediaEntry, MediaRelatedPayload } from "../../types";
import { DEFAULT_DISC_URL } from "../music/release/releaseTrackPanelMeta";

type Props = {
  folderPath: string;
};

const KIND_ORDER = ["series", "movies", "books", "games", "music"] as const;

const KIND_LABEL: Record<string, string> = {
  series: "Series",
  movies: "Movies",
  books: "Books",
  games: "Games",
  music: "Music",
};

export default function SeriesRelatedPanel({ folderPath }: Props) {
  const [data, setData] = useState<MediaRelatedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMediaRelated(folderPath));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [folderPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    if (!data) return [];
    return KIND_ORDER.map((kind) => {
      const items = ((data[kind] as FranchiseMediaEntry[] | undefined) ?? []).filter(
        (it) => {
          if (kind !== "series") return true;
          // Prefer dated subseries over franchise hub roots
          const parts = (it.path || "").replace(/\\/g, "/").split("/").filter(Boolean);
          return !(parts.length === 3 && !it.date_iso);
        }
      );
      return { kind, label: KIND_LABEL[kind] ?? kind, items };
    }).filter((g) => g.items.length > 0);
  }, [data]);

  if (loading) {
    return <p className="muted artist-section-empty">Loading related media…</p>;
  }
  if (error) {
    return <p className="error artist-section-empty">{error}</p>;
  }
  if (!groups.length) {
    return (
      <p className="muted artist-section-empty">
        No related media under the same franchise name in Movies, Books, Games,
        or Music.
      </p>
    );
  }

  return (
    <div className="series-related">
      {data?.franchise ? (
        <p className="muted series-related__franchise">
          Franchise: {data.franchise.display_name}
        </p>
      ) : null}
      {groups.map((g) => (
        <section key={g.kind} className="series-related__section">
          <h3>{g.label}</h3>
          <div className="media-release-grid series-related__grid">
            {g.items.map((it) => (
              <article
                key={`${it.kind}:${it.path}`}
                className="media-release-card media-release-card--portrait"
                title={it.title}
              >
                <span
                  className="media-release-card__cover"
                  style={{
                    backgroundImage: `url("${DEFAULT_DISC_URL}")`,
                  }}
                />
                <span className="media-release-card__dim" aria-hidden />
                <span className="media-release-card__hover">
                  <span className="media-release-card__title-hover">
                    {it.title}
                  </span>
                </span>
                <span className="media-release-card__date">
                  <span className="media-release-card__date-label">
                    {it.kind}
                    {it.platform ? ` · ${it.platform}` : ""}
                  </span>
                </span>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
