import type { CardOrientation, ReleaseOverview } from "./types";
import { fetchReleaseOverview } from "./api";
import {
  readSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";

const MAX_ENTRIES = 32;
const NAMESPACE = "release-overview-v13";

type CacheKey = string;

const store = new Map<CacheKey, ReleaseOverview>();
const inflight = new Map<CacheKey, Promise<ReleaseOverview>>();

function cacheKey(
  bandId: number,
  releaseId: string,
  orientation: CardOrientation,
  neighborBandId?: number | null
): CacheKey {
  const neighbor =
    neighborBandId && neighborBandId !== bandId ? String(neighborBandId) : "-";
  return `${bandId}:${releaseId}:${orientation}:${neighbor}`;
}

function sessionKey(
  bandId: number,
  releaseId: string,
  orientation: CardOrientation,
  neighborBandId?: number | null
): string {
  return sessionCacheKey(
    NAMESPACE,
    cacheKey(bandId, releaseId, orientation, neighborBandId)
  );
}

export function getCachedReleaseOverview(
  bandId: number,
  releaseId: string,
  orientation: CardOrientation = "landscape",
  neighborBandId?: number | null
): ReleaseOverview | null {
  const key = cacheKey(bandId, releaseId, orientation, neighborBandId);
  const mem = store.get(key);
  if (mem) return mem;
  const fromSession = readSessionEntry<ReleaseOverview>(
    sessionKey(bandId, releaseId, orientation, neighborBandId)
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
  data: ReleaseOverview,
  neighborBandId?: number | null
): void {
  const key = cacheKey(bandId, releaseId, orientation, neighborBandId);
  if (store.has(key)) {
    store.delete(key);
  }
  store.set(key, data);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  writeSessionEntry(
    sessionKey(bandId, releaseId, orientation, neighborBandId),
    data
  );
}

export function prefetchReleaseOverview(
  bandId: number,
  releaseId: string,
  orientation: CardOrientation = "landscape",
  neighborBandId?: number | null
): Promise<ReleaseOverview> {
  const key = cacheKey(bandId, releaseId, orientation, neighborBandId);
  const cached = getCachedReleaseOverview(
    bandId,
    releaseId,
    orientation,
    neighborBandId
  );
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = fetchReleaseOverview(
    bandId,
    releaseId,
    orientation,
    neighborBandId
  )
    .then((data) => {
      setCachedReleaseOverview(
        bandId,
        releaseId,
        orientation,
        data,
        neighborBandId
      );
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}
