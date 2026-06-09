export type ArtistSection = "overview" | "audio" | "video" | "library" | "gallery";
export type ArtistOverviewTab = "about" | "lineup" | "links" | "related";

export type ArtistRoute = {
  bandId: number;
  section: ArtistSection;
  overviewTab: ArtistOverviewTab;
};

const SECTIONS: ArtistSection[] = [
  "overview",
  "audio",
  "video",
  "library",
  "gallery",
];
const OVERVIEW_TABS: ArtistOverviewTab[] = ["about", "lineup", "links", "related"];

export function parseArtistPath(pathname: string): ArtistRoute | null {
  const m = pathname.match(
    /^\/music\/artist\/(\d+)(?:\/([a-z]+))?(?:\/([a-z]+))?\/?$/
  );
  if (!m) return null;
  const bandId = Number(m[1]);
  let section: ArtistSection = "overview";
  let overviewTab: ArtistOverviewTab = "about";
  if (m[2] === "overview") {
    section = "overview";
    overviewTab = OVERVIEW_TABS.includes(m[3] as ArtistOverviewTab)
      ? (m[3] as ArtistOverviewTab)
      : "about";
  } else if (m[2] && SECTIONS.includes(m[2] as ArtistSection)) {
    section = m[2] as ArtistSection;
  }
  return {
    bandId,
    section: SECTIONS.includes(section) ? section : "overview",
    overviewTab: OVERVIEW_TABS.includes(overviewTab) ? overviewTab : "about",
  };
}

export function artistPath(
  bandId: number,
  section: ArtistSection = "overview",
  overviewTab: ArtistOverviewTab = "about"
): string {
  let path = `/music/artist/${bandId}`;
  if (section === "overview") {
    path += `/overview/${overviewTab}`;
  } else {
    path += `/${section}`;
  }
  return path;
}

export function pushArtistRoute(route: ArtistRoute, replace = false) {
  const path = artistPath(route.bandId, route.section, route.overviewTab);
  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
}
