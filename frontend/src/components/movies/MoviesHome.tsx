import { useLayoutEffect, useState } from "react";
import type { SeriesDashboard, Universe } from "../../types";
import { EMPTY_SERIES_DASHBOARD } from "../../types";
import { DashHoverTitle, useDashCardReveal } from "../DashHoverTitle";
import MyStackIcon from "../MyStackIcon";

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

function DashCover({
  url,
  position = "top",
}: {
  url?: string | null;
  position?: "top" | "center";
}) {
  if (url) {
    return (
      <span className="dash-icon-item-cover">
        <span
          className="card-bg-layer"
          style={{
            backgroundImage: `url("${url}")`,
            backgroundPosition:
              position === "center" ? "center center" : "center top",
          }}
        />
        <span className="dash-icon-item-cover__scrim" aria-hidden />
      </span>
    );
  }
  return (
    <span className="dash-icon-item-cover dash-icon-item-cover--empty">
      <MyStackIcon className="dash-icon-item-cover__mark" size={22} />
      <span className="dash-icon-item-cover__scrim" aria-hidden />
    </span>
  );
}

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

export type MoviesDashboardFilm = SeriesDashboard["top_series"][number] & {
  work_id?: string | null;
};

type Props = {
  data: (SeriesDashboard & { top_series?: MoviesDashboardFilm[] }) | null;
  loading?: boolean;
  universes?: Universe[];
  onFranchise: (workId: string) => void;
  onFilm: (filmId: string, workId?: string | null, title?: string | null) => void;
  onOpenUniverse?: (universeId: number) => void;
  onGenre?: (id: number | string) => void;
  onCountry?: (country: { id?: number; name: string }) => void;
};

export default function MoviesHome({
  data,
  loading,
  universes = [],
  onFranchise,
  onFilm,
  onOpenUniverse,
  onGenre,
  onCountry,
}: Props) {
  const dash = data ?? EMPTY_SERIES_DASHBOARD;
  const layout = useDashboardLayout();
  const paneLimit = paneItemLimit(layout);
  const useBannerArt = layout === "mobile-landscape";

  const pickCover = (s: {
    portrait_url?: string | null;
    cover_url?: string | null;
    photo_url?: string | null;
    banner_url?: string | null;
    landscape_url?: string | null;
  }) => {
    if (useBannerArt) {
      return (
        s.banner_url ||
        s.landscape_url ||
        s.portrait_url ||
        s.cover_url ||
        s.photo_url ||
        null
      );
    }
    return s.portrait_url || s.cover_url || s.photo_url || null;
  };

  const topFranchises = slicePane(dash.top_franchises || [], paneLimit);
  const topFilms = slicePane(
    (dash.top_series || []) as MoviesDashboardFilm[],
    paneLimit
  );
  const topUniverses = slicePane(universes, paneLimit);
  const topGenres = slicePane(dash.top_genres, paneLimit);
  const topCountries = slicePane(dash.top_countries, paneLimit);

  const franchisePlaceholders = placeholderCount(topFranchises.length, paneLimit);
  const filmPlaceholders = placeholderCount(topFilms.length, paneLimit);
  const universePlaceholders = placeholderCount(topUniverses.length, paneLimit);
  const genrePlaceholders = placeholderCount(topGenres.length, paneLimit);
  const countryPlaceholders = placeholderCount(topCountries.length, paneLimit);

  const dashClass = DASH_LAYOUT_CLASS[layout];
  const { revealedId, onCardActivate } = useDashCardReveal();

  return (
    <div
      className={`music-dashboard series-dashboard movies-dashboard${dashClass}${
        loading ? "" : " dash-appear-ready"
      }`}
    >
      <>
      <section className="dash-row dash-row--icons">
        <DashPaneLabel
          logo="/api/assets/icons/pane-on-repeat"
          title="BEST SAGAS"
          subtitle="Your top franchises"
        />
        <div className="dash-scroll dash-scroll--icons">
          {topFranchises.map((s) => {
            const cover = pickCover(s);
            return (
              <button
                key={s.id}
                type="button"
                data-dash-card={`franchise-${s.id}`}
                className={`dash-icon-item${
                  revealedId === `franchise-${s.id}` ? " is-revealed" : ""
                }`}
                onClick={onCardActivate(`franchise-${s.id}`, () =>
                  onFranchise(s.id)
                )}
              >
                <DashCover
                  url={cover}
                  position={useBannerArt ? "center" : "top"}
                />
                <DashHoverTitle
                  title={s.name}
                  revealed={revealedId === `franchise-${s.id}`}
                />
              </button>
            );
          })}
          <PlaceholderTiles
            count={topFranchises.length ? franchisePlaceholders : paneLimit}
            variant="landscape"
          />
        </div>
      </section>

      <section className="dash-row dash-row--icons">
        <DashPaneLabel
          logo="/api/assets/icons/pane-icons"
          title="BEST MOVIES"
          subtitle="Your top content"
        />
        <div className="dash-scroll dash-scroll--icons">
          {topFilms.map((s) => {
            const cover = pickCover(s);
            return (
              <button
                key={s.id}
                type="button"
                data-dash-card={`film-${s.id}`}
                className={`dash-icon-item${
                  revealedId === `film-${s.id}` ? " is-revealed" : ""
                }`}
                onClick={onCardActivate(`film-${s.id}`, () =>
                  onFilm(s.id, s.work_id, s.name)
                )}
              >
                <DashCover
                  url={cover}
                  position={useBannerArt ? "center" : "top"}
                />
                <DashHoverTitle
                  title={s.name}
                  revealed={revealedId === `film-${s.id}`}
                />
              </button>
            );
          })}
          <PlaceholderTiles
            count={topFilms.length ? filmPlaceholders : paneLimit}
            variant="landscape"
          />
        </div>
      </section>

      {topUniverses.length > 0 ? (
      <section className="dash-row dash-row--icons">
          <DashPaneLabel
            logo="/api/assets/icons/pane-on-repeat"
            title="UNIVERSES"
            subtitle="Shared story worlds"
          />
          <div className="dash-scroll dash-scroll--icons">
            {topUniverses.map((u) => {
              const cover = pickCover(u);
              return (
                <button
                  key={u.id}
                  type="button"
                  data-dash-card={`universe-${u.id}`}
                  className={`dash-icon-item${
                    revealedId === `universe-${u.id}` ? " is-revealed" : ""
                  }`}
                  onClick={onCardActivate(`universe-${u.id}`, () =>
                    onOpenUniverse?.(u.id)
                  )}
                >
                  <DashCover
                  url={cover}
                  position={useBannerArt ? "center" : "top"}
                />
                  <DashHoverTitle
                    title={u.name}
                    revealed={revealedId === `universe-${u.id}`}
                  />
                </button>
              );
            })}
            <PlaceholderTiles
              count={topUniverses.length ? universePlaceholders : paneLimit}
              variant="landscape"
            />
          </div>
        </section>
      ) : null}

      <section className="dash-row dash-row--genres">
        <DashPaneLabel
          logo="/api/assets/icons/pane-vibes"
          title="FILM VIBES"
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
                onGenre?.(g.id)
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
          title="GLOBAL ACTS"
          subtitle="Origin of your content"
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
                onCountry?.({ id: c.id, name: c.name })
              )}
            >
              <span className="dash-country-flag">
                {c.iso ? <span className={`fi fi-${c.iso}`} /> : null}
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
      </>
    </div>
  );
}
