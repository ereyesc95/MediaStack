import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchBooksHomeAudioPool,
  fetchGamesHomeAudioPool,
  fetchMoviesHomeAudioPool,
  fetchSeriesHomeAudioPool,
} from "../api";
import {
  applyPlaybackThemeFromCover,
  endPlaybackThemeSession,
  onPlaybackPaused,
  onPlaybackResumed,
  setPlaybackPlaying,
} from "../mediaTheme";
import { musicStreamUrl } from "../musicStreamUrl";
import { useBeatPulse } from "../useBeatPulse";
import { IconMediaMusic } from "./MenuIcons";
import {
  MiniAudioPlayerControls,
  useMiniAudio,
} from "./music/artist/MiniAudioPlayer";
import { trackMainTitle } from "./music/release/releaseTrackPanelMeta";

export type ModuleHomeAudioKind = "series" | "movies" | "books" | "games";

type Track = {
  id: string;
  title: string;
  play_url?: string;
  play_path?: string | null;
  cover_url?: string | null;
  artist?: string | null;
  navigate_band_id?: number | null;
  navigate_release_id?: string | null;
  release_title?: string | null;
};

type Props = {
  module: ModuleHomeAudioKind;
  enabled?: boolean;
  hideToggle?: boolean;
  /** Controlled open (portrait menu). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  userId?: number;
  onOpenMusicRelease?: (bandId: number, releaseId: string) => void;
  onOpenMusicArtist?: (bandId: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  onCoverChange?: (coverUrl: string | null) => void;
  onHasSrcChange?: (hasSrc: boolean) => void;
};

async function loadPool(module: ModuleHomeAudioKind): Promise<Track[]> {
  const data =
    module === "movies"
      ? await fetchMoviesHomeAudioPool()
      : module === "books"
        ? await fetchBooksHomeAudioPool()
        : module === "games"
          ? await fetchGamesHomeAudioPool()
          : await fetchSeriesHomeAudioPool();
  return (data.tracks || []) as Track[];
}

function playUrlFor(track: Track): string | null {
  if (track.play_url) return track.play_url;
  if (track.play_path) return musicStreamUrl(track.play_path);
  return null;
}

/**
 * Top-bar bubble for Series/Movies/Books/Games home chrome.
 * Prefetches a 10-track pool in the background; icon appears when ready.
 * Applies adaptive cover theme + reports cover/playing for parent backdrop FX.
 */
export default function ModuleHomeAudioPlayer({
  module,
  enabled = true,
  hideToggle = false,
  open: openProp,
  onOpenChange,
  userId,
  onOpenMusicRelease,
  onOpenMusicArtist,
  onPlayingChange,
  onCoverChange,
  onHasSrcChange,
}: Props) {
  const audio = useMiniAudio();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    if (openProp === undefined) setOpenInternal(value);
    onOpenChange?.(value);
  };
  const [tracks, setTracks] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [repeatOne, setRepeatOne] = useState(false);
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const dockPortalRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);
  const coverRef = useRef<string | null>(null);

  useBeatPulse(
    audio.audioRef,
    Boolean(enabled && tracks.length && (open || audio.playing || audio.src)),
    Boolean(audio.playing)
  );

  useEffect(() => {
    onPlayingChange?.(audio.playing);
  }, [audio.playing, onPlayingChange]);

  useEffect(() => {
    onHasSrcChange?.(Boolean(audio.src));
  }, [audio.src, onHasSrcChange]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void loadPool(module)
      .then((list) => {
        if (cancelled) return;
        setTracks(list);
        queueRef.current = list;
        loadedRef.current = true;
      })
      .catch(() => {
        if (cancelled) return;
        setTracks([]);
        queueRef.current = [];
        loadedRef.current = false;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [module, enabled]);

  useEffect(() => {
    return () => {
      endPlaybackThemeSession(userId);
      onCoverChange?.(null);
      onPlayingChange?.(false);
      onHasSrcChange?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (dockPortalRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const playAt = useCallback(
    (i: number, list: Track[]) => {
      const t = list[i];
      const url = t ? playUrlFor(t) : null;
      if (!t || !url) return;
      setIndex(i);
      const cover = t.cover_url ?? null;
      coverRef.current = cover;
      onCoverChange?.(cover);
      audio.loadSrc(url, true, {
        media: {
          title: trackMainTitle(t.title) || t.title || "Track",
          artist: t.artist ?? null,
          album: t.release_title ?? null,
          artworkUrl: cover,
        },
      });
      setPlaybackPlaying(true);
      applyPlaybackThemeFromCover(cover, userId);
    },
    [audio, onCoverChange, userId]
  );

  const playNext = useCallback(() => {
    const q = queueRef.current;
    if (!q.length) return;
    const next = (indexRef.current + 1) % q.length;
    playAt(next, q);
  }, [playAt]);

  const playPrev = useCallback(() => {
    const q = queueRef.current;
    if (!q.length) return;
    const prev = (indexRef.current - 1 + q.length) % q.length;
    playAt(prev, q);
  }, [playAt]);

  useEffect(() => {
    audio.setSessionHandlers({
      previous: () => playPrev(),
      next: () => playNext(),
    });
    return () => audio.setSessionHandlers(null);
  }, [audio, playNext, playPrev]);

  useEffect(() => {
    const el = audio.audioRef.current;
    if (!el) return;
    const onPause = () => onPlaybackPaused(userId);
    const onPlay = () => {
      setPlaybackPlaying(true);
      onPlaybackResumed(coverRef.current, userId);
    };
    const onEnd = () => {
      if (repeatOne) {
        el.currentTime = 0;
        void el.play().catch(() => {});
        return;
      }
      playNext();
    };
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("ended", onEnd);
    };
  }, [audio.audioRef, playNext, repeatOne, userId]);

  if (!enabled) return null;
  // Keep chrome quiet until we know there is something to play.
  if (!loading && tracks.length === 0) return null;

  const now = tracks[index];
  const artistLabel = (now?.artist || "").trim();
  const canOpenRelease = Boolean(
    now?.navigate_band_id &&
      now?.navigate_release_id &&
      onOpenMusicRelease
  );
  const canOpenArtist = Boolean(now?.navigate_band_id && onOpenMusicArtist);

  const dockBody = loading && !tracks.length ? (
    <span className="muted">Loading tracks…</span>
  ) : (
    <>
      <div className="series-audio-player__now">
        {now?.cover_url ? (
          canOpenRelease ? (
            <button
              type="button"
              className="series-audio-player__cover-btn"
              title="Go to release"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenMusicRelease?.(
                  Number(now!.navigate_band_id),
                  String(now!.navigate_release_id)
                );
              }}
            >
              <img src={now.cover_url} alt="" />
            </button>
          ) : (
            <img src={now.cover_url} alt="" />
          )
        ) : null}
        <div>
          <strong>{now?.title ? trackMainTitle(now.title) : "Now playing"}</strong>
          {artistLabel ? (
            canOpenArtist ? (
              <button
                type="button"
                className="series-audio-player__artist-link"
                title="Go to artist"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenMusicArtist?.(Number(now!.navigate_band_id));
                }}
              >
                {artistLabel}
              </button>
            ) : (
              <span className="muted">{artistLabel}</span>
            )
          ) : null}
        </div>
      </div>
      <MiniAudioPlayerControls
        playing={audio.playing}
        progress={audio.progress}
        duration={audio.duration}
        toggle={() => {
          if (!audio.src && tracks.length) {
            playAt(index, tracks);
            return;
          }
          audio.toggle();
        }}
        seek={audio.seek}
        onPrev={playPrev}
        onNext={playNext}
        repeatOne={repeatOne}
        onRepeatToggle={() => setRepeatOne((r) => !r)}
      />
    </>
  );

  const dock = open ? (
    <div className="series-audio-player__dock">{dockBody}</div>
  ) : null;

  return (
    <>
      <div
        ref={rootRef}
        className={`series-audio-player${open && !hideToggle ? " is-open" : ""}${
          hideToggle ? " series-audio-player--menu-anchor" : ""
        }`}
      >
        {!hideToggle ? (
          <button
            type="button"
            className={`series-audio-player__toggle${
              audio.playing && !open
                ? " series-audio-player__toggle--live"
                : ""
            }`}
            aria-pressed={open}
            aria-label={open ? "Hide player" : "Show player"}
            title={open ? "Hide player" : "Show player"}
            disabled={loading && !tracks.length}
            onClick={() => {
              const next = !open;
              setOpen(next);
              if (next && tracks.length && !audio.src) {
                playAt(0, tracks);
              }
            }}
          >
            <IconMediaMusic className="series-audio-player__icon" />
          </button>
        ) : null}
        {open && !hideToggle ? dock : null}
      </div>
      {open && hideToggle
        ? createPortal(
            <div
              ref={dockPortalRef}
              className="series-audio-player series-audio-player--menu-only is-open"
            >
              {dock}
            </div>,
            document.body
          )
        : null}
      <audio ref={audio.audioRef} preload="auto" playsInline hidden />
    </>
  );
}
