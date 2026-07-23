import { useMemo } from "react";
import type { SeriesRelatedShow } from "../../types";
import { DEFAULT_DISC_URL } from "../music/release/releaseTrackPanelMeta";

export type SeriesRelatedTab = "creator" | "similar";

type Props = {
  creator: SeriesRelatedShow[];
  similar: SeriesRelatedShow[];
  tab: SeriesRelatedTab;
};

export default function SeriesRelatedPanel({ creator, similar, tab }: Props) {
  const items = useMemo(
    () => (tab === "creator" ? creator : similar),
    [tab, creator, similar]
  );

  if (!items.length) {
    return (
      <p className="muted artist-section-empty artist-related__empty">
        {tab === "creator"
          ? "No other series by the same creator yet. Refresh metadata from TMDb."
          : "No similar series yet. Refresh metadata from TMDb."}
      </p>
    );
  }

  return (
    <div className="series-related artist-related">
      <div className="media-release-grid series-related__grid artist-related__grid">
        {items.map((it) => {
          const cover = it.cover_url || it.poster_url || DEFAULT_DISC_URL;
          const href = it.tmdb_id
            ? `https://www.themoviedb.org/tv/${it.tmdb_id}`
            : undefined;
          const inner = (
            <>
              <span
                className="media-release-card__cover"
                style={{ backgroundImage: `url("${cover}")` }}
              />
              <span className="media-release-card__dim" aria-hidden />
              <span className="media-release-card__hover">
                <span className="media-release-card__title-hover">
                  {it.title || it.name}
                </span>
              </span>
              {it.date_iso ? (
                <span className="media-release-card__date">
                  <span className="media-release-card__date-label">
                    {it.date_iso.slice(0, 4)}
                  </span>
                </span>
              ) : null}
            </>
          );
          return href ? (
            <a
              key={`${tab}-${it.tmdb_id || it.title}`}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="media-release-card media-release-card--portrait"
              title={it.title || it.name}
            >
              {inner}
            </a>
          ) : (
            <article
              key={`${tab}-${it.title}`}
              className="media-release-card media-release-card--portrait"
              title={it.title || it.name}
            >
              {inner}
            </article>
          );
        })}
      </div>
    </div>
  );
}
