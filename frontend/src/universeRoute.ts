import { dec, enc, isNumericId } from "./routeSlug";

export type UniverseSection =
  | "overview"
  | "series"
  | "movies"
  | "books"
  | "audio"
  | "gallery";
export type UniverseOverviewTab = "about";

export type UniverseRoute = {
  universeId?: number;
  universeSlug?: string;
  universeName?: string;
  section: UniverseSection;
  overviewTab?: UniverseOverviewTab;
};

const SECTIONS: UniverseSection[] = [
  "overview",
  "series",
  "movies",
  "books",
  "audio",
  "gallery",
];
const OVERVIEW_TABS: UniverseOverviewTab[] = ["about"];

export const UNIVERSE_PATH_PREFIX = "/universe";

export function universePath(route: UniverseRoute): string {
  const slug =
    route.universeName?.trim() ||
    route.universeSlug?.trim() ||
    (route.universeId != null ? String(route.universeId) : "universe");

  let path = `${UNIVERSE_PATH_PREFIX}/${enc(slug)}`;
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

export function parseUniversePath(pathname: string): UniverseRoute | null {
  const m = pathname.match(/^\/universe\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;

  const idRaw = dec(m[1]);
  const parts = (m[2] || "").split("/").filter(Boolean);

  let section: UniverseSection = "overview";
  let overviewTab: UniverseOverviewTab = "about";

  if (parts[0] === "overview") {
    section = "overview";
    if (parts[1] && OVERVIEW_TABS.includes(parts[1] as UniverseOverviewTab)) {
      overviewTab = parts[1] as UniverseOverviewTab;
    }
  } else if (parts[0] && SECTIONS.includes(parts[0] as UniverseSection)) {
    section = parts[0] as UniverseSection;
  }

  if (isNumericId(idRaw)) {
    return { universeId: Number(idRaw), section, overviewTab };
  }

  return { universeSlug: idRaw, section, overviewTab };
}

export function pushUniverseRoute(route: UniverseRoute, replace = false) {
  const path = universePath(route);
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
}
