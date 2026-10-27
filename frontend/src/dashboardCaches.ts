import { clearBooksDashboardCache } from "./booksDashboardCache";
import { clearMoviesDashboardCache } from "./moviesDashboardCache";
import { clearMusicDashboardCache } from "./musicDashboardCache";
import { clearSeriesDashboardCache } from "./seriesDashboardCache";
import { clearRouteEntityCache } from "./routeEntityCache";
import { clearUniversesCache } from "./universesCache";
import { clearAllLeafPageCaches } from "./leafPageCache";
import { clearFranchiseOverviewCache } from "./franchiseOverviewCache";
import { clearArtistMediaTabCache } from "./artistMediaTabCache";
import { clearArtistGalleryCache } from "./artistGalleryCache";

/** Drop home-pane caches so the next load (new session / profile) can pick fresh art. */
export function clearAllDashboardCaches(): void {
  clearMusicDashboardCache();
  clearSeriesDashboardCache();
  clearMoviesDashboardCache();
  clearBooksDashboardCache();
  clearUniversesCache();
  clearRouteEntityCache();
  // Leaf / franchise About + exclusive galleries include NSFW-gated payloads —
  // must not survive a mystack ↔ mystacknsfw profile switch.
  clearAllLeafPageCaches();
  clearFranchiseOverviewCache();
  clearArtistMediaTabCache();
  clearArtistGalleryCache();
}
