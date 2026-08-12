import { useCallback, useEffect, useState } from "react";

import {
  fetchAppSettings,
  fetchSession,
  importSql,
  logoutProfile,
  syncFolders,
} from "./api";
import {
  clearProfile,
  getProfileToken,
  getStoredProfile,
  saveProfile,
  type ProfileUser,
} from "./auth";

import AppMenu from "./components/AppMenu";
import HubBrand from "./components/HubBrand";
import MediaSourceModal from "./components/MediaSourceModal";
import ProfileEditModal from "./components/ProfileEditModal";
import ProfilePickerModal from "./components/ProfilePickerModal";

import HubPage from "./components/HubPage";

import type { MediaOption } from "./components/ModuleTopBar";

import MusicModule from "./components/music/MusicModule";
import MoviesModule from "./components/movies/MoviesModule";
import BooksModule from "./components/books/BooksModule";
import SeriesModule from "./components/series/SeriesModule";

import { toStackName } from "./mediaStack";
import {
  applyProfilePreferences,
  getStoredOrientation,
  saveOrientation,
} from "./themes";
import { parseArtistPath, parsePlaylistsGridPath, parseUserPlaylistPath, pushArtistRoute, pushPlaylistsGridRoute, saveReleaseReferrer } from "./musicRoute";
import {
  parseMoviesCatalogPath,
  parseMoviesPath,
  parseMoviesRootPath,
  pushMoviesCatalogRoute,
  pushMoviesRootRoute,
  pushMoviesRoute,
} from "./moviesRoute";
import {
  parseBooksCatalogPath,
  parseBooksPath,
  parseBooksRootPath,
  pushBooksCatalogRoute,
  pushBooksRootRoute,
  pushBooksRoute,
} from "./booksRoute";
import {
  parseSeriesCatalogPath,
  parseSeriesPath,
  parseSeriesRootPath,
  pushSeriesCatalogRoute,
  pushSeriesRootRoute,
  pushSeriesRoute,
} from "./seriesRoute";
import {
  parseUniversePath,
  pushUniverseRoute,
} from "./universeRoute";
import {
  getMediaEntrySource,
  getUniverseReturnTarget,
  setMediaEntrySource,
  setPendingCatalogBrowse,
  setUniverseReturnTarget,
} from "./mediaEntry";
import { clearMediaTheme } from "./mediaTheme";
import type { CardOrientation, MusicTab, View } from "./types";
import UniversePage from "./components/UniversePage";



const MEDIA_OPTIONS: MediaOption[] = [

  { id: 200, kind: "music", label: "Music" },

  { id: 400, kind: "series", label: "Series" },

  { id: 300, kind: "movies", label: "Movies" },

  { id: 500, kind: "books", label: "Books" },

  { id: 600, kind: "games", label: "Games" },

];



export default function App() {

  const [view, setView] = useState<View>({ kind: "hub" });

  const [cardOrientation, setCardOrientation] =
    useState<CardOrientation>("landscape");

  const [busy, setBusy] = useState("");

  const [error, setError] = useState<string | null>(null);

  const [mediaRootConfigured, setMediaRootConfigured] = useState<boolean | null>(
    null
  );

  const [sourceModal, setSourceModal] = useState<"welcome" | "settings" | null>(
    null
  );

  const [profile, setProfile] = useState<ProfileUser | null | undefined>(
    undefined
  );

  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [highlightProfileId, setHighlightProfileId] = useState<number | null>(
    null
  );

  useEffect(() => {
    async function init() {
      const token = getProfileToken();
      if (token) {
        try {
          const session = await fetchSession();
          if (session.user) {
            applyProfilePreferences(session.user.user_id);
            setCardOrientation(getStoredOrientation(session.user.user_id));
            setProfile(session.user);
            if (session.token) {
              saveProfile(session.user, session.token);
            }
          } else {
            clearProfile();
            setProfile(null);
          }
        } catch {
          clearProfile();
          setProfile(null);
        }
      } else {
        const stored = getStoredProfile();
        if (stored) {
          clearProfile();
        }
        setProfile(null);
      }

      try {
        const s = await fetchAppSettings();
        setMediaRootConfigured(s.media_root_configured);
        if (!s.media_root_chosen) {
          setSourceModal("welcome");
        }
      } catch {
        setMediaRootConfigured(false);
        setSourceModal("welcome");
      }
    }
    const userPlaylistId = parseUserPlaylistPath(window.location.pathname);
    if (userPlaylistId != null) {
      setView({
        kind: "music",
        tab: "playlists",
        playlistId: userPlaylistId,
      });
    } else if (parsePlaylistsGridPath(window.location.pathname)) {
      setView({
        kind: "music",
        tab: "playlists",
      });
    } else {
      const universeRoute = parseUniversePath(window.location.pathname);
      const seriesRoute = parseSeriesPath(
        window.location.pathname,
        window.location.search
      );
      const moviesRoute = parseMoviesPath(
        window.location.pathname,
        window.location.search
      );
      const booksRoute = parseBooksPath(
        window.location.pathname,
        window.location.search
      );
      if (universeRoute) {
        setView({
          kind: "universe",
          universeId: universeRoute.universeId,
          section: universeRoute.section,
          overviewTab: universeRoute.overviewTab,
        });
      } else if (seriesRoute) {
        setView({
          kind: "series",
          franchiseId: seriesRoute.franchiseId,
          subseriesId: seriesRoute.subseriesId,
          seasonId: seriesRoute.seasonId,
          section: seriesRoute.section,
          overviewTab: seriesRoute.overviewTab,
          universeId: seriesRoute.universeId,
        });
      } else if (
        parseSeriesCatalogPath(window.location.pathname) ||
        parseSeriesRootPath(window.location.pathname)
      ) {
        setView({ kind: "series" });
      } else if (moviesRoute) {
        setView({
          kind: "movies",
          franchiseId: moviesRoute.franchiseId,
          filmId: moviesRoute.filmId,
          section: moviesRoute.section,
          overviewTab: moviesRoute.overviewTab,
          universeId: moviesRoute.universeId,
        });
      } else if (
        parseMoviesCatalogPath(window.location.pathname) ||
        parseMoviesRootPath(window.location.pathname)
      ) {
        setView({ kind: "movies" });
      } else if (booksRoute) {
        setView({
          kind: "books",
          franchiseId: booksRoute.franchiseId,
          bookId: booksRoute.bookId,
          section: booksRoute.section,
          overviewTab: booksRoute.overviewTab,
          universeId: booksRoute.universeId,
        });
      } else if (
        parseBooksCatalogPath(window.location.pathname) ||
        parseBooksRootPath(window.location.pathname)
      ) {
        setView({ kind: "books" });
      } else {
        const route = parseArtistPath(window.location.pathname);
        if (route) {
          setView({
            kind: "music",
            tab: "artists",
            bandId: route.bandId,
            artistSection: route.section,
            artistOverviewTab: route.overviewTab,
            releaseId: route.releaseId,
            releaseTab: route.releaseTab,
            mediaItemId: route.mediaItemId,
            playlistSlug: route.playlistSlug,
          });
        }
      }
    }
    init();
  }, []);

  useEffect(() => {
    function onPopState() {
      const userPlaylistId = parseUserPlaylistPath(window.location.pathname);
      if (userPlaylistId != null) {
        setView({
          kind: "music",
          tab: "playlists",
          playlistId: userPlaylistId,
          bandId: undefined,
          playlistSlug: undefined,
        });
        return;
      }
      if (parsePlaylistsGridPath(window.location.pathname)) {
        setView((v) =>
          v.kind === "music"
            ? {
                ...v,
                tab: "playlists",
                playlistId: undefined,
                bandId: undefined,
                playlistSlug: undefined,
              }
            : { kind: "music", tab: "playlists" }
        );
        return;
      }
      const route = parseArtistPath(window.location.pathname);
      if (route) {
        setView((v) =>
          v.kind === "music"
            ? {
                ...v,
                tab: "artists",
                bandId: route.bandId,
                artistSection: route.section,
                artistOverviewTab: route.overviewTab,
                releaseId: route.releaseId,
                releaseTab: route.releaseTab,
                mediaItemId: route.mediaItemId,
                playlistSlug: route.playlistSlug,
              }
            : {
                kind: "music",
                tab: "artists",
                bandId: route.bandId,
                artistSection: route.section,
                artistOverviewTab: route.overviewTab,
                releaseId: route.releaseId,
                releaseTab: route.releaseTab,
                mediaItemId: route.mediaItemId,
                playlistSlug: route.playlistSlug,
              }
        );
        return;
      }
      const universeRoute = parseUniversePath(window.location.pathname);
      if (universeRoute) {
        setView({
          kind: "universe",
          universeId: universeRoute.universeId,
          section: universeRoute.section,
          overviewTab: universeRoute.overviewTab,
        });
        return;
      }
      const seriesRoute = parseSeriesPath(
        window.location.pathname,
        window.location.search
      );
      if (seriesRoute) {
        setView({
          kind: "series",
          franchiseId: seriesRoute.franchiseId,
          subseriesId: seriesRoute.subseriesId,
          seasonId: seriesRoute.seasonId,
          section: seriesRoute.section,
          overviewTab: seriesRoute.overviewTab,
          universeId: seriesRoute.universeId,
        });
        return;
      }
      if (parseSeriesCatalogPath(window.location.pathname)) {
        setView({ kind: "series" });
        return;
      }
      if (parseSeriesRootPath(window.location.pathname)) {
        setView({ kind: "series" });
        return;
      }
      const moviesRoute = parseMoviesPath(
        window.location.pathname,
        window.location.search
      );
      if (moviesRoute) {
        setView({
          kind: "movies",
          franchiseId: moviesRoute.franchiseId,
          filmId: moviesRoute.filmId,
          section: moviesRoute.section,
          overviewTab: moviesRoute.overviewTab,
          universeId: moviesRoute.universeId,
        });
        return;
      }
      if (
        parseMoviesCatalogPath(window.location.pathname) ||
        parseMoviesRootPath(window.location.pathname)
      ) {
        setView({ kind: "movies" });
        return;
      }
      const booksRoute = parseBooksPath(
        window.location.pathname,
        window.location.search
      );
      if (booksRoute) {
        setView({
          kind: "books",
          franchiseId: booksRoute.franchiseId,
          bookId: booksRoute.bookId,
          section: booksRoute.section,
          overviewTab: booksRoute.overviewTab,
          universeId: booksRoute.universeId,
        });
        return;
      }
      if (
        parseBooksCatalogPath(window.location.pathname) ||
        parseBooksRootPath(window.location.pathname)
      ) {
        setView({ kind: "books" });
        return;
      }
      if (window.location.pathname === "/" || window.location.pathname === "") {
        setView({ kind: "hub" });
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function handleProfileSelected(user: ProfileUser, token: string) {
    applyProfilePreferences(user.user_id);
    setCardOrientation(getStoredOrientation(user.user_id));
    saveProfile(user, token);
    setProfile(user);
    setHighlightProfileId(null);
    if (parsePlaylistsGridPath(window.location.pathname)) {
      setView({ kind: "music", tab: "playlists" });
    } else if (parseUserPlaylistPath(window.location.pathname) != null) {
      setView({
        kind: "music",
        tab: "playlists",
        playlistId: parseUserPlaylistPath(window.location.pathname) ?? undefined,
      });
    } else {
      setView({ kind: "hub" });
    }
  }

  function handleProfileUpdated(user: ProfileUser) {
    const token = getProfileToken();
    if (token) {
      saveProfile(user, token);
    }
    setProfile(user);
  }

  async function handleSwitchProfile() {
    if (profile?.user_id) {
      setHighlightProfileId(profile.user_id);
    }
    try {
      await logoutProfile();
    } catch {
      /* ignore */
    }
    clearProfile();
    setProfile(null);
    setSourceModal(null);
    setView({ kind: "hub" });
    window.history.replaceState(null, "", "/");
  }

  function handleSourceChosen(path: string) {
    setMediaRootConfigured(true);
    setSourceModal(null);
    setError(null);
    if (path) setBusy("");
  }



  const setOrientation = (next: CardOrientation) => {
    setCardOrientation(next);
    if (profile?.user_id) {
      saveOrientation(profile.user_id, next);
    }
  };



  async function handleImport() {

    setBusy("Importing…");

    setError(null);

    try {

      await importSql(false);

      setBusy("Import done");

    } catch (e) {

      setError(e instanceof Error ? e.message : String(e));

      setBusy("");

    }

  }



  async function handleSync() {

    setBusy("Syncing…");

    try {

      await syncFolders("all");

      setBusy("Sync done");

    } catch (e) {

      setError(e instanceof Error ? e.message : String(e));

      setBusy("");

    }

  }



  const openMusic = useCallback((patch: Partial<Extract<View, { kind: "music" }>>) => {

    setView((v) =>

      v.kind === "music"

        ? { ...v, ...patch }

        : { kind: "music", tab: "home", ...patch }

    );

  }, []);



  function selectMedia(opt: MediaOption) {

    if (opt.kind === "music") {
      window.history.pushState({}, "", "/");
      setView({ kind: "music", tab: "home" });
      return;
    }

    if (opt.kind === "series") {
      pushSeriesRootRoute();
      setView({ kind: "series" });
      return;
    }

    if (opt.kind === "movies") {
      pushMoviesRootRoute();
      setView({ kind: "movies" });
      return;
    }

    if (opt.kind === "books") {
      pushBooksRootRoute();
      setView({ kind: "books" });
      return;
    }

    if (opt.kind === "games") setView({ kind: "games" });
  }

  function openUniversePage(
    universeId: number,
    fromModule: "series" | "movies" | "books",
    from: "home" | "catalog" = "catalog",
    universeName?: string
  ) {
    setMediaEntrySource(from);
    setUniverseReturnTarget({
      module: fromModule,
      source: from,
      universeId,
      universeName,
    });
    pushUniverseRoute({
      universeId,
      section: "overview",
      overviewTab: "about",
    });
    setView({
      kind: "universe",
      universeId,
      section: "overview",
      overviewTab: "about",
    });
  }

  function backFromUniverse() {
    const ret = getUniverseReturnTarget();
    const from = getMediaEntrySource() || ret.source;
    clearMediaTheme(profile?.user_id);
    if (ret.module === "movies") {
      if (from === "home") pushMoviesRootRoute();
      else pushMoviesCatalogRoute();
      setView({ kind: "movies" });
      return;
    }
    if (ret.module === "books") {
      if (from === "home") pushBooksRootRoute();
      else pushBooksCatalogRoute();
      setView({ kind: "books" });
      return;
    }
    if (from === "home") pushSeriesRootRoute();
    else pushSeriesCatalogRoute();
    setView({ kind: "series" });
  }



  const isMusic = view.kind === "music";

  const musicTab = isMusic ? (view.tab ?? "home") : undefined;



  const isAdmin = profile?.is_admin === true;
  const profileReady = profile != null && profile !== undefined;
  const showProfilePicker = profile === null;

  const hubMenu = (
    <AppMenu
      onImport={handleImport}
      onSync={handleSync}
      onChooseSource={isAdmin ? () => setSourceModal("settings") : undefined}
      isAdmin={isAdmin}
      userId={profile?.user_id}
      onSwitchProfile={handleSwitchProfile}
      onEditProfile={
        profile && !isAdmin ? () => setEditProfileOpen(true) : undefined
      }
    />
  );

  const appReady = profileReady && mediaRootConfigured === true;
  const booting =
    profile === undefined ||
    (profileReady && mediaRootConfigured === null);
  const showSourceModal =
    profileReady &&
    (sourceModal === "settings" ||
      (sourceModal === "welcome" && !mediaRootConfigured));

  return (

    <div className={`app ${view.kind === "hub" ? "app--hub" : "app--module-view"}`}>

      {booting && (
        <div className="app-boot" role="status" aria-live="polite">
          <p className="app-boot__label">Loading MyStack…</p>
        </div>
      )}

      {showProfilePicker && (
        <ProfilePickerModal
          onSelected={handleProfileSelected}
          highlightUserId={highlightProfileId}
        />
      )}

      {editProfileOpen && profile && (
        <ProfileEditModal
          profile={profile}
          lockName={Boolean(isAdmin)}
          onClose={() => setEditProfileOpen(false)}
          onSaved={(user) => {
            handleProfileUpdated(user);
            setEditProfileOpen(false);
          }}
        />
      )}

      {showSourceModal && (
        <MediaSourceModal
          required={sourceModal !== "settings"}
          canConfigure={isAdmin}
          onDone={handleSourceChosen}
          onClose={
            sourceModal === "settings"
              ? () => setSourceModal(null)
              : undefined
          }
          onSwitchProfile={handleSwitchProfile}
        />
      )}

      {appReady && view.kind === "hub" && (

        <header className="header header--hub">

          <HubBrand />

          <span className="spacer" />

          {busy && <span className="status-bar">{busy}</span>}

          {hubMenu}

        </header>

      )}



      <main className={`main ${view.kind === "hub" ? "main--hub" : "main--module"}`}>

        {appReady && error && <div className="error">{error}</div>}



        {appReady && view.kind === "hub" && (

          <HubPage

            onSelect={(id) => {

              const opt = MEDIA_OPTIONS.find((m) => m.id === id);

              if (opt) selectMedia(opt);

            }}

          />

        )}



        {appReady && view.kind === "music" && (

          <MusicModule
            key={profile.user_id}
            tab={musicTab ?? "home"}

            bandId={view.bandId}

            artistSection={view.artistSection}

            artistOverviewTab={view.artistOverviewTab}

            releaseId={view.releaseId}

            releaseTab={view.releaseTab}

            mediaItemId={view.mediaItemId}

            playlistSlug={view.playlistSlug}

            playlistId={view.playlistId}

            genreFilterId={view.genreFilterId}

            countryFilterId={view.countryFilterId}

            countryFilterName={view.countryFilterName}

            cardOrientation={cardOrientation}

            mediaOptions={MEDIA_OPTIONS}

            busy={busy}

            onImport={handleImport}

            onSync={handleSync}

            onSetOrientation={setOrientation}

            onTab={(tab: MusicTab) => {
              if (tab === "playlists") {
                pushPlaylistsGridRoute();
              }
              openMusic({ tab, bandId: undefined, playlistId: undefined });
            }}

            onBand={(id, artistSection = "overview") =>
              openMusic(
                id !== undefined
                  ? {
                      bandId: id,
                      tab: "artists",
                      artistSection,
                      artistOverviewTab: "about",
                      releaseId: undefined,
                      releaseTab: undefined,
                    }
                  : {
                      bandId: undefined,
                      tab: "artists",
                      artistSection: undefined,
                      artistOverviewTab: undefined,
                      releaseId: undefined,
                      releaseTab: undefined,
                    }
              )
            }

            onArtistNavigate={(section, overviewTab) =>
              openMusic({
                artistSection: section,
                artistOverviewTab: overviewTab,
                releaseId: undefined,
                releaseTab: undefined,
                mediaItemId: undefined,
                playlistSlug: undefined,
              })
            }

            onPlaylistNavigate={(slug) =>
              openMusic({
                artistSection: "audio",
                playlistSlug: slug,
                releaseId: undefined,
                releaseTab: undefined,
                mediaItemId: undefined,
              })
            }

            onMediaItemNavigate={(itemId, section) =>
              openMusic({
                mediaItemId: itemId,
                artistSection: section ?? view.artistSection ?? "video",
                tab: "artists",
                releaseId: undefined,
                releaseTab: undefined,
              })
            }

            onReleaseNavigate={(releaseId, releaseTab, patchBandId) =>
              openMusic({
                releaseId,
                releaseTab: releaseTab ?? "overview",
                artistSection: "audio",
                tab: "artists",
                playlistSlug: undefined,
                mediaItemId: undefined,
                ...(patchBandId !== undefined ? { bandId: patchBandId } : {}),
              })
            }

            onPlaylist={(id) => {
              if (id != null) {
                window.history.pushState(null, "", `/music/playlists/${id}`);
              } else if (window.location.pathname.startsWith("/music/playlists/")) {
                window.history.pushState(null, "", "/");
              }
              openMusic({ playlistId: id, tab: "playlists", bandId: undefined });
            }}

            onGenreFilter={(id) =>
              openMusic(
                id !== undefined
                  ? {
                      genreFilterId: id,
                      countryFilterId: undefined,
                      countryFilterName: undefined,
                      tab: "artists",
                      bandId: undefined,
                      playlistId: undefined,
                    }
                  : { genreFilterId: undefined }
              )
            }

            onCountryFilter={(id, name) =>
              openMusic(
                id != null || name
                  ? {
                      countryFilterId: id ?? undefined,
                      countryFilterName: id == null ? name : undefined,
                      genreFilterId: undefined,
                      tab: "artists",
                      bandId: undefined,
                      playlistId: undefined,
                    }
                  : {
                      countryFilterId: undefined,
                      countryFilterName: undefined,
                    }
              )
            }

            onSelectMedia={selectMedia}

            onChooseSource={isAdmin ? () => setSourceModal("settings") : undefined}
            isAdmin={isAdmin}
            userId={profile?.user_id}
            onSwitchProfile={handleSwitchProfile}
            onEditProfile={
              profile && !isAdmin ? () => setEditProfileOpen(true) : undefined
            }
            onBackToSeries={(franchiseId, subseriesId) => {
              // Empty franchiseId → Series catalog (artist opened from a music-linked card).
              if (!franchiseId) {
                pushSeriesCatalogRoute();
                setView({
                  kind: "series",
                  franchiseId: undefined,
                  subseriesId: undefined,
                  section: "overview",
                  overviewTab: "about",
                });
                return;
              }
              pushSeriesRoute({
                franchiseId,
                subseriesId,
                section: "overview",
                overviewTab: "about",
              });
              setView({
                kind: "series",
                franchiseId,
                subseriesId,
                section: "overview",
                overviewTab: "about",
              });
            }}
            onBackToMovies={(franchiseId) => {
              if (!franchiseId) {
                pushMoviesCatalogRoute();
                setView({
                  kind: "movies",
                  franchiseId: undefined,
                  filmId: undefined,
                  section: "overview",
                  overviewTab: "about",
                });
                return;
              }
              pushMoviesRoute({
                franchiseId,
                section: "audio",
                overviewTab: "about",
              });
              setView({
                kind: "movies",
                franchiseId,
                section: "audio",
                overviewTab: "about",
              });
            }}
            onBackToBooks={(franchiseId) => {
              if (!franchiseId) {
                pushBooksCatalogRoute();
                setView({
                  kind: "books",
                  franchiseId: undefined,
                  bookId: undefined,
                  section: "overview",
                  overviewTab: "about",
                });
                return;
              }
              pushBooksRoute({
                franchiseId,
                section: "overview",
                overviewTab: "about",
              });
              setView({
                kind: "books",
                franchiseId,
                section: "overview",
                overviewTab: "about",
              });
            }}

          />

        )}



        {appReady && view.kind === "universe" && (
          <UniversePage
            key={`universe-${profile.user_id}-${view.universeId}`}
            universeId={view.universeId}
            section={view.section}
            overviewTab={view.overviewTab}
            busy={busy}
            isAdmin={isAdmin}
            userId={profile?.user_id}
            onImport={handleImport}
            onSync={handleSync}
            onChooseSource={
              isAdmin ? () => setSourceModal("settings") : undefined
            }
            onSwitchProfile={handleSwitchProfile}
            onEditProfile={
              profile && !isAdmin ? () => setEditProfileOpen(true) : undefined
            }
            onBack={backFromUniverse}
            backLabel={
              (getMediaEntrySource() || getUniverseReturnTarget().source) ===
              "home"
                ? "HOME"
                : "CATALOG"
            }
            onNavigate={(patch) =>
              setView({
                kind: "universe",
                universeId: view.universeId,
                section: patch.section ?? view.section,
                overviewTab: patch.overviewTab ?? view.overviewTab,
              })
            }
            onOpenSeriesLeaf={(franchiseId, subseriesId) => {
              pushSeriesRoute({
                franchiseId,
                subseriesId,
                section: "overview",
                overviewTab: "about",
                universeId: view.universeId,
              });
              setView({
                kind: "series",
                franchiseId,
                subseriesId,
                section: "overview",
                overviewTab: "about",
                universeId: view.universeId,
              });
            }}
            onOpenMoviesLeaf={(franchiseId, filmId) => {
              pushMoviesRoute({
                franchiseId,
                filmId,
                section: "overview",
                overviewTab: "about",
                universeId: view.universeId,
              });
              setView({
                kind: "movies",
                franchiseId,
                filmId,
                section: "overview",
                overviewTab: "about",
                universeId: view.universeId,
              });
            }}
            onOpenBooksLeaf={(franchiseId, bookId) => {
              pushBooksRoute({
                franchiseId,
                bookId,
                section: "overview",
                overviewTab: "about",
                universeId: view.universeId,
              });
              setView({
                kind: "books",
                franchiseId,
                bookId,
                section: "overview",
                overviewTab: "about",
                universeId: view.universeId,
              });
            }}
            onOpenSeriesFranchise={(franchiseId) => {
              pushSeriesRoute({
                franchiseId,
                section: "overview",
                overviewTab: "about",
                universeId: view.universeId,
              });
              setView({
                kind: "series",
                franchiseId,
                section: "overview",
                overviewTab: "about",
                universeId: view.universeId,
              });
            }}
            onOpenMoviesFranchise={(franchiseId) => {
              pushMoviesRoute({
                franchiseId,
                section: "overview",
                overviewTab: "about",
                universeId: view.universeId,
              });
              setView({
                kind: "movies",
                franchiseId,
                section: "overview",
                overviewTab: "about",
                universeId: view.universeId,
              });
            }}
            onOpenBooksFranchise={(franchiseId) => {
              pushBooksRoute({
                franchiseId,
                section: "overview",
                overviewTab: "about",
                universeId: view.universeId,
              });
              setView({
                kind: "books",
                franchiseId,
                section: "overview",
                overviewTab: "about",
                universeId: view.universeId,
              });
            }}
            onBrowseCatalog={(target) => {
              const module =
                getUniverseReturnTarget().module === "movies"
                  ? "movies"
                  : "series";
              clearMediaTheme(profile?.user_id);
              setMediaEntrySource("catalog");
              setPendingCatalogBrowse({ module, ...target });
              if (module === "movies") {
                pushMoviesCatalogRoute();
                setView({ kind: "movies" });
              } else {
                pushSeriesCatalogRoute();
                setView({ kind: "series" });
              }
            }}
          />
        )}

        {appReady && view.kind === "series" && (
          <SeriesModule
            key={`series-${profile.user_id}`}
            mediaOptions={MEDIA_OPTIONS}
            busy={busy}
            onImport={handleImport}
            onSync={handleSync}
            onSelectMedia={selectMedia}
            onChooseSource={isAdmin ? () => setSourceModal("settings") : undefined}
            isAdmin={isAdmin}
            userId={profile?.user_id}
            onSwitchProfile={handleSwitchProfile}
            onEditProfile={
              profile && !isAdmin ? () => setEditProfileOpen(true) : undefined
            }
            franchiseId={view.franchiseId}
            subseriesId={view.subseriesId}
            seasonId={view.seasonId}
            section={view.section}
            overviewTab={view.overviewTab}
            universeId={view.universeId}
            cardOrientation={cardOrientation}
            onSetOrientation={setOrientation}
            onNavigate={(patch) =>
              setView({
                kind: "series",
                franchiseId:
                  "franchiseId" in patch ? patch.franchiseId : view.franchiseId,
                subseriesId:
                  "subseriesId" in patch ? patch.subseriesId : view.subseriesId,
                seasonId: "seasonId" in patch ? patch.seasonId : view.seasonId,
                section: patch.section ?? view.section,
                overviewTab:
                  "overviewTab" in patch
                    ? patch.overviewTab
                    : view.overviewTab,
                universeId:
                  "universeId" in patch ? patch.universeId : view.universeId,
              })
            }
            onOpenMusicRelease={(bandId, releaseId, seriesCtx) => {
              if (seriesCtx?.franchiseId) {
                saveReleaseReferrer({
                  bandId,
                  section: "audio",
                  source: "series",
                  franchiseId: seriesCtx.franchiseId,
                  subseriesId: seriesCtx.subseriesId,
                  franchiseName: seriesCtx.franchiseName,
                  franchiseIconUrl: seriesCtx.franchiseIconUrl,
                });
              }
              pushArtistRoute({
                bandId,
                section: "audio",
                overviewTab: "about",
                releaseId,
                releaseTab: "overview",
              });
              setView({
                kind: "music",
                tab: "artists",
                bandId,
                artistSection: "audio",
                artistOverviewTab: "about",
                releaseId,
                releaseTab: "overview",
              });
            }}
            onOpenArtist={(bandId, artistSection = "overview") => {
              pushArtistRoute({
                bandId,
                section: artistSection,
                overviewTab: "about",
              });
              setView({
                kind: "music",
                tab: "artists",
                bandId,
                artistSection,
                artistOverviewTab: "about",
              });
            }}
            onOpenMoviesFranchise={(franchiseId, filmId, section, universeId) => {
              const isLanding = universeId != null;
              const nextSection = (section as
                | "overview"
                | "movies"
                | "series"
                | "audio"
                | "library"
                | "games"
                | "gallery") || "overview";
              pushMoviesRoute({
                franchiseId,
                filmId,
                section: nextSection,
                overviewTab: isLanding ? "related" : "about",
                universeId,
              });
              setView({
                kind: "movies",
                franchiseId,
                filmId,
                section: nextSection,
                overviewTab: isLanding ? "related" : "about",
                universeId,
              });
            }}
            onOpenBooksFranchise={(franchiseId, bookId, section, universeId) => {
              const isLanding = universeId != null;
              const nextSection = (section as
                | "overview"
                | "movies"
                | "series"
                | "audio"
                | "library"
                | "games"
                | "gallery") || "overview";
              pushBooksRoute({
                franchiseId,
                bookId,
                section: nextSection,
                overviewTab: isLanding ? "related" : "about",
                universeId,
              });
              setView({
                kind: "books",
                franchiseId,
                bookId,
                section: nextSection,
                overviewTab: isLanding ? "related" : "about",
                universeId,
              });
            }}
            onOpenUniversePage={(id, from, name) =>
              openUniversePage(id, "series", from, name)
            }
          />
        )}

        {appReady && view.kind === "movies" && (
          <MoviesModule
            key={`movies-${profile.user_id}`}
            mediaOptions={MEDIA_OPTIONS}
            busy={busy}
            onImport={handleImport}
            onSync={handleSync}
            onSelectMedia={selectMedia}
            onChooseSource={isAdmin ? () => setSourceModal("settings") : undefined}
            isAdmin={isAdmin}
            userId={profile?.user_id}
            onSwitchProfile={handleSwitchProfile}
            onEditProfile={
              profile && !isAdmin ? () => setEditProfileOpen(true) : undefined
            }
            franchiseId={view.franchiseId}
            filmId={view.filmId}
            section={view.section}
            overviewTab={view.overviewTab}
            universeId={view.universeId}
            cardOrientation={cardOrientation}
            onSetOrientation={setOrientation}
            onNavigate={(patch) =>
              setView({
                kind: "movies",
                franchiseId:
                  "franchiseId" in patch ? patch.franchiseId : view.franchiseId,
                filmId: "filmId" in patch ? patch.filmId : view.filmId,
                section: patch.section ?? view.section,
                overviewTab:
                  "overviewTab" in patch
                    ? patch.overviewTab
                    : view.overviewTab,
                universeId:
                  "universeId" in patch ? patch.universeId : view.universeId,
              })
            }
            onOpenSeriesFranchise={(franchiseId, subseriesId, universeId) => {
              const isLanding = universeId != null;
              pushSeriesRoute({
                franchiseId,
                subseriesId,
                section: "overview",
                overviewTab: isLanding ? "related" : "about",
                universeId,
              });
              setView({
                kind: "series",
                franchiseId,
                subseriesId,
                section: "overview",
                overviewTab: isLanding ? "related" : "about",
                universeId,
              });
            }}
            onOpenBooksFranchise={(franchiseId, bookId, section, universeId) => {
              const isLanding = universeId != null;
              const nextSection = (section as
                | "overview"
                | "movies"
                | "series"
                | "audio"
                | "library"
                | "games"
                | "gallery") || "overview";
              pushBooksRoute({
                franchiseId,
                bookId,
                section: nextSection,
                overviewTab: isLanding ? "related" : "about",
                universeId,
              });
              setView({
                kind: "books",
                franchiseId,
                bookId,
                section: nextSection,
                overviewTab: isLanding ? "related" : "about",
                universeId,
              });
            }}
            onOpenMusicRelease={(bandId, releaseId) => {
              if (view.franchiseId) {
                saveReleaseReferrer({
                  bandId,
                  section: "audio",
                  source: "movies",
                  franchiseId: view.franchiseId,
                });
              }
              pushArtistRoute({
                bandId,
                section: "audio",
                overviewTab: "about",
                releaseId,
                releaseTab: "overview",
              });
              setView({
                kind: "music",
                tab: "artists",
                bandId,
                artistSection: "audio",
                artistOverviewTab: "about",
                releaseId,
                releaseTab: "overview",
              });
            }}
            onOpenUniversePage={(id, from, name) =>
              openUniversePage(id, "movies", from, name)
            }
            onOpenArtist={(bandId, artistSection = "overview") => {
              pushArtistRoute({
                bandId,
                section: artistSection,
                overviewTab: "about",
              });
              setView({
                kind: "music",
                tab: "artists",
                bandId,
                artistSection,
                artistOverviewTab: "about",
              });
            }}
          />
        )}

        {appReady && view.kind === "books" && (
          <BooksModule
            key={`books-${profile.user_id}`}
            mediaOptions={MEDIA_OPTIONS}
            busy={busy}
            onImport={handleImport}
            onSync={handleSync}
            onSelectMedia={selectMedia}
            onChooseSource={isAdmin ? () => setSourceModal("settings") : undefined}
            isAdmin={isAdmin}
            userId={profile?.user_id}
            onSwitchProfile={handleSwitchProfile}
            onEditProfile={
              profile && !isAdmin ? () => setEditProfileOpen(true) : undefined
            }
            franchiseId={view.franchiseId}
            bookId={view.bookId}
            section={view.section}
            overviewTab={view.overviewTab}
            universeId={view.universeId}
            cardOrientation={cardOrientation}
            onSetOrientation={setOrientation}
            onNavigate={(patch) =>
              setView({
                kind: "books",
                franchiseId:
                  "franchiseId" in patch ? patch.franchiseId : view.franchiseId,
                bookId: "bookId" in patch ? patch.bookId : view.bookId,
                section: patch.section ?? view.section,
                overviewTab:
                  "overviewTab" in patch
                    ? patch.overviewTab
                    : view.overviewTab,
                universeId:
                  "universeId" in patch ? patch.universeId : view.universeId,
              })
            }
            onOpenSeriesFranchise={(franchiseId, subseriesId, universeId) => {
              const isLanding = universeId != null;
              pushSeriesRoute({
                franchiseId,
                subseriesId,
                section: "overview",
                overviewTab: isLanding ? "related" : "about",
                universeId,
              });
              setView({
                kind: "series",
                franchiseId,
                subseriesId,
                section: "overview",
                overviewTab: isLanding ? "related" : "about",
                universeId,
              });
            }}
            onOpenMoviesFranchise={(franchiseId, filmId, section, universeId) => {
              const isLanding = universeId != null;
              const nextSection = (section as
                | "overview"
                | "movies"
                | "series"
                | "audio"
                | "library"
                | "games"
                | "gallery") || "overview";
              pushMoviesRoute({
                franchiseId,
                filmId,
                section: nextSection,
                overviewTab: isLanding ? "related" : "about",
                universeId,
              });
              setView({
                kind: "movies",
                franchiseId,
                filmId,
                section: nextSection,
                overviewTab: isLanding ? "related" : "about",
                universeId,
              });
            }}
            onOpenUniversePage={(id, from, name) =>
              openUniversePage(id, "books", from, name)
            }
            onOpenArtist={(bandId, artistSection = "overview") => {
              pushArtistRoute({
                bandId,
                section: artistSection,
                overviewTab: "about",
              });
              setView({
                kind: "music",
                tab: "artists",
                bandId,
                artistSection,
                artistOverviewTab: "about",
              });
            }}
          />
        )}

        {appReady &&
          view.kind !== "hub" &&
          view.kind !== "music" &&
          view.kind !== "series" &&
          view.kind !== "movies" &&
          view.kind !== "books" &&
          view.kind !== "universe" && (

          <>

            <header className="header header--minimal">

              <span className="header-title">
                {toStackName(
                  MEDIA_OPTIONS.find((m) => m.kind === view.kind)?.label ??
                    view.kind.charAt(0).toUpperCase() + view.kind.slice(1)
                )}
              </span>

              <span className="spacer" />

              {busy && <span className="status-bar">{busy}</span>}

              {hubMenu}

            </header>

            <p className="muted module-placeholder">

              {view.kind} module UI coming next — same pattern as Music.

            </p>

          </>

        )}

      </main>

    </div>

  );

}

