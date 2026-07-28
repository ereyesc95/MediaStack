import type { SeriesEpisodeItem } from "../../types";
import { formatTrackDate } from "../../formatDate";

type Props = {
  episodes: SeriesEpisodeItem[];
  emptyLabel?: string;
  onSelect?: (ep: SeriesEpisodeItem) => void;
  /** When true, show release date before duration (movies / specials). */
  showReleaseDate?: boolean;
};

function openEpisode(ep: SeriesEpisodeItem) {
  const url = ep.open_url?.trim();
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function SeriesEpisodeList({
  episodes,
  emptyLabel = "No episode video files in this season folder.",
  onSelect,
  showReleaseDate = false,
}: Props) {
  if (!episodes.length) {
    return (
      <p className="muted release-tracklist__edition-empty">{emptyLabel}</p>
    );
  }

  return (
    <div className="release-tracklist__content series-episode-list">
      <ul className="release-tracklist__tracks series-episode-list__tracks">
        {episodes.map((ep, index) => {
          const num =
            ep.number != null
              ? ep.number
              : showReleaseDate
                ? index + 1
                : "–";
          const dateLabel =
            showReleaseDate || ep.kind === "movie"
              ? ep.display_date || formatTrackDate(ep.date_iso)
              : null;
          const canOpen = Boolean(ep.open_url?.trim());
          return (
            <li key={ep.id} className="series-episode-list__item">
              <button
                type="button"
                className={`release-tracklist__row series-episode-list__row${
                  canOpen ? "" : " series-episode-list__row--unavailable"
                }`}
                onClick={() => {
                  onSelect?.(ep);
                  if (canOpen) openEpisode(ep);
                }}
                title={canOpen ? `Open ${ep.title}` : `${ep.title} (file not linked)`}
                disabled={!canOpen && !onSelect}
              >
                <span className="release-tracklist__num series-episode-list__num">
                  {num}
                </span>
                <span className="release-tracklist__title series-episode-list__title">
                  {ep.title}
                  {(ep as { video_suffix?: string | null }).video_suffix ? (
                    <span className="release-tracklist__video-badge">
                      {(ep as { video_suffix?: string }).video_suffix}
                    </span>
                  ) : null}
                </span>
                <span className="series-episode-list__trailing">
                  {dateLabel ? (
                    <span className="series-episode-list__date">{dateLabel}</span>
                  ) : null}
                  {ep.duration ? (
                    <span className="release-tracklist__duration">
                      {ep.duration}
                    </span>
                  ) : (
                    <span className="release-tracklist__duration release-tracklist__duration--empty">
                      –
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
