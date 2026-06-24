import { useCallback, useEffect, useRef, useState } from "react";
import { resumeBeatAudioContext } from "../../../beatAudioGraph";

export type MiniAudioControls = {
  playing: boolean;
  progress: number;
  duration: number;
  toggle: () => void;
  seek: (value: number) => void;
};

export function useMiniAudio() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const autoPlayRef = useRef(false);
  const srcRef = useRef<string | null>(null);

  const loadSrc = useCallback((url: string | null, autoPlay = false) => {
    if (!url) {
      autoPlayRef.current = false;
      srcRef.current = null;
      setSrc(null);
      setPlaying(false);
      setProgress(0);
      setDuration(0);
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      return;
    }
    if (url === srcRef.current) {
      if (autoPlay) {
        const el = audioRef.current;
        if (el) void el.play().catch(() => {});
      }
      return;
    }
    autoPlayRef.current = autoPlay;
    srcRef.current = url;
    setSrc(url);
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !src) return;
    el.load();
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
    if (autoPlayRef.current) {
      autoPlayRef.current = false;
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
      <audio ref={audioRef} src={src} preload="auto" />
    </>
  );
}
