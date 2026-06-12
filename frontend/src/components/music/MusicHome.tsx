import { useLayoutEffect, useRef, useState } from "react";
import type { MusicDashboard } from "../../types";
import { EMPTY_DASHBOARD } from "../../types";
import DashIconCard from "./DashIconCard";

const PHONE_MAX_WIDTH = 900;
const PHONE_PORTRAIT_MAX_WIDTH = 480;
const TABLET_PORTRAIT_MAX_WIDTH = 1366;
/** Landscape tablets (Surface Pro, iPad) — short viewport; excludes 1080p desktops. */
const TABLET_LANDSCAPE_MAX_HEIGHT = 950;

function hasTouchScreen(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.maxTouchPoints > 0;
}

const DESKTOP_PANE_ITEMS = 10;
const TABLET_LANDSCAPE_ITEMS = 7;
const TABLET_PORTRAIT_ITEMS = 5;
const MOBILE_LANDSCAPE_ITEMS = 5;
const MOBILE_PORTRAIT_ITEMS = 3;

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

function useDashboardLayout() {
  const [layout, setLayout] = useState<DashLayout>(resolveDashLayout);

  useLayoutEffect(() => {
    const update = () => setLayout(resolveDashLayout());
    const landscapeMq = window.matchMedia("(orientation: landscape)");
    landscapeMq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      landscapeMq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
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

type Props = {
  data: MusicDashboard | null;
  loading?: boolean;
  onPlayTrack: (path: string, artistId: number | null, title: string | null) => void;
  onArtist: (id: number) => void;
  onGenre: (id: number) => void;
  onCountry: (country: { id?: number; name: string }) => void;
};

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

function BillboardText({
  short,
  full,
  className,
}: {
  short: string;
  full: string;
  className: string;
}) {
  const complete = (full || short || "").trim();
  const clipRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrolls, setScrolls] = useState(false);
  const [scrollEnd, setScrollEnd] = useState("0px");
  const [scrollDuration, setScrollDuration] = useState("6s");

  useLayoutEffect(() => {
    const clip = clipRef.current;
    const text = textRef.current;
    if (!clip || !text) return;

    const measure = () => {
      const overflow = Math.max(0, text.scrollWidth - clip.clientWidth);
      const needsScroll = overflow > 1;
      setScrolls(needsScroll);
      setScrollEnd(needsScroll ? `-${overflow}px` : "0px");
      setScrollDuration(`${Math.max(4, overflow / 32)}s`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(clip);
    return () => observer.disconnect();
  }, [complete]);

  const scrollStyle = scrolls
    ? ({
        "--scroll-end": scrollEnd,
        "--scroll-duration": scrollDuration,
      } as React.CSSProperties)
    : undefined;

  return (
    <span
      className={`billboard-text ${className}${scrolls ? " billboard-text--scroll" : ""}`}
      title={scrolls ? undefined : complete}
    >
      <span className="billboard-text-clip" ref={clipRef}>
        <span
          className="billboard-text-inner"
          ref={textRef}
          style={scrollStyle}
        >
          {complete}
        </span>
      </span>
    </span>
  );
}

export default function MusicHome({
  data,
  loading,
  onPlayTrack,
  onArtist,
  onGenre,
  onCountry,
}: Props) {
  const dash = data ?? EMPTY_DASHBOARD;
  const layout = useDashboardLayout();
  const paneLimit = paneItemLimit(layout);

  const topTracks = slicePane(dash.top_tracks, paneLimit);
  const topArtists = slicePane(dash.top_artists, paneLimit);
  const topGenres = slicePane(dash.top_genres, paneLimit);
  const topCountries = slicePane(dash.top_countries, paneLimit);

  const trackPlaceholders = placeholderCount(topTracks.length, paneLimit);
  const artistPlaceholders = placeholderCount(topArtists.length, paneLimit);
  const genrePlaceholders = placeholderCount(topGenres.length, paneLimit);
  const countryPlaceholders = placeholderCount(topCountries.length, paneLimit);

  const dashClass = DASH_LAYOUT_CLASS[layout];

  return (
    <div className={`music-dashboard${dashClass}`}>
      {loading && <p className="muted dash-status">Updating…</p>}

      <section className="dash-row dash-row--tracks">
        <DashPaneLabel
          logo="/api/assets/system/icons/pane-on-repeat"
          title="ON REPEAT"
          subtitle="Most played tracks"
        />
        <div className="dash-scroll dash-scroll--tracks">
          {topTracks.map((t) => (
            <button
              key={t.id}
              type="button"
              className="dash-track"
              onClick={() =>
                t.path && onPlayTrack(t.path, t.artist_id, t.title)
              }
            >
              <span className="dash-track-art">
                <span
                  className="dash-track-art-bg card-bg-layer"
                  style={
                    t.cover_url
                      ? { backgroundImage: `url("${t.cover_url}")` }
                      : undefined
                  }
                />
              </span>
              <BillboardText
                className="dash-track-title"
                short={t.title ?? ""}
                full={t.title_full ?? t.title ?? ""}
              />
              <BillboardText
                className="dash-track-sub"
                short={(t.artist_name ?? "").replace(/■/g, ",")}
                full={(t.artist_name_full ?? t.artist_name ?? "").replace(
                  /■/g,
                  ","
                )}
              />
            </button>
          ))}
          <PlaceholderTiles
            count={topTracks.length ? trackPlaceholders : paneLimit}
            variant="square"
          />
        </div>
      </section>

      <section className="dash-row dash-row--icons">
        <DashPaneLabel
          logo="/api/assets/system/icons/pane-icons"
          title="ICONS"
          subtitle="Your top artists"
        />
        <div className="dash-scroll dash-scroll--icons">
          {topArtists.map((a) => (
            <DashIconCard
              key={a.id}
              artist={a}
              onClick={() => onArtist(a.id)}
            />
          ))}
          <PlaceholderTiles
            count={topArtists.length ? artistPlaceholders : paneLimit}
            variant="landscape"
          />
        </div>
      </section>

      <section className="dash-row dash-row--genres">
        <DashPaneLabel
          logo="/api/assets/system/icons/pane-vibes"
          title="MUSIC VIBES"
          subtitle="Genres on rotation"
        />
        <div className="dash-scroll dash-scroll--genres">
          {topGenres.map((g) => (
            <button
              key={g.id ?? g.name}
              type="button"
              className="dash-genre"
              onClick={() => onGenre(Number(g.id))}
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
          logo="/api/assets/system/icons/pane-global"
          title="GLOBAL SOUND"
          subtitle="Origins of your music"
        />
        <div className="dash-scroll dash-scroll--flags">
          {topCountries.map((c) => (
            <button
              key={c.name}
              type="button"
              className="dash-country"
              onClick={() => onCountry({ id: c.id, name: c.name })}
            >
              <span className="dash-country-flag">
                {c.iso && <span className={`fi fi-${c.iso}`} />}
              </span>
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
