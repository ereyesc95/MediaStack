import type { CardOrientation, ReleaseOverview } from "./types";
import { fetchReleaseOverview } from "./api";
import {
  readSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";

const MAX_ENTRIES = 32;
const NAMESPACE = "release-overview-v12";

type CacheKey = `${number}:${string}:${CardOrientation}`;

const store = new Map<CacheKey, ReleaseOverview>();
const inflight = new Map<CacheKey, Promise<ReleaseOverview>>();

function cacheKey(
  bandId: number,
  releaseId: string,
  orientation: CardOrientation
): CacheKey {
  return `${bandId}:${releaseId}:${orientation}`;
}

function sessionKey(
  bandId: number,
  releaseId: string,
  orientation: CardOrientation
): string {
  return sessionCacheKey(NAMESPACE, cacheKey(bandId, releaseId, orientation));
}

export function getCachedReleaseOverview(
  bandId: number,
  releaseId: string,
  orientation: CardOrientation = "landscape"
): ReleaseOverview | null {
  const key = cacheKey(bandId, releaseId, orientation);
  const mem = store.get(key);
  if (mem) return mem;
  const fromSession = readSessionEntry<ReleaseOverview>(
    sessionKey(bandId, releaseId, orientation)
  );
  if (fromSession) {
    store.set(key, fromSession);
    return fromSession;
  }
  return null;
}

export function setCachedReleaseOverview(
  bandId: number,
  releaseId: string,
  orientation: CardOrientation,
  data: ReleaseOverview
): void {
  const key = cacheKey(bandId, releaseId, orientation);
  if (store.has(key)) {
    store.delete(key);
  }
  store.set(key, data);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  writeSessionEntry(sessionKey(bandId, releaseId, orientation), data);
}

export function prefetchReleaseOverview(
  bandId: number,
  releaseId: string,
  orientation: CardOrientation = "landscape"
): Promise<ReleaseOverview> {
  const key = cacheKey(bandId, releaseId, orientation);
  const cached = getCachedReleaseOverview(bandId, releaseId, orientation);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = fetchReleaseOverview(bandId, releaseId, orientation)
    .then((data) => {
      setCachedReleaseOverview(bandId, releaseId, orientation, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}
