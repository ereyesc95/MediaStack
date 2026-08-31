import type { SeriesEpisodeItem } from "../../types";
import { formatTrackDate } from "../../formatDate";

type Props = {
  episodes: SeriesEpisodeItem[];
  emptyLabel?: string;
  onSelect?: (ep: SeriesEpisodeItem) => void;
  /** When true, show release date before duration (movies / specials). */
  showReleaseDate?: boolean;
  /** Highlight the last-clicked / active episode row. */
  activeId?: string | null;
  /** Default hover action text when episode has no duration (link rows). */
  hoverActionLabel?: string;
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
  activeId = null,
  hoverActionLabel = "Watch episode",
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
            showReleaseDate ||
            ep.kind === "movie" ||
            Boolean(ep.display_date || ep.date_iso)
              ? ep.display_date || formatTrackDate(ep.date_iso)
              : null;
          const canOpen = Boolean(ep.open_url?.trim());
          const active = Boolean(activeId && activeId === ep.id);
          const isLinkRow =
            ep.source === "remote" ||
            ep.open_mode === "tab" ||
            (!ep.duration && canOpen);
          const actionLabel =
            ep.hover_label?.trim() || (isLinkRow ? hoverActionLabel : null);
          return (
            <li key={ep.id} className="series-episode-list__item">
              <button
                type="button"
                className={`release-tracklist__row series-episode-list__row${
                  active ? " active" : ""
                }${canOpen ? "" : " series-episode-list__row--unavailable"}${
                  actionLabel ? " series-episode-list__row--link-action" : ""
                }`}
                onClick={() => {
                  onSelect?.(ep);
                  if (canOpen) openEpisode(ep);
                }}
                title={
                  canOpen
                    ? actionLabel
                      ? `${actionLabel}: ${ep.title}`
                      : `Open ${ep.title}`
                    : `${ep.title} (file not linked)`
                }
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
                  {actionLabel ? (
                    <>
                      <span className="release-tracklist__duration release-tracklist__duration--empty series-episode-list__duration-idle">
                        {ep.duration || "–"}
                      </span>
                      <span className="series-episode-list__hover-action">
                        {actionLabel}
                      </span>
                    </>
                  ) : ep.duration ? (
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
