/** Shared home vs catalog entry for back-navigation across Movies/Series. */
export type MediaEntrySource = "home" | "catalog";

export type UniverseReturnTarget = {
  module: "series" | "movies" | "books";
  source: MediaEntrySource;
  universeId?: number;
  universeName?: string;
};

export type PendingCatalogBrowse = {
  module: "series" | "movies" | "books";
  mode: "name" | "genre" | "country" | "publisher" | "writer";
  countryId?: number;
  subgenreId?: number;
  publisher?: string;
  writer?: string;
  /** Name-filter letter chip (e.g. "H"). */
  letter?: string;
};

let entrySource: MediaEntrySource = "catalog";
let universeReturn: UniverseReturnTarget = {
  module: "series",
  source: "catalog",
};
let pendingCatalogBrowse: PendingCatalogBrowse | null = null;

const ENTRY_SOURCE_KEY = "mystack_media_entry_source";
const DIRECT_FILM_HOME_KEY = "mystack_direct_film_from_home";
const DIRECT_BOOK_HOME_KEY = "mystack_direct_book_from_home";

export function setMediaEntrySource(next: MediaEntrySource): void {
  entrySource = next;
  try {
    sessionStorage.setItem(ENTRY_SOURCE_KEY, next);
  } catch {
    /* ignore */
  }
}

export function getMediaEntrySource(): MediaEntrySource {
  try {
    const stored = sessionStorage.getItem(ENTRY_SOURCE_KEY);
    if (stored === "home" || stored === "catalog") {
      entrySource = stored;
      return stored;
    }
  } catch {
    /* ignore */
  }
  return entrySource;
}

export function setDirectFilmFromHome(next: boolean): void {
  try {
    sessionStorage.setItem(DIRECT_FILM_HOME_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function getDirectFilmFromHome(): boolean {
  try {
    return sessionStorage.getItem(DIRECT_FILM_HOME_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDirectBookFromHome(next: boolean): void {
  try {
    sessionStorage.setItem(DIRECT_BOOK_HOME_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function getDirectBookFromHome(): boolean {
  try {
    return sessionStorage.getItem(DIRECT_BOOK_HOME_KEY) === "1";
  } catch {
    return false;
  }
}

export function setUniverseReturnTarget(next: UniverseReturnTarget): void {
  universeReturn = next;
}

export function getUniverseReturnTarget(): UniverseReturnTarget {
  return universeReturn;
}

export function setPendingCatalogBrowse(next: PendingCatalogBrowse): void {
  pendingCatalogBrowse = next;
}

/** Consume a one-shot catalog filter jump (universe/franchise pill clicks). */
export function takePendingCatalogBrowse(
  module: "series" | "movies" | "books"
): PendingCatalogBrowse | null {
  if (!pendingCatalogBrowse || pendingCatalogBrowse.module !== module) {
    return null;
  }
  const hit = pendingCatalogBrowse;
  pendingCatalogBrowse = null;
  return hit;
}
