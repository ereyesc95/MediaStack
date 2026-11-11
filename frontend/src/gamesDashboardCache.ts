import { fetchGamesDashboard } from "./api";
import { getRecentGameIds } from "./gamesRecent";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import { EMPTY_SERIES_DASHBOARD, type SeriesDashboard } from "./types";

export type GamesDashboard = SeriesDashboard & {
  platforms?: import("./types").SeriesFranchiseCard[];
  recent_games?: import("./types").MoviesFilmCard[];
  top_games?: import("./types").MoviesFilmCard[];
  top_franchises?: import("./types").SeriesFranchiseCard[];
  franchise_count?: number;
  game_count?: number;
  platform_count?: number;
};

const NAMESPACE = "games-dashboard";
const CACHE_KEY = sessionCacheKey(NAMESPACE, "home");

let memory: GamesDashboard | null = null;
let inflight: Promise<GamesDashboard> | null = null;

function remember(data: GamesDashboard): GamesDashboard {
  memory = data;
  writeSessionEntry(CACHE_KEY, data);
  return data;
}

function dashboardHasItems(data: GamesDashboard): boolean {
  // Genres alone can exist without a Games/ catalog hit.
  return Boolean(
    data.top_franchises?.length ||
      data.top_games?.length ||
      data.top_series?.length ||
      data.platforms?.length ||
      data.recent_games?.length
  );
}

function rememberIfPopulated(data: GamesDashboard): GamesDashboard {
  if (dashboardHasItems(data)) return remember(data);
  return data;
}

export function getCachedGamesDashboard(): GamesDashboard | null {
  if (memory) {
    if (dashboardHasItems(memory)) return memory;
    memory = null;
  }
  const fromSession = readSessionEntry<GamesDashboard>(CACHE_KEY);
  if (fromSession) {
    if (dashboardHasItems(fromSession)) {
      memory = fromSession;
      return fromSession;
    }
    removeSessionEntry(CACHE_KEY);
  }
  return null;
}

export function clearGamesDashboardCache(): void {
  memory = null;
  inflight = null;
  removeSessionEntry(CACHE_KEY);
}

export function prefetchGamesDashboard(options?: {
  force?: boolean;
  recentIds?: string[];
}): Promise<GamesDashboard> {
  const force = options?.force ?? false;
  if (!force) {
    const cached = getCachedGamesDashboard();
    if (cached) return Promise.resolve(cached);
  }
  if (inflight) return inflight;
  const recent = options?.recentIds ?? getRecentGameIds();
  inflight = fetchGamesDashboard(recent)
    .then(rememberIfPopulated)
    .catch(
      () =>
        getCachedGamesDashboard() ??
        (EMPTY_SERIES_DASHBOARD as GamesDashboard)
    )
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
