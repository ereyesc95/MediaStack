import { useEffect, useRef, useState } from "react";
import { fetchMusicEvents } from "../../api";
import { formatTrackDate } from "../../formatDate";
import { pushArtistRoute } from "../../musicRoute";
import type { EventCard, EventsCardLayout } from "../../types";
import BillboardText from "../BillboardText";
import PlaylistBoot from "../PlaylistBoot";

export type EventsActFilter = "all" | "main" | "openers";

export type EventsFilters = {
  act: EventsActFilter;
  artist: string;
  origin: string;
  country: string;
  venue: string;
  genre: string;
  year: string;
  promoter: string;
  ticketer: string;
};

export const EMPTY_EVENTS_FILTERS: EventsFilters = {
  act: "all",
  artist: "",
  origin: "",
  country: "",
  venue: "",
  genre: "",
  year: "",
  promoter: "",
  ticketer: "",
};

export const EVENTS_ACT_CYCLE: { id: EventsActFilter; label: string }[] = [
  { id: "all", label: "ALL ACTS" },
  { id: "main", label: "MAIN ACTS" },
  { id: "openers", label: "OPENERS" },
];

export function nextEventsAct(current: EventsActFilter): EventsActFilter {
  const idx = EVENTS_ACT_CYCLE.findIndex((x) => x.id === current);
  return EVENTS_ACT_CYCLE[(idx + 1) % EVENTS_ACT_CYCLE.length]!.id;
}

export function eventsActLabel(act: EventsActFilter): string {
  return EVENTS_ACT_CYCLE.find((x) => x.id === act)?.label ?? "ALL ACTS";
}

type Facets = {
  artists: string[];
  origins: string[];
  countries: string[];
  venues: string[];
  genres: string[];
  genre_groups: { genre: string; items: string[] }[];
  years: number[];
  promoters: string[];
  ticketers: string[];
};

type FilterId =
  | "artist"
  | "origin"
  | "country"
  | "venue"
  | "date"
  | "genre"
  | "promoter"
  | "ticketer";

const FILTER_TABS: { id: FilterId; label: string }[] = [
  { id: "artist", label: "Artist" },
  { id: "origin", label: "Origin" },
  { id: "country", label: "Country" },
  { id: "venue", label: "Venue" },
  { id: "date", label: "Date" },
  { id: "genre", label: "Genre" },
  { id: "promoter", label: "Promoter" },
  { id: "ticketer", label: "Ticketer" },
];

type LiveShowsCard = {
  slug: string;
  name: string;
  cover_url?: string | null;
  track_count?: number | null;
};

type Props = {
  filters: EventsFilters;
  onFiltersChange: (next: EventsFilters) => void;
  onOpenShow: (event: EventCard) => void;
  cardLayout?: EventsCardLayout;
  /** Bump after Sync folders so logos/artwork re-resolve from disk. */
  refreshKey?: number;
  liveShowsCard?: LiveShowsCard | null;
  onOpenLiveShows?: () => void;
};

function eventCoverUrl(ev: EventCard, layout: EventsCardLayout): string | null {
  switch (layout) {
    case "landscape":
      return ev.thumbnail_url || ev.banner_url || ev.poster_url;
    case "banner":
      return ev.banner_url || ev.thumbnail_url || ev.poster_url;
    case "cover":
      return ev.playlist_url || ev.poster_url;
    case "logos":
      return ev.tour_logo_url || ev.poster_url;
    case "portrait":
    default:
      return ev.poster_url || ev.banner_url;
  }
}

function EventHoverBrand({
  ev,
  layout,
}: {
  ev: EventCard;
  layout: EventsCardLayout;
}) {
  const actName =
    ev.hover_artist_name || ev.band_name || ev.main_artist_name || "";

  const artistBlock =
    ev.era_icon_url || ev.era_logo_url ? (
      <span className="media-release-card__event-artist-brand">
        {ev.era_icon_url ? (
          <img
            src={ev.era_icon_url}
            alt=""
            className="media-release-card__event-era-icon"
            draggable={false}
          />
        ) : null}
        {ev.era_logo_url ? (
          <img
            src={ev.era_logo_url}
            alt=""
            className="media-release-card__event-era-logo"
            draggable={false}
          />
        ) : (
          <span className="muted">{actName}</span>
        )}
      </span>
    ) : (
      <span className="muted">{actName}</span>
    );

  // Logos layout already shows the tour logo as the card face — hover only
  // the act branding (date stays in the date strip).
  if (layout === "logos") {
    return (
      <span className="media-release-card__title-hover media-release-card__title-hover--event media-release-card__title-hover--logos">
        {artistBlock}
      </span>
    );
  }

  const tourBlock = ev.tour_logo_url ? (
    <img
      src={ev.tour_logo_url}
      alt=""
      className="media-release-card__logo media-release-card__logo--event-tour"
      draggable={false}
    />
  ) : (
    <span className="media-release-card__title-hover-text">
      <BillboardText short={ev.tour_title} full={ev.tour_title} maxLines={2} />
    </span>
  );

  return (
    <span className="media-release-card__title-hover media-release-card__title-hover--event">
      {tourBlock}
      {artistBlock}
    </span>
  );
}

function EventCardView({
  ev,
  layout,
  onOpen,
}: {
  ev: EventCard;
  layout: EventsCardLayout;
  onOpen: () => void;
}) {
  const dateLabel = formatTrackDate(ev.date_iso);
  const actName =
    ev.hover_artist_name || ev.band_name || ev.main_artist_name || "";
  const hoverTitle = [ev.tour_title, actName, dateLabel]
    .filter(Boolean)
    .join(" · ");
  const cover = eventCoverUrl(ev, layout);

  if (layout === "list") {
    return (
      <article
        className="media-release-card media-release-card--list catalog-list-cell media-release-card--clickable"
        role="button"
        tabIndex={0}
        title={hoverTitle}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        <span className="catalog-list-cell__title">
          {ev.venue || ev.tour_title}
        </span>
        <span className="catalog-list-cell__sub">
          {[actName, dateLabel, ev.city].filter(Boolean).join(" · ")}
        </span>
      </article>
    );
  }

  if (layout === "banner") {
    // Background: Banner → Thumbnail → Poster. Cover tile: Playlist → Poster.
    const bannerUrl = ev.banner_url || ev.thumbnail_url || ev.poster_url;
    const thumb = ev.playlist_url || ev.poster_url;
    return (
      <article
        className="media-release-card media-release-card--banner media-release-card--clickable media-beat-frame"
        role="button"
        tabIndex={0}
        title={hoverTitle}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        <span className="media-release-card__banner-bg">
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
            {thumb ? (
              <img
                src={thumb}
                alt=""
                className="media-release-card__banner-cover-img"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            ) : null}
          </span>
          <span className="media-release-card__banner-meta">
            {ev.tour_logo_url ? (
              <img
                src={ev.tour_logo_url}
                alt=""
                className="media-release-card__banner-release-logo"
                draggable={false}
              />
            ) : (
              <span className="media-release-card__banner-title">
                {ev.tour_title}
              </span>
            )}
            <span className="media-release-card__banner-artist-brand">
              {ev.era_icon_url ? (
                <img
                  src={ev.era_icon_url}
                  alt=""
                  className="media-release-card__banner-era-icon"
                  draggable={false}
                />
              ) : null}
              {ev.era_logo_url ? (
                <img
                  src={ev.era_logo_url}
                  alt=""
                  className="media-release-card__banner-era-logo"
                  draggable={false}
                />
              ) : (
                <span className="media-release-card__banner-artist">
                  {actName}
                </span>
              )}
            </span>
            {dateLabel ? (
              <span className="media-release-card__banner-date">{dateLabel}</span>
            ) : null}
          </span>
        </span>
      </article>
    );
  }

  const layoutClass =
    layout === "landscape"
      ? "media-release-card--landscape"
      : layout === "cover" || layout === "logos"
        ? "media-release-card--cover"
        : "media-release-card--portrait";

  return (
    <article
      className={[
        "media-release-card",
        layoutClass,
        "media-release-card--clickable",
        "media-beat-frame",
        layout === "logos" ? "" : "media-beat-frame--cover",
      ]
        .filter(Boolean)
        .join(" ")}
      role="button"
      tabIndex={0}
      title={hoverTitle}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="media-release-card__cover">
        {cover ? (
          <img
            src={cover}
            alt=""
            className={
              layout === "logos"
                ? "media-release-card__cover-img media-release-card__cover-img--contain"
                : "media-release-card__cover-img"
            }
            loading="lazy"
            draggable={false}
          />
        ) : null}
      </span>
      <span className="media-release-card__dim" aria-hidden />
      <span className="media-release-card__hover">
        <EventHoverBrand ev={ev} layout={layout} />
      </span>
      {dateLabel ? (
        <span className="media-release-card__date">
          <span className="media-release-card__date-label">{dateLabel}</span>
        </span>
      ) : null}
    </article>
  );
}

export default function EventsBrowse({
  liveShowsCard = null,
  onOpenLiveShows,
  filters,
  onFiltersChange,
  onOpenShow,
  cardLayout = "portrait",
  refreshKey = 0,
}: Props) {
  const [events, setEvents] = useState<EventCard[] | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<FilterId | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const refreshedOnce = useRef(false);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const doRefresh = !refreshedOnce.current || refreshKey > 0;
    if (!refreshedOnce.current) refreshedOnce.current = true;
    void fetchMusicEvents({
      act: filters.act,
      artist: filters.artist || undefined,
      origin: filters.origin || undefined,
      country: filters.country || undefined,
      venue: filters.venue || undefined,
      genre: filters.genre || undefined,
      year: filters.year ? Number(filters.year) : null,
      promoter: filters.promoter || undefined,
      ticketer: filters.ticketer || undefined,
      refresh: doRefresh,
    })
      .then((data) => {
        if (cancelled) return;
        setEvents(data.events || []);
        setFacets({
          artists: data.facets?.artists || [],
          origins: data.facets?.origins || [],
          countries: data.facets?.countries || [],
          venues: data.facets?.venues || [],
          genres: data.facets?.genres || [],
          genre_groups: data.facets?.genre_groups || [],
          years: data.facets?.years || [],
          promoters: data.facets?.promoters || [],
          ticketers: data.facets?.ticketers || [],
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load events");
          setEvents([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, refreshKey]);

  const patch = (partial: Partial<EventsFilters>) =>
    onFiltersChange({ ...filters, ...partial });

  const filterValue = (id: FilterId): string => {
    switch (id) {
      case "artist":
        return filters.artist;
      case "origin":
        return filters.origin;
      case "country":
        return filters.country;
      case "venue":
        return filters.venue;
      case "date":
        return filters.year;
      case "genre":
        return filters.genre;
      case "promoter":
        return filters.promoter;
      case "ticketer":
        return filters.ticketer;
    }
  };

  type Opt = { value: string; label: string; group?: string };

  const filterOptions = (id: FilterId): Opt[] => {
    if (!facets) return [];
    switch (id) {
      case "artist":
        return (facets.artists || []).map((a) => ({ value: a, label: a }));
      case "origin":
        return (facets.origins || []).map((a) => ({ value: a, label: a }));
      case "country":
        return (facets.countries || []).map((a) => ({ value: a, label: a }));
      case "venue":
        return (facets.venues || []).map((a) => ({ value: a, label: a }));
      case "date":
        return (facets.years || []).map((y) => ({
          value: String(y),
          label: String(y),
        }));
      case "genre":
        if (facets.genre_groups?.length) {
          return facets.genre_groups.flatMap((g) =>
            g.items.map((name) => ({
              value: name,
              label: name,
              group: g.genre,
            }))
          );
        }
        return (facets.genres || []).map((a) => ({ value: a, label: a }));
      case "promoter":
        return (facets.promoters || []).map((a) => ({ value: a, label: a }));
      case "ticketer":
        return (facets.ticketers || []).map((a) => ({ value: a, label: a }));
    }
  };

  const applyFilter = (id: FilterId, value: string) => {
    switch (id) {
      case "artist":
        patch({ artist: value });
        break;
      case "origin":
        patch({ origin: value });
        break;
      case "country":
        patch({ country: value });
        break;
      case "venue":
        patch({ venue: value });
        break;
      case "date":
        patch({ year: value });
        break;
      case "genre":
        patch({ genre: value });
        break;
      case "promoter":
        patch({ promoter: value });
        break;
      case "ticketer":
        patch({ ticketer: value });
        break;
    }
    setOpenDropdown(null);
  };

  const visibleTabs = FILTER_TABS.filter((t) => filterOptions(t.id).length > 0);

  const gridClass = [
    "media-release-grid",
    "events-browse__grid",
    cardLayout === "banner" ? "media-release-grid--banner" : "",
    cardLayout === "list" ? "media-release-grid--list" : "",
    cardLayout === "landscape" ? "media-release-grid--landscape" : "",
    cardLayout === "cover" || cardLayout === "logos"
      ? "media-release-grid--cover"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="events-browse">
      <div className="events-browse__sticky artist-browse-sticky">
        <div
          ref={barRef}
          className="sub-nav sub-nav--spread sub-nav--compact collection-browse__filterbar"
          aria-label="Events filters"
        >
          {visibleTabs.map((sf) => {
            const selected = filterValue(sf.id);
            const opts = filterOptions(sf.id);
            let lastGroup: string | undefined;
            return (
              <div
                key={sf.id}
                className="sub-nav-item-wrap collection-browse__filter-item"
              >
                <button
                  type="button"
                  className={
                    selected || openDropdown === sf.id ? "active" : undefined
                  }
                  aria-haspopup="listbox"
                  aria-expanded={openDropdown === sf.id}
                  onClick={() =>
                    setOpenDropdown((cur) => (cur === sf.id ? null : sf.id))
                  }
                >
                  <span>{sf.label}</span>
                  {selected ? (
                    <span className="collection-browse__filter-sub">
                      {selected}
                    </span>
                  ) : null}
                </button>
                {openDropdown === sf.id ? (
                  <ul className="collection-browse__dropdown" role="listbox">
                    <li>
                      <button
                        type="button"
                        className={!selected ? "active" : undefined}
                        onClick={() => applyFilter(sf.id, "")}
                      >
                        All
                      </button>
                    </li>
                    {opts.map((o) => {
                      const showGroup =
                        o.group && o.group !== lastGroup
                          ? ((lastGroup = o.group), true)
                          : false;
                      return (
                        <li key={`${o.group || ""}:${o.value}`}>
                          {showGroup ? (
                            <span
                              className="collection-browse__dropdown-group"
                              aria-hidden
                            >
                              {o.group}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className={
                              filterValue(sf.id) === o.value
                                ? "active"
                                : undefined
                            }
                            onClick={() => applyFilter(sf.id, o.value)}
                          >
                            {o.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {loading && !events ? (
        <PlaylistBoot
          className="playlist-boot--compact"
          label="Loading events…"
        />
      ) : null}
      {error ? <p className="error events-browse__error">{error}</p> : null}
      {!loading && events && !events.length ? (
        <p className="muted artist-section-empty">
          No events match these filters. Add Tours folders under artists.
        </p>
      ) : null}

      {liveShowsCard && onOpenLiveShows ? (
        <div className="events-browse__live-shows">
          <button
            type="button"
            className="playlist-card playlist-card--system events-browse__live-shows-card"
            onClick={onOpenLiveShows}
          >
            <span
              className="playlist-card-bg card-bg-layer"
              style={{
                backgroundImage: liveShowsCard.cover_url
                  ? `url("${liveShowsCard.cover_url}")`
                  : "linear-gradient(145deg, #252a38, #3d4660)",
              }}
            />
            <span className="playlist-card-dim" />
            <span className="playlist-card-label">{liveShowsCard.name}</span>
            <span className="playlist-card-meta">
              {liveShowsCard.track_count != null
                ? `${liveShowsCard.track_count} tracks`
                : "System"}
            </span>
          </button>
        </div>
      ) : null}

      {events && events.length ? (
        <div className={gridClass}>
          {events.map((ev) => (
            <EventCardView
              key={ev.id}
              ev={ev}
              layout={cardLayout}
              onOpen={() => onOpenShow(ev)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Helper used by MusicModule to open an event into the dedicated show page. */
export function openEventShow(event: EventCard) {
  pushArtistRoute({
    bandId: event.band_id,
    artistName: event.band_name || undefined,
    section: "tours",
    overviewTab: "about",
    tourSlug: event.tour_slug,
    showSlug: event.slug,
    showTab: "overview",
  });
}
