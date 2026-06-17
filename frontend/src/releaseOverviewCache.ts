import type { CardOrientation, ReleaseOverview } from "./types";
import { fetchReleaseOverview } from "./api";

const MAX_ENTRIES = 32;

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

export function getCachedReleaseOverview(
  bandId: number,
  releaseId: string,
  orientation: CardOrientation = "landscape"
): ReleaseOverview | null {
  return store.get(cacheKey(bandId, releaseId, orientation)) ?? null;
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
}

export function prefetchReleaseOverview(
  bandId: number,
  releaseId: string,
  orientation: CardOrientation = "landscape"
): Promise<ReleaseOverview> {
  const key = cacheKey(bandId, releaseId, orientation);
  const cached = store.get(key);
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
