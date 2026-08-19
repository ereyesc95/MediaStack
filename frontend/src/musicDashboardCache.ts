import { fetchMusicDashboard } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import { EMPTY_DASHBOARD, type MusicDashboard } from "./types";

const NAMESPACE = "music-dashboard";
const CACHE_KEY = sessionCacheKey(NAMESPACE, "home");

let memory: MusicDashboard | null = null;
let inflight: Promise<MusicDashboard> | null = null;

function remember(data: MusicDashboard): MusicDashboard {
  memory = data;
  writeSessionEntry(CACHE_KEY, data);
  return data;
}

function dashboardHasItems(data: MusicDashboard): boolean {
  return Boolean(
    data.top_tracks?.length ||
      data.top_artists?.length ||
      data.top_releases?.length ||
      data.top_genres?.length ||
      data.top_countries?.length
  );
}

function rememberIfPopulated(data: MusicDashboard): MusicDashboard {
  if (dashboardHasItems(data)) return remember(data);
  return data;
}

export function getCachedMusicDashboard(): MusicDashboard | null {
  if (memory) {
    if (dashboardHasItems(memory)) return memory;
    memory = null;
  }
  const fromSession = readSessionEntry<MusicDashboard>(CACHE_KEY);
  if (fromSession) {
    if (dashboardHasItems(fromSession)) {
      memory = fromSession;
      return fromSession;
    }
    removeSessionEntry(CACHE_KEY);
  }
  return null;
}

export function clearMusicDashboardCache(): void {
  memory = null;
  inflight = null;
  removeSessionEntry(CACHE_KEY);
}

export function prefetchMusicDashboard(
  options?: { force?: boolean }
): Promise<MusicDashboard> {
  const force = options?.force ?? false;

  if (!force) {
    const cached = getCachedMusicDashboard();
    if (cached) return Promise.resolve(cached);
  }

  if (inflight) return inflight;

  inflight = fetchMusicDashboard()
    .then(rememberIfPopulated)
    .catch(() => getCachedMusicDashboard() ?? EMPTY_DASHBOARD)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
