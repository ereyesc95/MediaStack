import { fetchBandLibraryIndex, fetchBandVideoIndex } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import type { MediaTabIndexPayload } from "./types";

const MAX_ENTRIES = 32;
const NAMESPACE = "artist-media-tab-v2";

type CacheKey = `${number}:${"video" | "library"}`;

const store = new Map<CacheKey, MediaTabIndexPayload>();
const inflight = new Map<CacheKey, Promise<MediaTabIndexPayload>>();

function cacheKey(bandId: number, kind: "video" | "library"): CacheKey {
  return `${bandId}:${kind}`;
}

function sessionKey(bandId: number, kind: "video" | "library"): string {
  return sessionCacheKey(NAMESPACE, cacheKey(bandId, kind));
}

function remember(
  bandId: number,
  kind: "video" | "library",
  data: MediaTabIndexPayload
): void {
  const key = cacheKey(bandId, kind);
  if (store.has(key)) store.delete(key);
  store.set(key, data);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  writeSessionEntry(sessionKey(bandId, kind), data);
}

export function getCachedArtistMediaTab(
  bandId: number,
  kind: "video" | "library"
): MediaTabIndexPayload | null {
  const key = cacheKey(bandId, kind);
  const mem = store.get(key);
  if (mem) return mem;
  const fromSession = readSessionEntry<MediaTabIndexPayload>(
    sessionKey(bandId, kind)
  );
  if (fromSession) {
    store.set(key, fromSession);
    return fromSession;
  }
  return null;
}

export function clearArtistMediaTabCache(
  bandId?: number,
  kind?: "video" | "library"
): void {
  if (bandId != null && kind) {
    const key = cacheKey(bandId, kind);
    store.delete(key);
    inflight.delete(key);
    removeSessionEntry(sessionKey(bandId, kind));
    return;
  }
  store.clear();
  inflight.clear();
}

export function prefetchArtistMediaTab(
  bandId: number,
  kind: "video" | "library",
  options?: { force?: boolean }
): Promise<MediaTabIndexPayload> {
  const key = cacheKey(bandId, kind);
  const force = options?.force ?? false;

  if (!force) {
    const cached = getCachedArtistMediaTab(bandId, kind);
    if (cached) return Promise.resolve(cached);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = (
    kind === "video"
      ? fetchBandVideoIndex(bandId)
      : fetchBandLibraryIndex(bandId)
  )
    .then((data) => {
      remember(bandId, kind, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}
