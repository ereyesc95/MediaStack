import type { SeriesOverviewTab, SeriesSection } from "./types";
import { franchisePath, type FranchiseRoute } from "./franchiseRoute";
import {
  dec,
  enc,
  isReservedSegment,
  normalizeSlug,
  stripDatedFolderTitle,
  parseUniverseId,
  withUniverseQuery,
} from "./routeSlug";

export type SeriesRoute = {
  franchiseId: string;
  franchiseName?: string;
  subseriesId?: string;
  subseriesTitle?: string;
  seasonId?: string;
  seasonTitle?: string;
  section: SeriesSection;
  overviewTab?: SeriesOverviewTab;
  universeId?: number;
  /** Franchise-only (no leaf) — canonical URL is /franchise/… */
  franchiseOnly?: boolean;
};

const SECTIONS: SeriesSection[] = [
  "overview",
  "series",
  "movies",
  "audio",
  "library",
  "games",
  "gallery",
  "episodes",
];
const OVERVIEW_TABS: SeriesOverviewTab[] = [
  "about",
  "cast",
  "links",
  "related",
];

export const SERIES_ROOT_PATH = "/series";
export const SERIES_CATALOG_PATH = "/series/catalog";

function parseTail(parts: string[], start: number): {
  section: SeriesSection;
  overviewTab: SeriesOverviewTab;
  next: number;
} {
  let section: SeriesSection = "overview";
  let overviewTab: SeriesOverviewTab = "about";
  let i = start;

  if (parts[i] === "overview") {
    section = "overview";
    if (
      parts[i + 1] &&
      OVERVIEW_TABS.includes(parts[i + 1] as SeriesOverviewTab)
    ) {
      overviewTab = parts[i + 1] as SeriesOverviewTab;
    }
  } else if (parts[i] && SECTIONS.includes(parts[i] as SeriesSection)) {
    section = parts[i] as SeriesSection;
  }

  return { section, overviewTab, next: i };
}

function parseLegacySeriesPath(
  pathname: string,
  search: string
): SeriesRoute | null {
  const m = pathname.match(/^\/series\/franchise\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;

  const franchiseId = dec(m[1]);
  const parts = (m[2] || "").split("/").filter(Boolean);

  let subseriesId: string | undefined;
  let seasonId: string | undefined;
  let i = 0;

  if (parts[i] === "show" && parts[i + 1]) {
    subseriesId = dec(parts[i + 1]);
    i += 2;
  }
  if (parts[i] === "season" && parts[i + 1]) {
    seasonId = dec(parts[i + 1]);
    i += 2;
  }

  const tail = parseTail(parts, i);
  const franchiseOnly = !subseriesId && !seasonId;

  return {
    franchiseId,
    subseriesId,
    seasonId,
    section: tail.section,
    overviewTab: tail.overviewTab,
    universeId: parseUniverseId(search),
    franchiseOnly,
  };
}

function parseFlatSeriesPath(pathname: string, search: string): SeriesRoute | null {
  const m = pathname.match(/^\/series\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;
  const head = dec(m[1]);
  if (head === "catalog" || head === "franchise") return null;

  const franchiseId = head;
  const parts = (m[2] || "").split("/").filter(Boolean);
  let subseriesId: string | undefined;
  let seasonId: string | undefined;
  let i = 0;

  if (parts[i] && !isReservedSegment(parts[i]) && parts[i] !== "season") {
    subseriesId = dec(parts[i]);
    i += 1;
  }
  if (parts[i] === "season" && parts[i + 1]) {
    seasonId = dec(parts[i + 1]);
    i += 2;
  }

  const tail = parseTail(parts, i);
  const franchiseOnly = !subseriesId && !seasonId;

  return {
    franchiseId,
    subseriesId,
    seasonId,
    section: tail.section,
    overviewTab: tail.overviewTab,
    universeId: parseUniverseId(search),
    franchiseOnly,
  };
}

export function seriesPath(route: SeriesRoute): string {
  if (!route.subseriesId && !route.seasonId) {
    const fr: FranchiseRoute = {
      franchiseId: route.franchiseId,
      franchiseName: route.franchiseName,
      section: route.section,
      overviewTab: route.overviewTab,
      universeId: route.universeId,
    };
    return franchisePath(fr);
  }

  const franchiseSeg = route.franchiseId;
  let path = `/series/${enc(franchiseSeg)}`;
  if (route.subseriesId) {
    path += `/${enc(route.subseriesId)}`;
  }
  if (route.seasonId) {
    path += `/season/${enc(route.seasonId)}`;
  }
  const section = SECTIONS.includes(route.section) ? route.section : "overview";
  if (section === "overview") {
    const tab =
      route.overviewTab && OVERVIEW_TABS.includes(route.overviewTab)
        ? route.overviewTab
        : "about";
    path += `/overview/${tab}`;
  } else {
    path += `/${section}`;
  }
  return withUniverseQuery(path, route.universeId);
}

export function parseSeriesPath(
  pathname: string,
  search = typeof window !== "undefined" ? window.location.search : ""
): SeriesRoute | null {
  return (
    parseLegacySeriesPath(pathname, search) ??
    parseFlatSeriesPath(pathname, search)
  );
}

export function parseSeriesCatalogPath(pathname: string): boolean {
  return /^\/series\/catalog\/?$/.test(pathname);
}

export function parseSeriesRootPath(pathname: string): boolean {
  return /^\/series\/?$/.test(pathname);
}

function pushHistoryPath(path: string, replace: boolean) {
  const current = window.location.pathname + window.location.search;
  if (path === current) return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
}

export function pushSeriesRoute(route: SeriesRoute, replace = false) {
  pushHistoryPath(seriesPath(route), replace);
}

export function pushSeriesCatalogRoute(replace = false) {
  const path = SERIES_CATALOG_PATH;
  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
}

export function pushSeriesRootRoute(replace = false) {
  const path = SERIES_ROOT_PATH;
  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
}

/** Cross-module return path when opening Series from Movies (or similar). */
const SERIES_ENTRY_REFERRER_KEY = "mystack_series_entry_referrer";

export type SeriesEntryReferrer = {
  kind: "movies" | "books" | "music";
  franchiseId?: string;
  filmId?: string;
  bookId?: string;
  section?: string;
  overviewTab?: string;
  universeId?: number;
  /** Display name for back button (e.g. book franchise title). */
  title?: string;
  /** When kind is music — return to this artist. */
  bandId?: number;
  artistSection?: string;
};

export function saveSeriesEntryReferrer(ref: SeriesEntryReferrer) {
  try {
    sessionStorage.setItem(SERIES_ENTRY_REFERRER_KEY, JSON.stringify(ref));
  } catch {
    /* ignore */
  }
}

export function getSeriesEntryReferrer(): SeriesEntryReferrer | null {
  try {
    const raw = sessionStorage.getItem(SERIES_ENTRY_REFERRER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SeriesEntryReferrer;
  } catch {
    return null;
  }
}

export function clearSeriesEntryReferrer() {
  try {
    sessionStorage.removeItem(SERIES_ENTRY_REFERRER_KEY);
  } catch {
    /* ignore */
  }
}
