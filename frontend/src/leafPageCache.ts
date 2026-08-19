import {
  fetchBooksBook,
  fetchBooksBookOverview,
  fetchBooksFranchiseOverview,
  fetchMoviesFilm,
  fetchMoviesFilmOverview,
  fetchMoviesFranchiseOverview,
} from "./api";
import type {
  CardOrientation,
  MoviesFilmCard,
  MoviesFilmDetail,
  SeriesFolderDetail,
  SeriesOverview,
  SeriesSubseriesCard,
} from "./types";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";

const MAX_ENTRIES = 32;
const NAMESPACE = "leaf-page-v1";

export type LeafPageCacheEntry = {
  overview: SeriesOverview | null;
  card: SeriesSubseriesCard | null;
  detail: SeriesFolderDetail | null;
  siblings: SeriesSubseriesCard[];
  filmVersions?: MoviesFilmDetail["versions"];
  filmHasVideo?: boolean;
  trailerUrl?: string | null;
  workName?: string | null;
};

const store = new Map<string, LeafPageCacheEntry>();
const inflight = new Map<string, Promise<void>>();

export function leafPageCacheKey(
  isFilm: boolean,
  franchiseId: string,
  id: string
): string {
  return `${isFilm ? "film" : "sub"}:${franchiseId}:${id}`;
}

function sessionKey(key: string): string {
  return sessionCacheKey(NAMESPACE, key);
}

export function getCachedLeafPage(key: string): LeafPageCacheEntry | null {
  const mem = store.get(key);
  if (mem) return mem;
  const fromSession = readSessionEntry<LeafPageCacheEntry>(sessionKey(key));
  if (fromSession) {
    store.set(key, fromSession);
    return fromSession;
  }
  return null;
}

export function setCachedLeafPage(key: string, entry: LeafPageCacheEntry): void {
  if (store.has(key)) store.delete(key);
  store.set(key, entry);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  writeSessionEntry(sessionKey(key), entry);
}

export function deleteCachedLeafPage(key: string): void {
  store.delete(key);
  removeSessionEntry(sessionKey(key));
}

function filmDetailToFolder(film: MoviesFilmDetail): SeriesFolderDetail {
  return {
    id: film.id,
    title: film.title,
    date_iso: film.date_iso,
    display_date: film.display_date ?? null,
    folder_path: film.folder_path,
    cover_url: film.cover_url,
    banner_url: film.banner_url ?? null,
    cover_back_url: film.cover_back_url ?? null,
    logo_url: film.logo_url ?? null,
    icon_url: film.icon_url ?? null,
    badge_url: film.badge_url ?? null,
    has_gallery: Boolean(film.has_gallery),
    kind: "folder",
    seasons: film.seasons || [],
    subseries: film.subseries || [],
    episodes: film.episodes || [],
    movies: film.movies || [],
    photocards: film.photocards,
  };
}

function filmCardToSubseries(
  f: MoviesFilmCard | SeriesSubseriesCard
): SeriesSubseriesCard {
  return {
    id: f.id,
    title: f.title,
    date_iso: f.date_iso,
    display_date: f.display_date ?? null,
    folder_path: f.folder_path,
    cover_url: f.cover_url,
    logo_url: f.logo_url ?? null,
    icon_url: f.icon_url ?? null,
    badge_url: f.badge_url ?? null,
    season_count:
      "season_count" in f
        ? f.season_count
        : (f as MoviesFilmCard).version_count ?? 1,
    has_gallery: "has_gallery" in f ? Boolean(f.has_gallery) : undefined,
  } as SeriesSubseriesCard;
}

function buildFilmLeafEntry(
  filmDetail: MoviesFilmDetail,
  filmOv: SeriesOverview | null,
  workOv: SeriesOverview | null,
  filmList: (MoviesFilmCard | SeriesSubseriesCard)[],
  franchiseName?: string | null
): LeafPageCacheEntry {
  const list = filmList.length
    ? filmList.map(filmCardToSubseries)
    : [
        filmCardToSubseries({
          id: filmDetail.id,
          title: filmDetail.title,
          date_iso: filmDetail.date_iso,
          display_date: filmDetail.display_date ?? null,
          folder_path: filmDetail.folder_path,
          cover_url: filmDetail.cover_url,
          logo_url: filmDetail.logo_url ?? null,
          icon_url: filmDetail.icon_url ?? null,
          badge_url: filmDetail.badge_url ?? null,
          version_count: filmDetail.versions?.length || 1,
          has_gallery: filmDetail.has_gallery,
        } as MoviesFilmCard),
      ];
  const found =
    list.find((s) => s.id === filmDetail.id) || list[0] || null;
  const nextVersions =
    filmDetail.versions ||
    (filmDetail as { volumes?: typeof filmDetail.versions }).volumes ||
    (filmOv as { versions?: typeof filmDetail.versions } | null)?.versions ||
    [];
  const nextHasVideo = Boolean(
    filmDetail.has_video ||
      (filmOv as { has_video?: boolean } | null)?.has_video ||
      nextVersions.length ||
      (filmDetail as { has_pdf?: boolean }).has_pdf
  );
  const nextTrailer =
    filmDetail.trailer_url ??
    (filmOv as { trailer_url?: string | null } | null)?.trailer_url ??
    null;
  const nextWorkName =
    filmDetail.work?.name ||
    (filmOv as { work?: { name?: string | null } } | null)?.work?.name ||
    workOv?.name ||
    franchiseName ||
    null;

  return {
    overview: filmOv || workOv || null,
    card: found,
    detail: filmDetailToFolder(filmDetail),
    siblings: list,
    filmVersions: nextVersions,
    filmHasVideo: nextHasVideo,
    trailerUrl: nextTrailer,
    workName: nextWorkName,
  };
}

/** Warm leaf cache before navigation (movies/books). */
export function prefetchFilmLeafPage(
  franchiseId: string,
  leafId: string,
  options?: { isBook?: boolean; orientation?: CardOrientation }
): Promise<void> {
  const isBook = Boolean(options?.isBook);
  const orientation =
    options?.orientation === "landscape" ? "landscape" : "portrait";
  const key = leafPageCacheKey(true, franchiseId, leafId);
  if (getCachedLeafPage(key)) return Promise.resolve();

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const workOvP = (isBook
      ? fetchBooksFranchiseOverview(franchiseId, orientation)
      : fetchMoviesFranchiseOverview(franchiseId, orientation)
    ).catch(() => null);

    const [filmOv, filmDetail] = await Promise.all([
      (isBook
        ? fetchBooksBookOverview(leafId, orientation)
        : fetchMoviesFilmOverview(leafId, orientation)
      ).catch(() => null),
      isBook
        ? fetchBooksBook(leafId).catch(() => null)
        : fetchMoviesFilm(leafId).catch(() => null),
    ]);

    if (!filmDetail) return;

    const workOv = await workOvP;
    const filmList = (workOv?.films || workOv?.subseries || []) as (
      | MoviesFilmCard
      | SeriesSubseriesCard
    )[];

    setCachedLeafPage(
      key,
      buildFilmLeafEntry(filmDetail, filmOv, workOv, filmList)
    );
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, pending);
  return pending;
}
