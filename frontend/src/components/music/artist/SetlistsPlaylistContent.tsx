import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchSetlistShows, fetchSetlistTracks } from "../../../api";
import SearchableDropdown, { type DropdownOption } from "../../SearchableDropdown";
import { setlistShowLabelPlain, SetlistShowLabelRich } from "./setlistShowLabel";
import type {
  ReleaseTrackItem,
  SetlistShowSummary,
  SetlistTracklistPayload,
} from "../../../types";
import SetlistTracklist, { flattenPlayableSetlistTracks } from "./SetlistTracklist";

export type SetlistsPlaylistHandle = {
  adjacentTracks: (path: string) => { prev: ReleaseTrackItem | null; next: ReleaseTrackItem | null };
};

type Props = {
  bandId: number;
  years: string[];
  playingPath: string | null;
  onPlay: (path: string, title: string, playbackKey?: string, track?: ReleaseTrackItem) => void;
  onPanelTrack?: (track: ReleaseTrackItem) => void;
  onContextChange?: (ctx: {
    tourName: string | null;
    showLabel: string | null;
    trackCount: number | null;
    setlistId: string | null;
  }) => void;
};

function formatFetchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const data = JSON.parse(message) as { detail?: string };
    if (typeof data.detail === "string" && data.detail.trim()) {
      return data.detail;
    }
  } catch {
    /* raw message */
  }
  return message;
}

const SetlistsPlaylistContent = forwardRef<SetlistsPlaylistHandle, Props>(function SetlistsPlaylistContent(
  { bandId, years, playingPath, onPlay, onPanelTrack, onContextChange },
  ref
) {
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedShowId, setSelectedShowId] = useState("");
  const [shows, setShows] = useState<SetlistShowSummary[]>([]);
  const [showsLoading, setShowsLoading] = useState(false);
  const [showsError, setShowsError] = useState<string | null>(null);
  const [setlistPayload, setSetlistPayload] = useState<SetlistTracklistPayload | null>(null);
  const [setlistLoading, setSetlistLoading] = useState(false);
  const [setlistError, setSetlistError] = useState<string | null>(null);
  const onContextChangeRef = useRef(onContextChange);

  useEffect(() => {
    onContextChangeRef.current = onContextChange;
  }, [onContextChange]);

  const notifyContext = useCallback(
    (ctx: {
      tourName: string | null;
      showLabel: string | null;
      trackCount: number | null;
      setlistId: string | null;
    }) => {
      onContextChangeRef.current?.(ctx);
    },
    []
  );

  const yearOptions: DropdownOption[] = useMemo(
    () => years.map((y) => ({ value: y, label: y })),
    [years]
  );

  const showById = useMemo(() => new Map(shows.map((show) => [show.id, show])), [shows]);

  const showOptions: DropdownOption[] = useMemo(
    () =>
      shows.map((show) => ({
        value: show.id,
        label: setlistShowLabelPlain(show),
        iso: show.country_iso || undefined,
      })),
    [shows]
  );

  const renderShowLabel = useCallback(
    (opt: DropdownOption) => {
      const show = showById.get(opt.value);
      return show ? <SetlistShowLabelRich show={show} /> : opt.label;
    },
    [showById]
  );

  const playableTracks = useMemo(
    () => (setlistPayload ? flattenPlayableSetlistTracks(setlistPayload.editions) : []),
    [setlistPayload]
  );


  useImperativeHandle(
    ref,
    () => ({
      adjacentTracks(path: string) {
        const idx = playableTracks.findIndex((t) => t.play_path === path);
        if (idx < 0) return { prev: null, next: null };
        return {
          prev: idx > 0 ? playableTracks[idx - 1]! : null,
          next: idx < playableTracks.length - 1 ? playableTracks[idx + 1]! : null,
        };
      },
    }),
    [playableTracks]
  );

  useEffect(() => {
    if (!selectedYear) {
      setShows([]);
      setSelectedShowId("");
      setSetlistPayload(null);
      notifyContext({ tourName: null, showLabel: null, trackCount: null, setlistId: null });
      return;
    }
    let cancelled = false;
    setShowsLoading(true);
    setShowsError(null);
    setSelectedShowId("");
    setSetlistPayload(null);
    notifyContext({ tourName: null, showLabel: null, trackCount: null, setlistId: null });
    void fetchSetlistShows(bandId, selectedYear)
      .then((res) => {
        if (cancelled) return;
        setShows(res.shows);
      })
      .catch((e) => {
        if (!cancelled) {
          setShows([]);
          setShowsError(formatFetchError(e));
        }
      })
      .finally(() => {
        if (!cancelled) setShowsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, notifyContext, selectedYear]);

  useEffect(() => {
    if (!selectedShowId) {
      setSetlistPayload(null);
      notifyContext({ tourName: null, showLabel: null, trackCount: null, setlistId: null });
      return;
    }
    let cancelled = false;
    setSetlistLoading(true);
    setSetlistError(null);
    void fetchSetlistTracks(bandId, selectedShowId)
      .then((payload) => {
        if (cancelled) return;
        setSetlistPayload(payload);
        let trackCount = 0;
        for (const ed of payload.editions) {
          for (const group of ed.groups) {
            trackCount += group.tracks.length;
          }
        }
        notifyContext({
          tourName: payload.tour_name ?? null,
          showLabel: payload.display_date ?? null,
          trackCount,
          setlistId: payload.setlist_id,
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setSetlistPayload(null);
          setSetlistError(formatFetchError(e));
          notifyContext({ tourName: null, showLabel: null, trackCount: null, setlistId: null });
        }
      })
      .finally(() => {
        if (!cancelled) setSetlistLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, notifyContext, selectedShowId]);

  const pickShow = useCallback((showId: string) => {
    setSelectedShowId(showId);
  }, []);

  const showPlaceholder = !selectedYear
    ? "Choose a year first"
    : showsLoading
      ? "Loading shows…"
      : shows.length === 0
        ? "No shows for this year"
        : "Search date, venue, country…";

  return (
    <div className="setlists-playlist">
      <div className="setlists-playlist__controls">
        <label className="setlists-playlist__field">
          <span className="setlists-playlist__label">Year</span>
          <SearchableDropdown
            options={yearOptions}
            value={selectedYear}
            onChange={setSelectedYear}
            placeholder="Select year…"
          />
        </label>
        <label className="setlists-playlist__field">
          <span className="setlists-playlist__label">Show</span>
          <SearchableDropdown
            options={showOptions}
            value={selectedShowId}
            onChange={pickShow}
            placeholder={showPlaceholder}
            renderSelectedLabel={renderShowLabel}
            renderOptionLabel={renderShowLabel}
          />
        </label>
      </div>

      {!selectedYear && (
        <p className="muted setlists-playlist__hint">Choose a year to browse live shows.</p>
      )}

      {selectedYear && showsLoading && (
        <p className="muted setlists-playlist__hint">Loading shows for {selectedYear}…</p>
      )}
      {showsError && <p className="error setlists-playlist__hint">{showsError}</p>}

      {selectedYear && !showsLoading && !showsError && shows.length === 0 && (
        <p className="muted setlists-playlist__hint">No shows found for {selectedYear}.</p>
      )}

      {selectedShowId && setlistLoading && (
        <p className="muted setlists-playlist__hint">Loading setlist…</p>
      )}
      {setlistError && <p className="error setlists-playlist__hint">{setlistError}</p>}

      {setlistPayload && (
        <SetlistTracklist
          editions={setlistPayload.editions}
          setlistId={setlistPayload.setlist_id}
          playingPath={playingPath}
          onPlay={(path, title, playbackKey) => {
            const track = playableTracks.find((t) => t.play_path === path);
            onPlay(path, title, playbackKey, track);
          }}
          onPanelTrack={onPanelTrack}
        />
      )}
    </div>
  );
});

export default SetlistsPlaylistContent;
