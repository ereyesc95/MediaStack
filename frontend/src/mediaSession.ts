/** Browser Media Session — lock-screen / notification metadata for music & video. */

export type NowPlayingInfo = {
  title: string;
  artist?: string | null;
  album?: string | null;
  artworkUrl?: string | null;
};

export type MediaSessionHandlers = {
  play?: () => void;
  pause?: () => void;
  next?: () => void;
  previous?: () => void;
  seekTo?: (seconds: number) => void;
};

export type MediaLoadOptions = {
  restart?: boolean;
  media?: NowPlayingInfo | null;
  sessionHandlers?: MediaSessionHandlers | null;
};

const ARTWORK_SIZES = [96, 256, 512] as const;

let boundEl: HTMLMediaElement | null = null;
let handlers: MediaSessionHandlers = {};
let actionsWired = false;
let playHandler: (() => void) | null = null;
let pauseHandler: (() => void) | null = null;
let endedHandler: (() => void) | null = null;

function supported(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

/** Absolute URL for OS artwork fetch (relative /api paths need an origin). */
export function absoluteMediaUrl(
  url: string | null | undefined
): string | undefined {
  const raw = (url || "").trim();
  if (!raw) return undefined;
  if (/^(https?:|blob:|data:)/i.test(raw)) return raw;
  if (typeof window === "undefined") return raw;
  try {
    return new URL(raw, window.location.origin).href;
  } catch {
    return raw;
  }
}

function artworkEntries(
  artworkUrl: string | null | undefined
): MediaImage[] | undefined {
  const abs = absoluteMediaUrl(artworkUrl);
  if (!abs) return undefined;
  return ARTWORK_SIZES.map((size) => ({
    src: abs,
    sizes: `${size}x${size}`,
    type: guessImageType(abs),
  }));
}

function guessImageType(url: string): string | undefined {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return undefined;
}

function wireActionsOnce(): void {
  if (!supported() || actionsWired) return;
  actionsWired = true;
  const session = navigator.mediaSession;

  const safe = (fn?: () => void) => () => {
    try {
      fn?.();
    } catch {
      /* ignore */
    }
  };

  try {
    session.setActionHandler("play", () => {
      if (handlers.play) handlers.play();
      else void boundEl?.play().catch(() => {});
    });
    session.setActionHandler("pause", () => {
      if (handlers.pause) handlers.pause();
      else boundEl?.pause();
    });
    session.setActionHandler("stop", () => {
      if (handlers.pause) handlers.pause();
      else {
        boundEl?.pause();
        if (boundEl) boundEl.currentTime = 0;
      }
      setMediaSessionPlaybackState("none");
    });
    session.setActionHandler("previoustrack", safe(() => handlers.previous?.()));
    session.setActionHandler("nexttrack", safe(() => handlers.next?.()));
    session.setActionHandler("seekto", (details) => {
      if (details.seekTime == null || !Number.isFinite(details.seekTime)) return;
      if (handlers.seekTo) handlers.seekTo(details.seekTime);
      else if (boundEl) boundEl.currentTime = details.seekTime;
    });
  } catch {
    /* some browsers reject unsupported actions */
  }
}

function unbindElementListeners(): void {
  if (!boundEl) return;
  if (playHandler) boundEl.removeEventListener("play", playHandler);
  if (pauseHandler) boundEl.removeEventListener("pause", pauseHandler);
  if (endedHandler) boundEl.removeEventListener("ended", endedHandler);
  playHandler = pauseHandler = endedHandler = null;
}

function bindElementListeners(el: HTMLMediaElement): void {
  unbindElementListeners();
  boundEl = el;
  playHandler = () => setMediaSessionPlaybackState("playing");
  pauseHandler = () => setMediaSessionPlaybackState("paused");
  endedHandler = () => setMediaSessionPlaybackState("paused");
  el.addEventListener("play", playHandler);
  el.addEventListener("pause", pauseHandler);
  el.addEventListener("ended", endedHandler);
  setMediaSessionPlaybackState(el.paused ? "paused" : "playing");
}

export function setMediaSessionPlaybackState(
  state: MediaSessionPlaybackState
): void {
  if (!supported()) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch {
    /* ignore */
  }
}

export function setMediaSessionHandlers(
  next: MediaSessionHandlers | null
): void {
  handlers = next ? { ...next } : {};
  wireActionsOnce();
}

/**
 * Publish now-playing metadata for the active media element.
 * Pass ``info: null`` to clear the session (e.g. stop / unload).
 */
export function setNowPlaying(
  info: NowPlayingInfo | null,
  options?: {
    element?: HTMLMediaElement | null;
    handlers?: MediaSessionHandlers | null;
  }
): void {
  if (!supported()) return;
  wireActionsOnce();

  if (options?.handlers !== undefined) {
    setMediaSessionHandlers(options.handlers);
  }

  if (!info || !info.title.trim()) {
    clearNowPlaying();
    return;
  }

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: info.title.trim(),
      artist: (info.artist || "").trim() || "MyStack",
      album: (info.album || "").trim() || undefined,
      artwork: artworkEntries(info.artworkUrl),
    });
  } catch {
    /* MediaMetadata construction can fail on odd artwork URLs */
  }

  if (options?.element) {
    bindElementListeners(options.element);
  } else if (boundEl) {
    setMediaSessionPlaybackState(boundEl.paused ? "paused" : "playing");
  } else {
    setMediaSessionPlaybackState("playing");
  }
}

export function clearNowPlaying(): void {
  if (!supported()) return;
  unbindElementListeners();
  boundEl = null;
  handlers = {};
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  } catch {
    /* ignore */
  }
}

/** True when this element currently owns the Media Session binding. */
export function mediaSessionOwnsElement(el: HTMLMediaElement | null): boolean {
  return Boolean(el && boundEl === el);
}
