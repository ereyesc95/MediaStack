export type BooksSection =
  | "overview"
  | "books"
  | "movies"
  | "series"
  | "audio"
  | "library"
  | "games"
  | "gallery"
  | "episodes";

export type BooksOverviewTab = "about" | "cast" | "links" | "related";

export type BooksRoute = {
  franchiseId: string;
  bookId?: string;
  section: BooksSection;
  overviewTab?: BooksOverviewTab;
  universeId?: number;
};

const SECTIONS: BooksSection[] = [
  "overview",
  "books",
  "movies",
  "series",
  "audio",
  "library",
  "games",
  "gallery",
  "episodes",
];

const OVERVIEW_TABS: BooksOverviewTab[] = [
  "about",
  "cast",
  "links",
  "related",
];

export const BOOKS_ROOT_PATH = "/books";
export const BOOKS_CATALOG_PATH = "/books/catalog";

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

export function booksPath(route: BooksRoute): string {
  let path = `/books/franchise/${enc(route.franchiseId)}`;
  if (route.bookId) {
    path += `/book/${enc(route.bookId)}`;
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

export function parseBooksPath(
  pathname: string,
  search = typeof window !== "undefined" ? window.location.search : ""
): BooksRoute | null {
  const m = pathname.match(/^\/books\/franchise\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;

  const franchiseId = dec(m[1]);
  const parts = (m[2] || "").split("/").filter(Boolean);

  let bookId: string | undefined;
  let section: BooksSection = "overview";
  let overviewTab: BooksOverviewTab = "about";
  let i = 0;

  if (parts[i] === "book" && parts[i + 1]) {
    bookId = dec(parts[i + 1]);
    i += 2;
  }

  if (parts[i] === "overview" && parts[i + 1]) {
    section = "overview";
    const tab = dec(parts[i + 1]) as BooksOverviewTab;
    if (OVERVIEW_TABS.includes(tab)) overviewTab = tab;
  } else if (parts[i] && SECTIONS.includes(parts[i] as BooksSection)) {
    section = parts[i] as BooksSection;
  }

  return {
    franchiseId,
    bookId,
    section,
    overviewTab,
    universeId: parseUniverseId(search),
  };
}

export function parseBooksRootPath(pathname: string): boolean {
  return pathname === BOOKS_ROOT_PATH || pathname === `${BOOKS_ROOT_PATH}/`;
}

export function parseBooksCatalogPath(pathname: string): boolean {
  return (
    pathname === BOOKS_CATALOG_PATH || pathname === `${BOOKS_CATALOG_PATH}/`
  );
}

export function pushBooksRoute(route: BooksRoute, replace = false): void {
  const path = booksPath(route);
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
}

export function pushBooksRootRoute(replace = false): void {
  if (replace) window.history.replaceState({}, "", BOOKS_ROOT_PATH);
  else window.history.pushState({}, "", BOOKS_ROOT_PATH);
}

export function pushBooksCatalogRoute(replace = false): void {
  if (replace) window.history.replaceState({}, "", BOOKS_CATALOG_PATH);
  else window.history.pushState({}, "", BOOKS_CATALOG_PATH);
}
