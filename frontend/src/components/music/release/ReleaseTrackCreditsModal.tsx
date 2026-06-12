type Props = {
  title: string;
  writers: string[];
  composers: string[];
  lyricists: string[];
  source: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

export default function ReleaseTrackCreditsModal({
  title,
  writers,
  composers,
  lyricists,
  source,
  loading,
  error,
  onClose,
}: Props) {
  const hasAny = writers.length || composers.length || lyricists.length;

  return (
    <div className="release-credits-modal" role="dialog" aria-modal="true">
      <div className="release-credits-modal__backdrop" onClick={onClose} />
      <div className="release-credits-modal__panel">
        <header className="release-credits-modal__head">
          <h2>Credits — {title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="release-credits-modal__body">
          {loading && <p className="muted">Loading credits…</p>}
          {error && <p className="error">{error}</p>}
          {!loading && !error && !hasAny && (
            <p className="muted">No writing credits found for this track.</p>
          )}
          {!loading && !error && writers.length > 0 && (
            <p>
              <strong>Writers:</strong> {writers.join(" · ")}
            </p>
          )}
          {!loading && !error && composers.length > 0 && (
            <p>
              <strong>Composers:</strong> {composers.join(" · ")}
            </p>
          )}
          {!loading && !error && lyricists.length > 0 && (
            <p>
              <strong>Lyricists:</strong> {lyricists.join(" · ")}
            </p>
          )}
          {source && <p className="muted release-credits-modal__source">Source: {source}</p>}
        </div>
      </div>
    </div>
  );
}
