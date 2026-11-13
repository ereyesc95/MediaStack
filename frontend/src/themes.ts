import { getStoredProfile } from "./auth";
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
const ADAPTIVE_KEY = "adaptive-media-theme";

/**
 * Admin uses one user_id for both passwords; NSFW unlock gets its own theme
 * bucket (`theme:{id}:nsfw`) so mystack vs mystacknsfw keep independent picks.
 */
function resolveNsfwThemeScope(
  userId?: number,
  nsfwUnlocked?: boolean
): boolean {
  if (nsfwUnlocked != null) return Boolean(nsfwUnlocked);
  if (userId == null) return false;
  const profile = getStoredProfile();
  return Boolean(profile && profile.user_id === userId && profile.nsfw_unlocked);
}

function storageUserId(
  userId?: number,
  nsfwUnlocked?: boolean
): string | undefined {
  if (userId == null) return undefined;
  return resolveNsfwThemeScope(userId, nsfwUnlocked)
    ? `${userId}:nsfw`
    : String(userId);
}

function themeKey(userId?: number, nsfwUnlocked?: boolean) {
  const id = storageUserId(userId, nsfwUnlocked);
  return id ? `theme:${id}` : "theme";
}

function adaptiveKey(userId?: number, nsfwUnlocked?: boolean) {
  const id = storageUserId(userId, nsfwUnlocked);
  return id ? `${ADAPTIVE_KEY}:${id}` : ADAPTIVE_KEY;
}

/** Whether media pages should use Adaptive. `null` = default on (sample art). */
export function getAdaptiveMediaPref(
  userId?: number,
  nsfwUnlocked?: boolean
): boolean | null {
  const raw = localStorage.getItem(adaptiveKey(userId, nsfwUnlocked));
  if (raw === "1") return true;
  if (raw === "0") return false;
  return null;
}

export function setAdaptiveMediaPref(
  on: boolean,
  userId?: number,
  nsfwUnlocked?: boolean
) {
  localStorage.setItem(adaptiveKey(userId, nsfwUnlocked), on ? "1" : "0");
}

function customKey(userId?: number, nsfwUnlocked?: boolean) {
  const id = storageUserId(userId, nsfwUnlocked);
  return id ? `custom-theme-colors:${id}` : CUSTOM_KEY;
}

export function getStoredTheme(
  userId?: number,
  nsfwUnlocked?: boolean
): ThemeId {
  const raw = localStorage.getItem(themeKey(userId, nsfwUnlocked));
  if (raw === "artist" || raw === "album") {
    // Legacy: Adaptive was written as the user theme and overwrote Custom.
    setAdaptiveMediaPref(true, userId, nsfwUnlocked);
    const inferred: ThemeId = localStorage.getItem(
      customKey(userId, nsfwUnlocked)
    )
      ? "custom"
      : "dark";
    localStorage.setItem(themeKey(userId, nsfwUnlocked), inferred);
    return inferred;
  }
  if (raw && THEMES.some((t) => t.id === raw)) return raw as ThemeId;
  return "dark";
}

export function readPersistedTheme(
  userId?: number,
  nsfwUnlocked?: boolean
): ThemeId {
  return getStoredTheme(userId, nsfwUnlocked);
}

export function getCustomColors(
  userId?: number,
  nsfwUnlocked?: boolean
): CustomThemeColors {
  try {
    const raw = localStorage.getItem(customKey(userId, nsfwUnlocked));
    if (raw) return { ...DEFAULT_CUSTOM, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CUSTOM };
}

export function saveCustomColors(
  colors: CustomThemeColors,
  userId?: number,
  nsfwUnlocked?: boolean
) {
  localStorage.setItem(customKey(userId, nsfwUnlocked), JSON.stringify(colors));
}

function artistKey(userId?: number, nsfwUnlocked?: boolean) {
  const id = storageUserId(userId, nsfwUnlocked);
  return id ? `artist-theme-colors:${id}` : ARTIST_KEY;
}

export function getArtistThemeColors(
  userId?: number,
  nsfwUnlocked?: boolean
): CustomThemeColors | null {
  try {
    const raw = localStorage.getItem(artistKey(userId, nsfwUnlocked));
    if (raw) return { ...DEFAULT_CUSTOM, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return null;
}

export function saveArtistThemeColors(
  colors: CustomThemeColors,
  userId?: number,
  nsfwUnlocked?: boolean
) {
  localStorage.setItem(artistKey(userId, nsfwUnlocked), JSON.stringify(colors));
}

export function hasArtistTheme(
  userId?: number,
  nsfwUnlocked?: boolean
): boolean {
  return getArtistThemeColors(userId, nsfwUnlocked) !== null;
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

export function applyTheme(
  id: ThemeId,
  userId?: number,
  nsfwUnlocked?: boolean
) {
  const attr =
    id === "custom" ? "custom" : id === "artist" || id === "album" ? id : id;
  document.documentElement.setAttribute("data-theme", attr);
  // Adaptive is page-local — never store it as the user's home theme.
  if (id !== "artist" && id !== "album") {
    localStorage.setItem(themeKey(userId, nsfwUnlocked), id);
  }
  if (id === "custom") {
    applyThemeColors(getCustomColors(userId, nsfwUnlocked));
  } else if (id === "artist" || id === "album") {
    applyThemeColors(
      getArtistThemeColors(userId, nsfwUnlocked) ?? DEFAULT_CUSTOM
    );
  } else {
    clearCustomCss();
    document.documentElement.style.removeProperty("--beat-accent");
  }
  updateFavicon();
  window.dispatchEvent(new CustomEvent("theme-changed"));
}

/** Persist theme choice without updating CSS (used during active playback). */
export function persistThemeChoice(
  id: ThemeId,
  userId?: number,
  nsfwUnlocked?: boolean
) {
  if (id === "artist" || id === "album") {
    setAdaptiveMediaPref(true, userId, nsfwUnlocked);
    updateFavicon();
    return;
  }
  // Store the home/global theme. Do not disable Adaptive for media pages —
  // that only happens when the user pins a fixed theme while on a media page.
  localStorage.setItem(themeKey(userId, nsfwUnlocked), id);
  updateFavicon();
}

export function orientationKey(userId: number) {
  return `music-card-orientation:${userId}`;
}

export function hobbiesOrientationKey(userId: number) {
  return `hobbies-card-orientation:${userId}`;
}

export function getStoredHobbiesOrientation(
  userId: number,
  fallback: CardOrientation = "round"
): CardOrientation {
  const raw = localStorage.getItem(hobbiesOrientationKey(userId));
  if (raw && CARD_ORIENTATIONS.includes(raw as CardOrientation) && raw !== "badge") {
    return raw as CardOrientation;
  }
  return fallback;
}

export function saveHobbiesOrientation(userId: number, value: CardOrientation) {
  localStorage.setItem(hobbiesOrientationKey(userId), value);
}

const CARD_ORIENTATIONS: CardOrientation[] = [
  "landscape",
  "portrait",
  "banner",
  "round",
  "icons",
  "badge",
  "list",
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
  return raw === "banner" || raw === "cover" || raw === "list" ? raw : fallback;
}

export function saveReleaseCardLayout(userId: number, value: ReleaseCardLayout) {
  localStorage.setItem(releaseCardLayoutKey(userId), value);
}

export type CollectionBrowseLayout = "list" | "cover" | "banner" | "shelf";

export function collectionLayoutKey(userId: number) {
  return `music-collection-layout:${userId}`;
}

export function getStoredCollectionLayout(
  userId: number,
  fallback: CollectionBrowseLayout = "list"
): CollectionBrowseLayout {
  const raw = localStorage.getItem(collectionLayoutKey(userId));
  // Shelf is hidden in the UI for now; map a stored "shelf" back to list.
  if (raw === "shelf") return fallback;
  return raw === "list" || raw === "cover" || raw === "banner"
    ? raw
    : fallback;
}

export function saveCollectionLayout(
  userId: number,
  value: CollectionBrowseLayout
) {
  localStorage.setItem(collectionLayoutKey(userId), value);
}

export function applyProfilePreferences(
  userId: number,
  nsfwUnlocked?: boolean
) {
  applyTheme(getStoredTheme(userId, nsfwUnlocked), userId, nsfwUnlocked);
}
