import { useEffect, useMemo, useState } from "react";
import { DEFAULT_DISC_URL } from "../music/release/releaseTrackPanelMeta";
import type { ReleaseCardLayout } from "../../types";

export type SeriesMediaCard = {
  id: string;
  title: string;
  cover_url?: string | null;
  banner_url?: string | null;
  meta?: string;
  date_label?: string | null;
  path?: string;
  platform?: string | null;
};

type Props = {
  items: SeriesMediaCard[];
  loading?: boolean;
  emptyMessage?: string;
  onOpen?: (item: SeriesMediaCard) => void;
  cardLayout?: ReleaseCardLayout;
};

export default function SeriesMediaGrid({
  items,
  loading,
  emptyMessage = "Nothing here yet.",
  onOpen,
  cardLayout = "cover",
}: Props) {
  if (loading) {
    return <p className="muted artist-section-empty">Loading…</p>;
  }
  if (!items.length) {
    return <p className="muted artist-section-empty">{emptyMessage}</p>;
  }

  const isBanner = cardLayout === "banner";

  return (
    <div
      className={`media-release-grid series-media-grid${
        isBanner ? " media-release-grid--banner" : ""
      }`}
    >
      {items.map((item) => {
        const cover = item.cover_url || DEFAULT_DISC_URL;
        const bannerBg = item.banner_url
          ? `url("${item.banner_url}")`
          : item.cover_url
            ? `url("${item.cover_url}")`
            : "linear-gradient(135deg, #1a1f2e, #2d3548)";
        const dateLabel = item.date_label || item.meta || "";

        if (isBanner) {
          const bannerClass =
            "media-release-card media-release-card--banner media-beat-frame media-beat-frame--cover" +
            (onOpen
              ? " media-release-card--clickable media-release-card--button"
              : "");
          const bannerInner = (
            <>
              <span
                className="media-release-card__banner-bg"
                style={{ backgroundImage: bannerBg }}
              />
              <span className="media-release-card__banner-overlay">
                <span className="media-release-card__banner-glass" aria-hidden />
                <span
                  className="media-release-card__banner-cover"
                  style={{ backgroundImage: `url("${cover}")` }}
                />
                <span className="media-release-card__banner-meta">
                  <span className="media-release-card__banner-title">
                    {item.title}
                  </span>
                  {dateLabel ? (
                    <span className="media-release-card__banner-date">
                      {dateLabel}
                    </span>
                  ) : null}
                </span>
              </span>
            </>
          );
          if (onOpen) {
            return (
              <button
                key={item.id}
                type="button"
                className={bannerClass}
                onClick={() => onOpen(item)}
                title={item.title}
              >
                {bannerInner}
              </button>
            );
          }
          return (
            <article key={item.id} className={bannerClass} title={item.title}>
              {bannerInner}
            </article>
          );
        }

        const className =
          "media-release-card media-release-card--portrait" +
          (onOpen
            ? " media-release-card--clickable media-release-card--button"
            : "");
        const inner = (
          <>
            <span
              className="media-release-card__cover"
              style={{ backgroundImage: `url("${cover}")` }}
            />
            <span className="media-release-card__dim" aria-hidden />
            <span className="media-release-card__hover">
              <span className="media-release-card__title-hover">{item.title}</span>
            </span>
            <span className="media-release-card__date">
              <span className="media-release-card__date-label">{dateLabel}</span>
            </span>
          </>
        );
        if (onOpen) {
          return (
            <button
              key={item.id}
              type="button"
              className={className}
              onClick={() => onOpen(item)}
              title={item.title}
            >
              {inner}
            </button>
          );
        }
        return (
          <article key={item.id} className={className} title={item.title}>
            {inner}
          </article>
        );
      })}
    </div>
  );
}
