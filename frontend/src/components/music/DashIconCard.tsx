import type { ArtistCard as ArtistCardType } from "../../types";

type Props = {
  artist: ArtistCardType;
  onClick: () => void;
  /** Prefer square/portrait icon art on phone portrait; landscape photo otherwise. */
  preferPortrait?: boolean;
};

export default function DashIconCard({
  artist,
  onClick,
  preferPortrait = false,
}: Props) {
  const coverUrl = preferPortrait
    ? artist.icon_url || artist.photo_url
    : artist.photo_url || artist.icon_url;
  const bg = coverUrl
    ? `url("${coverUrl}")`
    : "linear-gradient(135deg, #1a1f2e, #2d3548)";
  const name = (artist.name ?? "Untitled")
    .replace(/■/g, ",")
    .replace(/█/g, "'");

  return (
    <button type="button" className="dash-icon-item" onClick={onClick}>
      <span className="dash-icon-item-cover">
        <span className="card-bg-layer" style={{ backgroundImage: bg }} />
      </span>
      <span className="dash-item-label dash-icon-item-name" title={name}>
        {name}
      </span>
    </button>
  );
}
