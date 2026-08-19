import { fetchMoviesDashboard } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import { EMPTY_SERIES_DASHBOARD, type SeriesDashboard } from "./types";

type MoviesDash = SeriesDashboard & {
  franchise_count?: number;
  film_count?: number;
};

const NAMESPACE = "movies-dashboard";
const CACHE_KEY = sessionCacheKey(NAMESPACE, "home");

let memory: MoviesDash | null = null;
let inflight: Promise<MoviesDash> | null = null;

function remember(data: MoviesDash): MoviesDash {
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

function rememberIfPopulated(data: MoviesDash): MoviesDash {
  if (dashboardHasItems(data)) return remember(data);
  return data;
}

export function getCachedMoviesDashboard(): MoviesDash | null {
  if (memory) {
    if (dashboardHasItems(memory)) return memory;
    memory = null;
  }
  const fromSession = readSessionEntry<MoviesDash>(CACHE_KEY);
  if (fromSession) {
    if (dashboardHasItems(fromSession)) {
      memory = fromSession;
      return fromSession;
    }
    removeSessionEntry(CACHE_KEY);
  }
  return null;
}

export function clearMoviesDashboardCache(): void {
  memory = null;
  inflight = null;
  removeSessionEntry(CACHE_KEY);
}

export function prefetchMoviesDashboard(options?: {
  force?: boolean;
}): Promise<MoviesDash> {
  const force = options?.force ?? false;
  if (!force) {
    const cached = getCachedMoviesDashboard();
    if (cached) return Promise.resolve(cached);
  }
  if (inflight) return inflight;
  inflight = fetchMoviesDashboard()
    .then((data) => rememberIfPopulated(data as MoviesDash))
    .catch(() => getCachedMoviesDashboard() ?? (EMPTY_SERIES_DASHBOARD as MoviesDash))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
