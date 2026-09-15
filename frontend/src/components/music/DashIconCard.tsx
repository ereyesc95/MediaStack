import type { ArtistCard as ArtistCardType } from "../../types";
import { DashHoverTitle } from "../DashHoverTitle";
import type { MouseEvent } from "react";

type Props = {
  artist: ArtistCardType;
  onClick: (e: MouseEvent<HTMLElement>) => void;
  /** Prefer portrait artist photo on phone portrait; landscape photo otherwise. */
  preferPortrait?: boolean;
  revealed?: boolean;
};

export default function DashIconCard({
  artist,
  onClick,
  preferPortrait = false,
  revealed = false,
}: Props) {
  // Home ICONS / Round: Photo only — never branding icons or Cover art.
  const coverUrl = preferPortrait
    ? artist.portrait_url || artist.photo_url
    : artist.photo_url || artist.portrait_url;
  const name = (artist.name ?? "Untitled")
    .replace(/■/g, ",")
    .replace(/█/g, "'");

  return (
    <button
      type="button"
      data-dash-card={`artist-${artist.id}`}
      className={`dash-icon-item${revealed ? " is-revealed" : ""}`}
      onClick={onClick}
    >
      <span
        className={`dash-icon-item-cover${coverUrl ? "" : " dash-icon-item-cover--empty"}`}
      >
        {coverUrl ? (
          <span
            className="card-bg-layer"
            style={{ backgroundImage: `url("${coverUrl}")` }}
          />
        ) : null}
        <DashHoverTitle title={name} revealed={revealed} />
      </span>
    </button>
  );
}
