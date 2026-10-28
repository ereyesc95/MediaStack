import {
  fetchBandLibraryIndex,
  fetchBandVideoIndex,
  fetchBooksFranchise,
  fetchBooksFranchiseOverview,
  fetchGamesFranchise,
  fetchMoviesFranchise,
  fetchSeriesFranchise,
  fetchUniverses,
  resolveArtistName,
  searchArtistReleases,
} from "./api";
import type { FranchiseRoute } from "./franchiseRoute";
import type { ArtistRoute } from "./musicRoute";
import type { MoviesRoute } from "./moviesRoute";
import type { BooksRoute } from "./booksRoute";
import type { SeriesRoute } from "./seriesRoute";
import type { UniverseRoute } from "./universeRoute";
import type { View } from "./types";
import {
  isBookId,
  isFilmId,
  isMediaItemId,
  isReleaseId,
  slugMatch,
  stripDatedFolderTitle,
} from "./routeSlug";
import { parseBooksPath } from "./booksRoute";
import { parseGamesPath } from "./gamesRoute";
import { parseFranchisePath, parseLegacyFranchiseHubPath } from "./franchiseRoute";
import { getFranchiseHomeReferrer } from "./franchiseHome";
import { parseMoviesPath } from "./moviesRoute";
import { parseArtistPath, parsePlaylistsGridPath, parseUserPlaylistPath } from "./musicRoute";
import { parseSeriesPath } from "./seriesRoute";
import { parseUniversePath } from "./universeRoute";
import {
  bandIdFromArtistSlug,
  leafIdFromSlug,
  rememberArtistSlug,
  rememberLeafSlug,
  rememberReleaseSlug,
  releaseIdFromSlug,
} from "./routeEntityCache";

type FranchiseHomeModule = "series" | "movies" | "books" | "games";

function matchLeafTitle<
  T extends { id: string; title?: string | null; name?: string | null; folder_name?: string | null },
>(items: T[] | undefined, slug: string): T | undefined {
  if (!items?.length) return undefined;
  const decoded = slug.trim();
  const byId = items.find(
    (it) =>
      it.id === decoded ||
      slugMatch(it.id, decoded) ||
      slugMatch(stripDatedFolderTitle(it.id), decoded) ||
      slugMatch(it.folder_name || "", decoded) ||
      slugMatch(stripDatedFolderTitle(it.folder_name || ""), decoded)
  );
  if (byId) return byId;
  const byTitle = items.filter((it) =>
    slugMatch(it.title || it.name || "", decoded)
  );
  if (byTitle.length === 1) return byTitle[0];
  return undefined;
}

async function resolveFranchiseHomeModule(
  franchiseId: string
): Promise<FranchiseHomeModule> {
  try {
    const series = await fetchSeriesFranchise(franchiseId);
    const home = String(
      (series as { artwork_home_module?: string | null }).artwork_home_module || ""
    ).toLowerCase();
    if (home === "movies" || home === "books" || home === "series") return home;
    if (series?.id) return "series";
  } catch {
    /* try others */
  }
  try {
    const movies = await fetchMoviesFranchise(franchiseId);
    if (movies?.id) return "movies";
  } catch {
    /* try books */
  }
  try {
    const books = await fetchBooksFranchiseOverview(franchiseId);
    if (books?.id) return "books";
  } catch {
    /* try games */
  }
  try {
    const games = await fetchGamesFranchise(franchiseId);
    if (games?.id) return "games";
  } catch {
    /* default */
  }
  return "series";
}

export async function resolveArtistRoute(route: ArtistRoute): Promise<ArtistRoute> {
  if (route.bandId != null) return route;
  const slug = route.artistSlug?.trim();
  if (!slug) return route;
  try {
    const res = await resolveArtistName(slug);
    if (res.band_id != null) {
      rememberArtistSlug(slug, res.band_id);
      return { ...route, bandId: res.band_id, artistName: res.name || slug };
    }
  } catch {
    /* ignore */
  }
  return route;
}

async function resolveReleaseTitle(
  bandId: number,
  title: string
): Promise<string | undefined> {
  if (isReleaseId(title)) return title;
  try {
    const res = await searchArtistReleases(bandId, title);
    const hit = matchLeafTitle(res.releases, title);
    if (hit?.id) {
      rememberReleaseSlug(bandId, title, hit.id);
      return hit.id;
    }
    const query = title.trim();
    if (query.length >= 2) {
      const loose = res.releases?.find(
        (row) =>
          slugMatch(row.title || "", query) ||
          slugMatch(stripDatedFolderTitle(row.id || ""), query) ||
          slugMatch(stripDatedFolderTitle(row.folder_name || ""), query)
      );
      if (loose?.id) {
        rememberReleaseSlug(bandId, title, loose.id);
        return loose.id;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function resolveMediaItemTitle(
  bandId: number,
  kind: "video" | "library",
  title: string
): Promise<string | undefined> {
  if (isMediaItemId(title)) return title;
  try {
    const res =
      kind === "library"
        ? await fetchBandLibraryIndex(bandId)
        : await fetchBandVideoIndex(bandId);
    const items = (res.categories || []).flatMap((c) => c.items || []);
    const hit = matchLeafTitle(items, title);
    return hit?.id;
  } catch {
    return undefined;
  }
}

export async function resolveArtistRouteDeep(
  route: ArtistRoute
): Promise<ArtistRoute | null> {
  const base = await resolveArtistRoute(route);
  if (base.bandId == null) return null;

  let releaseId = base.releaseId;
  if (releaseId && !isReleaseId(releaseId)) {
    releaseId =
      (await resolveReleaseTitle(base.bandId, releaseId)) || releaseId;
  }

  let mediaItemId = base.mediaItemId;
  if (mediaItemId && !isMediaItemId(mediaItemId)) {
    const kind =
      base.section === "library"
        ? "library"
        : base.section === "video"
          ? "video"
          : null;
    if (kind) {
      mediaItemId =
        (await resolveMediaItemTitle(base.bandId, kind, mediaItemId)) ||
        mediaItemId;
    }
  }

  return {
    ...base,
    releaseId,
    mediaItemId,
  };
}

export async function resolveSeriesRoute(
  route: SeriesRoute
): Promise<SeriesRoute> {
  let subseriesId = route.subseriesId;
  let subseriesTitle = route.subseriesTitle;
  let franchiseName = route.franchiseName;
  try {
    const detail = await fetchSeriesFranchise(route.franchiseId);
    if (!franchiseName && detail?.name) franchiseName = detail.name;
    if (subseriesId) {
      const subs = [
        ...(detail.subseries || []),
        ...(detail.is_standalone && detail.primary_subseries_id
          ? [{ id: detail.primary_subseries_id, title: detail.name }]
          : []),
      ];
      const hit = matchLeafTitle(subs, subseriesId);
      if (hit) {
        subseriesId = hit.id;
        subseriesTitle = hit.title || subseriesTitle;
        rememberLeafSlug(
          "series",
          route.franchiseId,
          hit.title || subseriesId,
          hit.id
        );
      }
    }
  } catch {
    /* keep raw slug */
  }
  return { ...route, franchiseName, subseriesId, subseriesTitle };
}

export async function resolveMoviesRoute(route: MoviesRoute): Promise<MoviesRoute> {
  let filmId = route.filmId;
  let filmTitle = route.filmTitle;
  let franchiseName = route.franchiseName;
  try {
    const detail = await fetchMoviesFranchise(route.franchiseId);
    if (!franchiseName && detail?.name) franchiseName = detail.name;
    if (filmId) {
      const films = detail.films || [];
      const hit =
        matchLeafTitle(films, filmId) ||
        (isFilmId(filmId)
          ? films.find((f) => f.id === filmId)
          : undefined);
      if (hit) {
        filmId = hit.id;
        filmTitle = hit.title || filmTitle;
        rememberLeafSlug(
          "movies",
          route.franchiseId,
          hit.title || filmId,
          hit.id
        );
      }
    }
  } catch {
    /* keep slug */
  }
  return { ...route, franchiseName, filmId, filmTitle };
}

export async function resolveBooksRoute(route: BooksRoute): Promise<BooksRoute> {
  let bookId = route.bookId;
  let bookTitle = route.bookTitle;
  let franchiseName = route.franchiseName;
  try {
    const detail = await fetchBooksFranchise(route.franchiseId);
    if (!franchiseName && detail?.name) franchiseName = detail.name;
    if (bookId) {
      const books =
        (detail as { books?: typeof detail.films }).books ||
        detail.films ||
        [];
      const hit =
        matchLeafTitle(books, bookId) ||
        (isBookId(bookId) ? books.find((b) => b.id === bookId) : undefined);
      if (hit) {
        bookId = hit.id;
        bookTitle = hit.title || bookTitle;
        rememberLeafSlug(
          "books",
          route.franchiseId,
          hit.title || bookId,
          hit.id
        );
      }
    }
  } catch {
    /* keep slug */
  }
  return { ...route, franchiseName, bookId, bookTitle };
}

export async function resolveUniverseRoute(
  route: UniverseRoute
): Promise<UniverseRoute | null> {
  if (route.universeId != null) return route;
  const slug = route.universeSlug?.trim();
  if (!slug) return null;
  try {
    const { universes } = await fetchUniverses();
    const hit =
      universes.find((u) => slugMatch(u.slug, slug) || slugMatch(u.name, slug)) ||
      universes.find((u) => String(u.id) === slug);
    if (hit) {
      return {
        ...route,
        universeId: hit.id,
        universeName: hit.name,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function franchiseRouteToView(
  route: FranchiseRoute,
  module: FranchiseHomeModule
): View {
  if (module === "movies") {
    return {
      kind: "movies",
      franchiseId: route.franchiseId,
      section: (route.section === "episodes"
        ? "overview"
        : route.section) as import("./moviesRoute").MoviesSection,
      overviewTab: route.overviewTab as
        | import("./moviesRoute").MoviesOverviewTab
        | undefined,
      universeId: route.universeId,
    };
  }
  if (module === "books") {
    return {
      kind: "books",
      franchiseId: route.franchiseId,
      section: (route.section === "episodes"
        ? "overview"
        : route.section) as import("./booksRoute").BooksSection,
      overviewTab: route.overviewTab as
        | import("./booksRoute").BooksOverviewTab
        | undefined,
      universeId: route.universeId,
    };
  }
  if (module === "games") {
    return {
      kind: "games",
      franchiseId: route.franchiseId,
      section: (route.section === "episodes"
        ? "overview"
        : route.section) as import("./gamesRoute").GamesSection,
      overviewTab: route.overviewTab as
        | import("./gamesRoute").GamesOverviewTab
        | undefined,
      universeId: route.universeId,
    };
  }
  return {
    kind: "series",
    franchiseId: route.franchiseId,
    section: route.section,
    overviewTab: route.overviewTab,
    universeId: route.universeId,
  };
}

export type ResolvedPath = {
  view: View;
  /** Canonical URL replace after resolve (legacy → slug). */
  canonicalPath?: string;
};

export async function resolvePathToView(
  pathname: string,
  search = ""
): Promise<ResolvedPath | null> {
  const userPlaylistId = parseUserPlaylistPath(pathname);
  if (userPlaylistId != null) {
    return {
      view: { kind: "music", tab: "playlists", playlistId: userPlaylistId },
    };
  }
  if (parsePlaylistsGridPath(pathname)) {
    return { view: { kind: "music", tab: "playlists" } };
  }

  const legacyFranchise = parseLegacyFranchiseHubPath(pathname, search);
  if (legacyFranchise) {
    const module = await resolveFranchiseHomeModule(legacyFranchise.franchiseId);
    const { franchisePath } = await import("./franchiseRoute");
    return {
      view: franchiseRouteToView(legacyFranchise, module),
      canonicalPath: franchisePath(legacyFranchise),
    };
  }

  const franchiseRoute = parseFranchisePath(pathname, search);
  if (franchiseRoute) {
    const ref = getFranchiseHomeReferrer();
    const refMatches =
      ref &&
      slugMatch(String(ref.franchiseId || ""), franchiseRoute.franchiseId);
    // Games → series (or movies/books) artwork home: stay on the home module
    // so About/Cast/Links match SeriesStack. GAMES tab order comes from the
    // homeReferrer on SeriesFranchisePage, not from loading GamesModule.
    const module =
      refMatches && ref!.source === "games"
        ? ref!.home === "games"
          ? ("games" as FranchiseHomeModule)
          : ref!.home === "movies" ||
              ref!.home === "books" ||
              ref!.home === "series"
            ? ref!.home
            : await resolveFranchiseHomeModule(franchiseRoute.franchiseId)
        : refMatches && (ref!.source === "movies" || ref!.source === "books")
          ? ref!.source
          : await resolveFranchiseHomeModule(franchiseRoute.franchiseId);
    return { view: franchiseRouteToView(franchiseRoute, module) };
  }

  const universeParsed = parseUniversePath(pathname);
  if (universeParsed) {
    const universeRoute = await resolveUniverseRoute(universeParsed);
    if (!universeRoute) return null;
    const { universePath } = await import("./universeRoute");
    return {
      view: {
        kind: "universe",
        universeId: universeRoute.universeId!,
        section: universeRoute.section,
        overviewTab: universeRoute.overviewTab,
      },
      canonicalPath:
        universeRoute.universeName && !universeParsed.universeId
          ? universePath(universeRoute)
          : undefined,
    };
  }

  const seriesParsed = parseSeriesPath(pathname, search);
  if (seriesParsed) {
    if (seriesParsed.franchiseOnly) {
      const { franchisePath } = await import("./franchiseRoute");
      const fr: FranchiseRoute = {
        franchiseId: seriesParsed.franchiseId,
        section: seriesParsed.section,
        overviewTab: seriesParsed.overviewTab,
        universeId: seriesParsed.universeId,
        franchiseName: seriesParsed.franchiseName,
      };
      const module = await resolveFranchiseHomeModule(fr.franchiseId);
      return {
        view: franchiseRouteToView(fr, module),
        canonicalPath: franchisePath(fr),
      };
    }
    const seriesRoute = await resolveSeriesRoute(seriesParsed);
    const { seriesPath } = await import("./seriesRoute");
    return {
      view: {
        kind: "series",
        franchiseId: seriesRoute.franchiseId,
        subseriesId: seriesRoute.subseriesId,
        seasonId: seriesRoute.seasonId,
        section: seriesRoute.section,
        overviewTab: seriesRoute.overviewTab,
        universeId: seriesRoute.universeId,
      },
      canonicalPath: seriesPath(seriesRoute),
    };
  }

  if (
    pathname.match(/^\/series\/?$/) ||
    pathname.match(/^\/series\/catalog\/?$/)
  ) {
    return { view: { kind: "series" } };
  }

  const moviesParsed = parseMoviesPath(pathname, search);
  if (moviesParsed) {
    if (moviesParsed.franchiseOnly) {
      const { franchisePath } = await import("./franchiseRoute");
      const fr: FranchiseRoute = {
        franchiseId: moviesParsed.franchiseId,
        section: moviesParsed.section as FranchiseRoute["section"],
        overviewTab: moviesParsed.overviewTab as FranchiseRoute["overviewTab"],
        universeId: moviesParsed.universeId,
        franchiseName: moviesParsed.franchiseName,
      };
      const module = await resolveFranchiseHomeModule(fr.franchiseId);
      return {
        view: franchiseRouteToView(fr, module),
        canonicalPath: franchisePath(fr),
      };
    }
    const moviesRoute = await resolveMoviesRoute(moviesParsed);
    const { moviesPath } = await import("./moviesRoute");
    return {
      view: {
        kind: "movies",
        franchiseId: moviesRoute.franchiseId,
        filmId: moviesRoute.filmId,
        section: moviesRoute.section,
        overviewTab: moviesRoute.overviewTab,
        universeId: moviesRoute.universeId,
      },
      canonicalPath: moviesPath(moviesRoute),
    };
  }

  if (
    pathname.match(/^\/movies\/?$/) ||
    pathname.match(/^\/movies\/catalog\/?$/)
  ) {
    return { view: { kind: "movies" } };
  }

  const booksParsed = parseBooksPath(pathname, search);
  if (booksParsed) {
    if (booksParsed.franchiseOnly) {
      const { franchisePath } = await import("./franchiseRoute");
      const fr: FranchiseRoute = {
        franchiseId: booksParsed.franchiseId,
        section: booksParsed.section as FranchiseRoute["section"],
        overviewTab: booksParsed.overviewTab as FranchiseRoute["overviewTab"],
        universeId: booksParsed.universeId,
        franchiseName: booksParsed.franchiseName,
      };
      const module = await resolveFranchiseHomeModule(fr.franchiseId);
      return {
        view: franchiseRouteToView(fr, module),
        canonicalPath: franchisePath(fr),
      };
    }
    const booksRoute = await resolveBooksRoute(booksParsed);
    const { booksPath } = await import("./booksRoute");
    return {
      view: {
        kind: "books",
        franchiseId: booksRoute.franchiseId,
        bookId: booksRoute.bookId,
        section: booksRoute.section,
        overviewTab: booksRoute.overviewTab,
        universeId: booksRoute.universeId,
      },
      canonicalPath: booksPath(booksRoute),
    };
  }

  if (
    pathname.match(/^\/books\/?$/) ||
    pathname.match(/^\/books\/catalog\/?$/)
  ) {
    return { view: { kind: "books" } };
  }

  const gamesParsed = parseGamesPath(pathname, search);
  if (gamesParsed) {
    if (gamesParsed.franchiseOnly) {
      const { franchisePath } = await import("./franchiseRoute");
      const fr: FranchiseRoute = {
        franchiseId: gamesParsed.franchiseId,
        section: gamesParsed.section as FranchiseRoute["section"],
        overviewTab: gamesParsed.overviewTab as FranchiseRoute["overviewTab"],
        universeId: gamesParsed.universeId,
        franchiseName: gamesParsed.franchiseName,
      };
      return {
        view: {
          kind: "games",
          franchiseId: gamesParsed.franchiseId,
          section: gamesParsed.section,
          overviewTab: gamesParsed.overviewTab,
          universeId: gamesParsed.universeId,
        },
        canonicalPath: franchisePath(fr),
      };
    }
    const { gamesPath } = await import("./gamesRoute");
    return {
      view: {
        kind: "games",
        franchiseId: gamesParsed.franchiseId,
        gameId: gamesParsed.gameId,
        section: gamesParsed.section,
        overviewTab: gamesParsed.overviewTab,
        universeId: gamesParsed.universeId,
      },
      canonicalPath: gamesPath({
        ...gamesParsed,
        franchiseName: gamesParsed.franchiseName,
      }),
    };
  }

  if (
    pathname.match(/^\/games\/?$/) ||
    pathname.match(/^\/games\/catalog\/?$/)
  ) {
    return { view: { kind: "games" } };
  }

  if (pathname.match(/^\/photos\/?$/)) {
    return { view: { kind: "photos" } };
  }

  {
    const { parseFilesRootPath, parseFilesTabPath } = await import(
      "./filesRoute"
    );
    if (parseFilesRootPath(pathname)) {
      return { view: { kind: "files" } };
    }
    const filesTab = parseFilesTabPath(pathname);
    if (filesTab != null) {
      return { view: { kind: "files", tabId: filesTab } };
    }
  }

  {
    const {
      parseHobbiesCollectionPath,
      parseHobbiesRootPath,
      parseHobbiesThemesPath,
    } = await import("./hobbiesRoute");
    if (parseHobbiesThemesPath(pathname)) {
      return { view: { kind: "hobbies", tab: "themes" } };
    }
    if (parseHobbiesRootPath(pathname)) {
      return { view: { kind: "hobbies", tab: "home" } };
    }
    const hobbyId = parseHobbiesCollectionPath(pathname);
    if (hobbyId != null) {
      return { view: { kind: "hobbies", collectionId: hobbyId } };
    }
  }

  const artistParsed = parseArtistPath(pathname);
  if (artistParsed) {
    const artistRoute = await resolveArtistRouteDeep(artistParsed);
    if (!artistRoute?.bandId) return null;
    const { artistPath } = await import("./musicRoute");
    return {
      view: {
        kind: "music",
        tab: "artists",
        bandId: artistRoute.bandId,
        artistSection: artistRoute.section,
        artistOverviewTab: artistRoute.overviewTab,
        releaseId: artistRoute.releaseId,
        releaseTab: artistRoute.releaseTab,
        mediaItemId: artistRoute.mediaItemId,
        tourSlug: artistRoute.tourSlug,
        showSlug: artistRoute.showSlug,
        showTab: artistRoute.showTab,
        playlistSlug: artistRoute.playlistSlug,
      },
      canonicalPath: artistPath(artistRoute),
    };
  }

  return null;
}

function syncFranchiseModule(pathname: string): FranchiseHomeModule {
  if (pathname.startsWith("/movies")) return "movies";
  if (pathname.startsWith("/books")) return "books";
  if (pathname.startsWith("/games")) return "games";
  // Shared /franchise/… — games entry keeps GAMES tab order via referrer, but
  // content loads from artwork home (usually series), same as Movies→Series.
  if (pathname.startsWith("/franchise")) {
    const ref = getFranchiseHomeReferrer();
    if (ref?.source === "games") {
      if (ref.home === "games") return "games";
      if (
        ref.home === "series" ||
        ref.home === "movies" ||
        ref.home === "books"
      ) {
        return ref.home;
      }
      return "series";
    }
    if (ref?.source === "movies") return "movies";
    if (ref?.source === "books") return "books";
  }
  return "series";
}

/** Parse URL → View without network (used for first paint + boot gate). */
export function parsePathToViewSync(pathname: string, search = ""): View | null {
  const userPlaylistId = parseUserPlaylistPath(pathname);
  if (userPlaylistId != null) {
    return { kind: "music", tab: "playlists", playlistId: userPlaylistId };
  }
  if (parsePlaylistsGridPath(pathname)) {
    return { kind: "music", tab: "playlists" };
  }

  const legacyFranchise = parseLegacyFranchiseHubPath(pathname, search);
  if (legacyFranchise) {
    return franchiseRouteToView(legacyFranchise, syncFranchiseModule(pathname));
  }

  const franchiseRoute = parseFranchisePath(pathname, search);
  if (franchiseRoute) {
    return franchiseRouteToView(franchiseRoute, syncFranchiseModule(pathname));
  }

  const universeParsed = parseUniversePath(pathname);
  if (universeParsed) {
    return {
      kind: "universe",
      universeId: universeParsed.universeId ?? 0,
      section: universeParsed.section,
      overviewTab: universeParsed.overviewTab,
    };
  }

  const seriesParsed = parseSeriesPath(pathname, search);
  if (seriesParsed) {
    if (seriesParsed.franchiseOnly) {
      const fr: FranchiseRoute = {
        franchiseId: seriesParsed.franchiseId,
        section: seriesParsed.section,
        overviewTab: seriesParsed.overviewTab,
        universeId: seriesParsed.universeId,
        franchiseName: seriesParsed.franchiseName,
      };
      return franchiseRouteToView(fr, "series");
    }
    return {
      kind: "series",
      franchiseId: seriesParsed.franchiseId,
      subseriesId: seriesParsed.subseriesId
        ? leafIdFromSlug(
            "series",
            seriesParsed.franchiseId,
            seriesParsed.subseriesId
          ) ?? seriesParsed.subseriesId
        : undefined,
      seasonId: seriesParsed.seasonId,
      section: seriesParsed.section,
      overviewTab: seriesParsed.overviewTab,
      universeId: seriesParsed.universeId,
    };
  }

  if (pathname.match(/^\/series\/?$/) || pathname.match(/^\/series\/catalog\/?$/)) {
    return { kind: "series" };
  }

  const moviesParsed = parseMoviesPath(pathname, search);
  if (moviesParsed) {
    if (moviesParsed.franchiseOnly) {
      const fr: FranchiseRoute = {
        franchiseId: moviesParsed.franchiseId,
        section: moviesParsed.section as FranchiseRoute["section"],
        overviewTab: moviesParsed.overviewTab as FranchiseRoute["overviewTab"],
        universeId: moviesParsed.universeId,
        franchiseName: moviesParsed.franchiseName,
      };
      return franchiseRouteToView(fr, "movies");
    }
    return {
      kind: "movies",
      franchiseId: moviesParsed.franchiseId,
      filmId: moviesParsed.filmId
        ? isFilmId(moviesParsed.filmId)
          ? moviesParsed.filmId
          : leafIdFromSlug(
              "movies",
              moviesParsed.franchiseId,
              moviesParsed.filmId
            ) ?? moviesParsed.filmId
        : undefined,
      section: moviesParsed.section,
      overviewTab: moviesParsed.overviewTab,
      universeId: moviesParsed.universeId,
    };
  }

  if (pathname.match(/^\/movies\/?$/) || pathname.match(/^\/movies\/catalog\/?$/)) {
    return { kind: "movies" };
  }

  const booksParsed = parseBooksPath(pathname, search);
  if (booksParsed) {
    if (booksParsed.franchiseOnly) {
      const fr: FranchiseRoute = {
        franchiseId: booksParsed.franchiseId,
        section: booksParsed.section as FranchiseRoute["section"],
        overviewTab: booksParsed.overviewTab as FranchiseRoute["overviewTab"],
        universeId: booksParsed.universeId,
        franchiseName: booksParsed.franchiseName,
      };
      return franchiseRouteToView(fr, "books");
    }
    return {
      kind: "books",
      franchiseId: booksParsed.franchiseId,
      bookId: booksParsed.bookId
        ? isBookId(booksParsed.bookId)
          ? booksParsed.bookId
          : leafIdFromSlug(
              "books",
              booksParsed.franchiseId,
              booksParsed.bookId
            ) ?? booksParsed.bookId
        : undefined,
      section: booksParsed.section,
      overviewTab: booksParsed.overviewTab,
      universeId: booksParsed.universeId,
    };
  }

  if (pathname.match(/^\/books\/?$/) || pathname.match(/^\/books\/catalog\/?$/)) {
    return { kind: "books" };
  }

  const gamesParsed = parseGamesPath(pathname, search);
  if (gamesParsed) {
    return {
      kind: "games",
      franchiseId: gamesParsed.franchiseId,
      gameId: gamesParsed.gameId,
      section: gamesParsed.section,
      overviewTab: gamesParsed.overviewTab,
      universeId: gamesParsed.universeId,
    };
  }

  if (pathname.match(/^\/games\/?$/) || pathname.match(/^\/games\/catalog\/?$/)) {
    return { kind: "games" };
  }

  if (pathname.match(/^\/photos\/?$/)) {
    return { kind: "photos" };
  }

  {
    if (pathname === "/files" || pathname === "/files/") {
      return { kind: "files" };
    }
    const filesMatch = pathname.match(/^\/files\/([^/]+)\/?$/i);
    if (filesMatch) {
      try {
        return { kind: "files", tabId: decodeURIComponent(filesMatch[1]) };
      } catch {
        return { kind: "files", tabId: filesMatch[1] };
      }
    }
  }

  {
    // Sync path parse — dynamic import not available; inline match
    if (pathname === "/hobbies/themes" || pathname === "/hobbies/themes/") {
      return { kind: "hobbies", tab: "themes" };
    }
    if (pathname === "/hobbies" || pathname === "/hobbies/") {
      return { kind: "hobbies", tab: "home" };
    }
    const hobbyMatch = pathname.match(/^\/hobbies\/(\d+)\/?$/i);
    if (hobbyMatch) {
      const collectionId = Number(hobbyMatch[1]);
      if (Number.isFinite(collectionId)) {
        return { kind: "hobbies", collectionId };
      }
    }
  }

  const artistParsed = parseArtistPath(pathname);
  if (artistParsed) {
    let bandId = artistParsed.bandId;
    if (bandId == null && artistParsed.artistSlug) {
      bandId = bandIdFromArtistSlug(artistParsed.artistSlug) ?? undefined;
    }
    let releaseId = artistParsed.releaseId;
    if (releaseId && bandId != null && !isReleaseId(releaseId)) {
      releaseId = releaseIdFromSlug(bandId, releaseId) ?? releaseId;
    }
    return {
      kind: "music",
      tab: "artists",
      bandId,
      artistSection: artistParsed.section,
      artistOverviewTab: artistParsed.overviewTab,
      releaseId,
      releaseTab: artistParsed.releaseTab,
      mediaItemId: artistParsed.mediaItemId,
      tourSlug: artistParsed.tourSlug,
      showSlug: artistParsed.showSlug,
      showTab: artistParsed.showTab,
      playlistSlug: artistParsed.playlistSlug,
    };
  }

  if (pathname.match(/^\/music\/?$/)) {
    return { kind: "music", tab: "home" };
  }

  return null;
}
