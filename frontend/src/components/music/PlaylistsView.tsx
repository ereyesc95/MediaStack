import type { PlaylistTrack, UserPlaylist } from "../../types";

type Props = {
  playlists: UserPlaylist[];
  selectedId: number | null;
  tracks: PlaylistTrack[];
  onOpen: (id: number) => void;
  onBack: () => void;
  onPlay: (path: string, title: string) => void;
};

export default function PlaylistsView({
  playlists,
  selectedId,
  tracks,
  onOpen,
  onBack,
  onPlay,
}: Props) {
  if (selectedId != null) {
    return (
      <div className="playlist-detail">
        <button type="button" className="btn" onClick={onBack}>
          ← Playlists
        </button>
        <ul className="playlist-tracks">
          {tracks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPlay(t.path, t.title)}
              >
                {t.title} — {t.artist}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="playlist-grid">
      {playlists.map((p) => (
        <button
          key={p.id}
          type="button"
          className="playlist-card"
          onClick={() => onOpen(p.id)}
        >
          <span
            className="playlist-card-bg card-bg-layer"
            style={{
              backgroundImage: p.cover_url
                ? `url("${p.cover_url}")`
                : "linear-gradient(145deg, #252a38, #3d4660)",
            }}
          />
          <span className="playlist-card-dim" />
          <span className="playlist-card-label">{p.name}</span>
          <span className="playlist-card-meta">{p.track_count} tracks</span>
        </button>
      ))}
    </div>
  );
}
