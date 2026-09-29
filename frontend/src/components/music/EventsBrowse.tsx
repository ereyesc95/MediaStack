import { useEffect, useState } from "react";
import { fetchMusicEvents } from "../../api";
import { formatTrackDate } from "../../formatDate";
import { pushArtistRoute } from "../../musicRoute";
import type { EventCard } from "../../types";
import PlaylistBoot from "../PlaylistBoot";

export type EventsActFilter = "all" | "main" | "openers";

export type EventsFilters = {
  act: EventsActFilter;
  artist: string;
  genre: string;
  decade: string;
  country: string;
  continent: string;
  promoter: string;
  ticketer: string;
};

export const EMPTY_EVENTS_FILTERS: EventsFilters = {
  act: "all",
  artist: "",
  genre: "",
  decade: "",
  country: "",
  continent: "",
  promoter: "",
  ticketer: "",
};

type Facets = {
  artists: string[];
  genres: string[];
  decades: number[];
  countries: string[];
  continents: string[];
  promoters: string[];
  ticketers: string[];
};

type Props = {
  filters: EventsFilters;
  onFiltersChange: (next: EventsFilters) => void;
  onOpenShow: (event: EventCard) => void;
};

function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  if (!options.length) return null;
  return (
    <label className="events-browse__facet">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function EventsBrowse({
  filters,
  onFiltersChange,
  onOpenShow,
}: Props) {
  const [events, setEvents] = useState<EventCard[] | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchMusicEvents({
      act: filters.act,
      artist: filters.artist || undefined,
      genre: filters.genre || undefined,
      decade: filters.decade ? Number(filters.decade) : null,
      country: filters.country || undefined,
      continent: filters.continent || undefined,
      promoter: filters.promoter || undefined,
      ticketer: filters.ticketer || undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setEvents(data.events || []);
        setFacets(
          data.facets || {
            artists: [],
            genres: [],
            decades: [],
            countries: [],
            continents: [],
            promoters: [],
            ticketers: [],
          }
        );
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
  }, [filters]);

  const patch = (partial: Partial<EventsFilters>) =>
    onFiltersChange({ ...filters, ...partial });

  return (
    <div className="events-browse">
      <div className="events-browse__filters">
        {(
          [
            ["all", "All acts"],
            ["main", "Main acts"],
            ["openers", "Openers"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={
              filters.act === id
                ? "events-browse__chip is-active"
                : "events-browse__chip"
            }
            onClick={() => patch({ act: id })}
          >
            {label}
          </button>
        ))}
      </div>

      {facets ? (
        <div className="events-browse__facets">
          <FacetSelect
            label="Artist"
            value={filters.artist}
            options={(facets.artists || []).map((a) => ({ value: a, label: a }))}
            onChange={(v) => patch({ artist: v })}
          />
          <FacetSelect
            label="Genre"
            value={filters.genre}
            options={(facets.genres || []).map((g) => ({ value: g, label: g }))}
            onChange={(v) => patch({ genre: v })}
          />
          <FacetSelect
            label="Decade"
            value={filters.decade}
            options={(facets.decades || []).map((d) => ({
              value: String(d),
              label: `${d}s`,
            }))}
            onChange={(v) => patch({ decade: v })}
          />
          <FacetSelect
            label="Country"
            value={filters.country}
            options={(facets.countries || []).map((c) => ({
              value: c,
              label: c,
            }))}
            onChange={(v) => patch({ country: v })}
          />
          <FacetSelect
            label="Continent"
            value={filters.continent}
            options={(facets.continents || []).map((c) => ({
              value: c,
              label: c,
            }))}
            onChange={(v) => patch({ continent: v })}
          />
          <FacetSelect
            label="Promoter"
            value={filters.promoter}
            options={(facets.promoters || []).map((p) => ({
              value: p,
              label: p,
            }))}
            onChange={(v) => patch({ promoter: v })}
          />
          <FacetSelect
            label="Ticketer"
            value={filters.ticketer}
            options={(facets.ticketers || []).map((t) => ({
              value: t,
              label: t,
            }))}
            onChange={(v) => patch({ ticketer: v })}
          />
        </div>
      ) : null}

      {loading && !events ? (
        <PlaylistBoot className="playlist-boot--compact" label="Loading events…" />
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && events && !events.length ? (
        <p className="muted artist-section-empty">
          No events match these filters. Add Tours folders under artists.
        </p>
      ) : null}

      {events && events.length ? (
        <div className="artist-media-grid artist-playlist-grid">
          {events.map((ev) => {
            const dateLabel = formatTrackDate(ev.date_iso);
            const hoverTitle = [ev.tour_title, ev.main_artist_name, dateLabel]
              .filter(Boolean)
              .join(" · ");
            return (
              <article
                key={ev.id}
                className="media-release-card media-release-card--portrait media-release-card--clickable media-beat-frame media-beat-frame--cover"
                role="button"
                tabIndex={0}
                title={hoverTitle}
                onClick={() => onOpenShow(ev)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenShow(ev);
                  }
                }}
              >
                <span className="media-release-card__cover">
                  {ev.poster_url ? (
                    <img
                      src={ev.poster_url}
                      alt=""
                      className="media-release-card__cover-img"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : null}
                </span>
                <span className="media-release-card__dim" aria-hidden />
                <span className="media-release-card__hover">
                  <span className="media-release-card__title-hover">
                    {ev.tour_title}
                    <br />
                    <span className="muted">{ev.main_artist_name}</span>
                  </span>
                </span>
                {dateLabel ? (
                  <span className="media-release-card__date">
                    <span className="media-release-card__date-label">{dateLabel}</span>
                  </span>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Helper used by MusicModule to open an event into the artist tour show page. */
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
