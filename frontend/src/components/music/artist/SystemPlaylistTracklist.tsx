import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { fetchTrackLyrics, fetchTrackVersions } from "../../../api";
import { formatTrackDate } from "../../../formatDate";
import type {
  ArtistPlaylistTrack,
  ReleaseTrackItem,
  TrackVersionItem,
} from "../../../types";
import { ReleaseTrackTitle } from "../release/releaseTrackTitle";
import ReleaseAddToPlaylistModal from "../release/ReleaseAddToPlaylistModal";
import ReleaseInlineLyrics from "../release/ReleaseInlineLyrics";
import LyricsStatusBadge from "../release/LyricsStatusBadge";
import {
  ChevronIcon,
  parseTrackPanelMeta,
  trackDisplayTitle,
  versionSourceFromVersionItem,
} from "../release/releaseTrackPanelMeta";
import { TrackActionEditIcon, TrackActionRetryIcon } from "../release/releaseTrackActionIcons";
import type { ReleaseMobileTrackView, ReleasePlaybackArt } from "../release/ReleaseTracklist";

export type SystemPlaylistTracklistHandle = {
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
  artistName: string;
  tracks: ArtistPlaylistTrack[];
  stacked: boolean;
  compactLyricsHead?: boolean;
  playingPath: string | null;
  playbackProgress?: number;
  mobileView: ReleaseMobileTrackView;
  mobileBackdropUrl?: string | null;
  onPlay: (
    path: string,
    title: string,
    art?: ReleasePlaybackArt,
    track?: ArtistPlaylistTrack
  ) => void;
  onPanelActionsChange?: (state: {
    track: ReleaseTrackItem | null;
    showLyrics: boolean;
    showVersions: boolean;
    panelDateIso?: string | null;
    versionSource?: {
      album_title: string;
      navigate_release_id: string;
      navigate_band_id?: number;
      date_iso?: string | null;
      display_date?: string | null;
    } | null;
  }) => void;
  isAdmin?: boolean;
  hidePerformer?: string;
  hideCoverArtist?: string;
};

function toTrackItem(track: ArtistPlaylistTrack, index: number): ReleaseTrackItem {
  return {
    id: track.play_path ?? `${track.title}-${index}`,
    number: index + 1,
    title: track.title,
    play_path: track.play_path,
    duration: track.duration ?? null,
    duration_sec: track.duration_sec ?? null,
    has_lrc: false,
    has_synced_lrc: false,
    is_link: false,
    cover_url: track.cover_url,
    navigate_release_id: track.navigate_release_id ?? null,
    navigate_band_id: track.navigate_band_id ?? null,
    source_album_title: track.album_title ?? null,
    source_date_iso: track.release_date,
  };
}

function trackArt(track: ArtistPlaylistTrack): ReleasePlaybackArt {
  return {
    cover_url: track.cover_url,
    background_layers: track.cover_url ? [track.cover_url] : [],
  };
}

const SystemPlaylistTracklist = forwardRef<SystemPlaylistTracklistHandle, Props>(
  function SystemPlaylistTracklist(
    {
      bandId,
      artistName,
      tracks,
      stacked,
      compactLyricsHead = false,
      playingPath,
      playbackProgress = 0,
      mobileView,
      mobileBackdropUrl,
      onPlay,
      onPanelActionsChange,
      isAdmin = false,
      hidePerformer,
      hideCoverArtist,
    },
    ref
  ) {
    const trackItems = useMemo(
      () => tracks.map((t, i) => toTrackItem(t, i)),
      [tracks]
    );
    const trackByPath = useMemo(() => {
      const map = new Map<string, ArtistPlaylistTrack>();
      tracks.forEach((t) => {
        if (t.play_path) map.set(t.play_path, t);
      });
      return map;
    }, [tracks]);

    const [rightView, setRightView] = useState<"tracks" | "lyrics" | "versions">("tracks");
    const [lyricsTrack, setLyricsTrack] = useState<ReleaseTrackItem | null>(null);
    const [lyricsText, setLyricsText] = useState<string | null>(null);
    const [syncedLyrics, setSyncedLyrics] = useState<string | null>(null);
    const [lyricsLoading, setLyricsLoading] = useState(false);
    const [versionsTrack, setVersionsTrack] = useState<ReleaseTrackItem | null>(null);
    const [versions, setVersions] = useState<TrackVersionItem[]>([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [versionsError, setVersionsError] = useState<string | null>(null);
    const [plusTrack, setPlusTrack] = useState<ReleaseTrackItem | null>(null);

    const loadLyricsForTrack = useCallback(
      async (track: ReleaseTrackItem, opts?: { switchView?: boolean; retry?: boolean }) => {
        if (opts?.switchView !== false) setRightView("lyrics");
        setLyricsTrack(track);
        setLyricsLoading(true);
        setLyricsText(null);
        setSyncedLyrics(null);
        try {
          const res = await fetchTrackLyrics(artistName, trackDisplayTitle(track.title), track.play_path ?? undefined, {
            bandId,
            releaseId: track.navigate_release_id ?? undefined,
          });
          setLyricsText(res.lyrics);
          setSyncedLyrics(res.synced_lyrics ?? null);
        } catch {
          if (!opts?.retry) {
            setLyricsText(null);
            setSyncedLyrics(null);
          }
        } finally {
          setLyricsLoading(false);
        }
      },
      [artistName, bandId]
    );

    const openLyrics = useCallback(
      (track: ReleaseTrackItem) => void loadLyricsForTrack(track),
      [loadLyricsForTrack]
    );

    const openVersions = useCallback(
      async (track: ReleaseTrackItem) => {
        setRightView("versions");
        setVersionsTrack(track);
        setVersions([]);
        setVersionsError(null);
        const releaseId = track.navigate_release_id;
        if (!releaseId || !track.play_path) {
          setVersionsError("Release not found for this track.");
          return;
        }
        setVersionsLoading(true);
        try {
          const res = await fetchTrackVersions(
            bandId,
            releaseId,
            trackDisplayTitle(track.title),
            track.play_path
          );
          setVersions(res.versions ?? []);
        } catch (e) {
          setVersionsError(e instanceof Error ? e.message : String(e));
        } finally {
          setVersionsLoading(false);
        }
      },
      [bandId]
    );

    const adjacentTracks = useCallback(
      (path: string) => {
        const idx = trackItems.findIndex((t) => t.play_path === path);
        if (idx < 0 || trackItems.length === 0) return { prev: null, next: null };
        return {
          prev: trackItems[(idx - 1 + trackItems.length) % trackItems.length],
          next: trackItems[(idx + 1) % trackItems.length],
        };
      },
      [trackItems]
    );

    useImperativeHandle(
      ref,
      () => ({
        openLyrics,
        openVersions,
        openPlus: (track) => setPlusTrack(track),
        adjacentTracks,
        allTracks: () => trackItems,
      }),
      [adjacentTracks, openLyrics, openVersions, trackItems]
    );

    useEffect(() => {
      if (rightView !== "tracks") return;
      setLyricsTrack(null);
      setVersionsTrack(null);
    }, [rightView]);

    const handleBack = () => setRightView("tracks");

    const handlePlayRow = (track: ArtistPlaylistTrack, item: ReleaseTrackItem) => {
      if (!track.play_path) return;
      const formattedDate = track.release_date
        ? formatTrackDate(track.release_date)
        : null;
      const versionSource =
        track.album_title && track.navigate_release_id
          ? {
              album_title: track.album_title,
              navigate_release_id: track.navigate_release_id,
              navigate_band_id: bandId,
              date_iso: track.release_date,
              display_date: formattedDate,
            }
          : null;
      onPlay(track.play_path, track.title, trackArt(track), track);
      onPanelActionsChange?.({
        track: item,
        showLyrics: true,
        showVersions: Boolean(track.navigate_release_id),
        panelDateIso: track.release_date,
        versionSource,
      });
    };

    const tracklistBody = (
      <div className="release-tracklist__content">
        <ol className="release-tracklist__tracks">
          {tracks.map((track, index) => {
            const item = trackItems[index]!;
            const active = playingPath === track.play_path;
            return (
              <li
                key={item.id}
                className={active ? "release-tracklist__row active" : "release-tracklist__row"}
              >
                <button
                  type="button"
                  className="release-tracklist__play"
                  onClick={() => handlePlayRow(track, item)}
                  disabled={!track.play_path}
                  aria-label={`Play ${track.title}`}
                >
                  <span className="release-tracklist__num">{index + 1}</span>
                  <span className="release-tracklist__title-wrap">
                    <ReleaseTrackTitle
                      title={track.title}
                      billboard={stacked}
                      hidePerformer={hidePerformer}
                      hideCoverArtist={hideCoverArtist}
                    />
                  </span>
                  {track.duration ? (
                    <span className="release-tracklist__duration">{track.duration}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    );

    const lyricsBody = lyricsTrack && (
      <ReleaseInlineLyrics
        title={trackDisplayTitle(lyricsTrack.title)}
        lyrics={lyricsText}
        syncedLyrics={syncedLyrics}
        currentTime={playbackProgress}
        loading={lyricsLoading}
      />
    );

    const lyricsToolbar = lyricsTrack ? (
      <div className="release-tracklist__lyrics-toolbar">
        <button
          type="button"
          className="release-tracklist__back"
          onClick={handleBack}
          aria-label="Back to tracklist"
        >
          <ChevronIcon direction="left" />
        </button>
        <div className="release-tracklist__subview-actions">
          {!lyricsLoading && !lyricsText && !syncedLyrics && (
            <button
              type="button"
              className="release-tracklist__lyrics-retry"
              onClick={() => void loadLyricsForTrack(lyricsTrack, { switchView: false, retry: true })}
              disabled={lyricsLoading}
              title="Retry"
              aria-label="Retry"
            >
              <TrackActionRetryIcon className="release-tracklist__lyrics-retry-icon" />
            </button>
          )}
          {!lyricsLoading && syncedLyrics && (
            <LyricsStatusBadge synced iconOnly={compactLyricsHead} title="Timestamped synced lyrics" />
          )}
          {!lyricsLoading && lyricsText && !syncedLyrics && (
            <LyricsStatusBadge synced={false} iconOnly={compactLyricsHead} title="Lyrics without timestamps" />
          )}
        </div>
      </div>
    ) : null;

    const versionsTitle = versionsTrack
      ? `${parseTrackPanelMeta(versionsTrack.title).mainTitle} Versions`
      : "Versions";

    return (
      <div
        className={`release-tracklist${stacked ? " release-tracklist--stacked" : ""}${
          rightView === "lyrics" ? " release-tracklist--lyrics" : ""
        }${
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
        <div className="release-tracklist__body">
          {rightView === "lyrics" && lyricsTrack && (
            <div className="release-tracklist__lyrics-view">
              {lyricsToolbar}
              {lyricsBody}
            </div>
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
              <div className="release-tracklist__content">
                {versionsLoading && <p className="muted">Loading versions…</p>}
                {versionsError && <p className="error">{versionsError}</p>}
                {!versionsLoading && !versionsError && versions.length === 0 && (
                  <p className="muted">No alternate versions found.</p>
                )}
                {versions.length > 0 && (
                  <ol className="release-tracklist__tracks">
                    {versions.map((v, i) => {
                      const active = playingPath === v.play_path;
                      const sourceTrack = trackByPath.get(versionsTrack?.play_path ?? "");
                      return (
                        <li
                          key={v.play_path}
                          className={active ? "release-tracklist__row active" : "release-tracklist__row"}
                        >
                          <button
                            type="button"
                            className="release-tracklist__play"
                            onClick={() => {
                              const source = versionSourceFromVersionItem(
                                v,
                                versionsTrack?.play_path ?? null
                              );
                              onPlay(v.play_path, v.title, {
                                cover_url: v.cover_url,
                                cover_animation_url: v.cover_animation_url,
                                canvas_url: v.canvas_url,
                                disc_url: v.disc_url,
                                background_layers: v.background_layers,
                              });
                              onPanelActionsChange?.({
                                track: {
                                  id: v.play_path,
                                  number: i + 1,
                                  title: v.title,
                                  play_path: v.play_path,
                                  duration: v.duration ?? null,
                                  duration_sec: null,
                                  has_lrc: false,
                                  has_synced_lrc: false,
                                  is_link: false,
                                  cover_url: v.cover_url,
                                  navigate_release_id:
                                    v.navigate_release_id ??
                                    sourceTrack?.navigate_release_id ??
                                    null,
                                },
                                showLyrics: true,
                                showVersions: false,
                                panelDateIso: v.date_iso ?? source?.date_iso ?? null,
                                versionSource: source,
                              });
                            }}
                          >
                            <span className="release-tracklist__num">{i + 1}</span>
                            <ReleaseTrackTitle
                              title={v.title}
                              billboard={stacked}
                              hidePerformer={hidePerformer}
                            />
                            {v.duration && (
                              <span className="release-tracklist__duration">{v.duration}</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </>
          )}
        </div>

        {plusTrack && (
          <ReleaseAddToPlaylistModal
            bandId={bandId}
            trackTitle={plusTrack.title}
            playPath={plusTrack.play_path ?? undefined}
            onClose={() => setPlusTrack(null)}
          />
        )}
      </div>
    );
  }
);

export default SystemPlaylistTracklist;
