import { useEffect, useState } from "react";
import {
  addBandSimilar,
  searchMusicBrainz,
  searchRosterBands,
} from "../../../api";
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
    let cancelled = false;
    const t = window.setTimeout(() => {
      setSearching(true);
      searchMusicBrainz(query.trim())
        .catch(() => ({ items: [] as MbArtistMatch[] }))
        .then(async (d) => {
          if (d.items.length) {
            if (!cancelled) setResults(d.items);
            return;
          }
          const local = await searchRosterBands(query.trim(), 50);
          if (!cancelled) {
            setResults(
              local.items
                .filter((item) => item.id !== bandId)
                .map((item) => ({
                  mbid: "",
                  name: item.name,
                  sort_name: item.name,
                  type: "Local",
                  disambiguation: "MyStack catalog",
                }))
            );
          }
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [bandId, query]);

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
                <li key={`${item.mbid || "local"}-${item.name}`}>
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
