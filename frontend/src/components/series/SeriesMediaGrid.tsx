import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type { ReleaseCardLayout } from "../../types";
import { usePhoneLayout } from "../../usePhoneLayout";
import { ChevronIcon } from "../music/release/releaseTrackPanelMeta";

export type SeriesMediaCard = {
  id: string;
  title: string;
  cover_url?: string | null;
  banner_url?: string | null;
  logo_url?: string | null;
  meta?: string;
  date_label?: string | null;
  date_iso?: string | null;
  display_date?: string | null;
  path?: string;
  platform?: string | null;
  open_url?: string | null;
  open_mode?: "tab" | "local" | null;
  open_label?: string | null;
  navigate_band_id?: number | null;
  navigate_release_id?: string | null;
  category?: string | null;
  duration?: string | null;
  duration_sec?: number | null;
};

type Props = {
  items: SeriesMediaCard[];
  loading?: boolean;
  emptyMessage?: string;
  onOpen?: (item: SeriesMediaCard) => void;
  cardLayout?: ReleaseCardLayout;
  /** Force square cover cards (audio releases). */
  squareCovers?: boolean;
  /** Banner left-cover aspect: square (audio) or portrait 2/3 (movies/library/games). */
  coverAspect?: "square" | "portrait";
};

function openInTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

async function openLocal(url: string) {
  try {
    await fetch(url, { method: "POST" });
  } catch {
    /* ignore */
  }
}

function SeriesMediaCardView({
  item,
  cardLayout,
  coverAspect,
  onOpen,
  tapReveal,
  revealed,
  onReveal,
}: {
  item: SeriesMediaCard;
  cardLayout: ReleaseCardLayout;
  coverAspect: "square" | "portrait";
  onOpen?: (item: SeriesMediaCard) => void;
  tapReveal: boolean;
  revealed: boolean;
  onReveal: () => void;
}) {
  const cover = item.cover_url || null;
  const bannerBg = item.banner_url || item.cover_url || null;
  const dateLabel = item.date_label || item.meta || "";
  const openLabel = item.open_label || null;
  const openUrl = item.open_url?.trim() || null;
  // Phone tap-reveal needs a click target even when there is no navigation handler.
  const interactive = Boolean(onOpen) || tapReveal;

  const handleOpenFile = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!openUrl) return;
    if (item.open_mode === "local") {
      void openLocal(openUrl);
    } else {
      openInTab(openUrl);
    }
  };

  const handleClick = () => {
    if (tapReveal && !revealed) {
      onReveal();
      return;
    }
    onOpen?.(item);
  };

  const openFileControl =
    openUrl && openLabel ? (
      <button
        type="button"
        className="media-release-card__open-file"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={handleOpenFile}
      >
        <span className="media-release-card__open-file-label">{openLabel}</span>
        <ChevronIcon direction="right" />
      </button>
    ) : null;

  if (cardLayout === "banner") {
    const hasBannerCover = Boolean(cover);
    const bannerClass = [
      "media-release-card",
      "media-release-card--banner",
      hasBannerCover ? "" : "media-release-card--banner-no-cover",
      hasBannerCover && coverAspect === "portrait"
        ? "media-release-card--banner-cover-portrait"
        : "",
      "media-beat-frame",
      "media-beat-frame--cover",
      interactive
        ? "media-release-card--clickable media-release-card--button"
        : "",
      tapReveal ? "media-release-card--tap-reveal" : "",
      tapReveal && revealed ? "media-release-card--revealed" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const bannerInner = (
      <>
        <span
          className="media-release-card__banner-bg"
          style={
            bannerBg
              ? { backgroundImage: `url("${bannerBg}")` }
              : {
                  backgroundImage:
                    "linear-gradient(135deg, #1a1512 0%, #2a221c 55%, #1a1512 100%)",
                }
          }
        />
        <span className="media-release-card__banner-overlay">
          <span className="media-release-card__banner-glass" aria-hidden />
          {hasBannerCover ? (
            <span
              className="media-release-card__banner-cover"
              style={{ backgroundImage: `url("${cover}")` }}
            />
          ) : null}
          <span className="media-release-card__banner-meta">
            {item.logo_url ? (
              <img
                className="media-release-card__banner-logo media-release-card__logo"
                src={item.logo_url}
                alt=""
              />
            ) : (
              <span className="media-release-card__banner-title media-release-card__banner-title--compact">
                {item.title}
              </span>
            )}
            {openFileControl || dateLabel ? (
              <span className="media-release-card__banner-date-row">
                {openFileControl}
                {dateLabel ? (
                  <span className="media-release-card__banner-date">
                    {dateLabel}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        </span>
      </>
    );
    if (interactive) {
      return (
        <button
          type="button"
          className={bannerClass}
          onClick={handleClick}
          title={item.title}
        >
          {bannerInner}
        </button>
      );
    }
    return (
      <article className={bannerClass} title={item.title}>
        {bannerInner}
      </article>
    );
  }

  const className = [
    "media-release-card",
    "media-release-card--portrait",
    "series-media-card--portrait",
    interactive
      ? "media-release-card--clickable media-release-card--button"
      : "",
    tapReveal ? "media-release-card--tap-reveal" : "",
    tapReveal && revealed ? "media-release-card--revealed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const inner = (
    <>
      <span
        className="media-release-card__cover"
        style={
          cover
            ? { backgroundImage: `url("${cover}")` }
            : {
                backgroundImage:
                  "linear-gradient(160deg, #1a1512 0%, #2c241e 50%, #14110f 100%)",
              }
        }
      />
      <span className="media-release-card__dim" aria-hidden />
      <span className="media-release-card__hover">
        {item.logo_url ? (
          <img
            className="media-release-card__logo"
            src={item.logo_url}
            alt=""
          />
        ) : (
          <span className="media-release-card__title-hover">{item.title}</span>
        )}
      </span>
      {openFileControl || dateLabel ? (
        <span className="media-release-card__date">
          {openFileControl}
          {dateLabel ? (
            <span className="media-release-card__date-label">{dateLabel}</span>
          ) : null}
        </span>
      ) : null}
    </>
  );
  if (interactive) {
    return (
      <button
        type="button"
        className={className}
        onClick={handleClick}
        title={item.title}
      >
        {inner}
      </button>
    );
  }
  return (
    <article className={className} title={item.title}>
      {inner}
    </article>
  );
}

export default function SeriesMediaGrid({
  items,
  loading,
  emptyMessage = "Nothing here yet.",
  onOpen,
  cardLayout = "cover",
  squareCovers = false,
  coverAspect = "square",
}: Props) {
  const isPhone = usePhoneLayout();
  const tapReveal = isPhone;
  const [revealedId, setRevealedId] = useState<string | null>(null);

  useEffect(() => {
    setRevealedId(null);
  }, [items, cardLayout]);

  useEffect(() => {
    if (!tapReveal || revealedId == null) return;
    const onDoc = (e: Event) => {
      const target = e.target as Node | null;
      if (!target) return;
      const el = target instanceof Element ? target : null;
      if (el?.closest?.(".media-release-card--revealed")) return;
      setRevealedId(null);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [tapReveal, revealedId]);

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
        isBanner
          ? " media-release-grid--banner"
          : squareCovers
            ? " series-media-grid--square"
            : " series-media-grid--portrait"
      }`}
    >
      {items.map((item) => (
        <SeriesMediaCardView
          key={item.id}
          item={item}
          cardLayout={cardLayout}
          coverAspect={coverAspect}
          onOpen={onOpen}
          tapReveal={tapReveal}
          revealed={tapReveal && revealedId === item.id}
          onReveal={() => setRevealedId(item.id)}
        />
      ))}
    </div>
  );
}

export const SERIES_AUDIO_CATEGORY_META: {
  key: string;
  label: string;
}[] = [
  { key: "albums", label: "Albums" },
  { key: "extended_plays", label: "EPs" },
  { key: "compilations", label: "Compilations" },
  { key: "soundtracks", label: "Soundtracks" },
  { key: "live_albums", label: "Live" },
  { key: "singles", label: "Singles" },
  { key: "playlists", label: "Playlists" },
];

export function useSeriesAudioCategories(items: SeriesMediaCard[]) {
  const present = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.category) set.add(it.category);
    }
    return SERIES_AUDIO_CATEGORY_META.filter((c) => set.has(c.key));
  }, [items]);
  const [categoryKey, setCategoryKey] = useState<string>("all");
  useEffect(() => {
    if (categoryKey !== "all" && !present.some((c) => c.key === categoryKey)) {
      setCategoryKey("all");
    }
  }, [present, categoryKey]);
  const filtered =
    categoryKey === "all"
      ? items
      : items.filter((it) => it.category === categoryKey);
  return { present, categoryKey, setCategoryKey, filtered };
}
