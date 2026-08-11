import type { SeriesOverviewTab, SeriesSection } from "./types";

export type SeriesRoute = {
  franchiseId: string;
  subseriesId?: string;
  seasonId?: string;
  section: SeriesSection;
  overviewTab?: SeriesOverviewTab;
  universeId?: number;
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

function enc(seg: string): string {
  return encodeURIComponent(seg);
}

function dec(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

function parseUniverseId(search: string): number | undefined {
  const raw = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  ).get("universe");
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}

function withUniverseQuery(path: string, universeId?: number): string {
  if (universeId == null) return path;
  return `${path}?universe=${universeId}`;
}

export function seriesPath(route: SeriesRoute): string {
  let path = `/series/franchise/${enc(route.franchiseId)}`;
  if (route.subseriesId) {
    path += `/show/${enc(route.subseriesId)}`;
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
  const m = pathname.match(/^\/series\/franchise\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;

  const franchiseId = dec(m[1]);
  const parts = (m[2] || "").split("/").filter(Boolean);

  let subseriesId: string | undefined;
  let seasonId: string | undefined;
  let section: SeriesSection = "overview";
  let overviewTab: SeriesOverviewTab = "about";
  let i = 0;

  if (parts[i] === "show" && parts[i + 1]) {
    subseriesId = dec(parts[i + 1]);
    i += 2;
  }
  if (parts[i] === "season" && parts[i + 1]) {
    seasonId = dec(parts[i + 1]);
    i += 2;
  }
  if (parts[i] === "overview") {
    section = "overview";
    if (parts[i + 1] && OVERVIEW_TABS.includes(parts[i + 1] as SeriesOverviewTab)) {
      overviewTab = parts[i + 1] as SeriesOverviewTab;
    }
  } else if (parts[i] && SECTIONS.includes(parts[i] as SeriesSection)) {
    section = parts[i] as SeriesSection;
  }

  return {
    franchiseId,
    subseriesId,
    seasonId,
    section,
    overviewTab,
    universeId: parseUniverseId(search),
  };
}

export function parseSeriesCatalogPath(pathname: string): boolean {
  return /^\/series\/catalog\/?$/.test(pathname);
}

export function parseSeriesRootPath(pathname: string): boolean {
  return /^\/series\/?$/.test(pathname);
}

export function pushSeriesRoute(route: SeriesRoute, replace = false) {
  const path = seriesPath(route);
  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
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
  kind: "movies" | "books";
  franchiseId: string;
  filmId?: string;
  bookId?: string;
  section?: string;
  overviewTab?: string;
  universeId?: number;
  /** Display name for back button (e.g. book franchise title). */
  title?: string;
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
