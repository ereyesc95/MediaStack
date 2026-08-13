/** Cross-module entry context when opening an Artist page from Movies/Series/Books. */

import type { ArtistSection } from "./types";

export type ArtistEntrySource = "music" | "series" | "movies" | "books";

export type ArtistEntryReferrer = {
  source: ArtistEntrySource;
  /**
   * Preferred media tab that should appear next to Overview for this entry
   * (series / movies / books). Navigation itself should open Overview.
   */
  section: ArtistSection;
  /** Module tab the user came from (Home vs Catalog). */
  fromTab?: "home" | "catalog";
  /** Catalog name-letter to restore when returning to Catalog. */
  catalogLetter?: string;
  franchiseId?: string;
  franchiseName?: string;
  backLabel?: string;
};

export type ArtistBackRestore = {
  tab?: "home" | "catalog";
  letter?: string;
};

const KEY = "mystack_artist_entry_referrer";

let memory: ArtistEntryReferrer | null = null;

export function saveArtistEntryReferrer(ref: ArtistEntryReferrer | null): void {
  memory = ref;
  try {
    if (!ref) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(ref));
  } catch {
    /* ignore */
  }
}

export function getArtistEntryReferrer(): ArtistEntryReferrer | null {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ArtistEntryReferrer;
    if (!parsed || typeof parsed !== "object") return null;
    memory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function clearArtistEntryReferrer(): void {
  saveArtistEntryReferrer(null);
}

/** Media tab shown beside Overview for the source module — not the landing tab. */
export function defaultSectionForSource(
  source: ArtistEntrySource
): ArtistSection {
  switch (source) {
    case "movies":
      return "video";
    case "series":
      return "series";
    case "books":
      return "library";
    case "music":
    default:
      return "audio";
  }
}
