import type { SeriesEpisodeItem } from "../../types";

type Props = {
  episodes: SeriesEpisodeItem[];
  emptyLabel?: string;
};

function openEpisode(ep: SeriesEpisodeItem) {
  const url =
    ep.open_url ||
    `/api/media/file?path=${encodeURIComponent(ep.play_path)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function SeriesEpisodeList({
  episodes,
  emptyLabel = "No episode video files in this season folder.",
}: Props) {
  if (!episodes.length) {
    return (
      <p className="muted release-tracklist__edition-empty">{emptyLabel}</p>
    );
  }

  return (
    <div className="release-tracklist__content series-episode-list">
      <ul className="release-tracklist__tracks series-episode-list__tracks">
        {episodes.map((ep) => (
          <li key={ep.id}>
            <button
              type="button"
              className="release-tracklist__row series-episode-list__row"
              onClick={() => openEpisode(ep)}
              title={`Open ${ep.title}`}
            >
              <span className="release-tracklist__num series-episode-list__num">
                {ep.number != null ? ep.number : "–"}
              </span>
              <span className="release-tracklist__title series-episode-list__title">
                {ep.title}
              </span>
              <span
                className="release-tracklist__meta series-episode-list__open"
                aria-hidden
              >
                ↗
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
