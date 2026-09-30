import { useCallback, useEffect, useState } from "react";
import { fetchBandTours } from "../../../api";
import { formatTrackDate } from "../../../formatDate";
import type { ReleaseCardLayout, TourCard } from "../../../types";
import { usePhoneLayout } from "../../../usePhoneLayout";
import BillboardText from "../../BillboardText";
import PlaylistBoot from "../../PlaylistBoot";

type Props = {
  bandId: number;
  cardLayout?: ReleaseCardLayout;
  artistName?: string;
  refreshKey?: number;
  onOpenTour: (tour: TourCard) => void;
};

function TourCardView({
  tour,
  cardLayout,
  artistName,
  onOpen,
}: {
  tour: TourCard;
  cardLayout: ReleaseCardLayout;
  artistName?: string;
  onOpen: () => void;
}) {
  const isPhone = usePhoneLayout();
  const [revealed, setRevealed] = useState(false);
  const tapReveal = isPhone;
  const dateLabel = formatTrackDate(tour.date_iso);
  const supportLabel = tour.is_support
    ? `By ${tour.main_artist_name || "main artist"}`
    : null;
  const coverUrl = tour.poster_url;
  const bannerUrl = tour.banner_url || tour.poster_url;
  const title = tour.title;

  const handleActivate = () => {
    if (tapReveal && !revealed) {
      setRevealed(true);
      return;
    }
    onOpen();
  };

  if (cardLayout === "banner") {
    const bannerBg = bannerUrl
      ? `url(${JSON.stringify(bannerUrl)})`
      : undefined;
    return (
      <article
        className={[
          "media-release-card",
          "media-release-card--banner",
          "media-release-card--clickable",
          "media-beat-frame",
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
        title={title}
      >
        <span
          className="media-release-card__banner-bg"
          style={bannerUrl ? undefined : { backgroundImage: bannerBg }}
        >
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt=""
              className="media-release-card__banner-bg-img"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ) : null}
        </span>
        <span className="media-release-card__banner-overlay">
          <span className="media-release-card__banner-glass" aria-hidden />
          <span className="media-release-card__banner-cover">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                className="media-release-card__banner-cover-img"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            ) : null}
          </span>
          <span className="media-release-card__banner-meta">
            <span className="media-release-card__banner-title">{title}</span>
            {tour.logo_url ? (
              <span className="media-release-card__banner-artist-brand">
                <img
                  src={tour.logo_url}
                  alt=""
                  className="media-release-card__banner-era-logo"
                  draggable={false}
                />
              </span>
            ) : artistName ? (
              <span className="media-release-card__banner-artist">{artistName}</span>
            ) : null}
            {dateLabel || supportLabel ? (
              <span className="media-release-card__banner-date-row">
                {supportLabel ? (
                  <span className="media-release-card__source-artist">
                    {supportLabel}
                  </span>
                ) : null}
                {dateLabel ? (
                  <span className="media-release-card__banner-date">
                    {dateLabel}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        </span>
      </article>
    );
  }

  const hoverLabel = tour.logo_url ? (
    <img
      src={tour.logo_url}
      alt=""
      className="media-release-card__logo"
      draggable={false}
    />
  ) : (
    <span className="media-release-card__title-hover">
      <BillboardText short={title} full={title} maxLines={3} />
    </span>
  );

  return (
    <article
      className={[
        "media-release-card",
        "media-release-card--portrait",
        "media-release-card--clickable",
        "media-beat-frame",
        "media-beat-frame--cover",
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
      title={title}
    >
      <span className="media-release-card__cover">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="media-release-card__cover-img"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : null}
      </span>
      <span className="media-release-card__dim" aria-hidden />
      <span className="media-release-card__hover">{hoverLabel}</span>
      {dateLabel || supportLabel ? (
        <span className="media-release-card__date">
          {supportLabel ? (
            <span className="media-release-card__source-artist">
              {supportLabel}
            </span>
          ) : null}
          {dateLabel ? (
            <span className="media-release-card__date-label">{dateLabel}</span>
          ) : null}
        </span>
      ) : null}
    </article>
  );
}

export default function ArtistTours({
  bandId,
  cardLayout = "cover",
  artistName,
  refreshKey = 0,
  onOpenTour,
}: Props) {
  const [tours, setTours] = useState<TourCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBandTours(bandId, true);
      setTours(data.tours || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tours");
      setTours([]);
    } finally {
      setLoading(false);
    }
  }, [bandId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading && !tours) {
    return <PlaylistBoot className="playlist-boot--compact" label="Loading…" />;
  }
  if (error) {
    return <p className="error artist-section-empty">{error}</p>;
  }
  if (!tours?.length) {
    return <p className="muted artist-section-empty">No tours found.</p>;
  }

  return (
    <div
      className={[
        "media-release-grid",
        "artist-media-grid",
        "events-browse__grid",
        cardLayout === "banner" ? "media-release-grid--banner" : "",
        cardLayout === "list" ? "media-release-grid--list" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {tours.map((tour) => (
        <TourCardView
          key={tour.id}
          tour={tour}
          cardLayout={cardLayout}
          artistName={artistName}
          onOpen={() => onOpenTour(tour)}
        />
      ))}
    </div>
  );
}
