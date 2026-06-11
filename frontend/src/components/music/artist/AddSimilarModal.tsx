import { useEffect, useState } from "react";
import { addBandSimilar, searchMusicBrainz } from "../../../api";
import type { MbArtistMatch } from "../../../types";
import ModalPortal from "../../ModalPortal";

type Props = {
  bandId: number;
  onClose: () => void;
  onSaved: () => void;
};

export default function AddSimilarModal({ bandId, onClose, onSaved }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MbArtistMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      setSearching(true);
      searchMusicBrainz(query.trim())
        .then((d) => setResults(d.items))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => window.clearTimeout(t);
  }, [query]);

  async function pick(item: MbArtistMatch) {
    setSaving(true);
    setError(null);
    try {
      await addBandSimilar(bandId, {
        name: item.name,
        mbid: item.mbid,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Add similar artist</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="artist-admin-form">
          <label>
            Search MusicBrainz
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Band or artist name…"
              autoFocus
            />
          </label>

          {searching && <p className="muted">Searching…</p>}

          {results.length > 0 && (
            <ul className="add-similar-results">
              {results.map((item) => (
                <li key={item.mbid}>
                  <button
                    type="button"
                    className="btn btn--block"
                    disabled={saving}
                    onClick={() => void pick(item)}
                  >
                    <span className="add-similar-results__name">{item.name}</span>
                    {item.disambiguation && (
                      <span className="muted add-similar-results__dis">
                        {item.disambiguation}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="modal-actions-row">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
