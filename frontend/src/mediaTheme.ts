import {
  applyTheme,
  getArtistThemeColors,
  getStoredTheme,
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

export function colorsFromImageUrl(
  url: string
): Promise<CustomThemeColors | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
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
        if (!n) {
          resolve(null);
          return;
        }
        const accent = rgbToHex(r / n, g / n, b / n);
        const bg = mix("#050608", accent, 0.35);
        const bgElevated = mix("#0a0c10", accent, 0.28);
        const bgHover = mix("#12151c", accent, 0.22);
        const border = mix("#2a3042", accent, 0.35);
        resolve({
          bg,
          bgElevated,
          bgHover,
          border,
          text: "#e8eaef",
          textMuted: mix("#8b93a7", accent, 0.15),
          accent,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function applyMediaCss(colors: CustomThemeColors, theme: "artist" | "album" = "artist") {
  const el = document.documentElement;
  el.dataset.theme = theme;
  el.style.setProperty("--bg", colors.bg);
  el.style.setProperty("--bg-elevated", colors.bgElevated);
  el.style.setProperty("--bg-hover", colors.bgHover);
  el.style.setProperty("--border", colors.border);
  el.style.setProperty("--text", colors.text);
  el.style.setProperty("--text-muted", colors.textMuted);
  el.style.setProperty("--accent", colors.accent);
  el.style.setProperty("--accent-hover", colors.accent);
  el.style.removeProperty("--beat-accent");
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
  ];
  keys.forEach((k) => el.style.removeProperty(k));
}

/** Call when entering the artist page. */
export function beginArtistPageSession(userId?: number) {
  if (!artistPageActive) {
    themeBeforeArtist = readPersistedTheme(userId);
    artistPageActive = true;
  }
}

export function applyMediaTheme(colors: CustomThemeColors, userId?: number) {
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
  applySavedArtistTheme(userId);
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
