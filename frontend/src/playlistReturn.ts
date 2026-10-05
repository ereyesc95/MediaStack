/** Return path when leaving a playlist for an artist/release page. */

import type { TourShowTab } from "./types";

export type PlaylistReturn = {
  kind: "artist-playlist" | "user-playlist" | "catalog-live-shows" | "tour-show";
  bandId?: number;
  slug?: string;
  userPlaylistId?: number;
  tourSlug?: string;
  showSlug?: string;
  showTab?: TourShowTab;
  /** Where the tour show was opened from (events browse vs artist tours). */
  tourEntry?: "events" | "artist";
  backLabel: string;
};

const KEY = "mystack_playlist_return";

let memory: PlaylistReturn | null = null;

export function savePlaylistReturn(ref: PlaylistReturn | null): void {
  memory = ref;
  try {
    if (!ref) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(ref));
  } catch {
    /* ignore */
  }
}

export function getPlaylistReturn(): PlaylistReturn | null {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlaylistReturn;
    if (!parsed || typeof parsed !== "object") return null;
    memory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPlaylistReturn(): void {
  savePlaylistReturn(null);
}
