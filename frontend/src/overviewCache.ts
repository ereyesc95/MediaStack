import type { BandOverview, CardOrientation } from "./types";
import { fetchBandOverview } from "./api";

const MAX_ENTRIES = 24;

type CacheKey = `${number}:${CardOrientation}`;

const store = new Map<CacheKey, BandOverview>();
const inflight = new Map<CacheKey, Promise<BandOverview>>();

function cacheKey(bandId: number, orientation: CardOrientation): CacheKey {
  return `${bandId}:${orientation}`;
}

export function getCachedOverview(
  bandId: number,
  orientation: CardOrientation
): BandOverview | null {
  return store.get(cacheKey(bandId, orientation)) ?? null;
}

export function setCachedOverview(
  bandId: number,
  orientation: CardOrientation,
  data: BandOverview
): void {
  const key = cacheKey(bandId, orientation);
  if (store.has(key)) {
    store.delete(key);
  }
  store.set(key, data);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}

export function prefetchBandOverview(
  bandId: number,
  orientation: CardOrientation = "landscape"
): Promise<BandOverview> {
  const key = cacheKey(bandId, orientation);
  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = fetchBandOverview(bandId, orientation)
    .then((data) => {
      setCachedOverview(bandId, orientation, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}
