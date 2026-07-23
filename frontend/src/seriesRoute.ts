import type { SeriesOverviewTab, SeriesSection } from "./types";

export type SeriesRoute = {
  franchiseId: string;
  subseriesId?: string;
  seasonId?: string;
  section: SeriesSection;
  overviewTab?: SeriesOverviewTab;
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
  return path;
}

export function parseSeriesPath(pathname: string): SeriesRoute | null {
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

  return { franchiseId, subseriesId, seasonId, section, overviewTab };
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
