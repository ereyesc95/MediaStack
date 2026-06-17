import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchReleaseTracklist,
  fetchTrackLyrics,
  fetchTrackVersions,
} from "../../../api";
import type {
  ReleaseEdition,
  ReleaseTrackItem,
  ReleaseTracklist,
  TrackVersionItem,
} from "../../../types";
import { ReleaseTrackTitle } from "./releaseTrackTitle";
import ReleaseAddToPlaylistModal from "./ReleaseAddToPlaylistModal";
import ReleaseInlineLyrics from "./ReleaseInlineLyrics";
import { ChevronIcon, parseTrackPanelMeta } from "./releaseTrackPanelMeta";

export type ReleasePlaybackArt = {
  cover_url?: string | null;
  cover_animation_url?: string | null;
  canvas_url?: string | null;
  disc_url?: string | null;
  background_layers?: string[];
};

export type ReleaseMobileTrackView = "album" | "tracks";
export type ReleaseRightView = "tracks" | "lyrics" | "versions";

export type ReleaseTracklistHandle = {
  openLyrics: (track: ReleaseTrackItem) => void;
  openVersions: (track: ReleaseTrackItem) => void;
  openPlus: (track: ReleaseTrackItem) => void;
  adjacentTracks: (path: string) => {
    prev: ReleaseTrackItem | null;
    next: ReleaseTrackItem | null;
  };
  allTracks: () => ReleaseTrackItem[];
};

type Props = {
  bandId: number;
  releaseId: string;
  artistName: string;
  releaseTitle: string;
  stacked: boolean;
  playingPath: string | null;
  playbackProgress?: number;
  mobileView: ReleaseMobileTrackView;
  onMobileViewChange: (view: ReleaseMobileTrackView) => void;
  onPlay: (
    path: string,
    title: string,
    art?: ReleasePlaybackArt,
    editionLabel?: string | null
  ) => void;
  onEditionArt?: (edition: ReleaseEdition) => void;
  onActiveTrackChange?: (track: ReleaseTrackItem | null) => void;
  onRightViewChange?: (view: ReleaseRightView) => void;
  mobileBackdropUrl?: string | null;
  reloadKey?: number;
};

function trackArt(
  track: ReleaseTrackItem,
  edition: ReleaseEdition,
  groupDisc?: string | null
): ReleasePlaybackArt {
  return {
    cover_url: track.cover_url ?? edition.cover_url,
    cover_animation_url: track.cover_animation_url ?? edition.cover_animation_url,
    canvas_url: track.canvas_url ?? edition.canvas_url,
    disc_url: track.disc_url ?? groupDisc ?? edition.disc_url,
    background_layers: edition.background_layers,
  };
}

const ReleaseTracklist = forwardRef<ReleaseTracklistHandle, Props>(function ReleaseTracklist(
  {
    bandId,
    releaseId,
    artistName,
    releaseTitle,
    stacked,
    playingPath,
    playbackProgress = 0,
    mobileView,
    onMobileViewChange,
    onPlay,
    onEditionArt,
    onActiveTrackChange,
    onRightViewChange,
    mobileBackdropUrl,
    reloadKey = 0,
  },
  ref
) {
  const [data, setData] = useState<ReleaseTracklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editionIndex, setEditionIndex] = useState(0);
  const [rightView, setRightView] = useState<ReleaseRightView>("tracks");
  const [lyricsTrack, setLyricsTrack] = useState<ReleaseTrackItem | null>(null);
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [syncedLyrics, setSyncedLyrics] = useState<string | null>(null);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [versionsTrack, setVersionsTrack] = useState<ReleaseTrackItem | null>(null);
  const [versions, setVersions] = useState<TrackVersionItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [plusTrack, setPlusTrack] = useState<ReleaseTrackItem | null>(null);

  const setView = useCallback(
    (view: ReleaseRightView) => {
      setRightView(view);
      onRightViewChange?.(view);
    },
    [onRightViewChange]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchReleaseTracklist(bandId, releaseId);
      setData(payload);
      setEditionIndex(0);
      setView("tracks");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bandId, releaseId, setView]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const edition = data?.editions[editionIndex] ?? null;
  const showEditionBar = (data?.editions.length ?? 0) > 1;
  const showEditionHeader = showEditionBar;

  const flatTracks = useMemo(() => {
    if (!edition) return [] as ReleaseTrackItem[];
    return edition.groups.flatMap((g) => g.tracks);
  }, [edition]);

  useEffect(() => {
    if (edition && onEditionArt) {
      onEditionArt(edition);
    }
  }, [edition, onEditionArt]);

  useEffect(() => {
    if (!onActiveTrackChange) return;
    const current =
      flatTracks.find((t) => t.play_path === playingPath) ?? null;
    onActiveTrackChange(current);
  }, [flatTracks, playingPath, onActiveTrackChange]);

  const openLyrics = (track: ReleaseTrackItem) => {
    setLyricsTrack(track);
    setLyricsText(null);
    setSyncedLyrics(null);
    setLyricsError(null);
    setView("lyrics");
    void fetchTrackLyrics(artistName, track.title, track.play_path)
      .then((res) => {
        setLyricsText(res.lyrics);
        setSyncedLyrics(res.synced_lyrics ?? null);
      })
      .catch((e) => {
        setLyricsError(e instanceof Error ? e.message : String(e));
      });
  };

  const openVersions = (track: ReleaseTrackItem) => {
    setVersionsTrack(track);
    setVersions([]);
    setVersionsError(null);
    setView("versions");
    setVersionsLoading(true);
    void fetchTrackVersions(bandId, releaseId, track.title, track.play_path)
      .then((res) => setVersions(res.versions))
      .catch((e) => {
        setVersionsError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setVersionsLoading(false));
  };

  const adjacentTracks = useCallback(
    (path: string) => {
      const idx = flatTracks.findIndex((t) => t.play_path === path);
      if (idx < 0) return { prev: null, next: null };
      return {
        prev: idx > 0 ? flatTracks[idx - 1] : null,
        next: idx < flatTracks.length - 1 ? flatTracks[idx + 1] : null,
      };
    },
    [flatTracks]
  );

  useImperativeHandle(
    ref,
    () => ({
      openLyrics: (track) => openLyrics(track),
      openVersions: (track) => openVersions(track),
      openPlus: (track) => setPlusTrack(track),
      adjacentTracks,
      allTracks: () => flatTracks,
    }),
    [adjacentTracks, flatTracks]
  );

  if (loading && !data) {
    return <p className="muted release-tracklist__loading">Loading tracklist…</p>;
  }
  if (error) {
    return <p className="error release-tracklist__error">{error}</p>;
  }
  if (!data || !edition) {
    return <p className="muted release-tracklist__empty">No tracks found.</p>;
  }

  const versionsTitle = versionsTrack
    ? `${parseTrackPanelMeta(versionsTrack.title).mainTitle} versions`
    : "Versions";

  const tracklistBody = (
    <div className="release-tracklist__content">
      {showEditionBar && (
        <nav className="release-tracklist__editions">
          {data.editions.map((ed, i) => (
            <button
              key={ed.id}
              type="button"
              className={i === editionIndex ? "active" : ""}
              onClick={() => setEditionIndex(i)}
            >
              {ed.label}
            </button>
          ))}
        </nav>
      )}

      {showEditionHeader && (
        <h2 className="release-tracklist__edition-title">{edition.label}</h2>
      )}

      {edition.groups.map((group) => (
        <section key={group.id} className="release-tracklist__group">
          {group.label && (
            <h3 className="release-tracklist__group-label">{group.label}</h3>
          )}
          <ol className="release-tracklist__tracks">
            {group.tracks.map((track) => {
              const active = playingPath === track.play_path;
              const art = trackArt(track, edition, group.disc_url);
              return (
                <li
                  key={track.id}
                  className={active ? "release-tracklist__row active" : "release-tracklist__row"}
                >
                  <button
                    type="button"
                    className="release-tracklist__play"
                    onClick={() =>
                      onPlay(track.play_path, track.title, art, edition.label)
                    }
                    aria-label={`Play ${track.title}`}
                  >
                    <span className="release-tracklist__num">{track.number}</span>
                    <ReleaseTrackTitle title={track.title} />
                    {track.duration && (
                      <span className="release-tracklist__duration">{track.duration}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );

  const lyricsBody = lyricsTrack && (
    <ReleaseInlineLyrics
      title={lyricsTrack.title}
      lyrics={lyricsText}
      syncedLyrics={syncedLyrics}
      currentTime={playbackProgress}
      error={lyricsError}
    />
  );

  const versionsBody = (
    <div className="release-tracklist__inline release-tracklist__inline--versions">
      <h2 className="release-tracklist__inline-title">{versionsTitle}</h2>
      {versionsLoading && <p className="muted">Loading versions…</p>}
      {versionsError && <p className="error">{versionsError}</p>}
      {!versionsLoading && !versionsError && versions.length === 0 && (
        <p className="muted">No alternate versions found.</p>
      )}
      {versions.length > 0 && (
        <ol className="release-tracklist__tracks">
          {versions.map((v, i) => (
            <li key={v.play_path} className="release-tracklist__row">
              <button
                type="button"
                className="release-tracklist__play"
                onClick={() => {
                  setView("tracks");
                  onPlay(v.play_path, v.title);
                }}
              >
                <span className="release-tracklist__num">{i + 1}</span>
                <ReleaseTrackTitle title={v.title} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  const showBack = rightView !== "tracks";

  return (
    <div
      className={`release-tracklist${stacked ? " release-tracklist--stacked" : ""}${
        stacked && mobileView === "tracks" && mobileBackdropUrl
          ? " release-tracklist--mobile-canvas"
          : ""
      }`}
      style={
        stacked && mobileView === "tracks" && mobileBackdropUrl
          ? ({ ["--tracklist-bg" as string]: `url("${mobileBackdropUrl}")` } as CSSProperties)
          : undefined
      }
    >
      {stacked && (
        <nav className="release-tracklist__mobile-toggle">
          <button
            type="button"
            className={mobileView === "album" ? "active" : ""}
            onClick={() => onMobileViewChange("album")}
          >
            ALBUM
          </button>
          <button
            type="button"
            className={mobileView === "tracks" ? "active" : ""}
            onClick={() => onMobileViewChange("tracks")}
          >
            TRACKS
          </button>
        </nav>
      )}

      {(!stacked || mobileView === "tracks") && (
        <>
          {showBack && (
            <button
              type="button"
              className="release-tracklist__back"
              onClick={() => setView("tracks")}
              aria-label="Back to tracklist"
            >
              <ChevronIcon direction="left" />
            </button>
          )}
          {rightView === "tracks" && tracklistBody}
          {rightView === "lyrics" && lyricsBody}
          {rightView === "versions" && versionsBody}
        </>
      )}

      {plusTrack && (
        <ReleaseAddToPlaylistModal
          track={plusTrack}
          artistName={artistName}
          releaseTitle={releaseTitle}
          onClose={() => setPlusTrack(null)}
        />
      )}
    </div>
  );
});

export default ReleaseTracklist;
