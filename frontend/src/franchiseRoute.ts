import type { SeriesOverviewTab, SeriesSection } from "./types";
import {
  dec,
  enc,
  isReservedSegment,
  normalizeSlug,
  parseUniverseId,
  withUniverseQuery,
} from "./routeSlug";

export type FranchiseSection = SeriesSection;
export type FranchiseOverviewTab = SeriesOverviewTab;

export type FranchiseRoute = {
  franchiseId: string;
  section: FranchiseSection;
  overviewTab?: FranchiseOverviewTab;
  universeId?: number;
  /** Display name for URL building (optional). */
  franchiseName?: string;
};

const SECTIONS: FranchiseSection[] = [
  "overview",
  "series",
  "movies",
  "audio",
  "library",
  "games",
  "gallery",
  "episodes",
];

const OVERVIEW_TABS: FranchiseOverviewTab[] = [
  "about",
  "cast",
  "links",
  "related",
];

export const FRANCHISE_PATH_PREFIX = "/franchise";

function parseTail(parts: string[]): {
  section: FranchiseSection;
  overviewTab: FranchiseOverviewTab;
} {
  let section: FranchiseSection = "overview";
  let overviewTab: FranchiseOverviewTab = "about";
  let i = 0;

  if (parts[i] === "overview") {
    section = "overview";
    if (
      parts[i + 1] &&
      OVERVIEW_TABS.includes(parts[i + 1] as FranchiseOverviewTab)
    ) {
      overviewTab = parts[i + 1] as FranchiseOverviewTab;
    }
  } else if (parts[i] && SECTIONS.includes(parts[i] as FranchiseSection)) {
    section = parts[i] as FranchiseSection;
  }

  return { section, overviewTab };
}

export function franchisePath(route: FranchiseRoute): string {
  const raw = route.franchiseName?.trim() || route.franchiseId;
  const slug = normalizeSlug(raw) || raw;
  let path = `${FRANCHISE_PATH_PREFIX}/${enc(slug)}`;
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

export function parseFranchisePath(
  pathname: string,
  search = typeof window !== "undefined" ? window.location.search : ""
): FranchiseRoute | null {
  const m = pathname.match(/^\/franchise\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;

  const franchiseId = dec(m[1]);
  const parts = (m[2] || "").split("/").filter(Boolean);
  const { section, overviewTab } = parseTail(parts);

  return {
    franchiseId,
    section,
    overviewTab,
    universeId: parseUniverseId(search),
  };
}

/** Legacy module franchise-only URLs (no leaf). */
export function parseLegacyFranchiseHubPath(
  pathname: string,
  search = typeof window !== "undefined" ? window.location.search : ""
): FranchiseRoute | null {
  for (const prefix of ["/series/franchise/", "/movies/franchise/", "/books/franchise/"]) {
    if (!pathname.startsWith(prefix)) continue;
    const rest = pathname.slice(prefix.length);
    const slash = rest.indexOf("/");
    const franchiseRaw = slash >= 0 ? rest.slice(0, slash) : rest;
    const tail = slash >= 0 ? rest.slice(slash + 1) : "";
    const parts = tail.split("/").filter(Boolean);
    let i = 0;
    if (parts[i] === "show" && parts[i + 1]) return null;
    if (parts[i] === "film" && parts[i + 1]) return null;
    if (parts[i] === "book" && parts[i + 1]) return null;
    if (parts[i] === "season" && parts[i + 1]) return null;
    if (parts[i] && !isReservedSegment(parts[i]) && parts[i] !== "overview") {
      return null;
    }
    const { section, overviewTab } = parseTail(parts.slice(i));
    return {
      franchiseId: dec(franchiseRaw.replace(/\/$/, "")),
      section,
      overviewTab,
      universeId: parseUniverseId(search),
    };
  }
  return null;
}

export function pushFranchiseRoute(route: FranchiseRoute, replace = false) {
  const path = franchisePath(route);
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
}
