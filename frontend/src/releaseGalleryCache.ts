import { fetchReleaseGallery } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import type { ReleaseGalleryPayload } from "./types";

const MAX_ENTRIES = 24;
const NAMESPACE = "release-gallery";

type CacheKey = `${number}:${string}`;

const store = new Map<CacheKey, ReleaseGalleryPayload>();
const inflight = new Map<CacheKey, Promise<ReleaseGalleryPayload>>();

function cacheKey(bandId: number, releaseId: string): CacheKey {
  return `${bandId}:${releaseId}`;
}

function sessionKey(bandId: number, releaseId: string): string {
  return sessionCacheKey(NAMESPACE, cacheKey(bandId, releaseId));
}

function remember(
  bandId: number,
  releaseId: string,
  data: ReleaseGalleryPayload
): void {
  const key = cacheKey(bandId, releaseId);
  if (store.has(key)) store.delete(key);
  store.set(key, data);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  writeSessionEntry(sessionKey(bandId, releaseId), data);
}

export function getCachedReleaseGallery(
  bandId: number,
  releaseId: string
): ReleaseGalleryPayload | null {
  const key = cacheKey(bandId, releaseId);
  const mem = store.get(key);
  if (mem) return mem;
  const fromSession = readSessionEntry<ReleaseGalleryPayload>(
    sessionKey(bandId, releaseId)
  );
  if (fromSession) {
    store.set(key, fromSession);
    return fromSession;
  }
  return null;
}

export function clearReleaseGalleryCache(bandId?: number, releaseId?: string): void {
  if (bandId != null && releaseId) {
    const key = cacheKey(bandId, releaseId);
    store.delete(key);
    inflight.delete(key);
    removeSessionEntry(sessionKey(bandId, releaseId));
    return;
  }
  store.clear();
  inflight.clear();
}

export function prefetchReleaseGallery(
  bandId: number,
  releaseId: string,
  options?: { force?: boolean }
): Promise<ReleaseGalleryPayload> {
  const key = cacheKey(bandId, releaseId);
  const force = options?.force ?? false;

  if (!force) {
    const cached = getCachedReleaseGallery(bandId, releaseId);
    if (cached) return Promise.resolve(cached);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = fetchReleaseGallery(bandId, releaseId)
    .then((data) => {
      remember(bandId, releaseId, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}
