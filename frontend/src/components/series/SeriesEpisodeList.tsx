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
    return <p className="muted artist-section-empty">{emptyLabel}</p>;
  }

  return (
    <div className="series-episode-list">
      <ul className="series-episode-list__tracks">
        {episodes.map((ep) => (
          <li key={ep.id}>
            <button
              type="button"
              className="series-episode-list__row"
              onClick={() => openEpisode(ep)}
              title={`Open ${ep.title}`}
            >
              <span className="series-episode-list__num">
                {ep.number != null ? ep.number : "–"}
              </span>
              <span className="series-episode-list__title">{ep.title}</span>
              <span className="series-episode-list__open" aria-hidden>
                ↗
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
