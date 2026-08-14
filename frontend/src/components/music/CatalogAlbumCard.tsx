import { usePhoneLayout } from "../../usePhoneLayout";
import { DEFAULT_DISC_URL } from "./release/releaseTrackPanelMeta";
import type { AlbumCard, ReleaseCardLayout } from "../../types";

type Props = {
  album: AlbumCard;
  cardLayout: ReleaseCardLayout;
  tapReveal?: boolean;
  revealed?: boolean;
  onReveal?: () => void;
  onOpen: (album: AlbumCard) => void;
};

export default function CatalogAlbumCard({
  album,
  cardLayout,
  tapReveal = false,
  revealed = false,
  onReveal,
  onOpen,
}: Props) {
  const isPhone = usePhoneLayout();
  const coverUrl = album.cover_url || DEFAULT_DISC_URL;

  const handleActivate = () => {
    if (tapReveal && !revealed) {
      onReveal?.();
      return;
    }
    onOpen(album);
  };

  if (cardLayout === "banner") {
    const bannerBg = album.banner_url
      ? `url("${album.banner_url}")`
      : "linear-gradient(135deg, #1a1f2e, #2d3548)";
    return (
      <article
        className={[
          "media-release-card",
          "media-release-card--banner",
          "media-release-card--clickable",
          tapReveal ? "media-release-card--tap-reveal" : "",
          revealed ? "media-release-card--revealed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="button"
        tabIndex={0}
        onClick={handleActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleActivate();
          }
        }}
      >
        <span
          className="media-release-card__banner-bg"
          style={{ backgroundImage: bannerBg }}
        />
        <span className="media-release-card__banner-overlay">
          <span className="media-release-card__banner-glass" aria-hidden />
          <span
            className="media-release-card__banner-cover"
            style={{ backgroundImage: `url("${coverUrl}")` }}
          />
          <span className="media-release-card__banner-meta">
            {album.logo_url ? (
              <img
                src={album.logo_url}
                alt=""
                className="media-release-card__banner-release-logo"
                draggable={false}
              />
            ) : (
              <span className="media-release-card__banner-title">
                {album.title}
              </span>
            )}
            {album.artist_name ? (
              <span className="media-release-card__banner-artist">
                {album.artist_name}
              </span>
            ) : null}
            {album.display_date ? (
              <span className="media-release-card__banner-date">
                {album.display_date}
              </span>
            ) : null}
          </span>
        </span>
      </article>
    );
  }

  const hoverLabel = album.logo_url ? (
    <img
      src={album.logo_url}
      alt=""
      className="media-release-card__logo"
      draggable={false}
    />
  ) : (
    <span className="media-release-card__title-hover">{album.title}</span>
  );

  return (
    <article
      className={[
        "media-release-card",
        "media-release-card--clickable",
        tapReveal ? "media-release-card--tap-reveal" : "",
        revealed ? "media-release-card--revealed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      <span
        className="media-release-card__cover"
        style={
          album.cover_url
            ? { backgroundImage: `url("${album.cover_url}")` }
            : undefined
        }
      />
      <span className="media-release-card__dim" aria-hidden />
      <span className="media-release-card__hover">{hoverLabel}</span>
      {album.display_date || album.artist_name ? (
        <span className="media-release-card__date">
          {album.artist_name && !isPhone ? (
            <span className="media-release-card__source-artist">
              {album.artist_name}
            </span>
          ) : null}
          {album.display_date ? (
            <span className="media-release-card__date-label">
              {album.display_date}
            </span>
          ) : null}
        </span>
      ) : null}
    </article>
  );
}
