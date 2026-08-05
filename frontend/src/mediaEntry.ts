/** Shared home vs catalog entry for back-navigation across Movies/Series. */
export type MediaEntrySource = "home" | "catalog";

let entrySource: MediaEntrySource = "catalog";

export function setMediaEntrySource(next: MediaEntrySource): void {
  entrySource = next;
}

export function getMediaEntrySource(): MediaEntrySource {
  return entrySource;
}
