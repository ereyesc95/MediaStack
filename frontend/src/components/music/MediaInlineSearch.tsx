import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  searchArtistReleases,
  searchRosterBands,
} from "../../api";

export type CatalogSearchResult = {
  id: number;
  name: string;
};

export type ReleaseSearchResult = {
  id: string;
  title: string;
  cover_url: string | null;
  display_date: string | null;
  category: string;
};

export type TrackSearchResult = {
  title: string;
  play_path: string;
  album_title: string | null;
};

type Props =
  | {
      mode: "catalog";
      bandId?: never;
      onSelectBand: (bandId: number) => void;
      onSelectRelease?: never;
      onSelectTrack?: never;
    }
  | {
      mode: "artist-releases";
      bandId: number;
      onSelectBand?: never;
      onSelectRelease: (releaseId: string) => void;
      onSelectTrack?: (path: string, title: string) => void;
    };

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <circle
        cx="11"
        cy="11"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M16 16l5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function MediaInlineSearch(props: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [bands, setBands] = useState<CatalogSearchResult[]>([]);
  const [releases, setReleases] = useState<ReleaseSearchResult[]>([]);
  const [tracks, setTracks] = useState<TrackSearchResult[]>([]);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setBands([]);
        setReleases([]);
        setTracks([]);
        return;
      }
      setLoading(true);
      try {
        if (props.mode === "catalog") {
          const data = await searchRosterBands(trimmed, 12);
          setBands(data.items);
          setReleases([]);
          setTracks([]);
        } else {
          const data = await searchArtistReleases(props.bandId, trimmed);
          setBands([]);
          setReleases(data.releases);
          setTracks(data.tracks);
        }
      } catch {
        setBands([]);
        setReleases([]);
        setTracks([]);
      } finally {
        setLoading(false);
      }
    },
    [props]
  );

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void runSearch(query), 220);
    return () => window.clearTimeout(t);
  }, [query, open, runSearch]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const hasResults =
    bands.length > 0 || releases.length > 0 || tracks.length > 0;

  const close = () => {
    setOpen(false);
    setQuery("");
    setBands([]);
    setReleases([]);
    setTracks([]);
  };

  return (
    <div
      ref={rootRef}
      className={`media-inline-search${open ? " media-inline-search--open" : ""}`}
    >
      {open ? (
        <div className="media-inline-search__field">
          <input
            ref={inputRef}
            type="search"
            className="media-inline-search__input"
            placeholder={
              props.mode === "catalog" ? "Search catalog…" : "Search artist…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-controls={listId}
            aria-expanded={hasResults}
            aria-autocomplete="list"
          />
          <button
            type="button"
            className="media-inline-search__close"
            onClick={close}
            aria-label="Close search"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="media-inline-search__toggle icon-btn"
          onClick={() => setOpen(true)}
          aria-label="Search"
        >
          <SearchIcon />
        </button>
      )}

      {open && (loading || hasResults || query.trim().length >= 2) && (
        <div id={listId} className="media-inline-search__results" role="listbox">
          {loading && <p className="muted media-inline-search__hint">Searching…</p>}
          {!loading && query.trim().length >= 2 && !hasResults && (
            <p className="muted media-inline-search__hint">No matches</p>
          )}
          {props.mode === "catalog" &&
            bands.map((b) => (
              <button
                key={b.id}
                type="button"
                className="media-inline-search__item"
                role="option"
                onClick={() => {
                  props.onSelectBand(b.id);
                  close();
                }}
              >
                <span>{b.name}</span>
              </button>
            ))}
          {props.mode === "artist-releases" && releases.length > 0 && (
            <p className="media-inline-search__section">Releases</p>
          )}
          {props.mode === "artist-releases" &&
            releases.map((r) => (
              <button
                key={r.id}
                type="button"
                className="media-inline-search__item"
                role="option"
                onClick={() => {
                  props.onSelectRelease(r.id);
                  close();
                }}
              >
                {r.cover_url && (
                  <img src={r.cover_url} alt="" className="media-inline-search__thumb" />
                )}
                <span>
                  {r.title}
                  {r.display_date ? ` · ${r.display_date}` : ""}
                </span>
              </button>
            ))}
          {props.mode === "artist-releases" && tracks.length > 0 && (
            <p className="media-inline-search__section">Tracks</p>
          )}
          {props.mode === "artist-releases" &&
            tracks.map((t) => (
              <button
                key={t.play_path}
                type="button"
                className="media-inline-search__item"
                role="option"
                onClick={() => {
                  if (props.onSelectTrack) {
                    props.onSelectTrack(t.play_path, t.title);
                  }
                  close();
                }}
              >
                <span>
                  {t.title}
                  {t.album_title ? ` · ${t.album_title}` : ""}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
