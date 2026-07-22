import {
  applyTheme,
  applyThemeColors,
  getArtistThemeColors,
  getStoredTheme,
  persistThemeChoice,
  readDomTheme,
  readPersistedTheme,
  saveArtistThemeColors,
  type CustomThemeColors,
  type ThemeId,
} from "./themes";

let themeBeforeArtist: ThemeId | null = null;
let artistPageActive = false;
let albumPageActive = false;
/** When set, era/orientation sampling must not override the user's preset theme. */
let artistPageThemePin: ThemeId | null = null;

let playbackSessionActive = false;
let playbackIsPlaying = false;
let themeBeforePlayback: ThemeId | null = null;
/** Theme chosen in menu while a playback session is active (shown when paused/stopped). */
let playbackMenuTheme: ThemeId | null = null;
/** When true, cover-based colors must not override the current display while playing. */
let playbackThemeSuppressed = false;

export function pinArtistPageTheme(id: ThemeId) {
  if (id === "artist" || id === "album") {
    artistPageThemePin = null;
    return;
  }
  artistPageThemePin = id;
}

export function clearArtistPageThemePin() {
  artistPageThemePin = null;
}

function shouldApplySampledTheme(): boolean {
  if (artistPageThemePin) return false;
  if (artistPageActive || albumPageActive) return true;
  const dom = readDomTheme();
  return dom === "artist" || dom === "album";
}

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((x) => clamp(x).toString(16).padStart(2, "0")).join("")}`;
}

function mix(a: string, b: string, t: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return rgbToHex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t
  );
}

function resolveImageSampleUrl(url: string): string {
  if (url.startsWith("/")) {
    return `${window.location.origin}${url}`;
  }
  return url;
}

function sampleColorsFromImage(img: HTMLImageElement): CustomThemeColors | null {
  try {
    const canvas = document.createElement("canvas");
    const size = 32;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 40) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    if (!n) return null;
    const accent = rgbToHex(r / n, g / n, b / n);
    const bg = mix("#050608", accent, 0.35);
    const bgElevated = mix("#0a0c10", accent, 0.28);
    const bgHover = mix("#12151c", accent, 0.22);
    const border = mix("#2a3042", accent, 0.35);
    return {
      bg,
      bgElevated,
      bgHover,
      border,
      text: "#e8eaef",
      textMuted: mix("#8b93a7", accent, 0.15),
      accent,
    };
  } catch {
    return null;
  }
}

export function colorsFromImageUrl(
  url: string
): Promise<CustomThemeColors | null> {
  const fullUrl = resolveImageSampleUrl(url);
  return fetch(fullUrl)
    .then((res) => {
      if (!res.ok) throw new Error("cover fetch failed");
      return res.blob();
    })
    .then(
      (blob) =>
        new Promise<CustomThemeColors | null>((resolve) => {
          const objectUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            const colors = sampleColorsFromImage(img);
            URL.revokeObjectURL(objectUrl);
            resolve(colors);
          };
          img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(null);
          };
          img.src = objectUrl;
        })
    )
    .catch(() => null);
}

function applyMediaCss(colors: CustomThemeColors, theme: "artist" | "album" = "artist") {
  const el = document.documentElement;
  el.dataset.theme = theme;
  applyThemeColors(colors);
}

/** Cover-based playback colors without changing the menu theme indicator. */
function applyPlaybackCoverColors(colors: CustomThemeColors) {
  applyThemeColors(colors);
}

function clearMediaCss() {
  const el = document.documentElement;
  delete el.dataset.theme;
  const keys = [
    "--bg",
    "--bg-elevated",
    "--bg-hover",
    "--border",
    "--text",
    "--text-muted",
    "--accent",
    "--accent-hover",
    "--accent-fg",
    "--scrollbar-thumb",
    "--scrollbar-track",
  ];
  keys.forEach((k) => el.style.removeProperty(k));
}

function restoreThemeAfterPlayback(userId?: number) {
  const restore =
    playbackMenuTheme ?? themeBeforePlayback ?? readPersistedTheme(userId);
  if (artistPageActive) {
    if (playbackMenuTheme || playbackThemeSuppressed) {
      if (restore === "artist") {
        const colors = getArtistThemeColors(userId);
        if (colors) applyMediaCss(colors);
        else applyTheme("artist", userId);
      } else {
        clearMediaCss();
        applyTheme(restore, userId);
      }
      window.dispatchEvent(new CustomEvent("theme-changed"));
      return;
    }
    window.dispatchEvent(new CustomEvent("playback-theme-ended"));
    return;
  }
  clearMediaCss();
  applyTheme(restore, userId);
}

/** Call when entering the artist page. */
export function beginArtistPageSession(userId?: number) {
  if (!artistPageActive) {
    themeBeforeArtist = readPersistedTheme(userId);
    artistPageActive = true;
    applyTheme("artist", userId);
  }
}

export function isPlaybackThemeActive() {
  return playbackSessionActive;
}

export function isPlaybackSessionActive() {
  return playbackSessionActive;
}

export function isPlaybackPlaying() {
  return playbackIsPlaying;
}

/** Theme id shown in the menu (persisted choice during playback, not cover sampling). */
export function getMenuActiveTheme(userId?: number): ThemeId {
  if (playbackSessionActive) {
    return playbackMenuTheme ?? readPersistedTheme(userId);
  }
  return readDomTheme();
}

export function setPlaybackPlaying(playing: boolean) {
  playbackIsPlaying = playing;
}

function beginPlaybackThemeSession(userId?: number) {
  if (!playbackSessionActive) {
    themeBeforePlayback = readPersistedTheme(userId);
    playbackMenuTheme = null;
    playbackThemeSuppressed = false;
  }
  playbackSessionActive = true;
}

/** Sample cover art and override theme colors while a track is actively playing. */
export function applyPlaybackThemeFromCover(
  coverUrl: string | null | undefined,
  userId?: number
) {
  if (!coverUrl || artistPageThemePin || playbackThemeSuppressed) return;
  beginPlaybackThemeSession(userId);
  void colorsFromImageUrl(coverUrl).then((colors) => {
    if (
      !colors ||
      !playbackSessionActive ||
      !playbackIsPlaying ||
      playbackThemeSuppressed
    ) {
      return;
    }
    if (artistPageActive) {
      applyMediaCss(colors, "artist");
      window.dispatchEvent(new CustomEvent("theme-changed"));
    } else {
      applyPlaybackCoverColors(colors);
      window.dispatchEvent(new CustomEvent("playback-cover-applied"));
    }
  });
}

/** User picked a theme in the menu while audio is still playing. */
export function notifyUserThemePickDuringPlayback(
  id: ThemeId,
  userId?: number
): boolean {
  if (!playbackSessionActive || !playbackIsPlaying) return false;
  playbackThemeSuppressed = true;
  playbackMenuTheme = id;
  persistThemeChoice(id, userId);
  if (artistPageActive) pinArtistPageTheme(id);
  return true;
}

/** User picked a theme while paused but a track is still loaded. */
export function notifyUserThemePickWhilePaused(
  id: ThemeId,
  userId?: number
) {
  if (!playbackSessionActive) return;
  playbackMenuTheme = id;
  playbackThemeSuppressed = true;
  persistThemeChoice(id, userId);
}

export function onPlaybackPaused(userId?: number) {
  if (!playbackSessionActive) return;
  playbackIsPlaying = false;
  restoreThemeAfterPlayback(userId);
}

export function onPlaybackResumed(
  coverUrl: string | null | undefined,
  userId?: number
) {
  if (!playbackSessionActive) return;
  playbackIsPlaying = true;
  playbackThemeSuppressed = false;
  clearArtistPageThemePin();
  applyPlaybackThemeFromCover(coverUrl, userId);
}

/** Restore theme when playback stops or the loaded track is cleared. */
export function endPlaybackThemeSession(userId?: number) {
  if (!playbackSessionActive) return;
  playbackSessionActive = false;
  playbackIsPlaying = false;
  restoreThemeAfterPlayback(userId);
  themeBeforePlayback = null;
  playbackMenuTheme = null;
  playbackThemeSuppressed = false;
}

export function applyMediaTheme(colors: CustomThemeColors, userId?: number) {
  if (playbackSessionActive && playbackIsPlaying) {
    window.dispatchEvent(new CustomEvent("artist-theme-updated"));
    return;
  }
  saveArtistThemeColors(colors, userId);
  if (shouldApplySampledTheme()) {
    const active = readDomTheme();
    applyMediaCss(colors, active === "album" ? "album" : "artist");
    window.dispatchEvent(new CustomEvent("theme-changed"));
  }
  window.dispatchEvent(new CustomEvent("artist-theme-updated"));
}

/** Call when entering a release page (artist session should stay active). */
export function beginAlbumPageSession() {
  albumPageActive = true;
}

export function applyAlbumTheme(colors: CustomThemeColors) {
  applyMediaCss(colors, "album");
  window.dispatchEvent(new CustomEvent("theme-changed"));
  window.dispatchEvent(new CustomEvent("artist-theme-updated"));
}

export function clearAlbumTheme(userId?: number) {
  if (!albumPageActive) return;
  albumPageActive = false;
  if (artistPageActive) {
    const colors = getArtistThemeColors(userId);
    if (colors) {
      applyMediaCss(colors);
      window.dispatchEvent(new CustomEvent("theme-changed"));
      return;
    }
    clearMediaCss();
    applyTheme("artist", userId);
    window.dispatchEvent(new CustomEvent("theme-changed"));
    return;
  }
  clearMediaCss();
  applyTheme(readPersistedTheme(userId), userId);
  window.dispatchEvent(new CustomEvent("theme-changed"));
}

/**
 * Leave a user/local/snapshot playlist page back to Music module chrome.
 * Always restores the user's menu theme (never leaves album/artist sampling active).
 */
export function clearUserPlaylistPageTheme(userId?: number) {
  albumPageActive = false;
  artistPageActive = false;
  themeBeforeArtist = null;
  clearArtistPageThemePin();
  clearMediaCss();
  applyTheme(readPersistedTheme(userId), userId);
  window.dispatchEvent(new CustomEvent("theme-changed"));
}

export function applySavedArtistTheme(userId?: number) {
  const colors = getArtistThemeColors(userId);
  if (colors) {
    applyMediaCss(colors);
    window.dispatchEvent(new CustomEvent("theme-changed"));
  }
}

export function clearMediaTheme(userId?: number) {
  albumPageActive = false;
  clearArtistPageThemePin();
  endPlaybackThemeSession(userId);
  if (!artistPageActive && themeBeforeArtist === null) {
    clearMediaCss();
    applyTheme(getStoredTheme(userId), userId);
    return;
  }
  clearMediaCss();
  const restore = themeBeforeArtist ?? readPersistedTheme(userId);
  themeBeforeArtist = null;
  artistPageActive = false;
  applyTheme(restore, userId);
}
