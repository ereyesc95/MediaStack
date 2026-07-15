import { useEffect, useMemo, useState } from "react";
import type { ArtistPlaylistTrack } from "../../types";
import FilterCombobox from "./FilterCombobox";
import SortChevron from "./SortChevron";
import {
  type PlaylistTrackSortKey,
  type SnapshotFilterState,
  titleCaseWords,
} from "./playlistTrackSort";

type Props = {
  tracks: ArtistPlaylistTrack[];
  onFilterStateChange: (state: SnapshotFilterState) => void;
  sortKey: PlaylistTrackSortKey;
  sortDesc: boolean;
  onSortChange: (key: PlaylistTrackSortKey, desc: boolean) => void;
  onReset: () => void;
  knownGenres?: string[];
};

function splitGenres(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((g) => g.trim()).filter(Boolean);
}

function genreTokens(tracks: ArtistPlaylistTrack[], knownGenres?: string[]): string[] {
  const known =
    knownGenres && knownGenres.length > 0
      ? new Set(knownGenres.map((g) => g.toLowerCase()))
      : null;
  const set = new Set<string>();
  for (const track of tracks) {
    const raw = splitGenres(track.snapshot?.genres);
    if (!raw.length) {
      set.add("Unknown");
      continue;
    }
    for (const g of raw) {
      if (known && !known.has(g.toLowerCase())) continue;
      set.add(g);
    }
  }
  return Array.from(set)
    .sort((a, b) => a.localeCompare(b))
    .map((g) => (g === "Unknown" ? g : titleCaseWords(g)));
}

function artistTokens(tracks: ArtistPlaylistTrack[]): string[] {
  const set = new Set<string>();
  for (const track of tracks) {
    const artist = track.snapshot?.artist?.trim() || track.artist_name?.trim();
    if (artist) set.add(artist);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

const SORT_OPTIONS: { key: PlaylistTrackSortKey; label: string }[] = [
  { key: "original", label: "Original order" },
  { key: "artist", label: "Artist" },
  { key: "album", label: "Album" },
  { key: "year", label: "Year" },
  { key: "energy", label: "Energy" },
  { key: "danceability", label: "Danceability" },
  { key: "tempo", label: "Tempo" },
  { key: "popularity", label: "Popularity" },
  { key: "valence", label: "Valence" },
  { key: "acousticness", label: "Acousticness" },
  { key: "instrumentalness", label: "Instrumentalness" },
];

const SORT_LABELS = Object.fromEntries(
  [
    ...SORT_OPTIONS,
    { key: "number" as const, label: "#" },
    { key: "title" as const, label: "Title" },
    { key: "duration" as const, label: "Length" },
    { key: "genres" as const, label: "Genres" },
    { key: "label" as const, label: "Label" },
  ].map((o) => [o.key, o.label])
) as Record<PlaylistTrackSortKey, string>;

function SortByControl({
  sortKey,
  sortDesc,
  onSortChange,
}: {
  sortKey: PlaylistTrackSortKey;
  sortDesc: boolean;
  onSortChange: (key: PlaylistTrackSortKey, desc: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = SORT_LABELS[sortKey] ?? "Original order";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".snapshot-sort-control")) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (key: PlaylistTrackSortKey) => {
    if (key === sortKey) {
      onSortChange(key, !sortDesc);
    } else {
      onSortChange(key, key === "original" ? false : true);
    }
    setOpen(false);
  };

  return (
    <div className="snapshot-filter-inline snapshot-sort-control">
      <div className="snapshot-sort-control__wrap">
        <button
          type="button"
          className={`snapshot-sort-control__trigger${open ? " open" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span>{label}</span>
          <SortChevron desc={sortDesc} />
        </button>
        {open && (
          <ul className="snapshot-sort-control__menu ms-scrollbar">
            {SORT_OPTIONS.map(({ key, label: optionLabel }) => (
              <li key={key}>
                <button
                  type="button"
                  className={`snapshot-sort-control__option${sortKey === key ? " selected" : ""}`}
                  onClick={() => pick(key)}
                >
                  <span>{optionLabel}</span>
                  {sortKey === key ? <SortChevron desc={sortDesc} /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function SnapshotPlaylistFilterBar({
  tracks,
  onFilterStateChange,
  sortKey,
  sortDesc,
  onSortChange,
  onReset,
  knownGenres,
}: Props) {
  const artists = useMemo(() => artistTokens(tracks), [tracks]);
  const genres = useMemo(() => genreTokens(tracks, knownGenres), [knownGenres, tracks]);

  const [state, setState] = useState<SnapshotFilterState>({
    artists: [],
    genres: [],
  });

  useEffect(() => {
    onFilterStateChange(state);
  }, [state, onFilterStateChange]);

  const hasFilters = state.artists.length > 0 || state.genres.length > 0;
  const hasSort = sortKey !== "original" || sortDesc;
  const canReset = hasFilters || hasSort;

  return (
    <div className="snapshot-filter-bar snapshot-filter-bar--inline">
      <div className="snapshot-filter-bar__inline-row">
        <div className="snapshot-filter-bar__filters">
          <FilterCombobox
            label="Artist"
            options={artists}
            value={state.artists}
            onChange={(artists) => setState((prev) => ({ ...prev, artists }))}
            placeholder="All Artists"
            inline
            hideLabel
          />
          <FilterCombobox
            label="Genre"
            options={genres}
            value={state.genres}
            onChange={(genres) => setState((prev) => ({ ...prev, genres }))}
            placeholder="All Genres"
            inline
            hideLabel
          />
        </div>
        <div className="snapshot-filter-bar__sort">
          <SortByControl sortKey={sortKey} sortDesc={sortDesc} onSortChange={onSortChange} />
          <button
            type="button"
            className="snapshot-filter-bar__reset"
            onClick={() => {
              setState({ artists: [], genres: [] });
              onReset();
            }}
            disabled={!canReset}
            aria-label="Reset filters and sort"
            title="Reset filters and sort"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="snapshot-filter-bar__reset-icon">
              <path
                d="M20 12a8 8 0 1 1-2.34-5.66"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <path
                d="M20 4v5h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export { applySnapshotFilters } from "./playlistTrackSort";
