import type { ArtistOverviewTab } from "./types";
import {
  dec,
  enc,
  isMediaItemId,
  isReleaseId,
  isReservedSegment,
  normalizeSlug,
  RELEASE_ID_RE,
  MEDIA_ITEM_ID_RE,
} from "./routeSlug";

export type ArtistSection =
  | "overview"
  | "audio"
  | "video"
  | "series"
  | "library"
  | "gallery"
  | "quiz";
export type { ArtistOverviewTab };
export type ReleaseTab = "overview" | "tracklist" | "gallery";

export type ArtistRoute = {
  bandId?: number;
  /** Raw artist segment before resolve (name slug). */
  artistSlug?: string;
  artistName?: string;
  section: ArtistSection;
  overviewTab: ArtistOverviewTab;
  releaseId?: string;
  releaseTitle?: string;
  releaseTab?: ReleaseTab;
  mediaItemId?: string;
  mediaItemTitle?: string;
  playlistSlug?: string;
};

const SECTIONS: ArtistSection[] = [
  "overview",
  "audio",
  "video",
  "series",
  "library",
  "gallery",
  "quiz",
];
const OVERVIEW_TABS: ArtistOverviewTab[] = [
  "about",
  "lineup",
  "links",
  "related",
  "artists",
];
const RELEASE_TABS: ReleaseTab[] = ["overview", "tracklist", "gallery"];

const REFERRER_KEY = "mystack_release_referrer";
const AUDIO_CATEGORY_KEY = "mystack_audio_category";
const LEGACY_REFERRER_KEY = "mediastack_release_referrer";
const LEGACY_AUDIO_CATEGORY_KEY = "mediastack_audio_category";

function readSessionKey(primary: string, legacy: string): string | null {
  try {
    const raw = sessionStorage.getItem(primary);
    if (raw) return raw;
    const old = sessionStorage.getItem(legacy);
    if (old) {
      sessionStorage.setItem(primary, old);
      sessionStorage.removeItem(legacy);
      return old;
    }
  } catch {
    /* ignore */
  }
  return null;
}

let audioCategoryIntent: {
  bandId: number;
  category: string;
  compilationBoxSetsOnly?: boolean;
} | null = null;

export type ReleaseReferrer = {
  bandId: number;
  section: ArtistSection;
  category?: string;
  artistName?: string;
  source?: "artist" | "series" | "movies";
  franchiseId?: string;
  subseriesId?: string;
  franchiseName?: string;
  franchiseIconUrl?: string | null;
};

export function saveReleaseReferrer(ref: ReleaseReferrer) {
  try {
    sessionStorage.setItem(REFERRER_KEY, JSON.stringify(ref));
  } catch {
    /* ignore */
  }
}

export function getReleaseReferrer(): ReleaseReferrer | null {
  try {
    const raw = readSessionKey(REFERRER_KEY, LEGACY_REFERRER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ReleaseReferrer;
  } catch {
    return null;
  }
}

export function clearReleaseReferrer() {
  try {
    sessionStorage.removeItem(REFERRER_KEY);
  } catch {
    /* ignore */
  }
}

export function savePendingAudioCategory(
  bandId: number,
  category: string,
  options?: { compilationBoxSetsOnly?: boolean }
) {
  if (!category) return;
  audioCategoryIntent = {
    bandId,
    category,
    compilationBoxSetsOnly: options?.compilationBoxSetsOnly,
  };
  try {
    sessionStorage.setItem(
      AUDIO_CATEGORY_KEY,
      JSON.stringify({
        bandId,
        category,
        compilationBoxSetsOnly: options?.compilationBoxSetsOnly,
      })
    );
  } catch {
    /* ignore */
  }
}

export function pendingAudioCategoryFor(bandId: number): string | null {
  if (audioCategoryIntent?.bandId === bandId) {
    return audioCategoryIntent.category;
  }
  return peekPendingAudioCategory(bandId);
}

export function clearPendingAudioCategory(bandId: number) {
  if (audioCategoryIntent?.bandId === bandId) {
    audioCategoryIntent = null;
  }
  try {
    const raw = sessionStorage.getItem(AUDIO_CATEGORY_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { bandId?: number; category?: string };
    if (parsed.bandId === bandId) {
      sessionStorage.removeItem(AUDIO_CATEGORY_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function peekPendingAudioCategory(bandId: number): string | null {
  const intent = peekPendingAudioIntent(bandId);
  return intent?.category ?? null;
}

export function pendingCompilationBoxSetsOnlyFor(bandId: number): boolean {
  const intent = peekPendingAudioIntent(bandId);
  return Boolean(intent?.compilationBoxSetsOnly);
}

function peekPendingAudioIntent(bandId: number): {
  category?: string;
  compilationBoxSetsOnly?: boolean;
} | null {
  if (audioCategoryIntent?.bandId === bandId) {
    return audioCategoryIntent;
  }
  try {
    const raw = readSessionKey(AUDIO_CATEGORY_KEY, LEGACY_AUDIO_CATEGORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      bandId?: number;
      category?: string;
      compilationBoxSetsOnly?: boolean;
    };
    if (parsed.bandId !== bandId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function consumePendingAudioCategory(bandId: number): string | null {
  try {
    const raw = sessionStorage.getItem(AUDIO_CATEGORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { bandId?: number; category?: string };
    if (parsed.bandId !== bandId || !parsed.category) return null;
    sessionStorage.removeItem(AUDIO_CATEGORY_KEY);
    return parsed.category;
  } catch {
    return null;
  }
}

function parseArtistTail(parts: string[]): Omit<
  ArtistRoute,
  "bandId" | "artistSlug" | "artistName"
> {
  let section: ArtistSection = "overview";
  let overviewTab: ArtistOverviewTab = "about";
  let releaseId: string | undefined;
  let releaseTab: ReleaseTab = "overview";
  let mediaItemId: string | undefined;
  let playlistSlug: string | undefined;

  if (parts[0] === "audio" && parts[1] === "playlist" && parts[2]) {
    section = "audio";
    playlistSlug = parts[2];
  } else if (parts[0] === "audio" && parts[1]) {
    section = "audio";
    const seg = dec(parts[1]);
    if (isReleaseId(seg) || RELEASE_ID_RE.test(parts[1])) {
      releaseId = seg;
    } else {
      releaseId = seg;
    }
    releaseTab = RELEASE_TABS.includes(parts[2] as ReleaseTab)
      ? (parts[2] as ReleaseTab)
      : "overview";
  } else if (parts[0] === "overview") {
    section = "overview";
    if (parts[1] === "quiz") {
      section = "quiz";
    } else {
      overviewTab = OVERVIEW_TABS.includes(parts[1] as ArtistOverviewTab)
        ? (parts[1] as ArtistOverviewTab)
        : "about";
    }
  } else if (parts[0] === "video" && parts[1]) {
    section = "video";
    mediaItemId = dec(parts[1]);
  } else if (parts[0] === "library" && parts[1]) {
    section = "library";
    mediaItemId = dec(parts[1]);
  } else if (parts[0] && SECTIONS.includes(parts[0] as ArtistSection)) {
    section = parts[0] as ArtistSection;
  }

  return {
    section: SECTIONS.includes(section) ? section : "overview",
    overviewTab: OVERVIEW_TABS.includes(overviewTab) ? overviewTab : "about",
    releaseId,
    releaseTab,
    mediaItemId,
    playlistSlug,
  };
}

/** Legacy: /music/artist/{bandId}/… */
function parseLegacyArtistPath(pathname: string): ArtistRoute | null {
  const m = pathname.match(/^\/music\/artist\/(\d+)(?:\/(.*))?\/?$/);
  if (!m) return null;
  const bandId = Number(m[1]);
  const parts = (m[2] || "").split("/").filter(Boolean);
  return { bandId, ...parseArtistTail(parts) };
}

/** New: /music/{artistSlug}/… (also accepts numeric id segment). */
function parseSlugArtistPath(pathname: string): ArtistRoute | null {
  const m = pathname.match(/^\/music\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;
  const head = dec(m[1]);
  if (
    head === "playlists" ||
    head === "artist" ||
    isReservedSegment(head)
  ) {
    return null;
  }
  const parts = (m[2] || "").split("/").filter(Boolean);
  if (/^\d+$/.test(head)) {
    return { bandId: Number(head), ...parseArtistTail(parts) };
  }
  return { artistSlug: head, ...parseArtistTail(parts) };
}

export function parseArtistPath(pathname: string): ArtistRoute | null {
  return parseLegacyArtistPath(pathname) ?? parseSlugArtistPath(pathname);
}

export function artistPath(route: ArtistRoute): string {
  const artistRaw =
    route.artistName?.trim() ||
    route.artistSlug?.trim() ||
    (route.bandId != null ? String(route.bandId) : "artist");
  const artistSeg =
    route.bandId != null && /^\d+$/.test(artistRaw)
      ? artistRaw
      : normalizeSlug(artistRaw) || artistRaw;

  let path = `/music/${enc(artistSeg)}`;
  const section = route.section;

  if (section === "overview") {
    path += `/overview/${route.overviewTab ?? "about"}`;
  } else if (section === "quiz") {
    path += `/overview/quiz`;
  } else if (section === "audio" && route.playlistSlug) {
    path += `/audio/playlist/${route.playlistSlug}`;
  } else if (section === "audio" && route.releaseId) {
    const titleRaw =
      route.releaseTitle?.trim() &&
      !isReleaseId(route.releaseTitle) &&
      route.releaseTitle !== route.releaseId
        ? route.releaseTitle
        : !isReleaseId(route.releaseId)
          ? route.releaseTitle?.trim() || route.releaseId
          : route.releaseTitle?.trim() || "";
    const releaseSeg = titleRaw
      ? normalizeSlug(titleRaw) || titleRaw
      : route.releaseId;
    path += `/audio/${enc(releaseSeg)}`;
    if (route.releaseTab && route.releaseTab !== "overview") {
      path += `/${route.releaseTab}`;
    }
  } else if (
    (section === "video" || section === "library") &&
    route.mediaItemId
  ) {
    const titleRaw =
      route.mediaItemTitle?.trim() &&
      !isMediaItemId(route.mediaItemTitle) &&
      route.mediaItemTitle !== route.mediaItemId
        ? route.mediaItemTitle
        : !isMediaItemId(route.mediaItemId)
          ? route.mediaItemTitle?.trim() || route.mediaItemId
          : route.mediaItemTitle?.trim() || "";
    const itemSeg = titleRaw
      ? normalizeSlug(titleRaw) || titleRaw
      : route.mediaItemId;
    path += `/${section}/${enc(itemSeg)}`;
  } else {
    path += `/${section}`;
  }
  return path;
}

export function pushArtistRoute(route: ArtistRoute, replace = false) {
  const path = artistPath(route);
  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
}

export function userPlaylistPath(playlistId: number): string {
  return `/music/playlists/${playlistId}`;
}

export const PLAYLISTS_GRID_PATH = "/music/playlists";

export function parsePlaylistsGridPath(pathname: string): boolean {
  return /^\/music\/playlists\/?$/.test(pathname);
}

export function pushPlaylistsGridRoute(replace = false) {
  const path = PLAYLISTS_GRID_PATH;
  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
}

export function pushUserPlaylistRoute(playlistId: number, replace = false) {
  const path = userPlaylistPath(playlistId);
  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
}

export function parseUserPlaylistPath(pathname: string): number | null {
  const m = pathname.match(/^\/music\/playlists\/(\d+)\/?$/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

// Re-export for callers that still import from musicRoute.
export { RELEASE_ID_RE, MEDIA_ITEM_ID_RE };
