type Props = {
  title: string;
  lyrics: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

export default function ReleaseLyricsModal({
  title,
  lyrics,
  loading,
  error,
  onClose,
}: Props) {
  return (
    <div className="release-lyrics-modal" role="dialog" aria-modal="true">
      <div className="release-lyrics-modal__backdrop" onClick={onClose} />
      <div className="release-lyrics-modal__panel">
        <header className="release-lyrics-modal__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="release-lyrics-modal__body">
          {loading && <p className="muted">Loading lyrics…</p>}
          {error && <p className="error">{error}</p>}
          {!loading && !error && lyrics && (
            <pre className="release-lyrics-modal__text">{lyrics}</pre>
          )}
          {!loading && !error && !lyrics && (
            <p className="muted">No lyrics found for this track.</p>
          )}
        </div>
      </div>
    </div>
  );
}
