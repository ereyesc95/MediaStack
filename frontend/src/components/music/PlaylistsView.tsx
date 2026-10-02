import type { UserPlaylist } from "../../types";

export type SystemPlaylistCard = {
  slug: string;
  name: string;
  cover_url?: string | null;
  track_count?: number | null;
};

type Props = {
  playlists: UserPlaylist[];
  systemPlaylists?: SystemPlaylistCard[];
  onOpen: (id: number) => void;
  onOpenSystem?: (slug: string) => void;
};

export default function PlaylistsView({
  playlists,
  systemPlaylists = [],
  onOpen,
  onOpenSystem,
}: Props) {
  return (
    <div className="playlist-grid">
      {systemPlaylists.map((p) => (
        <button
          key={`system-${p.slug}`}
          type="button"
          className="playlist-card playlist-card--system"
          onClick={() => onOpenSystem?.(p.slug)}
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
          <span className="playlist-card-label">
            {p.slug === "live-shows" ? "Live Shows" : p.name}
          </span>
          <span className="playlist-card-meta">
            {p.track_count != null ? `${p.track_count} tracks` : "System"}
          </span>
        </button>
      ))}
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
