import { withMediaAccess } from "./mediaFileUrl";

/** In-app stream URL for a media play path (matches backend resolve_playback_url). */
export function musicStreamUrl(path: string): string {
  const rel = path.trim().replace(/\\/g, "/");
  return withMediaAccess(
    `/api/music/stream?path=${encodeURIComponent(rel)}`
  );
}

type WarmSlot = "next" | "prev";

const warmEls: Partial<Record<WarmSlot, HTMLAudioElement>> = {};
const warmUrls: Partial<Record<WarmSlot, string>> = {};

function warmSlot(slot: WarmSlot, url: string): void {
  if (typeof Audio === "undefined") return;
  if (url === warmUrls[slot]) return;
  let el = warmEls[slot];
  if (!el) {
    el = new Audio();
    el.preload = "auto";
    warmEls[slot] = el;
  }
  warmUrls[slot] = url;
  el.src = url;
  try {
    el.load();
  } catch {
    /* ignore */
  }
}

/** Prefetch a stream into a hidden Audio element (HTTP cache + decode warm). */
export function warmMusicStream(
  url: string | null | undefined,
  slot: WarmSlot = "next"
): void {
  const next = (url || "").trim();
  if (!next) return;
  warmSlot(slot, next);
}

export function warmMusicStreamForPath(
  path: string | null | undefined,
  slot: WarmSlot = "next"
): void {
  if (!path) return;
  warmMusicStream(musicStreamUrl(path), slot);
}
