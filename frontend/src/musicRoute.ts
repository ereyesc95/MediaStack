import type { ArtistOverviewTab } from "./types";

export type ArtistSection =
  | "overview"
  | "audio"
  | "video"
  | "library"
  | "gallery"
  | "quiz";
export type { ArtistOverviewTab };
export type ReleaseTab = "overview" | "tracklist" | "gallery";

export type ArtistRoute = {
  bandId: number;
  section: ArtistSection;
  overviewTab: ArtistOverviewTab;
  releaseId?: string;
  releaseTab?: ReleaseTab;
  mediaItemId?: string;
  playlistSlug?: string;
};

const SECTIONS: ArtistSection[] = [
  "overview",
  "audio",
  "video",
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

const RELEASE_ID_RE = /^rel_[0-9a-f]{12}$/;
const MEDIA_ITEM_ID_RE = /^(vid|lib)_[0-9a-f]{12}$/;

const REFERRER_KEY = "mediastack_release_referrer";
const AUDIO_CATEGORY_KEY = "mediastack_audio_category";

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
    const raw = sessionStorage.getItem(REFERRER_KEY);
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
    const raw = sessionStorage.getItem(AUDIO_CATEGORY_KEY);
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

export function parseArtistPath(pathname: string): ArtistRoute | null {
  const m = pathname.match(/^\/music\/artist\/(\d+)(?:\/(.*))?\/?$/);
  if (!m) return null;
  const bandId = Number(m[1]);
  const parts = (m[2] || "").split("/").filter(Boolean);

  let section: ArtistSection = "overview";
  let overviewTab: ArtistOverviewTab = "about";
  let releaseId: string | undefined;
  let releaseTab: ReleaseTab = "overview";
  let mediaItemId: string | undefined;
  let playlistSlug: string | undefined;

  if (parts[0] === "audio" && parts[1] === "playlist" && parts[2]) {
    section = "audio";
    playlistSlug = parts[2];
  } else if (parts[0] === "audio" && parts[1] && RELEASE_ID_RE.test(parts[1])) {
    section = "audio";
    releaseId = parts[1];
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
  } else if (
    parts[0] === "video" &&
    parts[1] &&
    MEDIA_ITEM_ID_RE.test(parts[1])
  ) {
    section = "video";
    mediaItemId = parts[1];
  } else if (
    parts[0] === "library" &&
    parts[1] &&
    MEDIA_ITEM_ID_RE.test(parts[1])
  ) {
    section = "library";
    mediaItemId = parts[1];
  } else if (parts[0] && SECTIONS.includes(parts[0] as ArtistSection)) {
    section = parts[0] as ArtistSection;
  }

  return {
    bandId,
    section: SECTIONS.includes(section) ? section : "overview",
    overviewTab: OVERVIEW_TABS.includes(overviewTab) ? overviewTab : "about",
    releaseId,
    releaseTab,
    mediaItemId,
    playlistSlug,
  };
}

export function artistPath(
  bandId: number,
  section: ArtistSection = "overview",
  overviewTab: ArtistOverviewTab = "about",
  releaseId?: string,
  releaseTab: ReleaseTab = "overview",
  mediaItemId?: string,
  playlistSlug?: string
): string {
  let path = `/music/artist/${bandId}`;
  if (section === "overview") {
    path += `/overview/${overviewTab}`;
  } else if (section === "audio" && playlistSlug) {
    path += `/audio/playlist/${playlistSlug}`;
  } else if (section === "audio" && releaseId) {
    path += `/audio/${releaseId}`;
    if (releaseTab !== "overview") {
      path += `/${releaseTab}`;
    }
  } else if (
    (section === "video" || section === "library") &&
    mediaItemId
  ) {
    path += `/${section}/${mediaItemId}`;
  } else {
    path += `/${section}`;
  }
  return path;
}

export function pushArtistRoute(route: ArtistRoute, replace = false) {
  const path = artistPath(
    route.bandId,
    route.section,
    route.overviewTab,
    route.releaseId,
    route.releaseTab ?? "overview",
    route.mediaItemId,
    route.playlistSlug
  );
  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
}
