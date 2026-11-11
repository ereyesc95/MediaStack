import { useCallback, useEffect, useRef, useState } from "react";
import { resumeBeatAudioContext } from "../../../beatAudioGraph";
import {
  clearNowPlaying,
  mediaSessionOwnsElement,
  setMediaSessionHandlers,
  setNowPlaying,
  type MediaLoadOptions,
  type MediaSessionHandlers,
  type NowPlayingInfo,
} from "../../../mediaSession";

export type MiniAudioControls = {
  playing: boolean;
  progress: number;
  duration: number;
  toggle: () => void;
  seek: (value: number) => void;
};

export type MiniAudioLoadOptions = MediaLoadOptions;

export function useMiniAudio() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const autoPlayRef = useRef(false);
  const srcRef = useRef<string | null>(null);
  const sessionHandlersRef = useRef<MediaSessionHandlers>({});

  const publishSession = useCallback(
    (media: NowPlayingInfo | null | undefined, el: HTMLAudioElement | null) => {
      if (!media?.title?.trim()) return;
      setNowPlaying(media, {
        element: el,
        handlers: {
          play: () => void el?.play().catch(() => {}),
          pause: () => el?.pause(),
          seekTo: (seconds) => {
            if (el) el.currentTime = seconds;
          },
          ...sessionHandlersRef.current,
        },
      });
    },
    []
  );

  const setSessionHandlers = useCallback((next: MediaSessionHandlers | null) => {
    sessionHandlersRef.current = next ? { ...next } : {};
    setMediaSessionHandlers({
      play: () => {
        const el = audioRef.current;
        if (el) void el.play().catch(() => {});
      },
      pause: () => audioRef.current?.pause(),
      seekTo: (seconds) => {
        const el = audioRef.current;
        if (el) el.currentTime = seconds;
      },
      ...sessionHandlersRef.current,
    });
  }, []);

  const loadSrc = useCallback(
    (url: string | null, autoPlay = false, options?: MiniAudioLoadOptions) => {
      const el = audioRef.current;
      if (options?.sessionHandlers !== undefined) {
        sessionHandlersRef.current = options.sessionHandlers
          ? { ...options.sessionHandlers }
          : {};
      }
      if (!url) {
        autoPlayRef.current = false;
        srcRef.current = null;
        setSrc(null);
        setPlaying(false);
        setProgress(0);
        setDuration(0);
        if (el && mediaSessionOwnsElement(el)) clearNowPlaying();
        if (el) {
          el.pause();
          el.removeAttribute("src");
          el.load();
        }
        return;
      }
      if (url === srcRef.current) {
        if (options?.restart && el) {
          el.currentTime = 0;
          setProgress(0);
        }
        if (options?.media) publishSession(options.media, el);
        if (autoPlay && el) void el.play().catch(() => {});
        return;
      }
      autoPlayRef.current = autoPlay;
      srcRef.current = url;
      setSrc(url);
      // Start play in this user-gesture turn. Do not call load() first —
      // on mobile Safari that resets the element and drops autoplay permission.
      // Do not bind src via React props (absolute vs relative URL fights el.play()).
      if (el) {
        resumeBeatAudioContext();
        el.src = url;
        if (options?.media) publishSession(options.media, el);
        if (autoPlay) {
          autoPlayRef.current = false;
          void el.play().catch(() => {});
        }
      }
    },
    [publishSession]
  );

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setProgress(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnd);
    // Only assign if loadSrc ran before <audio> mounted — never reload/interrupt.
    if (src && !el.getAttribute("src")) {
      el.src = src;
    }
    if (src && autoPlayRef.current) {
      autoPlayRef.current = false;
      resumeBeatAudioContext();
      void el.play().catch(() => {});
    }
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnd);
    };
  }, [src]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const seek = useCallback(
    (value: number) => {
      const el = audioRef.current;
      if (!el || !duration) return;
      el.currentTime = (value / 100) * duration;
      setProgress(el.currentTime);
      resumeBeatAudioContext();
    },
    [duration]
  );

  const clear = useCallback(() => loadSrc(null), [loadSrc]);

  return {
    audioRef,
    src,
    playing,
    progress,
    duration,
    toggle,
    seek,
    loadSrc,
    clear,
    setSessionHandlers,
  };
}

type ControlsProps = MiniAudioControls & {
  onPrev?: () => void;
  onNext?: () => void;
  repeatOne?: boolean;
  onRepeatToggle?: () => void;
};

export function MiniAudioPlayerControls({
  playing,
  progress,
  duration,
  toggle,
  seek,
  onPrev,
  onNext,
  repeatOne = false,
  onRepeatToggle,
}: ControlsProps) {
  const pct = duration ? (progress / duration) * 100 : 0;

  return (
    <div className="artist-mini-player">
      {onPrev && (
        <button
          type="button"
          className="artist-mini-player__skip artist-mini-player__skip--prev"
          onClick={onPrev}
          aria-label="Previous track"
        />
      )}
      <button
        type="button"
        className="artist-mini-player__play"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <span className="artist-mini-player__pause" />
        ) : (
          <span className="artist-mini-player__triangle" />
        )}
      </button>
      <input
        type="range"
        className="artist-mini-player__seek"
        min={0}
        max={100}
        step={0.1}
        value={pct}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Seek"
      />
      {onNext && (
        <button
          type="button"
          className="artist-mini-player__skip artist-mini-player__skip--next"
          onClick={onNext}
          aria-label="Next track"
        />
      )}
      {onRepeatToggle && (
        <button
          type="button"
          className={`artist-mini-player__repeat${
            repeatOne ? " artist-mini-player__repeat--active" : ""
          }`}
          onClick={onRepeatToggle}
          aria-label={repeatOne ? "Disable repeat" : "Repeat track"}
          aria-pressed={repeatOne}
        >
          ↻
        </button>
      )}
    </div>
  );
}

type Props = {
  src: string;
  onPrev?: () => void;
  onNext?: () => void;
  autoPlay?: boolean;
};

export default function MiniAudioPlayer({
  src,
  onPrev,
  onNext,
  autoPlay = true,
}: Props) {
  const { audioRef, loadSrc, ...controls } = useMiniAudio();

  useEffect(() => {
    loadSrc(src, autoPlay);
  }, [src, autoPlay, loadSrc]);

  return (
    <>
      <MiniAudioPlayerControls {...controls} onPrev={onPrev} onNext={onNext} />
      <audio ref={audioRef} preload="auto" playsInline />
    </>
  );
}
