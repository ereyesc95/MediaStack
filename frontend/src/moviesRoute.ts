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
  filmId?: string;
  section: MoviesSection;
  overviewTab?: MoviesOverviewTab;
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

export function moviesPath(route: MoviesRoute): string {
  let path = `/movies/franchise/${enc(route.franchiseId)}`;
  if (route.filmId) {
    path += `/film/${enc(route.filmId)}`;
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

export function parseMoviesPath(pathname: string): MoviesRoute | null {
  const m = pathname.match(/^\/movies\/franchise\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;

  const franchiseId = dec(m[1]);
  const parts = (m[2] || "").split("/").filter(Boolean);

  let filmId: string | undefined;
  let section: MoviesSection = "overview";
  let overviewTab: MoviesOverviewTab = "about";
  let i = 0;

  if (parts[i] === "film" && parts[i + 1]) {
    filmId = dec(parts[i + 1]);
    i += 2;
  }

  if (parts[i] === "overview" && parts[i + 1]) {
    section = "overview";
    const tab = dec(parts[i + 1]) as MoviesOverviewTab;
    if (OVERVIEW_TABS.includes(tab)) overviewTab = tab;
  } else if (parts[i] && SECTIONS.includes(parts[i] as MoviesSection)) {
    section = parts[i] as MoviesSection;
  }

  return { franchiseId, filmId, section, overviewTab };
}

export function parseMoviesRootPath(pathname: string): boolean {
  return pathname === MOVIES_ROOT_PATH || pathname === `${MOVIES_ROOT_PATH}/`;
}

export function parseMoviesCatalogPath(pathname: string): boolean {
  return (
    pathname === MOVIES_CATALOG_PATH || pathname === `${MOVIES_CATALOG_PATH}/`
  );
}

export function pushMoviesRoute(route: MoviesRoute, replace = false): void {
  const path = moviesPath(route);
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
}

export function pushMoviesRootRoute(replace = false): void {
  if (replace) window.history.replaceState({}, "", MOVIES_ROOT_PATH);
  else window.history.pushState({}, "", MOVIES_ROOT_PATH);
}

export function pushMoviesCatalogRoute(replace = false): void {
  if (replace) window.history.replaceState({}, "", MOVIES_CATALOG_PATH);
  else window.history.pushState({}, "", MOVIES_CATALOG_PATH);
}
