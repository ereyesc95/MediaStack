import { clearBooksDashboardCache } from "./booksDashboardCache";
import { clearMoviesDashboardCache } from "./moviesDashboardCache";
import { clearMusicDashboardCache } from "./musicDashboardCache";
import { clearSeriesDashboardCache } from "./seriesDashboardCache";

/** Drop home-pane caches so the next load (new session / profile) can pick fresh art. */
export function clearAllDashboardCaches(): void {
  clearMusicDashboardCache();
  clearSeriesDashboardCache();
  clearMoviesDashboardCache();
  clearBooksDashboardCache();
}
