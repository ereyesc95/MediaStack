import type { BandOverview, CardOrientation } from "./types";
import { fetchBandOverview } from "./api";
import {
  readSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";

const MAX_ENTRIES = 24;
const NAMESPACE = "band-overview-v5";

type CacheKey = `${number}:${CardOrientation}`;

const store = new Map<CacheKey, BandOverview>();
const inflight = new Map<CacheKey, Promise<BandOverview>>();

function cacheKey(bandId: number, orientation: CardOrientation): CacheKey {
  return `${bandId}:${orientation}`;
}

function sessionKey(bandId: number, orientation: CardOrientation): string {
  return sessionCacheKey(NAMESPACE, cacheKey(bandId, orientation));
}

export function getCachedOverview(
  bandId: number,
  orientation: CardOrientation
): BandOverview | null {
  const key = cacheKey(bandId, orientation);
  const mem = store.get(key);
  if (mem) return mem;
  const fromSession = readSessionEntry<BandOverview>(sessionKey(bandId, orientation));
  if (fromSession) {
    store.set(key, fromSession);
    return fromSession;
  }
  return null;
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
  writeSessionEntry(sessionKey(bandId, orientation), data);
}

export function prefetchBandOverview(
  bandId: number,
  orientation: CardOrientation = "landscape"
): Promise<BandOverview> {
  const key = cacheKey(bandId, orientation);
  const cached = getCachedOverview(bandId, orientation);
  if (cached) return Promise.resolve(cached);

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
