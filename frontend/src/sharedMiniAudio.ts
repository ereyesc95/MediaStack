import { useCallback, useEffect, useRef, useState } from "react";
import { resumeBeatAudioContext } from "./beatAudioGraph";

export type SharedPlaybackMeta = {
  path: string | null;
  title: string | null;
  bandId: number | null;
  releaseId: string | null;
  coverUrl: string | null;
  artist: string | null;
  source: "series-player" | "release" | null;
};

const emptyMeta = (): SharedPlaybackMeta => ({
  path: null,
  title: null,
  bandId: null,
  releaseId: null,
  coverUrl: null,
  artist: null,
  source: null,
});

let sharedEl: HTMLAudioElement | null = null;
let sharedMeta: SharedPlaybackMeta = emptyMeta();
const metaListeners = new Set<() => void>();

function getSharedAudioElement(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!sharedEl) {
    sharedEl = new Audio();
    sharedEl.preload = "auto";
  }
  return sharedEl;
}

function notifyMeta() {
  metaListeners.forEach((fn) => fn());
}

export function getSharedPlaybackMeta(): SharedPlaybackMeta {
  return sharedMeta;
}

export function setSharedPlaybackMeta(patch: Partial<SharedPlaybackMeta>) {
  sharedMeta = { ...sharedMeta, ...patch };
  notifyMeta();
}

export function clearSharedPlaybackMeta() {
  sharedMeta = emptyMeta();
  notifyMeta();
}

export function useSharedPlaybackMeta(): SharedPlaybackMeta {
  const [meta, setMeta] = useState<SharedPlaybackMeta>(() => sharedMeta);
  useEffect(() => {
    const sync = () => setMeta({ ...sharedMeta });
    metaListeners.add(sync);
    sync();
    return () => {
      metaListeners.delete(sync);
    };
  }, []);
  return meta;
}

/**
 * One shared HTMLAudioElement for leaf SeriesAudioPlayer + embedded ReleasePage
 * so the top-right dock and Audio tab tracklist drive the same playback.
 */
export function useSharedMiniAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(getSharedAudioElement());
  const [src, setSrc] = useState<string | null>(() => sharedEl?.src || null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const autoPlayRef = useRef(false);
  const srcRef = useRef<string | null>(sharedEl?.getAttribute("src") || null);

  useEffect(() => {
    audioRef.current = getSharedAudioElement();
  }, []);

  const loadSrc = useCallback(
    (url: string | null, autoPlay = false, options?: { restart?: boolean }) => {
      const el = getSharedAudioElement();
      audioRef.current = el;
      if (!el) return;
      if (!url) {
        autoPlayRef.current = false;
        srcRef.current = null;
        setSrc(null);
        setPlaying(false);
        setProgress(0);
        setDuration(0);
        el.pause();
        el.removeAttribute("src");
        el.load();
        return;
      }
      if (url === srcRef.current) {
        if (options?.restart) {
          el.currentTime = 0;
          setProgress(0);
        }
        if (autoPlay) void el.play().catch(() => {});
        return;
      }
      autoPlayRef.current = autoPlay;
      srcRef.current = url;
      setSrc(url);
      el.src = url;
      el.load();
      if (autoPlay) {
        autoPlayRef.current = false;
        void el.play().catch(() => {});
      }
    },
    []
  );

  useEffect(() => {
    const el = getSharedAudioElement();
    if (!el) return;
    audioRef.current = el;
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
    setPlaying(!el.paused && Boolean(el.src));
    setProgress(el.currentTime || 0);
    setDuration(el.duration || 0);
    if (el.src) {
      srcRef.current = el.src;
      setSrc(el.src);
    }
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = useCallback(() => {
    const el = getSharedAudioElement();
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const seek = useCallback(
    (value: number) => {
      const el = getSharedAudioElement();
      if (!el || !duration) return;
      el.currentTime = (value / 100) * duration;
      setProgress(el.currentTime);
      resumeBeatAudioContext();
    },
    [duration]
  );

  const clear = useCallback(() => {
    loadSrc(null);
    clearSharedPlaybackMeta();
  }, [loadSrc]);

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
