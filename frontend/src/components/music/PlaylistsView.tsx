import type { UserPlaylist } from "../../types";

type Props = {
  playlists: UserPlaylist[];
  onOpen: (id: number) => void;
};

export default function PlaylistsView({ playlists, onOpen }: Props) {
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
