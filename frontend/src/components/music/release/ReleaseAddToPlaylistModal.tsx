import { useEffect, useState } from "react";
import {
  addTrackToPlaylist,
  createUserPlaylist,
  fetchUserPlaylists,
} from "../../../api";
import type { ReleaseTrackItem, UserPlaylist } from "../../../types";
import ModalPortal from "../../ModalPortal";
import { trackDisplayTitle } from "./releaseTrackPanelMeta";

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
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchUserPlaylists()
      .then((res) => setPlaylists(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const add = async (playlistId: number, allowDuplicate = false) => {
    setBusyId(playlistId);
    setError(null);
    try {
      const result = await addTrackToPlaylist(playlistId, {
        title: track.title,
        artist: artistName,
        release: releaseTitle,
        path: track.play_path ?? "",
        allow_duplicate: allowDuplicate,
      });
      if (result.duplicate && !allowDuplicate) {
        setBusyId(null);
        const proceed = window.confirm(
          "This track already exists in the playlist. Proceed?"
        );
        if (!proceed) return;
        await add(playlistId, true);
        return;
      }
      setDoneId(playlistId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name) {
      setError("Enter a playlist name.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createUserPlaylist({ name });
      const playlist: UserPlaylist = {
        id: created.id,
        name: created.name ?? name,
        type_id: 200,
        description: null,
        cover_url: null,
        track_count: 0,
      };
      setPlaylists((prev) => {
        if (prev.some((p) => p.id === playlist.id)) return prev;
        return [...prev, playlist].sort((a, b) =>
          (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })
        );
      });
      setNewName("");
      await add(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel release-add-playlist-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artist-word-cloud-modal__head release-add-playlist-modal__head">
          <div className="release-add-playlist-modal__titles">
            <h3>Add to playlist</h3>
            <p className="release-add-playlist-modal__track">
              {trackDisplayTitle(track.title)}
            </p>
          </div>
          <button
            type="button"
            className="artist-word-cloud-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {error && <p className="error">{error}</p>}

        <div className="release-add-playlist-modal__new">
          <input
            type="text"
            className="release-add-playlist-modal__input"
            value={newName}
            placeholder="New playlist name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createAndAdd();
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={creating || !newName.trim()}
            onClick={() => void createAndAdd()}
          >
            {creating ? "Creating…" : "Create & add"}
          </button>
        </div>

        <div className="release-add-playlist-modal__body ms-scrollbar">
          {loading && <p className="muted">Loading playlists…</p>}
          {!loading && playlists.length === 0 && (
            <p className="muted">No playlists yet. Create one above.</p>
          )}
          <ul className="release-add-playlist-modal__list">
            {playlists.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="release-add-playlist-modal__item"
                  disabled={busyId === p.id || creating}
                  onClick={() => void add(p.id)}
                >
                  <span>{p.name ?? `Playlist ${p.id}`}</span>
                  {doneId === p.id && (
                    <span className="release-add-playlist-modal__ok">Added</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ModalPortal>
  );
}
