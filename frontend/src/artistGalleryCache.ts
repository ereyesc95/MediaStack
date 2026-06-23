import { fetchBandGalleryIndex } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import type { GalleryIndexPayload } from "./types";

const MAX_ENTRIES = 24;
const NAMESPACE = "artist-gallery";

type CacheKey = `${number}`;

const store = new Map<CacheKey, GalleryIndexPayload>();
const inflight = new Map<CacheKey, Promise<GalleryIndexPayload>>();

function cacheKey(bandId: number): CacheKey {
  return `${bandId}`;
}

function sessionKey(bandId: number): string {
  return sessionCacheKey(NAMESPACE, cacheKey(bandId));
}

function remember(bandId: number, data: GalleryIndexPayload): void {
  const key = cacheKey(bandId);
  if (store.has(key)) store.delete(key);
  store.set(key, data);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  writeSessionEntry(sessionKey(bandId), data);
}

export function getCachedArtistGallery(bandId: number): GalleryIndexPayload | null {
  const key = cacheKey(bandId);
  const mem = store.get(key);
  if (mem) return mem;
  const fromSession = readSessionEntry<GalleryIndexPayload>(sessionKey(bandId));
  if (fromSession) {
    store.set(key, fromSession);
    return fromSession;
  }
  return null;
}

export function clearArtistGalleryCache(bandId?: number): void {
  if (bandId != null) {
    const key = cacheKey(bandId);
    store.delete(key);
    inflight.delete(key);
    removeSessionEntry(sessionKey(bandId));
    return;
  }
  store.clear();
  inflight.clear();
}

export function prefetchArtistGallery(
  bandId: number,
  options?: { force?: boolean }
): Promise<GalleryIndexPayload> {
  const key = cacheKey(bandId);
  const force = options?.force ?? false;

  if (!force) {
    const cached = getCachedArtistGallery(bandId);
    if (cached) return Promise.resolve(cached);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = fetchBandGalleryIndex(bandId)
    .then((data) => {
      remember(bandId, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}
