import { fetchBooksDashboard } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import { EMPTY_SERIES_DASHBOARD, type SeriesDashboard } from "./types";

const NAMESPACE = "books-dashboard";
const CACHE_KEY = sessionCacheKey(NAMESPACE, "home");

let memory: SeriesDashboard | null = null;
let inflight: Promise<SeriesDashboard> | null = null;

function remember(data: SeriesDashboard): SeriesDashboard {
  memory = data;
  writeSessionEntry(CACHE_KEY, data);
  return data;
}

export function getCachedBooksDashboard(): SeriesDashboard | null {
  if (memory) return memory;
  const fromSession = readSessionEntry<SeriesDashboard>(CACHE_KEY);
  if (fromSession) {
    memory = fromSession;
    return fromSession;
  }
  return null;
}

export function clearBooksDashboardCache(): void {
  memory = null;
  inflight = null;
  removeSessionEntry(CACHE_KEY);
}

export function prefetchBooksDashboard(options?: {
  force?: boolean;
}): Promise<SeriesDashboard> {
  const force = options?.force ?? false;
  if (!force) {
    const cached = getCachedBooksDashboard();
    if (cached) return Promise.resolve(cached);
  }
  if (inflight) return inflight;
  inflight = fetchBooksDashboard()
    .then(remember)
    .catch(() => remember(EMPTY_SERIES_DASHBOARD))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
