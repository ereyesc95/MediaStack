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

/** Pick cover URL by orientation (Series catalog parity — no refetch). */
export function pickArtistCoverUrl(
  artist: ArtistCardType,
  orientation: CardOrientation
): string | null {
  if (orientation === "icons" || orientation === "list") return null;
  if (orientation === "portrait") {
    return (
      artist.portrait_url ||
      artist.square_url ||
      artist.photo_url ||
      artist.landscape_url ||
      artist.banner_url ||
      null
    );
  }
  if (orientation === "banner") {
    return (
      artist.banner_url ||
      artist.landscape_url ||
      artist.portrait_url ||
      artist.photo_url ||
      null
    );
  }
  if (orientation === "round") {
    return (
      artist.square_url ||
      artist.portrait_url ||
      artist.photo_url ||
      artist.landscape_url ||
      null
    );
  }
  return (
    artist.landscape_url ||
    artist.photo_url ||
    artist.banner_url ||
    artist.portrait_url ||
    null
  );
}

export default function ArtistCard({
  artist,
  orientation,
  onClick,
  tapReveal = false,
  revealed = false,
  showDateOnHover = false,
}: Props) {
  const displayName = (artist.name ?? "Untitled")
    .replace(/■/g, ",")
    .replace(/█/g, "'");

  if (orientation === "list") {
    return (
      <button
        type="button"
        className={[
          "artist-card",
          "artist-card--list",
          "catalog-list-cell",
          tapReveal ? "artist-card--tap-reveal" : "",
          revealed ? "artist-card--revealed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={onClick}
      >
        <span className="catalog-list-cell__title">{displayName}</span>
      </button>
    );
  }

  const preferCollapsed = orientation === "banner";
  const logoSrc =
    preferCollapsed && artist.logo_collapsed_url
      ? artist.logo_collapsed_url
      : artist.logo_url;

  const isIcons = orientation === "icons";
  const isRound = orientation === "round";
  const coverUrl = pickArtistCoverUrl(artist, orientation);
  const hasPhoto = Boolean(coverUrl) && !isIcons;
  const placeholderUrl =
    orientation === "portrait" || isRound
      ? "/api/assets/default/placeholder-portrait"
      : "/api/assets/default/placeholder-landscape";
  const bg = hasPhoto
    ? `url("${coverUrl}")`
    : isIcons
      ? "none"
      : `url("${placeholderUrl}")`;

  const hasIcon = Boolean(artist.icon_url);
  const hasLogo = Boolean(logoSrc);
  const showName = !hasIcon && !hasLogo;
  const year = showDateOnHover ? yearFromArtist(artist) : null;

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
