import type { ArtistOverviewTab } from "./types";

export type ArtistSection = "overview" | "audio" | "video" | "library" | "gallery";
export type { ArtistOverviewTab };
export type ReleaseTab = "overview" | "tracklist" | "gallery";

export type ArtistRoute = {
  bandId: number;
  section: ArtistSection;
  overviewTab: ArtistOverviewTab;
  releaseId?: string;
  releaseTab?: ReleaseTab;
  mediaItemId?: string;
};

const SECTIONS: ArtistSection[] = [
  "overview",
  "audio",
  "video",
  "library",
  "gallery",
];
const OVERVIEW_TABS: ArtistOverviewTab[] = ["about", "lineup", "links", "related", "quiz"];
const RELEASE_TABS: ReleaseTab[] = ["overview", "tracklist", "gallery"];

const RELEASE_ID_RE = /^rel_[0-9a-f]{12}$/;
const MEDIA_ITEM_ID_RE = /^(vid|lib)_[0-9a-f]{12}$/;

const REFERRER_KEY = "mediastack_release_referrer";

export type ReleaseReferrer = {
  bandId: number;
  section: ArtistSection;
  category?: string;
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

  if (parts[0] === "audio" && parts[1] && RELEASE_ID_RE.test(parts[1])) {
    section = "audio";
    releaseId = parts[1];
    releaseTab = RELEASE_TABS.includes(parts[2] as ReleaseTab)
      ? (parts[2] as ReleaseTab)
      : "overview";
  } else if (parts[0] === "overview") {
    section = "overview";
    overviewTab = OVERVIEW_TABS.includes(parts[1] as ArtistOverviewTab)
      ? (parts[1] as ArtistOverviewTab)
      : "about";
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
  };
}

export function artistPath(
  bandId: number,
  section: ArtistSection = "overview",
  overviewTab: ArtistOverviewTab = "about",
  releaseId?: string,
  releaseTab: ReleaseTab = "overview",
  mediaItemId?: string
): string {
  let path = `/music/artist/${bandId}`;
  if (section === "overview") {
    path += `/overview/${overviewTab}`;
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
    route.mediaItemId
  );
  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
}
