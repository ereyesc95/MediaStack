import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCachedArtistMediaTab,
  prefetchArtistMediaTab,
} from "../../../artistMediaTabCache";
import { prefetchMediaItemOverview } from "../../../mediaItemOverviewCache";
import { formatTrackDate } from "../../../formatDate";
import { usePhoneLayout, useDeviceLayout, isMobilePortraitLayout } from "../../../usePhoneLayout";
import { DEFAULT_DISC_URL } from "../release/releaseTrackPanelMeta";
import type {
  MediaTabCategory,
  MediaTabIndexPayload,
  MediaTabItem,
  ReleaseCardLayout,
} from "../../../types";

type Props = {
  bandId: number;
  kind: "video" | "library";
  cardLayout?: ReleaseCardLayout;
  artistName?: string;
  onOpenItem?: (itemId: string) => void;
};

export function useArtistMediaTab(bandId: number, kind: "video" | "library", enabled: boolean) {
  const [data, setData] = useState<MediaTabIndexPayload | null>(
    () => getCachedArtistMediaTab(bandId, kind)
  );
  const [loading, setLoading] = useState(
    () => enabled && !getCachedArtistMediaTab(bandId, kind)
  );
  const [error, setError] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState(
    () => getCachedArtistMediaTab(bandId, kind)?.categories[0]?.key ?? ""
  );

  const load = useCallback(
    async (force = false) => {
    const cached = !force ? getCachedArtistMediaTab(bandId, kind) : null;
    if (cached) {
      setData(cached);
      setCategoryKey(cached.categories[0]?.key ?? "");
      setLoading(false);
      setError(null);
      prefetchArtistMediaTab(bandId, kind, { force: true })
        .then((payload) => {
          setData(payload);
          setCategoryKey((prev) => prev || payload.categories[0]?.key || "");
        })
        .catch(() => {});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await prefetchArtistMediaTab(bandId, kind, { force: true });
      setData(payload);
      setCategoryKey(payload.categories[0]?.key ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  },
    [bandId, kind]
  );

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    void load();
  }, [enabled, load]);

  const category: MediaTabCategory | null = useMemo(
    () => data?.categories.find((c) => c.key === categoryKey) ?? data?.categories[0] ?? null,
    [data, categoryKey]
  );

  return { data, loading, error, categoryKey, setCategoryKey, category, categories: data?.categories ?? [] };
}

function MediaItemCard({
  item,
  cardLayout,
  artistName,
  opening,
  tapReveal,
  revealed,
  onReveal,
  onOpen,
}: {
  item: MediaTabItem;
  cardLayout: ReleaseCardLayout;
  artistName?: string;
  opening: boolean;
  tapReveal: boolean;
  revealed: boolean;
  onReveal: () => void;
  onOpen: () => void;
}) {
  const deviceLayout = useDeviceLayout();
  const preferCollapsed = !isMobilePortraitLayout(deviceLayout);
  const hoverDate = item.display_date || formatTrackDate(item.date_iso) || null;
  const fullDate = formatTrackDate(item.date_iso) || item.display_date || null;
  const coverUrl = item.cover_url || DEFAULT_DISC_URL;
  const eraLogoSrc =
    preferCollapsed && item.era_logo_collapsed_url
      ? item.era_logo_collapsed_url
      : item.era_logo_url;

  const handleActivate = () => {
    if (tapReveal && !revealed) {
      onReveal();
      return;
    }
    onOpen();
  };

  if (cardLayout === "banner") {
    const bannerBg = item.banner_url
      ? `url("${item.banner_url}")`
      : "linear-gradient(135deg, #1a1f2e, #2d3548)";
    return (
      <article
        className={[
          "media-release-card",
          "media-release-card--banner",
          "media-release-card--banner-cover-portrait",
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
        aria-busy={opening}
        onClick={handleActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleActivate();
          }
        }}
        title={item.title}
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
            <span className="media-release-card__banner-title">{item.title}</span>
            {(item.era_icon_url || eraLogoSrc) ? (
              <span className="media-release-card__banner-artist-brand">
                {item.era_icon_url ? (
                  <img
                    src={item.era_icon_url}
                    alt=""
                    className="media-release-card__banner-era-icon"
                    draggable={false}
                  />
                ) : null}
                {eraLogoSrc ? (
                  <img
                    src={eraLogoSrc}
                    alt=""
                    className="media-release-card__banner-era-logo"
                    draggable={false}
                  />
                ) : null}
              </span>
            ) : artistName ? (
              <span className="media-release-card__banner-artist">{artistName}</span>
            ) : null}
            {fullDate ? (
              <span className="media-release-card__banner-date">{fullDate}</span>
            ) : null}
          </span>
        </span>
      </article>
    );
  }

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
      aria-busy={opening}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
      title={item.title}
    >
      <span
        className="media-release-card__cover"
        style={
          item.cover_url
            ? { backgroundImage: `url("${item.cover_url}")` }
            : undefined
        }
      />
      <span className="media-release-card__dim" aria-hidden />
      <span className="media-release-card__hover">
        <span className="media-release-card__title-hover">{item.title}</span>
      </span>
      {hoverDate ? (
        <span className="media-release-card__date">
          <span className="media-release-card__date-label">{hoverDate}</span>
        </span>
      ) : null}
    </article>
  );
}

export default function ArtistMediaGrid({
  bandId,
  kind,
  cardLayout = "cover",
  artistName,
  onOpenItem,
}: Props) {
  const { data, loading, error, category, categories, categoryKey, setCategoryKey } =
    useArtistMediaTab(bandId, kind, true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const isPhone = usePhoneLayout();
  const [revealedId, setRevealedId] = useState<string | null>(null);

  useEffect(() => {
    setRevealedId(null);
  }, [categoryKey, cardLayout, bandId, kind]);

  useEffect(() => {
    if (!isPhone || revealedId == null) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".media-release-card--tap-reveal")) return;
      setRevealedId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [isPhone, revealedId]);

  const handleOpen = useCallback(
    async (itemId: string) => {
      if (openingId) return;
      setOpeningId(itemId);
      try {
        const overview = await prefetchMediaItemOverview(bandId, kind, itemId, {
          force: true,
        });
        if (overview.open_url) {
          window.open(overview.open_url, "_blank", "noopener,noreferrer");
          return;
        }
        onOpenItem?.(itemId);
      } catch {
        onOpenItem?.(itemId);
      } finally {
        setOpeningId(null);
      }
    },
    [bandId, kind, onOpenItem, openingId]
  );

  if (loading && !data) {
    return <p className="muted artist-section-empty">Loading…</p>;
  }
  if (error) {
    return <p className="error artist-section-empty">{error}</p>;
  }
  if (!categories.length) {
    return (
      <p className="muted artist-section-empty">
        No {kind === "video" ? "video" : "library"} folders found.
      </p>
    );
  }

  return (
    <div className="artist-media-grid">
      {categories.length > 1 && (
        <nav className="artist-page__subtabs artist-media-grid__tabs">
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              className={categoryKey === c.key ? "active" : ""}
              onClick={() => setCategoryKey(c.key)}
            >
              <span>{c.label.toUpperCase()}</span>
            </button>
          ))}
        </nav>
      )}
      <div
        className={`media-release-grid artist-media-grid__cards${
          cardLayout === "banner" ? " media-release-grid--banner" : ""
        }`}
      >
        {(category?.items ?? []).map((item) => (
          <MediaItemCard
            key={item.id}
            item={item}
            cardLayout={cardLayout}
            artistName={artistName}
            opening={openingId === item.id}
            tapReveal={isPhone}
            revealed={isPhone && revealedId === item.id}
            onReveal={() => setRevealedId(item.id)}
            onOpen={() => void handleOpen(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
