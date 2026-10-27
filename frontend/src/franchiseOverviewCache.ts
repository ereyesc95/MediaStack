import type { SeriesOverview } from "./types";
import {
  clearSessionNamespace,
  readSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";

const NAMESPACE = "franchise-overview-v7";
const overviewCache = new Map<string, SeriesOverview>();

export function readFranchiseOverviewCache(key: string): SeriesOverview | null {
  const mem = overviewCache.get(key);
  if (mem) return mem;
  const stored = readSessionEntry<SeriesOverview>(
    sessionCacheKey(NAMESPACE, key)
  );
  if (stored) overviewCache.set(key, stored);
  return stored;
}

export function writeFranchiseOverviewCache(
  key: string,
  data: SeriesOverview
): void {
  overviewCache.set(key, data);
  writeSessionEntry(sessionCacheKey(NAMESPACE, key), data);
}

export function clearFranchiseOverviewCache(): void {
  overviewCache.clear();
  clearSessionNamespace(NAMESPACE);
}
