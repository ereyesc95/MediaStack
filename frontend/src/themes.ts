import { updateFavicon } from "./favicon";
import type { CardOrientation, ReleaseCardLayout } from "./types";

export type ThemeId =
  | "dark"
  | "light"
  | "midnight"
  | "ember"
  | "ocean"
  | "custom"
  | "artist"
  | "album";

export type CustomThemeColors = {
  bg: string;
  bgElevated: string;
  bgHover: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
};

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "midnight", label: "Midnight" },
  { id: "ember", label: "Ember" },
  { id: "ocean", label: "Ocean" },
  { id: "custom", label: "Custom" },
];

export const DEFAULT_CUSTOM: CustomThemeColors = {
  bg: "#0a0c10",
  bgElevated: "#12151c",
  bgHover: "#1a1f28",
  border: "#2a3042",
  text: "#e8eaef",
  textMuted: "#8b93a7",
  accent: "#00d4c8",
};

const CUSTOM_KEY = "custom-theme-colors";
const ARTIST_KEY = "artist-theme-colors";

function themeKey(userId?: number) {
  return userId ? `theme:${userId}` : "theme";
}

function customKey(userId?: number) {
  return userId ? `custom-theme-colors:${userId}` : CUSTOM_KEY;
}

export function getStoredTheme(userId?: number): ThemeId {
  const raw = localStorage.getItem(themeKey(userId));
  if (raw === "artist") return "dark";
  if (raw && THEMES.some((t) => t.id === raw)) return raw as ThemeId;
  return "dark";
}

export function readPersistedTheme(userId?: number): ThemeId {
  return getStoredTheme(userId);
}

export function getCustomColors(userId?: number): CustomThemeColors {
  try {
    const raw = localStorage.getItem(customKey(userId));
    if (raw) return { ...DEFAULT_CUSTOM, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CUSTOM };
}

export function saveCustomColors(colors: CustomThemeColors, userId?: number) {
  localStorage.setItem(customKey(userId), JSON.stringify(colors));
}

function artistKey(userId?: number) {
  return userId ? `artist-theme-colors:${userId}` : ARTIST_KEY;
}

export function getArtistThemeColors(userId?: number): CustomThemeColors | null {
  try {
    const raw = localStorage.getItem(artistKey(userId));
    if (raw) return { ...DEFAULT_CUSTOM, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return null;
}

export function saveArtistThemeColors(colors: CustomThemeColors, userId?: number) {
  localStorage.setItem(artistKey(userId), JSON.stringify(colors));
}

export function hasArtistTheme(userId?: number): boolean {
  return getArtistThemeColors(userId) !== null;
}

function accentForeground(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "#0a0c10" : "#ffffff";
}

export function applyThemeColors(colors: CustomThemeColors) {
  const el = document.documentElement;
  el.style.setProperty("--bg", colors.bg);
  el.style.setProperty("--bg-elevated", colors.bgElevated);
  el.style.setProperty("--bg-hover", colors.bgHover);
  el.style.setProperty("--border", colors.border);
  el.style.setProperty("--text", colors.text);
  el.style.setProperty("--text-muted", colors.textMuted);
  el.style.setProperty("--accent", colors.accent);
  el.style.setProperty("--accent-hover", colors.accent);
  el.style.setProperty("--accent-fg", accentForeground(colors.accent));
  el.style.removeProperty("--beat-accent");
  el.style.setProperty("--scrollbar-thumb", colors.border);
  el.style.setProperty("--scrollbar-track", colors.bgElevated);
}

function clearCustomCss() {
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
  for (const k of keys) document.documentElement.style.removeProperty(k);
}

export function readDomTheme(): ThemeId {
  const ds = document.documentElement.getAttribute("data-theme");
  if (ds === "artist") return "artist";
  if (ds === "album") return "album";
  if (ds === "custom") return "custom";
  if (ds && THEMES.some((t) => t.id === ds)) return ds as ThemeId;
  return "dark";
}

export function applyTheme(id: ThemeId, userId?: number) {
  const attr =
    id === "custom" ? "custom" : id === "artist" ? "artist" : id;
  document.documentElement.setAttribute("data-theme", attr);
  if (id !== "artist") {
    localStorage.setItem(themeKey(userId), id);
  }
  if (id === "custom") {
    applyThemeColors(getCustomColors(userId));
  } else if (id === "artist") {
    applyThemeColors(getArtistThemeColors(userId) ?? DEFAULT_CUSTOM);
  } else {
    clearCustomCss();
    document.documentElement.style.removeProperty("--beat-accent");
  }
  updateFavicon();
  window.dispatchEvent(new CustomEvent("theme-changed"));
}

/** Persist theme choice without updating CSS (used during active playback). */
export function persistThemeChoice(id: ThemeId, userId?: number) {
  if (id !== "artist") {
    localStorage.setItem(themeKey(userId), id);
  }
  updateFavicon();
}

export function orientationKey(userId: number) {
  return `music-card-orientation:${userId}`;
}

const CARD_ORIENTATIONS: CardOrientation[] = [
  "landscape",
  "portrait",
  "banner",
  "icons",
];

export function getStoredOrientation(
  userId: number,
  fallback: CardOrientation = "landscape"
): CardOrientation {
  const raw = localStorage.getItem(orientationKey(userId));
  if (raw && CARD_ORIENTATIONS.includes(raw as CardOrientation)) {
    return raw as CardOrientation;
  }
  return fallback;
}

export function saveOrientation(userId: number, value: CardOrientation) {
  localStorage.setItem(orientationKey(userId), value);
}

export function releaseCardLayoutKey(userId: number) {
  return `music-release-card-layout:${userId}`;
}

export function getStoredReleaseCardLayout(
  userId: number,
  fallback: ReleaseCardLayout = "cover"
): ReleaseCardLayout {
  const raw = localStorage.getItem(releaseCardLayoutKey(userId));
  return raw === "banner" || raw === "cover" ? raw : fallback;
}

export function saveReleaseCardLayout(userId: number, value: ReleaseCardLayout) {
  localStorage.setItem(releaseCardLayoutKey(userId), value);
}

export function applyProfilePreferences(userId: number) {
  applyTheme(getStoredTheme(userId), userId);
}
