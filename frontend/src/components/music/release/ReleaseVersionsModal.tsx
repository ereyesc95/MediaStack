import type { TrackVersionItem } from "../../../types";

type Props = {
  title: string;
  versions: TrackVersionItem[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onPlay: (path: string, title: string) => void;
};

export default function ReleaseVersionsModal({
  title,
  versions,
  loading,
  error,
  onClose,
  onPlay,
}: Props) {
  return (
    <div className="release-versions-modal" role="dialog" aria-modal="true">
      <div className="release-versions-modal__backdrop" onClick={onClose} />
      <div className="release-versions-modal__panel">
        <header className="release-versions-modal__head">
          <h2>Versions — {title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="release-versions-modal__body">
          {loading && <p className="muted">Scanning library…</p>}
          {error && <p className="error">{error}</p>}
          {!loading && !error && versions.length === 0 && (
            <p className="muted">No other versions found in this artist&apos;s library.</p>
          )}
          {!loading && !error && versions.length > 0 && (
            <ul className="release-versions-modal__list">
              {versions.map((v) => (
                <li key={v.play_path}>
                  <button
                    type="button"
                    className="release-versions-modal__item"
                    onClick={() => onPlay(v.play_path, v.title)}
                  >
                    {v.cover_url && (
                      <img src={v.cover_url} alt="" className="release-versions-modal__cover" />
                    )}
                    <span className="release-versions-modal__meta">
                      <span className="release-versions-modal__album">
                        {v.album_title ?? "Unknown album"}
                      </span>
                      {v.date_iso && (
                        <span className="release-versions-modal__date">{v.date_iso}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
