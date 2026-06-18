import { fetchTrackCredits } from "./api";
import type { TrackCredits } from "./types";

const MAX_ENTRIES = 256;

type CacheKey = `${number}:${string}:${string}`;

const store = new Map<CacheKey, TrackCredits>();
const inflight = new Map<CacheKey, Promise<TrackCredits>>();

function cacheKey(bandId: number, releaseId: string, title: string): CacheKey {
  return `${bandId}:${releaseId}:${title.trim().toLowerCase()}`;
}

export function getCachedTrackCredits(
  bandId: number,
  releaseId: string,
  title: string
): TrackCredits | null {
  return store.get(cacheKey(bandId, releaseId, title)) ?? null;
}

function remember(
  bandId: number,
  releaseId: string,
  title: string,
  data: TrackCredits
): TrackCredits {
  const key = cacheKey(bandId, releaseId, title);
  if (store.has(key)) store.delete(key);
  store.set(key, data);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  return data;
}

export function prefetchTrackCredits(
  bandId: number,
  releaseId: string,
  title: string
): Promise<TrackCredits> {
  const key = cacheKey(bandId, releaseId, title);
  const cached = store.get(key);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = fetchTrackCredits(bandId, releaseId, title)
    .then((data) => remember(bandId, releaseId, title, data))
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}

export function prefetchReleaseTrackCredits(
  bandId: number,
  releaseId: string,
  titles: string[]
): void {
  const seen = new Set<string>();
  for (const title of titles) {
    const norm = title.trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    void prefetchTrackCredits(bandId, releaseId, title);
  }
}
