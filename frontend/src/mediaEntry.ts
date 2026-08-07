/** Shared home vs catalog entry for back-navigation across Movies/Series. */
export type MediaEntrySource = "home" | "catalog";

export type UniverseReturnTarget = {
  module: "series" | "movies";
  source: MediaEntrySource;
};

let entrySource: MediaEntrySource = "catalog";
let universeReturn: UniverseReturnTarget = {
  module: "series",
  source: "catalog",
};

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
