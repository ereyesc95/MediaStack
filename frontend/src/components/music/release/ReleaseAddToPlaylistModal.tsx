import { useEffect, useState } from "react";
import { addTrackToPlaylist, fetchUserPlaylists } from "../../../api";
import type { ReleaseTrackItem, UserPlaylist } from "../../../types";

type Props = {
  track: ReleaseTrackItem;
  artistName: string;
  releaseTitle: string;
  onClose: () => void;
};

export default function ReleaseAddToPlaylistModal({
  track,
  artistName,
  releaseTitle,
  onClose,
}: Props) {
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [doneId, setDoneId] = useState<number | null>(null);

  useEffect(() => {
    fetchUserPlaylists()
      .then((res) =>
        setPlaylists(res.items.filter((p) => p.type_id !== 200))
      )
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const add = async (playlistId: number) => {
    setBusyId(playlistId);
    setError(null);
    try {
      await addTrackToPlaylist(playlistId, {
        title: track.title,
        artist: artistName,
        release: releaseTitle,
        path: track.play_path,
      });
      setDoneId(playlistId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="release-playlist-modal" role="dialog" aria-modal="true">
      <div className="release-playlist-modal__backdrop" onClick={onClose} />
      <div className="release-playlist-modal__panel">
        <header className="release-playlist-modal__head">
          <h2>Add to playlist — {track.title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="release-playlist-modal__body">
          {loading && <p className="muted">Loading playlists…</p>}
          {error && <p className="error">{error}</p>}
          {!loading && playlists.length === 0 && (
            <p className="muted">No playlists available.</p>
          )}
          <ul className="release-playlist-modal__list">
            {playlists.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => void add(p.id)}
                >
                  {p.name ?? `Playlist ${p.id}`}
                  {doneId === p.id && <span className="release-playlist-modal__ok"> ✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
