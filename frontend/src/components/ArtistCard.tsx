import type { ArtistCard as ArtistCardType, CardOrientation } from "../types";

type Props = {
  artist: ArtistCardType;
  orientation: CardOrientation;
  onClick: () => void;
  tapReveal?: boolean;
  revealed?: boolean;
  /** When true, show release year under the title/logo on hover (universe cards). */
  showDateOnHover?: boolean;
};

function yearFromArtist(artist: ArtistCardType): string | null {
  if (artist.era_year != null && artist.era_year > 0) {
    return String(artist.era_year);
  }
  const iso = artist.starting_dates?.trim();
  if (iso && /^\d{4}/.test(iso)) return iso.slice(0, 4);
  return null;
}

export default function ArtistCard({
  artist,
  orientation,
  onClick,
  tapReveal = false,
  revealed = false,
  showDateOnHover = false,
}: Props) {
  const preferCollapsed = orientation === "banner";
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
  const year = showDateOnHover ? yearFromArtist(artist) : null;

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
        year ? "artist-card--with-date" : "",
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
        {year ? <span className="artist-card-date">{year}</span> : null}
      </span>
    </button>
  );
}
