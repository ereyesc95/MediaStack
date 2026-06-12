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

import { toStackName } from "./mediaStack";
import {
  applyProfilePreferences,
  getStoredOrientation,
  saveOrientation,
} from "./themes";
import { parseArtistPath } from "./musicRoute";
import type { CardOrientation, MusicTab, View } from "./types";



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
      });
    }
    init();
  }, []);

  useEffect(() => {
    function onPopState() {
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
              }
        );
      } else if (window.location.pathname === "/" || window.location.pathname === "") {
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
    setView({ kind: "hub" });
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



  const toggleOrientation = () => {

    const next = cardOrientation === "landscape" ? "portrait" : "landscape";

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
      setView({ kind: "music", tab: "home" });
      return;
    }

    if (opt.kind === "series") setView({ kind: "series" });

    else if (opt.kind === "movies") setView({ kind: "movies" });

    else if (opt.kind === "books") setView({ kind: "books" });

    else if (opt.kind === "games") setView({ kind: "games" });

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
          <p className="app-boot__label">Loading MediaStack…</p>
        </div>
      )}

      {showProfilePicker && (
        <ProfilePickerModal
          onSelected={handleProfileSelected}
          highlightUserId={highlightProfileId}
        />
      )}

      {editProfileOpen && profile && !isAdmin && (
        <ProfileEditModal
          profile={profile}
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

            playlistId={view.playlistId}

            genreFilterId={view.genreFilterId}

            countryFilterId={view.countryFilterId}

            countryFilterName={view.countryFilterName}

            cardOrientation={cardOrientation}

            mediaOptions={MEDIA_OPTIONS}

            busy={busy}

            onImport={handleImport}

            onSync={handleSync}

            onToggleOrientation={toggleOrientation}

            onTab={(tab: MusicTab) => openMusic({ tab, bandId: undefined, playlistId: undefined })}

            onBand={(id) =>
              openMusic(
                id !== undefined
                  ? {
                      bandId: id,
                      tab: "artists",
                      artistSection: "overview",
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
                ...(patchBandId !== undefined ? { bandId: patchBandId } : {}),
              })
            }

            onPlaylist={(id) => openMusic({ playlistId: id, tab: "playlists" })}

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

          />

        )}



        {appReady && view.kind !== "hub" && view.kind !== "music" && (

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

