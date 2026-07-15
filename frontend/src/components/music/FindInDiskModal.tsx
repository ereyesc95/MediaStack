import { useCallback, useEffect, useState } from "react";
import {
  findPlaylistTrackInDisk,
  linkPlaylistTrackEntry,
  searchLibraryTracks,
  type LibraryTrackSearchHit,
} from "../../api";
import ModalPortal from "../ModalPortal";

type Props = {
  playlistId: number;
  entryId: number;
  trackTitle: string;
  onClose: () => void;
  onLinked: () => void;
};

export default function FindInDiskModal({
  playlistId,
  entryId,
  trackTitle,
  onClose,
  onLinked,
}: Props) {
  const [query, setQuery] = useState(trackTitle);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LibraryTrackSearchHit[]>([]);
  const [searched, setSearched] = useState(false);

  const runAutoMatch = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await findPlaylistTrackInDisk(playlistId, entryId);
      if (result.found) {
        onLinked();
        onClose();
        return;
      }
      if (result.candidates?.length) {
        setCandidates(result.candidates);
      } else {
        setCandidates([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [entryId, onClose, onLinked, playlistId]);

  useEffect(() => {
    void runAutoMatch();
  }, [runAutoMatch]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setSearched(true);
    try {
      const res = await searchLibraryTracks(q);
      setCandidates(res.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const linkPath = async (path: string) => {
    setLinking(path);
    setError(null);
    try {
      await linkPlaylistTrackEntry(playlistId, entryId, path);
      onLinked();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(null);
    }
  };

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel find-in-disk-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artist-word-cloud-modal__head">
          <div className="release-add-playlist-modal__titles">
            <h3>Find on disk</h3>
            <p className="muted find-in-disk-modal__subtitle">{trackTitle}</p>
          </div>
          <button type="button" className="artist-word-cloud-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="find-in-disk-modal__body">
          <div className="find-in-disk-modal__search-row">
            <input
              type="search"
              className="find-in-disk-modal__search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search library…"
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
            />
            <button type="button" className="btn" disabled={busy} onClick={() => void runSearch()}>
              Search
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          {busy && !candidates.length && <p className="muted">Searching…</p>}
          {!busy && searched && candidates.length === 0 && (
            <p className="muted">No matching tracks found. Try a different search.</p>
          )}
          {!busy && !searched && candidates.length === 0 && (
            <p className="muted">No automatic match. Search your library below.</p>
          )}
          {candidates.length > 0 && (
            <ul className="find-in-disk-modal__results ms-scrollbar">
              {candidates.map((hit) => (
                <li key={hit.path}>
                  <button
                    type="button"
                    className="find-in-disk-modal__result"
                    disabled={linking === hit.path}
                    onClick={() => void linkPath(hit.path)}
                  >
                    <span className="find-in-disk-modal__result-title">{hit.title}</span>
                    <span className="find-in-disk-modal__result-meta">
                      {hit.artist_name}
                      {hit.album_title ? ` · ${hit.album_title}` : ""}
                      {hit.year ? ` · ${hit.year}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
