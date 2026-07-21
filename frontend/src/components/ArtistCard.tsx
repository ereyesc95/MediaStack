import type { ArtistCard as ArtistCardType, CardOrientation } from "../types";
import { useDeviceLayout, isMobilePortraitLayout } from "../usePhoneLayout";

type Props = {
  artist: ArtistCardType;
  orientation: CardOrientation;
  onClick: () => void;
  tapReveal?: boolean;
  revealed?: boolean;
};

export default function ArtistCard({
  artist,
  orientation,
  onClick,
  tapReveal = false,
  revealed = false,
}: Props) {
  const layout = useDeviceLayout();
  const preferCollapsed =
    orientation === "banner" && !isMobilePortraitLayout(layout);
  const logoSrc =
    preferCollapsed && artist.logo_collapsed_url
      ? artist.logo_collapsed_url
      : artist.logo_url;

  const isIcons = orientation === "icons";
  const hasPhoto = Boolean(artist.photo_url) && !isIcons;
  const bg = hasPhoto
    ? `url("${artist.photo_url}")`
    : isIcons
      ? "none"
      : "linear-gradient(135deg, #1a1f2e, #2d3548)";

  const hasIcon = Boolean(artist.icon_url);
  const hasLogo = Boolean(logoSrc);
  const showName = !hasIcon && !hasLogo;

  const displayName = (artist.name ?? "Untitled")
    .replace(/■/g, ",")
    .replace(/█/g, "'");

  return (
    <button
      type="button"
      className={[
        "artist-card",
        "media-beat-frame",
        "media-beat-frame--card",
        `artist-card--${orientation}`,
        tapReveal ? "artist-card--tap-reveal" : "",
        revealed ? "artist-card--revealed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      <span className="artist-card-bg card-bg-layer" style={{ backgroundImage: bg }} />
      <span className="artist-card-dim" />
      <span className="artist-card-footer">
        {hasIcon && (
          <img src={artist.icon_url!} alt="" className="artist-card-icon" />
        )}
        {hasLogo && (
          <img src={logoSrc!} alt="" className="artist-card-logo" />
        )}
        {showName && (
          <span className="artist-card-name">{displayName}</span>
        )}
      </span>
    </button>
  );
}
