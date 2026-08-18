import { useLayoutEffect, useRef, useState } from "react";
import type { MusicDashboard } from "../../types";
import { EMPTY_DASHBOARD } from "../../types";
import { DashHoverTitle, useDashCardReveal } from "../DashHoverTitle";
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
  playingPath?: string | null;
  playerBarVisible?: boolean;
  onPlayTrack: (path: string, artistId: number | null, title: string | null) => void;
  onArtist: (id: number) => void;
  onRelease: (
    artistId: number,
    releaseId: string,
    meta?: { artistName?: string | null; title?: string | null }
  ) => void;
  onGenre: (id: number) => void;
  onCountry: (country: { id?: number; name: string }) => void;
};

type PlaceholderVariant = "square" | "landscape" | "circle" | "flag";

function DashPlaceholder({ variant }: { variant: PlaceholderVariant }) {
  if (variant === "landscape") {
    return (
      <div className="dash-icon-item dash-placeholder-item" aria-hidden>
        <span className="dash-icon-item-cover dash-placeholder dash-placeholder--landscape" />
      </div>
    );
  }
  if (variant === "square") {
    return (
      <div className="dash-track dash-placeholder-item" aria-hidden>
        <span className="dash-track-art dash-placeholder dash-placeholder--square" />
      </div>
    );
  }
  if (variant === "circle") {
    return (
      <div className="dash-genre dash-placeholder-item" aria-hidden>
        <span className="dash-genre-ring dash-placeholder dash-placeholder--circle" />
      </div>
    );
  }
  return (
    <div className="dash-country dash-placeholder-item" aria-hidden>
      <span className="dash-country-flag dash-placeholder dash-placeholder--flag" />
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

export default function MusicHome({
  data,
  loading,
  playingPath = null,
  playerBarVisible = false,
  onPlayTrack,
  onArtist,
  onRelease,
  onGenre,
  onCountry,
}: Props) {
  const dash = data ?? EMPTY_DASHBOARD;
  const layout = useDashboardLayout();
  const paneLimit = paneItemLimit(layout);

  const topTracks = slicePane(dash.top_tracks, paneLimit);
  const topArtists = slicePane(dash.top_artists, paneLimit);
  const topReleases = slicePane(dash.top_releases ?? [], paneLimit);
  const topGenres = slicePane(dash.top_genres, paneLimit);
  const topCountries = slicePane(dash.top_countries, paneLimit);

  const trackPlaceholders = placeholderCount(topTracks.length, paneLimit);
  const artistPlaceholders = placeholderCount(topArtists.length, paneLimit);
  const releasePlaceholders = placeholderCount(topReleases.length, paneLimit);
  const genrePlaceholders = placeholderCount(topGenres.length, paneLimit);
  const countryPlaceholders = placeholderCount(topCountries.length, paneLimit);

  const dashClass = `${DASH_LAYOUT_CLASS[layout]}${
    playerBarVisible ? " music-dashboard--player-active" : ""
  }`;
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const { revealedId, onCardActivate } = useDashCardReveal();

  useLayoutEffect(() => {
    if (
      (layout !== "mobile-portrait" && layout !== "mobile-landscape") ||
      !playingPath
    ) {
      return;
    }
    const scroller = tracksScrollRef.current;
    if (!scroller) return;
    const active = scroller.querySelector<HTMLElement>(
      `.dash-track.active[data-track-path="${CSS.escape(playingPath)}"]`
    );
    if (!active) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const left =
      active.offsetLeft -
      scroller.clientWidth / 2 +
      active.clientWidth / 2;
    scroller.scrollTo({
      left: Math.max(0, left),
      behavior: scrollerRect.width > 0 && activeRect.width > 0 ? "smooth" : "auto",
    });
  }, [layout, playingPath, topTracks]);

  return (
    <div className={`music-dashboard${dashClass}`}>
      {null}

      <section className="dash-row dash-row--tracks">
        <DashPaneLabel
          logo="/api/assets/icons/pane-on-repeat"
          title="ON REPEAT"
          subtitle="Most played tracks"
        />
        <div className="dash-scroll dash-scroll--tracks" ref={tracksScrollRef}>
          {topTracks.map((t) => (
            <button
              key={t.id}
              type="button"
              data-dash-card={`track-${t.id}`}
              className={`dash-track${
                playingPath && t.path === playingPath ? " active" : ""
              }${revealedId === `track-${t.id}` ? " is-revealed" : ""}`}
              data-track-path={t.path ?? undefined}
              onClick={onCardActivate(`track-${t.id}`, () => {
                if (t.path) onPlayTrack(t.path, t.artist_id, t.title);
              })}
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
                <DashHoverTitle
                  title={t.title_full ?? t.title ?? ""}
                  subtitle={(t.artist_name_full ?? t.artist_name ?? "").replace(
                    /■/g,
                    ","
                  )}
                  revealed={revealedId === `track-${t.id}`}
                />
              </span>
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
          logo="/api/assets/icons/pane-icons"
          title="ICONS"
          subtitle="Your top artists"
        />
        <div className="dash-scroll dash-scroll--icons">
          {topArtists.map((a) => (
            <DashIconCard
              key={a.id}
              artist={a}
              preferPortrait={layout === "mobile-portrait"}
              revealed={revealedId === `artist-${a.id}`}
              onClick={onCardActivate(`artist-${a.id}`, () => onArtist(a.id))}
            />
          ))}
          <PlaceholderTiles
            count={topArtists.length ? artistPlaceholders : paneLimit}
            variant="landscape"
          />
        </div>
      </section>

      <section className="dash-row dash-row--tracks">
        <DashPaneLabel
          logo="/api/assets/icons/pane-icons"
          title="TOP RECORDS"
          subtitle="Most played releases"
        />
        <div className="dash-scroll dash-scroll--tracks">
          {topReleases.map((r) => (
            <button
              key={r.id}
              type="button"
              data-dash-card={`release-${r.id}`}
              className={`dash-track${
                revealedId === `release-${r.id}` ? " is-revealed" : ""
              }`}
              onClick={onCardActivate(`release-${r.id}`, () => {
                if (r.artist_id != null) {
                  onRelease(r.artist_id, r.id, {
                    artistName: r.artist_name,
                    title: r.title,
                  });
                }
              })}
            >
              <span className="dash-track-art">
                <span
                  className="dash-track-art-bg card-bg-layer"
                  style={
                    r.cover_url
                      ? { backgroundImage: `url("${r.cover_url}")` }
                      : undefined
                  }
                />
                <DashHoverTitle
                  title={r.title ?? ""}
                  revealed={revealedId === `release-${r.id}`}
                />
              </span>
            </button>
          ))}
          <PlaceholderTiles
            count={topReleases.length ? releasePlaceholders : paneLimit}
            variant="square"
          />
        </div>
      </section>

      <section className="dash-row dash-row--genres">
        <DashPaneLabel
          logo="/api/assets/icons/pane-vibes"
          title="MUSIC VIBES"
          subtitle="Genres on rotation"
        />
        <div className="dash-scroll dash-scroll--genres">
          {topGenres.map((g) => (
            <button
              key={g.id ?? g.name}
              type="button"
              data-dash-card={`genre-${g.id ?? g.name}`}
              className={`dash-genre${
                revealedId === `genre-${g.id ?? g.name}` ? " is-revealed" : ""
              }`}
              onClick={onCardActivate(`genre-${g.id ?? g.name}`, () =>
                onGenre(Number(g.id))
              )}
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
                <DashHoverTitle
                  title={g.name}
                  revealed={revealedId === `genre-${g.id ?? g.name}`}
                />
              </span>
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
          title="GLOBAL SOUND"
          subtitle="Origins of your music"
        />
        <div className="dash-scroll dash-scroll--flags">
          {topCountries.map((c) => (
            <button
              key={c.name}
              type="button"
              data-dash-card={`country-${c.name}`}
              className={`dash-country${
                revealedId === `country-${c.name}` ? " is-revealed" : ""
              }`}
              onClick={onCardActivate(`country-${c.name}`, () =>
                onCountry({ id: c.id, name: c.name })
              )}
            >
              <span className="dash-country-flag">
                {c.iso && <span className={`fi fi-${c.iso}`} />}
                <DashHoverTitle
                  title={c.name}
                  revealed={revealedId === `country-${c.name}`}
                />
              </span>
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
