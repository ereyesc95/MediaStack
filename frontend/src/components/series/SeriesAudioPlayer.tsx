import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchSeriesPlayerTracks, fetchMoviesFilmPlayerTracks } from "../../api";
import { IconMediaMusic } from "../MenuIcons";
import {
  MiniAudioPlayerControls,
  useMiniAudio,
} from "../music/artist/MiniAudioPlayer";
import { useBeatPulse } from "../../useBeatPulse";

type Track = {
  id: string;
  title: string;
  play_url: string;
  cover_url?: string | null;
  artist?: string | null;
};

type Props = {
  franchiseId: string;
  /** When set, load tracks from the film Audio/ folder instead of series. */
  filmId?: string;
  enabled?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** When set, dock open state is controlled by the parent. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the top-bar music note toggle (e.g. when control lives in the menu). */
  hideToggle?: boolean;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Prefer `[By Artist]` / `(By Artist)` when the track artist is Various Artists. */
function displayTrackArtist(
  artist?: string | null,
  title?: string | null
): string | null {
  if (!artist) return null;
  if (!/^various\s+artists$/i.test(artist.trim())) return artist;
  const fromTitle =
    title?.match(/\[\s*by\s+([^\]]+?)\s*\]/i) ||
    title?.match(/\(\s*by\s+([^)]+?)\s*\)/i);
  const named = fromTitle?.[1]?.trim();
  return named || artist;
}

export default function SeriesAudioPlayer({
  franchiseId,
  filmId,
  enabled = true,
  onPlayingChange,
  open: openProp,
  onOpenChange,
  hideToggle = false,
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
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(0);
  const loadedForRef = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dockPortalRef = useRef<HTMLDivElement>(null);

  useBeatPulse(
    audio.audioRef,
    Boolean(enabled && (open || audio.playing)),
    Boolean(audio.playing)
  );

  useEffect(() => {
    onPlayingChange?.(audio.playing);
  }, [audio.playing, onPlayingChange]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

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
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const playAt = useCallback(
    (i: number, list: Track[]) => {
      const t = list[i];
      if (!t?.play_url) return;
      setIndex(i);
      audio.loadSrc(t.play_url, true);
    },
    [audio]
  );

  const loadTracks = useCallback(async () => {
    setLoading(true);
    const cacheKey = filmId ? `film:${filmId}` : `series:${franchiseId}`;
    try {
      const data = filmId
        ? await fetchMoviesFilmPlayerTracks(filmId)
        : await fetchSeriesPlayerTracks(franchiseId);
      const shuffled = shuffle(data.tracks || []);
      setTracks(shuffled);
      queueRef.current = shuffled;
      loadedForRef.current = cacheKey;
      if (shuffled.length) playAt(0, shuffled);
    } catch {
      setTracks([]);
      loadedForRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [franchiseId, filmId, playAt]);

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

  const scopeKey = filmId ? `film:${filmId}` : `series:${franchiseId}`;

  useEffect(() => {
    if (open && loadedForRef.current !== scopeKey) {
      void loadTracks();
    }
  }, [open, scopeKey, loadTracks]);

  useEffect(() => {
    const el = audio.audioRef.current;
    if (!el) return;
    const onEnd = () => playNext();
    el.addEventListener("ended", onEnd);
    return () => el.removeEventListener("ended", onEnd);
  }, [audio.audioRef, playNext]);

  useEffect(() => {
    loadedForRef.current = null;
    setTracks([]);
    setIndex(0);
    queueRef.current = [];
    audio.clear();
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when scope changes
  }, [scopeKey]);

  if (!enabled) return null;

  const now = tracks[index];
  const nowArtist = displayTrackArtist(now?.artist, now?.title);

  const dockBody =
    loading ? (
      <span className="muted">Loading tracks…</span>
    ) : tracks.length === 0 ? (
      <span className="muted">No audio found</span>
    ) : (
      <>
        <div className="series-audio-player__now">
          {now?.cover_url ? <img src={now.cover_url} alt="" /> : null}
          <div>
            <strong>{now?.title}</strong>
            {nowArtist ? <span className="muted">{nowArtist}</span> : null}
          </div>
        </div>
        <MiniAudioPlayerControls
          playing={audio.playing}
          progress={audio.progress}
          duration={audio.duration}
          toggle={audio.toggle}
          seek={audio.seek}
          onPrev={playPrev}
          onNext={playNext}
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
              audio.playing && !open ? " series-audio-player__toggle--live" : ""
            }`}
            aria-pressed={open}
            aria-label={open ? "Hide player" : "Show player"}
            title={open ? "Hide player" : "Show player"}
            onClick={() => {
              const next = !open;
              setOpen(next);
              if (next && loadedForRef.current !== scopeKey) {
                void loadTracks();
              }
            }}
          >
            <IconMediaMusic className="series-audio-player__icon" />
          </button>
        ) : null}
        {open && !hideToggle ? dock : null}
        <audio
          ref={audio.audioRef}
          src={audio.src ?? undefined}
          preload="metadata"
        />
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
    </>
  );
}
