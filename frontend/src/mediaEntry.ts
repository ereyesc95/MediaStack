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
};

let entrySource: MediaEntrySource = "catalog";
let universeReturn: UniverseReturnTarget = {
  module: "series",
  source: "catalog",
};
let pendingCatalogBrowse: PendingCatalogBrowse | null = null;

export function setMediaEntrySource(next: MediaEntrySource): void {
  entrySource = next;
}

export function getMediaEntrySource(): MediaEntrySource {
  return entrySource;
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
