import { fetchReleaseTracklist } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import type { ReleaseTracklist } from "./types";

const MAX_ENTRIES = 32;
const NAMESPACE = "release-tracklist";
const CACHE_VERSION = "v12";

type CacheKey = `${string}:${number}:${string}`;

const store = new Map<CacheKey, ReleaseTracklist>();
const inflight = new Map<CacheKey, Promise<ReleaseTracklist>>();

function cacheKey(bandId: number, releaseId: string): CacheKey {
  return `${CACHE_VERSION}:${bandId}:${releaseId}`;
}

function sessionKey(bandId: number, releaseId: string): string {
  return sessionCacheKey(NAMESPACE, cacheKey(bandId, releaseId));
}

function remember(bandId: number, releaseId: string, data: ReleaseTracklist): void {
  const key = cacheKey(bandId, releaseId);
  if (store.has(key)) store.delete(key);
  store.set(key, data);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  writeSessionEntry(sessionKey(bandId, releaseId), data);
}

export function getCachedReleaseTracklist(
  bandId: number,
  releaseId: string
): ReleaseTracklist | null {
  const key = cacheKey(bandId, releaseId);
  const mem = store.get(key);
  if (mem) return mem;
  const fromSession = readSessionEntry<ReleaseTracklist>(sessionKey(bandId, releaseId));
  if (fromSession) {
    store.set(key, fromSession);
    return fromSession;
  }
  return null;
}

export function setCachedReleaseTracklist(
  bandId: number,
  releaseId: string,
  data: ReleaseTracklist
): void {
  remember(bandId, releaseId, data);
}

export function clearReleaseTracklistCache(bandId?: number, releaseId?: string): void {
  if (bandId != null && releaseId) {
    const key = cacheKey(bandId, releaseId);
    store.delete(key);
    inflight.delete(key);
    removeSessionEntry(sessionKey(bandId, releaseId));
    return;
  }
  store.clear();
  inflight.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.includes(`${NAMESPACE}:${CACHE_VERSION}:`)) {
        sessionStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}

export function prefetchReleaseTracklist(
  bandId: number,
  releaseId: string,
  options?: { force?: boolean }
): Promise<ReleaseTracklist> {
  const key = cacheKey(bandId, releaseId);
  const force = options?.force ?? false;

  if (!force) {
    const cached = getCachedReleaseTracklist(bandId, releaseId);
    if (cached) return Promise.resolve(cached);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = fetchReleaseTracklist(bandId, releaseId)
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
