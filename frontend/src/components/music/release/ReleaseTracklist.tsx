import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchReleaseTracklist,
  fetchTrackLyrics,
  fetchTrackVersions,
} from "../../../api";
import { prefetchReleaseTrackCredits } from "../../../releaseTrackCreditsCache";
import type {
  ReleaseEdition,
  ReleaseTrackItem,
  ReleaseTracklist,
  TrackVersionItem,
} from "../../../types";
import { ReleaseTrackTitle } from "./releaseTrackTitle";
import ReleaseAddToPlaylistModal from "./ReleaseAddToPlaylistModal";
import ReleaseInlineLyrics from "./ReleaseInlineLyrics";
import ReleaseLyricsEditModal from "./ReleaseLyricsEditModal";
import { ChevronIcon, parseTrackPanelMeta, trackDisplayTitle, trackMainTitle } from "./releaseTrackPanelMeta";
import { TrackActionEditIcon, TrackActionRetryIcon } from "./releaseTrackActionIcons";

const tracklistCache = new Map<string, ReleaseTracklist>();

function tracklistCacheKey(bandId: number, releaseId: string) {
  return `v6:${bandId}:${releaseId}`;
}

export function prefetchReleaseTracklist(bandId: number, releaseId: string) {
  const cacheKey = tracklistCacheKey(bandId, releaseId);
  if (tracklistCache.has(cacheKey)) return Promise.resolve();
  return fetchReleaseTracklist(bandId, releaseId).then((payload) => {
    tracklistCache.set(cacheKey, payload);
  });
}

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
  findTrackContext: (path: string) => {
    track: ReleaseTrackItem;
    art: ReleasePlaybackArt;
    editionIndex: number;
  } | null;
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
  onActiveTrackChange?: (track: ReleaseTrackItem | null) => void;
  onPanelActionsChange?: (state: {
    track: ReleaseTrackItem | null;
    showLyrics: boolean;
    showVersions: boolean;
  }) => void;
  onResumeTrack?: (path: string) => void;
  onRightViewChange?: (view: ReleaseRightView) => void;
  mobileBackdropUrl?: string | null;
  reloadKey?: number;
  isAdmin?: boolean;
};

function trackArt(
  track: ReleaseTrackItem,
  edition: ReleaseEdition,
  groupDisc?: string | null
): ReleasePlaybackArt {
  const trackLayers = track.background_layers;
  const hasTrackArt = Boolean(
    trackLayers?.length ||
      track.canvas_url ||
      track.cover_animation_url ||
      (track.cover_url && track.cover_url !== edition.cover_url)
  );

  if (hasTrackArt) {
    return {
      cover_url: track.cover_url ?? edition.cover_url ?? null,
      cover_animation_url: track.cover_animation_url ?? edition.cover_animation_url ?? null,
      canvas_url: track.canvas_url ?? edition.canvas_url ?? null,
      disc_url: track.disc_url ?? groupDisc ?? edition.disc_url ?? null,
      background_layers:
        trackLayers && trackLayers.length > 0 ? trackLayers : edition.background_layers,
    };
  }

  const useEditionArt = edition.kind === "bside" || edition.kind === "single";
  const cover = track.cover_url ?? edition.cover_url ?? null;
  const background_layers = useEditionArt
    ? track.cover_url
      ? [
          track.cover_url,
          ...(edition.background_layers ?? []).filter((url) => url !== track.cover_url),
        ]
      : edition.background_layers
    : edition.background_layers;
  return {
    cover_url: cover,
    cover_animation_url: track.cover_animation_url ?? edition.cover_animation_url ?? null,
    canvas_url: track.canvas_url ?? edition.canvas_url ?? null,
    disc_url: track.disc_url ?? groupDisc ?? edition.disc_url ?? null,
    background_layers,
  };
}

function versionPlaybackArt(version: TrackVersionItem): ReleasePlaybackArt {
  return {
    cover_url: version.cover_url,
    cover_animation_url: version.cover_animation_url ?? null,
    canvas_url: version.canvas_url ?? null,
    disc_url: version.disc_url ?? null,
    background_layers: version.background_layers,
  };
}

function versionToTrackItem(version: TrackVersionItem): ReleaseTrackItem {
  return {
    id: version.play_path,
    number: 0,
    title: version.title,
    play_path: version.play_path,
    duration_sec: null,
    duration: version.duration ?? null,
    has_lrc: false,
    is_link: false,
    cover_url: version.cover_url,
    cover_animation_url: version.cover_animation_url,
    canvas_url: version.canvas_url,
    disc_url: version.disc_url,
    background_layers: version.background_layers,
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
    onActiveTrackChange,
    onPanelActionsChange,
    onResumeTrack,
    onRightViewChange,
    mobileBackdropUrl,
    reloadKey = 0,
    isAdmin = false,
  },
  ref
) {
  const cacheKey = tracklistCacheKey(bandId, releaseId);
  const [data, setData] = useState<ReleaseTracklist | null>(
    () => tracklistCache.get(cacheKey) ?? null
  );
  const [loading, setLoading] = useState(() => !tracklistCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const [rightView, setRightView] = useState<ReleaseRightView>("tracks");
  const [lyricsTrack, setLyricsTrack] = useState<ReleaseTrackItem | null>(null);
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [syncedLyrics, setSyncedLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [versionsTrack, setVersionsTrack] = useState<ReleaseTrackItem | null>(null);
  const [versions, setVersions] = useState<TrackVersionItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [plusTrack, setPlusTrack] = useState<ReleaseTrackItem | null>(null);
  const [lyricsEditOpen, setLyricsEditOpen] = useState(false);
  const [versionsReturnPath, setVersionsReturnPath] = useState<string | null>(null);
  const [playingVersionPath, setPlayingVersionPath] = useState<string | null>(null);
  const lyricsRequestRef = useRef(0);

  const setView = useCallback(
    (view: ReleaseRightView) => {
      setRightView(view);
      onRightViewChange?.(view);
    },
    [onRightViewChange]
  );

  const load = useCallback(async () => {
    const cached = tracklistCache.get(cacheKey);
    if (cached) {
      setData(cached);
      setView("tracks");
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchReleaseTracklist(bandId, releaseId);
      tracklistCache.set(cacheKey, payload);
      setData(payload);
      setView("tracks");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bandId, releaseId, cacheKey, setView]);

  useEffect(() => {
    if (reloadKey > 0) {
      tracklistCache.delete(cacheKey);
    }
    void load();
  }, [load, reloadKey, cacheKey]);

  useEffect(() => {
    if (!data) return;
    const titles = data.editions.flatMap((edition) =>
      edition.groups.flatMap((group) => group.tracks.map((track) => track.title))
    );
    prefetchReleaseTrackCredits(bandId, releaseId, titles);
  }, [data, bandId, releaseId]);

  const allTracksFlat = useMemo(() => {
    if (!data) return [] as ReleaseTrackItem[];
    return data.editions.flatMap((ed) => ed.groups.flatMap((g) => g.tracks));
  }, [data]);

  const trackContexts = useMemo(() => {
    if (!data) return [] as Array<{
      track: ReleaseTrackItem;
      edition: ReleaseEdition;
      editionIndex: number;
      groupDisc?: string | null;
    }>;
    return data.editions.flatMap((ed, editionIndex) =>
      ed.groups.flatMap((group) =>
        group.tracks.map((track) => ({
          track,
          edition: ed,
          editionIndex,
          groupDisc: group.disc_url,
        }))
      )
    );
  }, [data]);

  const playingEditionId = useMemo(() => {
    if (!playingPath) return null;
    const match = trackContexts.find((ctx) => ctx.track.play_path === playingPath);
    return match?.edition.id ?? null;
  }, [playingPath, trackContexts]);

  const resolveTrackContext = useCallback(
    (path: string) => {
      const match = trackContexts.find((ctx) => ctx.track.play_path === path);
      if (!match) return null;
      return {
        track: match.track,
        art: trackArt(match.track, match.edition, match.groupDisc),
        editionIndex: match.editionIndex,
      };
    },
    [trackContexts]
  );

  useEffect(() => {
    if (!onActiveTrackChange) return;
    const current = resolveTrackContext(playingPath ?? "")?.track ?? null;
    onActiveTrackChange(current);
  }, [playingPath, resolveTrackContext, onActiveTrackChange]);

  useEffect(() => {
    if (!onPanelActionsChange) return;

    if (rightView === "lyrics") {
      onPanelActionsChange({
        track: lyricsTrack ?? resolveTrackContext(playingPath ?? "")?.track ?? null,
        showLyrics: false,
        showVersions: true,
      });
      return;
    }

    if (rightView === "versions") {
      if (playingVersionPath) {
        const version = versions.find((v) => v.play_path === playingVersionPath);
        onPanelActionsChange({
          track: version ? versionToTrackItem(version) : versionsTrack,
          showLyrics: true,
          showVersions: false,
        });
        return;
      }
      onPanelActionsChange({
        track: versionsTrack,
        showLyrics: true,
        showVersions: false,
      });
      return;
    }

    const current = resolveTrackContext(playingPath ?? "")?.track ?? null;
    onPanelActionsChange({
      track: current,
      showLyrics: true,
      showVersions: true,
    });
  }, [
    playingPath,
    playingVersionPath,
    rightView,
    lyricsTrack,
    resolveTrackContext,
    versions,
    versionsTrack,
    onPanelActionsChange,
  ]);

  const loadLyricsForTrack = useCallback(
    (track: ReleaseTrackItem, options?: { switchView?: boolean; retry?: boolean }) => {
      const requestId = ++lyricsRequestRef.current;
      setLyricsTrack(track);
      setLyricsText(null);
      setSyncedLyrics(null);
      if (options?.switchView !== false) {
        setView("lyrics");
      }

      setLyricsLoading(true);

      const applyResult = (res: {
        lyrics: string | null;
        synced_lyrics?: string | null;
      }) => {
        if (requestId !== lyricsRequestRef.current) return;
        setLyricsText(res.lyrics);
        setSyncedLyrics(res.synced_lyrics ?? null);
      };

      void (async () => {
        try {
          const lyricsTitle = trackMainTitle(track.title);
          let res = await fetchTrackLyrics(artistName, lyricsTitle, track.play_path);
          if (!res.lyrics && !options?.retry) {
            await new Promise((resolve) => window.setTimeout(resolve, 700));
            if (requestId !== lyricsRequestRef.current) return;
            res = await fetchTrackLyrics(artistName, lyricsTitle, track.play_path);
          }
          applyResult(res);
        } catch {
          if (requestId !== lyricsRequestRef.current) return;
        } finally {
          if (requestId !== lyricsRequestRef.current) return;
          setLyricsLoading(false);
        }
      })();
    },
    [artistName, setView]
  );

  const openLyrics = (track: ReleaseTrackItem) => {
    loadLyricsForTrack(track);
  };

  useEffect(() => {
    if (rightView !== "lyrics" || !playingPath) return;
    const ctx = resolveTrackContext(playingPath);
    if (!ctx) return;
    if (lyricsTrack?.play_path === ctx.track.play_path) return;
    loadLyricsForTrack(ctx.track, { switchView: false });
  }, [playingPath, rightView, resolveTrackContext, lyricsTrack?.play_path, loadLyricsForTrack]);

  const openVersions = (track: ReleaseTrackItem) => {
    setVersionsReturnPath(playingPath);
    setPlayingVersionPath(null);
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

  const handleBack = useCallback(() => {
    if (rightView === "versions") {
      const returnPath = versionsReturnPath;
      setPlayingVersionPath(null);
      setVersionsReturnPath(null);
      setView("tracks");
      if (returnPath && onResumeTrack) {
        onResumeTrack(returnPath);
      }
      return;
    }
    setView("tracks");
  }, [onResumeTrack, rightView, setView, versionsReturnPath]);

  const adjacentTracks = useCallback(
    (path: string) => {
      const tracks = allTracksFlat;
      const idx = tracks.findIndex((t) => t.play_path === path);
      if (idx < 0 || tracks.length === 0) return { prev: null, next: null };
      return {
        prev: tracks[(idx - 1 + tracks.length) % tracks.length],
        next: tracks[(idx + 1) % tracks.length],
      };
    },
    [allTracksFlat]
  );

  useImperativeHandle(
    ref,
    () => ({
      openLyrics: (track) => openLyrics(track),
      openVersions: (track) => openVersions(track),
      openPlus: (track) => setPlusTrack(track),
      adjacentTracks,
      allTracks: () => allTracksFlat,
      findTrackContext: (path) => resolveTrackContext(path),
    }),
    [adjacentTracks, allTracksFlat, resolveTrackContext]
  );

  if (loading && !data) {
    return <p className="muted release-tracklist__loading">Loading tracklist…</p>;
  }
  if (error) {
    return <p className="error release-tracklist__error">{error}</p>;
  }
  if (!data || allTracksFlat.length === 0) {
    return <p className="muted release-tracklist__empty">No tracks found.</p>;
  }

  const showMultipleEditions = data.editions.length > 1;

  const tracklistBody = (
    <div className="release-tracklist__content">
      {data.editions.map((ed) => {
        const editionActive = playingEditionId === ed.id;
        const editionClass = [
          "release-tracklist__edition-block",
          ed.kind === "bside" ? "release-tracklist__edition-block--bside" : "",
          editionActive ? "release-tracklist__edition-block--active" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <section key={ed.id} className={editionClass}>
            {(showMultipleEditions || ed.kind === "bside") && (
              <h2 className="release-tracklist__edition-title">{ed.label}</h2>
            )}

            {ed.groups.map((group) => {
              const showGroupLabels =
                ed.groups.length > 1 || (ed.kind === "bside" && Boolean(group.label));
              return (
              <div key={group.id} className="release-tracklist__group">
                {showGroupLabels && group.label && (
                  <h3 className="release-tracklist__group-label">{group.label}</h3>
                )}
                <ol className="release-tracklist__tracks">
                  {group.tracks.map((track) => {
                    const active = playingPath === track.play_path;
                    const art = trackArt(track, ed, group.disc_url);
                    return (
                      <li
                        key={track.id}
                        className={
                          active ? "release-tracklist__row active" : "release-tracklist__row"
                        }
                      >
                        <button
                          type="button"
                          className="release-tracklist__play"
                          onClick={() => onPlay(track.play_path, track.title, art, ed.label)}
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
              </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );

  const versionsTitle = versionsTrack
    ? `${parseTrackPanelMeta(versionsTrack.title).mainTitle} versions`
    : "Versions";

  const lyricsBody = lyricsTrack && (
    <ReleaseInlineLyrics
      lyrics={lyricsText}
      syncedLyrics={syncedLyrics}
      currentTime={playbackProgress}
      loading={lyricsLoading}
    />
  );

  const lyricsHead = lyricsTrack ? (
    <div className="release-tracklist__subview-head">
      <button
        type="button"
        className="release-tracklist__back"
        onClick={handleBack}
        aria-label="Back to tracklist"
      >
        <ChevronIcon direction="left" />
      </button>
      <h2 className="release-tracklist__subview-title">
        {trackDisplayTitle(lyricsTrack.title)}
      </h2>
      <div className="release-tracklist__subview-actions">
        {!lyricsLoading && !lyricsText && !syncedLyrics && (
          <button
            type="button"
            className="release-tracklist__lyrics-retry"
            onClick={() =>
              loadLyricsForTrack(lyricsTrack, { switchView: false, retry: true })
            }
            disabled={lyricsLoading}
            title="Retry"
            aria-label="Retry"
          >
            <TrackActionRetryIcon className="release-tracklist__lyrics-retry-icon" />
          </button>
        )}
        {isAdmin && !lyricsLoading && (
          <button
            type="button"
            className="release-tracklist__lyrics-edit"
            onClick={() => setLyricsEditOpen(true)}
            title={lyricsText || syncedLyrics ? "Edit lyrics" : "Add lyrics"}
            aria-label={lyricsText || syncedLyrics ? "Edit lyrics" : "Add lyrics"}
          >
            <TrackActionEditIcon className="release-tracklist__lyrics-edit-icon" />
          </button>
        )}
      </div>
    </div>
  ) : null;

  const versionsListBody = (
    <div className="release-tracklist__content">
      {versionsLoading && <p className="muted">Loading versions…</p>}
      {versionsError && <p className="error">{versionsError}</p>}
      {!versionsLoading && !versionsError && versions.length === 0 && (
        <p className="muted">No alternate versions found.</p>
      )}
      {versions.length > 0 && (
        <section className="release-tracklist__group">
          <ol className="release-tracklist__tracks">
            {versions.map((v, i) => {
              const active = playingPath === v.play_path;
              return (
                <li
                  key={v.play_path}
                  className={active ? "release-tracklist__row active" : "release-tracklist__row"}
                >
                  <button
                    type="button"
                    className="release-tracklist__play"
                    onClick={() => {
                      setPlayingVersionPath(v.play_path);
                      onPlay(v.play_path, v.title, versionPlaybackArt(v));
                    }}
                  >
                    <span className="release-tracklist__num">{i + 1}</span>
                    <ReleaseTrackTitle title={v.title} />
                    {v.duration && (
                      <span className="release-tracklist__duration">{v.duration}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );

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
          {rightView === "lyrics" && lyricsTrack && (
            <>
              {lyricsHead}
              {lyricsBody}
            </>
          )}
          {rightView === "tracks" && tracklistBody}
          {rightView === "versions" && (
            <>
              <div className="release-tracklist__subview-head">
                <button
                  type="button"
                  className="release-tracklist__back"
                  onClick={handleBack}
                  aria-label="Back to tracklist"
                >
                  <ChevronIcon direction="left" />
                </button>
                <h2 className="release-tracklist__subview-title">{versionsTitle}</h2>
              </div>
              {versionsListBody}
            </>
          )}
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

      {lyricsEditOpen && lyricsTrack && (
        <ReleaseLyricsEditModal
          artistName={artistName}
          trackTitle={lyricsTrack.title}
          displayTitle={trackMainTitle(lyricsTrack.title)}
          playPath={lyricsTrack.play_path}
          initialLyrics={lyricsText ?? ""}
          onClose={() => setLyricsEditOpen(false)}
          onSaved={(text, synced) => {
            setLyricsText(text);
            setSyncedLyrics(synced);
          }}
        />
      )}
    </div>
  );
});

export default ReleaseTracklist;
