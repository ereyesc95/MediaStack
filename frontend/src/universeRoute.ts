export type UniverseSection =
  | "overview"
  | "series"
  | "movies"
  | "books"
  | "audio"
  | "gallery";
export type UniverseOverviewTab = "about";

export type UniverseRoute = {
  universeId: number;
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

export function universePath(route: UniverseRoute): string {
  let path = `${UNIVERSE_PATH_PREFIX}/${enc(String(route.universeId))}`;
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
  if (!/^\d+$/.test(idRaw)) return null;
  const universeId = Number(idRaw);
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

  return { universeId, section, overviewTab };
}

export function pushUniverseRoute(route: UniverseRoute, replace = false) {
  const path = universePath(route);
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
}
