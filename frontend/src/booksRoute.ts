import { franchisePath, type FranchiseRoute } from "./franchiseRoute";
import {
  dec,
  enc,
  isBookId,
  isReservedSegment,
  normalizeSlug,
  parseUniverseId,
  withUniverseQuery,
} from "./routeSlug";

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
  franchiseName?: string;
  bookId?: string;
  bookTitle?: string;
  section: BooksSection;
  overviewTab?: BooksOverviewTab;
  universeId?: number;
  franchiseOnly?: boolean;
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

function parseTail(parts: string[], start: number): {
  section: BooksSection;
  overviewTab: BooksOverviewTab;
} {
  let section: BooksSection = "overview";
  let overviewTab: BooksOverviewTab = "about";
  const i = start;

  if (parts[i] === "overview" && parts[i + 1]) {
    section = "overview";
    const tab = dec(parts[i + 1]) as BooksOverviewTab;
    if (OVERVIEW_TABS.includes(tab)) overviewTab = tab;
  } else if (parts[i] && SECTIONS.includes(parts[i] as BooksSection)) {
    section = parts[i] as BooksSection;
  }

  return { section, overviewTab };
}

function parseLegacyBooksPath(
  pathname: string,
  search: string
): BooksRoute | null {
  const m = pathname.match(/^\/books\/franchise\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;

  const franchiseId = dec(m[1]);
  const parts = (m[2] || "").split("/").filter(Boolean);

  let bookId: string | undefined;
  let i = 0;

  if (parts[i] === "book" && parts[i + 1]) {
    bookId = dec(parts[i + 1]);
    i += 2;
  }

  const tail = parseTail(parts, i);
  const franchiseOnly = !bookId;

  return {
    franchiseId,
    bookId,
    section: tail.section,
    overviewTab: tail.overviewTab,
    universeId: parseUniverseId(search),
    franchiseOnly,
  };
}

function parseFlatBooksPath(pathname: string, search: string): BooksRoute | null {
  const m = pathname.match(/^\/books\/([^/]+)(?:\/(.*))?\/?$/);
  if (!m) return null;
  const head = dec(m[1]);
  if (head === "catalog" || head === "franchise") return null;

  const franchiseId = head;
  const parts = (m[2] || "").split("/").filter(Boolean);
  let bookId: string | undefined;
  let i = 0;

  if (parts[i] && !isReservedSegment(parts[i])) {
    bookId = dec(parts[i]);
    i += 1;
  }

  const tail = parseTail(parts, i);
  const franchiseOnly = !bookId;

  return {
    franchiseId,
    bookId,
    section: tail.section,
    overviewTab: tail.overviewTab,
    universeId: parseUniverseId(search),
    franchiseOnly,
  };
}

export function booksPath(route: BooksRoute): string {
  if (!route.bookId) {
    const fr: FranchiseRoute = {
      franchiseId: route.franchiseId,
      franchiseName: route.franchiseName,
      section: route.section,
      overviewTab: route.overviewTab,
      universeId: route.universeId,
    };
    return franchisePath(fr);
  }

  const franchiseSeg =
    normalizeSlug(route.franchiseName?.trim() || route.franchiseId) ||
    route.franchiseId;
  let path = `/books/${enc(franchiseSeg)}`;
  const titleRaw =
    route.bookTitle?.trim() &&
    !isBookId(route.bookTitle) &&
    route.bookTitle !== route.bookId
      ? route.bookTitle
      : !isBookId(route.bookId || "")
        ? route.bookTitle?.trim() || route.bookId
        : route.bookTitle?.trim() || "";
  const bookSeg = titleRaw
    ? normalizeSlug(titleRaw) || titleRaw
    : route.bookId;
  path += `/${enc(bookSeg!)}`;

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
  return (
    parseLegacyBooksPath(pathname, search) ??
    parseFlatBooksPath(pathname, search)
  );
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
