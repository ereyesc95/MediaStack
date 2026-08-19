import {
  fetchSeriesFranchise,
  fetchSeriesFranchiseShows,
  resolveMoviesPath,
} from "./api";
import { normalizeSlug, slugMatch, stripDatedFolderTitle } from "./routeSlug";

export type MoviesLeafFromPath = {
  franchiseId: string;
  filmId: string;
  franchiseName?: string;
  filmTitle?: string;
};

export async function moviesLeafFromFolderPath(
  folderPath: string
): Promise<MoviesLeafFromPath | null> {
  const normalized = folderPath.replace(/\\/g, "/");
  try {
    const hit = await resolveMoviesPath(normalized);
    if (hit.work_id && hit.film_id) {
      return {
        franchiseId: hit.work_id,
        filmId: hit.film_id,
        franchiseName: hit.name ?? undefined,
        filmTitle: hit.film_title ?? undefined,
      };
    }
  } catch {
    /* fall through to folder parse */
  }

  const parts = normalized.split("/").filter(Boolean);
  const moviesIdx = parts.findIndex((p) => p.toLowerCase() === "movies");
  if (moviesIdx < 0 || parts.length <= moviesIdx + 2) return null;

  const franchiseName = parts[moviesIdx + 2] || "";
  const filmTitle = stripDatedFolderTitle(parts[parts.length - 1] || "");
  return {
    franchiseId: normalizeSlug(franchiseName) || franchiseName.toLowerCase(),
    filmId: filmTitle,
    franchiseName,
    filmTitle,
  };
}

export type SeriesLeafFromPath = {
  franchiseId: string;
  subseriesId?: string;
  franchiseName?: string;
};

export async function seriesLeafFromFolderPath(
  folderPath: string
): Promise<SeriesLeafFromPath | null> {
  const parts = folderPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length < 3 || parts[0].toLowerCase() !== "series") return null;

  const franchiseName = parts[2];
  const franchiseId = normalizeSlug(franchiseName) || franchiseName.toLowerCase();
  const leafFolder = parts.length >= 4 ? parts[parts.length - 1] : undefined;
  if (!leafFolder) {
    return { franchiseId, franchiseName };
  }

  try {
    const [detail, shows] = await Promise.all([
      fetchSeriesFranchise(franchiseId).catch(() => null),
      fetchSeriesFranchiseShows(franchiseId).catch(() => ({ items: [] })),
    ]);
    const candidates = [
      ...(detail?.subseries || []),
      ...(shows.items || []),
    ];
    const hit = candidates.find(
      (s) =>
        s.id === leafFolder ||
        (s.folder_path &&
          s.folder_path.replace(/\\/g, "/").split("/").pop() === leafFolder) ||
        slugMatch(s.title || "", leafFolder) ||
        slugMatch(("name" in s && s.name) || "", leafFolder)
    );
    if (hit?.id) {
      return {
        franchiseId,
        subseriesId: hit.id,
        franchiseName: detail?.name ?? franchiseName,
      };
    }
  } catch {
    /* use folder segment */
  }

  return {
    franchiseId,
    subseriesId: leafFolder,
    franchiseName,
  };
}
