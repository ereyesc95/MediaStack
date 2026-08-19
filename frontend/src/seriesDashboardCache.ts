import { fetchSeriesDashboard } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import { EMPTY_SERIES_DASHBOARD, type SeriesDashboard } from "./types";

const NAMESPACE = "series-dashboard";
const CACHE_KEY = sessionCacheKey(NAMESPACE, "home");

let memory: SeriesDashboard | null = null;
let inflight: Promise<SeriesDashboard> | null = null;

function remember(data: SeriesDashboard): SeriesDashboard {
  memory = data;
  writeSessionEntry(CACHE_KEY, data);
  return data;
}

function dashboardHasItems(data: SeriesDashboard): boolean {
  return Boolean(
    data.top_franchises?.length ||
      data.top_series?.length ||
      data.top_genres?.length ||
      data.top_countries?.length ||
      data.top_episodes?.length
  );
}

function rememberIfPopulated(data: SeriesDashboard): SeriesDashboard {
  if (dashboardHasItems(data)) return remember(data);
  return data;
}

export function getCachedSeriesDashboard(): SeriesDashboard | null {
  if (memory) {
    if (dashboardHasItems(memory)) return memory;
    memory = null;
  }
  const fromSession = readSessionEntry<SeriesDashboard>(CACHE_KEY);
  if (fromSession) {
    if (dashboardHasItems(fromSession)) {
      memory = fromSession;
      return fromSession;
    }
    removeSessionEntry(CACHE_KEY);
  }
  return null;
}

export function clearSeriesDashboardCache(): void {
  memory = null;
  inflight = null;
  removeSessionEntry(CACHE_KEY);
}

export function prefetchSeriesDashboard(options?: {
  force?: boolean;
}): Promise<SeriesDashboard> {
  const force = options?.force ?? false;
  if (!force) {
    const cached = getCachedSeriesDashboard();
    if (cached) return Promise.resolve(cached);
  }
  if (inflight) return inflight;
  inflight = fetchSeriesDashboard()
    .then(rememberIfPopulated)
    .catch(() => getCachedSeriesDashboard() ?? EMPTY_SERIES_DASHBOARD)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
