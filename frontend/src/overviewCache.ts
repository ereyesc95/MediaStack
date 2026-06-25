import type { BandOverview, CardOrientation } from "./types";
import { fetchBandOverview } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";

const MAX_ENTRIES = 24;
const NAMESPACE = "band-overview-v7";
const LEGACY_NAMESPACES = ["band-overview-v5", "band-overview-v6"];

type CacheKey = `${number}:${CardOrientation}`;

const store = new Map<CacheKey, BandOverview>();
const inflight = new Map<CacheKey, Promise<BandOverview>>();

function purgeLegacyOverviewCaches(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (LEGACY_NAMESPACES.some((ns) => key.includes(`:${ns}:`))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

purgeLegacyOverviewCaches();
store.clear();

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
  if (mem && !isStaleSoloOverview(mem)) return mem;
  if (mem) store.delete(key);
  const fromSession = readSessionEntry<BandOverview>(sessionKey(bandId, orientation));
  if (fromSession && !isStaleSoloOverview(fromSession)) {
    store.set(key, fromSession);
    return fromSession;
  }
  if (fromSession) {
    removeSessionEntry(sessionKey(bandId, orientation));
  }
  return null;
}

function isStaleSoloOverview(data: BandOverview): boolean {
  const performer = data.solo_performer;
  if (!performer) return false;
  const bandName = (data.name || "").trim().toLocaleLowerCase();
  const performerName = (performer.name || "").trim().toLocaleLowerCase();
  if (!bandName || !performerName || bandName === performerName) return false;
  return performer.is_deceased === true;
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
