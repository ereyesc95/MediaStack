import { franchisePath, type FranchiseRoute } from "./franchiseRoute";
import {
  dec,
  enc,
  isFilmId,
  isReservedSegment,
  normalizeSlug,
  parseUniverseId,
  withUniverseQuery,
} from "./routeSlug";

export type MoviesSection =
  | "overview"
  | "movies"
  | "series"
  | "audio"
  | "library"
  | "games"
  | "gallery";

export type MoviesOverviewTab = "about" | "cast" | "links" | "related";

export type MoviesRoute = {
  franchiseId: string;
  franchiseName?: string;
  filmId?: string;
  filmTitle?: string;
  section: MoviesSection;
  overviewTab?: MoviesOverviewTab;
  universeId?: number;
  franchiseOnly?: boolean;
};

const SECTIONS: MoviesSection[] = [
  "overview",
  "movies",
  "series",
  "audio",
  "library",
  "games",
  "gallery",
];

const OVERVIEW_TABS: MoviesOverviewTab[] = [
  "about",
  "cast",
  "links",
  "related",
];

export const MOVIES_ROOT_PATH = "/movies";
export const MOVIES_CATALOG_PATH = "/movies/catalog";

function parseTail(parts: string[], start: number): {
  section: MoviesSection;
  overviewTab: MoviesOverviewTab;
} {
  let section: MoviesSection = "overview";
  let overviewTab: MoviesOverviewTab = "about";
  const i = start;

  if (parts[i] === "overview") {
    section = "overview";
    if (parts[i + 1]) {
      const tab = dec(parts[i + 1]) as MoviesOverviewTab;
      if (OVERVIEW_TABS.includes(tab)) overviewTab = tab;
    }
  } else if (parts[i] && SECTIONS.includes(parts[i] as MoviesSection)) {
    section = parts[i] as MoviesSection;
  }

  return { section, overviewTab };
}

function parseLegacyMoviesPath(
  pathname: string,
  search: string
): MoviesRoute | null {
  const m = pathname.match(/^\/movies\/franchise\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;

  const franchiseId = dec(m[1]);
  const parts = (m[2] || "").split("/").filter(Boolean);

  let filmId: string | undefined;
  let i = 0;

  if (parts[i] === "film" && parts[i + 1]) {
    filmId = dec(parts[i + 1]);
    i += 2;
  }

  const tail = parseTail(parts, i);
  const franchiseOnly = !filmId;

  return {
    franchiseId,
    filmId,
    section: tail.section,
    overviewTab: tail.overviewTab,
    universeId: parseUniverseId(search),
    franchiseOnly,
  };
}

function parseFlatMoviesPath(pathname: string, search: string): MoviesRoute | null {
  const m = pathname.match(/^\/movies\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;
  const head = dec(m[1]);
  if (head === "catalog" || head === "franchise") return null;

  const franchiseId = head;
  const parts = (m[2] || "").split("/").filter(Boolean);
  let filmId: string | undefined;
  let i = 0;

  if (parts[i] && !isReservedSegment(parts[i])) {
    filmId = dec(parts[i]);
    i += 1;
  }

  const tail = parseTail(parts, i);
  const franchiseOnly = !filmId;

  return {
    franchiseId,
    filmId,
    section: tail.section,
    overviewTab: tail.overviewTab,
    universeId: parseUniverseId(search),
    franchiseOnly,
  };
}

export function moviesPath(route: MoviesRoute): string {
  if (!route.filmId) {
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
  let path = `/movies/${enc(franchiseSeg)}`;
  path += `/${enc(route.filmId!)}`;

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

export function parseMoviesPath(
  pathname: string,
  search = typeof window !== "undefined" ? window.location.search : ""
): MoviesRoute | null {
  return (
    parseLegacyMoviesPath(pathname, search) ??
    parseFlatMoviesPath(pathname, search)
  );
}

export function parseMoviesRootPath(pathname: string): boolean {
  return pathname === MOVIES_ROOT_PATH || pathname === `${MOVIES_ROOT_PATH}/`;
}

export function parseMoviesCatalogPath(pathname: string): boolean {
  return (
    pathname === MOVIES_CATALOG_PATH || pathname === `${MOVIES_CATALOG_PATH}/`
  );
}

function pushHistoryPath(path: string, replace: boolean) {
  const current = window.location.pathname + window.location.search;
  if (path === current) return;
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
}

export function pushMoviesRoute(route: MoviesRoute, replace = false): void {
  pushHistoryPath(moviesPath(route), replace);
}

export function pushMoviesRootRoute(replace = false): void {
  if (replace) window.history.replaceState({}, "", MOVIES_ROOT_PATH);
  else window.history.pushState({}, "", MOVIES_ROOT_PATH);
}

export function pushMoviesCatalogRoute(replace = false): void {
  if (replace) window.history.replaceState({}, "", MOVIES_CATALOG_PATH);
  else window.history.pushState({}, "", MOVIES_CATALOG_PATH);
}
