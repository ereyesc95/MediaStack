import {
  dec,
  enc,
  isReservedSegment,
  parseUniverseId,
  withUniverseQuery,
} from "./routeSlug";

export type GamesSection =
  | "overview"
  | "games"
  | "movies"
  | "series"
  | "books"
  | "audio"
  | "gallery"
  | "quiz";

export type GamesOverviewTab = "about" | "cast" | "links" | "related";

export type GamesRoute = {
  franchiseId: string;
  franchiseName?: string;
  gameId?: string;
  gameTitle?: string;
  section: GamesSection;
  overviewTab?: GamesOverviewTab;
  universeId?: number;
  franchiseOnly?: boolean;
};

const SECTIONS: GamesSection[] = [
  "overview",
  "games",
  "movies",
  "series",
  "books",
  "audio",
  "gallery",
  "quiz",
];

const OVERVIEW_TABS: GamesOverviewTab[] = [
  "about",
  "cast",
  "links",
  "related",
];

export const GAMES_ROOT_PATH = "/games";
export const GAMES_CATALOG_PATH = "/games/catalog";

function parseTail(parts: string[], start: number): {
  section: GamesSection;
  overviewTab: GamesOverviewTab;
} {
  let section: GamesSection = "overview";
  let overviewTab: GamesOverviewTab = "about";
  const i = start;

  if (parts[i] === "overview" && parts[i + 1]) {
    section = "overview";
    const tab = dec(parts[i + 1]) as GamesOverviewTab;
    if (OVERVIEW_TABS.includes(tab)) overviewTab = tab;
  } else if (parts[i] && SECTIONS.includes(parts[i] as GamesSection)) {
    section = parts[i] as GamesSection;
  }

  return { section, overviewTab };
}

function parseLegacyGamesPath(
  pathname: string,
  search: string
): GamesRoute | null {
  const m = pathname.match(/^\/games\/franchise\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;

  const franchiseId = dec(m[1]);
  const parts = (m[2] || "").split("/").filter(Boolean);

  let gameId: string | undefined;
  let i = 0;

  if (parts[i] === "game" && parts[i + 1]) {
    gameId = dec(parts[i + 1]);
    i += 2;
  }

  const tail = parseTail(parts, i);
  return {
    franchiseId,
    gameId,
    section: tail.section,
    overviewTab: tail.overviewTab,
    universeId: parseUniverseId(search),
    franchiseOnly: !gameId,
  };
}

function parseFlatGamesPath(pathname: string, search: string): GamesRoute | null {
  const m = pathname.match(/^\/games\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;
  const head = dec(m[1]);
  if (head === "catalog" || head === "franchise" || head === "platforms") {
    return null;
  }

  const franchiseId = head;
  const parts = (m[2] || "").split("/").filter(Boolean);
  let gameId: string | undefined;
  let i = 0;

  if (parts[i] && !isReservedSegment(parts[i])) {
    gameId = dec(parts[i]);
    i += 1;
  }

  const tail = parseTail(parts, i);
  return {
    franchiseId,
    gameId,
    section: tail.section,
    overviewTab: tail.overviewTab,
    universeId: parseUniverseId(search),
    franchiseOnly: !gameId,
  };
}

export function gamesPath(route: GamesRoute): string {
  if (!route.gameId) {
    const base = `/games/${enc(route.franchiseId)}`;
    const section = SECTIONS.includes(route.section) ? route.section : "overview";
    let path = base;
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

  let path = `/games/${enc(route.franchiseId)}/${enc(route.gameId!)}`;
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

export function parseGamesPath(
  pathname: string,
  search = typeof window !== "undefined" ? window.location.search : ""
): GamesRoute | null {
  return (
    parseLegacyGamesPath(pathname, search) ??
    parseFlatGamesPath(pathname, search)
  );
}

export function parseGamesRootPath(pathname: string): boolean {
  return pathname === GAMES_ROOT_PATH || pathname === `${GAMES_ROOT_PATH}/`;
}

export function parseGamesCatalogPath(pathname: string): boolean {
  return (
    pathname === GAMES_CATALOG_PATH || pathname === `${GAMES_CATALOG_PATH}/`
  );
}

function pushHistoryPath(path: string, replace: boolean) {
  const current = window.location.pathname + window.location.search;
  if (path === current) return;
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
}

export function pushGamesRoute(route: GamesRoute, replace = false): void {
  pushHistoryPath(gamesPath(route), replace);
}

export function pushGamesRootRoute(replace = false): void {
  if (replace) window.history.replaceState({}, "", GAMES_ROOT_PATH);
  else window.history.pushState({}, "", GAMES_ROOT_PATH);
}

export function pushGamesCatalogRoute(replace = false): void {
  if (replace) window.history.replaceState({}, "", GAMES_CATALOG_PATH);
  else window.history.pushState({}, "", GAMES_CATALOG_PATH);
}
