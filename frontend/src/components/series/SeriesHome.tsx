import { useLayoutEffect, useRef, useState } from "react";
import type { SeriesDashboard } from "../../types";
import { EMPTY_SERIES_DASHBOARD } from "../../types";
import BillboardText from "../BillboardText";
import { DEFAULT_DISC_URL } from "../music/release/releaseTrackPanelMeta";

const PHONE_MAX_WIDTH = 900;
const PHONE_PORTRAIT_MAX_WIDTH = 480;
const TABLET_PORTRAIT_MAX_WIDTH = 1366;
const TABLET_LANDSCAPE_MAX_HEIGHT = 950;

function hasTouchScreen(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.maxTouchPoints > 0;
}

const DESKTOP_PANE_ITEMS = 10;
const TABLET_LANDSCAPE_ITEMS = 7;
const TABLET_PORTRAIT_ITEMS = 5;
const MOBILE_LANDSCAPE_ITEMS = 10;
const MOBILE_PORTRAIT_ITEMS = 10;

type DashLayout =
  | "desktop"
  | "tablet-landscape"
  | "tablet-portrait"
  | "mobile-landscape"
  | "mobile-portrait";

function resolveDashLayout(): DashLayout {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;
  const height = window.innerHeight;
  const landscape = window.matchMedia("(orientation: landscape)").matches;

  if (landscape) {
    if (width <= PHONE_MAX_WIDTH) return "mobile-landscape";
    if (
      hasTouchScreen() &&
      height <= TABLET_LANDSCAPE_MAX_HEIGHT &&
      width > PHONE_MAX_WIDTH
    ) {
      return "tablet-landscape";
    }
    return "desktop";
  }

  if (width <= PHONE_PORTRAIT_MAX_WIDTH) return "mobile-portrait";
  if (width <= TABLET_PORTRAIT_MAX_WIDTH) return "tablet-portrait";
  return "desktop";
}

function useDashboardLayout(): DashLayout {
  const [layout, setLayout] = useState(resolveDashLayout);
  useLayoutEffect(() => {
    const update = () => setLayout(resolveDashLayout());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return layout;
}

function paneItemLimit(layout: DashLayout) {
  switch (layout) {
    case "tablet-landscape":
      return TABLET_LANDSCAPE_ITEMS;
    case "tablet-portrait":
      return TABLET_PORTRAIT_ITEMS;
    case "mobile-portrait":
      return MOBILE_PORTRAIT_ITEMS;
    case "mobile-landscape":
      return MOBILE_LANDSCAPE_ITEMS;
    default:
      return DESKTOP_PANE_ITEMS;
  }
}

const DASH_LAYOUT_CLASS: Record<DashLayout, string> = {
  desktop: "",
  "tablet-landscape": " music-dashboard--tablet-landscape",
  "tablet-portrait": " music-dashboard--tablet-portrait",
  "mobile-landscape": " music-dashboard--mobile-landscape",
  "mobile-portrait": " music-dashboard--mobile-portrait",
};

function slicePane<T>(items: T[], limit: number) {
  return items.slice(0, limit);
}

function placeholderCount(itemCount: number, limit: number) {
  return Math.max(0, limit - itemCount);
}

type PlaceholderVariant = "square" | "landscape" | "circle" | "flag";

function DashPlaceholder({ variant }: { variant: PlaceholderVariant }) {
  if (variant === "landscape") {
    return (
      <div className="dash-icon-item dash-placeholder-item" aria-hidden>
        <span className="dash-icon-item-cover dash-placeholder dash-placeholder--landscape" />
        <span className="dash-placeholder-slot-line" aria-hidden />
      </div>
    );
  }
  return (
    <div className={`dash-placeholder-slot dash-placeholder-slot--${variant}`}>
      <div className={`dash-placeholder dash-placeholder--${variant}`} aria-hidden />
      {variant === "square" ? (
        <>
          <span className="dash-placeholder-slot-line" aria-hidden />
          <span className="dash-placeholder-slot-line dash-placeholder-slot-line--sub" aria-hidden />
        </>
      ) : (
        <span className="dash-placeholder-slot-line" aria-hidden />
      )}
    </div>
  );
}

function PlaceholderTiles({
  count,
  variant,
}: {
  count: number;
  variant: PlaceholderVariant;
}) {
  if (count <= 0) return null;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <DashPlaceholder key={i} variant={variant} />
      ))}
    </>
  );
}

function DashPaneLabel({
  logo,
  title,
  subtitle,
}: {
  logo: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="dash-row-label">
      <img src={logo} alt="" className="dash-pane-logo" />
      <div className="dash-row-label-text">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}

type Props = {
  data: SeriesDashboard | null;
  loading?: boolean;
  onOpenEpisode: (openUrl: string | null | undefined, path?: string | null) => void;
  onFranchise: (id: string) => void;
  onGenre?: (id: number | string) => void;
  onCountry?: (country: { id?: number; name: string }) => void;
};

export default function SeriesHome({
  data,
  loading,
  onOpenEpisode,
  onFranchise,
  onGenre,
  onCountry,
}: Props) {
  const dash = data ?? EMPTY_SERIES_DASHBOARD;
  const layout = useDashboardLayout();
  const paneLimit = paneItemLimit(layout);

  const topEpisodes = slicePane(dash.top_episodes, paneLimit);
  const topSeries = slicePane(dash.top_series, paneLimit);
  const topGenres = slicePane(dash.top_genres, paneLimit);
  const topCountries = slicePane(dash.top_countries, paneLimit);

  const episodePlaceholders = placeholderCount(topEpisodes.length, paneLimit);
  const seriesPlaceholders = placeholderCount(topSeries.length, paneLimit);
  const genrePlaceholders = placeholderCount(topGenres.length, paneLimit);
  const countryPlaceholders = placeholderCount(topCountries.length, paneLimit);

  const dashClass = DASH_LAYOUT_CLASS[layout];
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`music-dashboard series-dashboard${dashClass}`}>
      {loading ? <p className="muted dash-status">Updating…</p> : null}

      <section className="dash-row dash-row--tracks">
        <DashPaneLabel
          logo="/api/assets/icons/pane-on-repeat"
          title="ON REPEAT"
          subtitle="Most played episodes"
        />
        <div className="dash-scroll dash-scroll--tracks" ref={scrollRef}>
          {topEpisodes.map((t) => (
            <button
              key={t.id}
              type="button"
              className="dash-track"
              onClick={() => onOpenEpisode(t.open_url, t.path)}
            >
              <span className="dash-track-art">
                <span
                  className="dash-track-art-bg card-bg-layer"
                  style={{
                    backgroundImage: `url("${t.cover_url || DEFAULT_DISC_URL}")`,
                  }}
                />
              </span>
              <BillboardText
                className="dash-track-title"
                short={t.title ?? ""}
                full={t.title_full ?? t.title ?? ""}
              />
              <BillboardText
                className="dash-track-sub"
                short={t.franchise_name ?? ""}
                full={t.franchise_name ?? ""}
              />
            </button>
          ))}
          <PlaceholderTiles
            count={topEpisodes.length ? episodePlaceholders : paneLimit}
            variant="square"
          />
        </div>
      </section>

      <section className="dash-row dash-row--icons">
        <DashPaneLabel
          logo="/api/assets/icons/pane-icons"
          title="ICONS"
          subtitle="Your top series"
        />
        <div className="dash-scroll dash-scroll--icons">
          {topSeries.map((s) => {
            const cover = s.cover_url || s.photo_url || DEFAULT_DISC_URL;
            return (
              <button
                key={s.id}
                type="button"
                className="dash-icon-item"
                onClick={() => onFranchise(s.id)}
              >
                <span className="dash-icon-item-cover">
                  <span
                    className="card-bg-layer"
                    style={{ backgroundImage: `url("${cover}")` }}
                  />
                </span>
                <span className="dash-item-label dash-icon-item-name" title={s.name}>
                  {s.name}
                </span>
              </button>
            );
          })}
          <PlaceholderTiles
            count={topSeries.length ? seriesPlaceholders : paneLimit}
            variant="landscape"
          />
        </div>
      </section>

      <section className="dash-row dash-row--genres">
        <DashPaneLabel
          logo="/api/assets/icons/pane-vibes"
          title="SHOW VIBES"
          subtitle="Genres on rotation"
        />
        <div className="dash-scroll dash-scroll--genres">
          {topGenres.map((g) => (
            <button
              key={g.id ?? g.name}
              type="button"
              className="dash-genre"
              onClick={() => onGenre?.(g.id)}
            >
              <span className="dash-genre-ring">
                <span
                  className="dash-genre-ring-bg card-bg-layer"
                  style={
                    g.image_url
                      ? { backgroundImage: `url("${g.image_url}")` }
                      : undefined
                  }
                />
              </span>
              <span className="dash-item-label">{g.name}</span>
            </button>
          ))}
          <PlaceholderTiles
            count={topGenres.length ? genrePlaceholders : paneLimit}
            variant="circle"
          />
        </div>
      </section>

      <section className="dash-row dash-row--flags">
        <DashPaneLabel
          logo="/api/assets/icons/pane-global"
          title="GLOBAL ACTS"
          subtitle="Origins of your content"
        />
        <div className="dash-scroll dash-scroll--flags">
          {topCountries.map((c) => (
            <button
              key={c.name}
              type="button"
              className="dash-country"
              onClick={() => onCountry?.({ id: c.id, name: c.name })}
            >
              <span className={`dash-country-flag fi fi-${c.iso}`} />
              <span className="dash-item-label">{c.name}</span>
            </button>
          ))}
          <PlaceholderTiles
            count={topCountries.length ? countryPlaceholders : paneLimit}
            variant="flag"
          />
        </div>
      </section>
    </div>
  );
}
