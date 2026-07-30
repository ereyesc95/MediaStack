import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchSeriesPlayerTracks } from "../../api";
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

export default function SeriesAudioPlayer({
  franchiseId,
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
    try {
      const data = await fetchSeriesPlayerTracks(franchiseId);
      const shuffled = shuffle(data.tracks || []);
      setTracks(shuffled);
      queueRef.current = shuffled;
      loadedForRef.current = franchiseId;
      if (shuffled.length) playAt(0, shuffled);
    } catch {
      setTracks([]);
      loadedForRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [franchiseId, playAt]);

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
    if (open && loadedForRef.current !== franchiseId) {
      void loadTracks();
    }
  }, [open, franchiseId, loadTracks]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when franchise changes
  }, [franchiseId]);

  if (!enabled) return null;

  const now = tracks[index];

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
            {now?.artist ? <span className="muted">{now.artist}</span> : null}
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
            className="series-audio-player__toggle"
            aria-pressed={open}
            aria-label={open ? "Hide player" : "Show player"}
            title={open ? "Hide player" : "Show player"}
            onClick={() => {
              const next = !open;
              setOpen(next);
              if (next && loadedForRef.current !== franchiseId) {
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
