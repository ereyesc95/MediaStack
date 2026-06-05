import { useState } from "react";
import { importBandFromMb, searchMusicBrainz } from "../../api";
import type { MbArtistMatch } from "../../types";

type Props = {
  onClose: () => void;
  onAdded: (bandId: number) => void;
};

export default function AddArtistModal({ onClose, onAdded }: Props) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<MbArtistMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    setError(null);
    setBusy(true);
    setMatches([]);
    try {
      const data = await searchMusicBrainz(query);
      setMatches(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pick(m: MbArtistMatch) {
    setBusy(true);
    setError(null);
    try {
      const res = await importBandFromMb(m.mbid);
      onAdded(res.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Add artist</h3>
        <p className="muted">Search MusicBrainz (up to 3 matches)</p>
        <div className="modal-search-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Artist or band name"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button type="button" className="btn" onClick={handleSearch} disabled={busy}>
            Search
          </button>
        </div>
        {error && <p className="error-inline">{error}</p>}
        <ul className="mb-matches">
          {matches.map((m) => (
            <li key={m.mbid}>
              <button type="button" onClick={() => pick(m)} disabled={busy}>
                <strong>{m.name}</strong>
                {m.disambiguation && (
                  <span className="muted"> — {m.disambiguation}</span>
                )}
                {m.type && <span className="badge">{m.type}</span>}
              </button>
            </li>
          ))}
        </ul>
        {!busy && matches.length === 0 && query && (
          <p className="muted">No matches yet. Try Search.</p>
        )}
        <button type="button" className="btn modal-close" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
