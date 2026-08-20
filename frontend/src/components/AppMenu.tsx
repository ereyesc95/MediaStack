import { useEffect, useRef, useState, type ReactNode } from "react";
import { applySavedArtistTheme, pinArtistPageTheme, notifyUserThemePickDuringPlayback, notifyUserThemePickWhilePaused, isPlaybackSessionActive, isPlaybackPlaying, getMenuActiveTheme } from "../mediaTheme";
import {
  THEMES,
  applyTheme,
  getCustomColors,
  persistThemeChoice,
  saveCustomColors,
  type CustomThemeColors,
  type ThemeId,
} from "../themes";
import { useMediaSwitch, type MediaSwitchKind } from "../mediaSwitchContext";
import {
  IconAbout,
  IconAddArtist,
  IconCamera,
  IconCards,
  IconCheck,
  IconSquare,
  IconEditProfile,
  IconEditRelease,
  IconFileTags,
  IconFolder,
  IconLineup,
  IconLinks,
  IconLyrics,
  IconMetadata,
  IconDownload,
  IconPlus,
  IconSettings,
  IconSwitchProfile,
  IconSync,
  IconTheme,
  IconTrackData,
  IconTrash,
  IconUniverse,
  IconVideo,
  IconMediaMusic,
  IconMediaSeries,
  IconMediaMovies,
  IconMediaBooks,
  IconMediaGames,
} from "./MenuIcons";

const MEDIA_SWITCH_OPTIONS: {
  kind: MediaSwitchKind;
  label: string;
  Icon: typeof IconMediaMusic;
}[] = [
  { kind: "music", label: "Music", Icon: IconMediaMusic },
  { kind: "series", label: "Series", Icon: IconMediaSeries },
  { kind: "movies", label: "Movies", Icon: IconMediaMovies },
  { kind: "books", label: "Books", Icon: IconMediaBooks },
  { kind: "games", label: "Games", Icon: IconMediaGames },
];

type Props = {
  onImport?: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onAddArtist?: () => void;
  showAddArtist?: boolean;
  onAddPlaylist?: () => void;
  showAddPlaylist?: boolean;
  showEditPlaylist?: boolean;
  editPlaylistActive?: boolean;
  onEditPlaylistToggle?: () => void;
  showDeletePlaylist?: boolean;
  onDeletePlaylist?: () => void;
  showReimportCsv?: boolean;
  onReimportCsv?: () => void;
  isAdmin?: boolean;
  userId?: number;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onRefreshMetadata?: () => void;
  onFetchLyrics?: () => void;
  onSetLyrics?: () => void;
  onFetchVideos?: () => void;
  onSetVideo?: () => void;
  onWriteFileTags?: () => void;
  onRefreshTracklist?: () => void;
  menuVariant?: "artist" | "release" | "media-item";
  /** Override label for Update movie/series under Edit Data (leaf pages). */
  editDataLabel?: string;
  /**
   * Leaf movie/subseries menu: Refresh data + Edit Data parents
   * (instead of flat edit / cast / refresh-local buttons).
   */
  editDataFlat?: boolean;
  /** @deprecated Duplicate of Local files under Refresh data — ignored. */
  refreshLocalFlat?: boolean;
  onAddToUniverse?: () => void;
  /** Label for onAddToUniverse (default: Add to Universe). */
  addToUniverseLabel?: string;
  onRescanLibrary?: () => void;
  onRefreshLineup?: () => void;
  onRefreshPhotos?: () => void;
  onRefreshLinks?: () => void;
  onEditAbout?: () => void;
  onAddMember?: () => void;
  onAddLink?: () => void;
  onAddSimilar?: () => void;
  addSimilarLabel?: string;
  onRefreshRelatedSimilar?: () => void;
  onRefreshRelatedParticipations?: () => void;
  refreshIncludeBio?: boolean;
  onRefreshIncludeBioChange?: (v: boolean) => void;
  refreshIncludeLabel?: string;
  /** Show "Adaptive" in the theme menu (image-sampled colors). */
  adaptiveThemeActive?: boolean;
  /** @deprecated Use adaptiveThemeActive */
  artistThemeActive?: boolean;
  /** Extra controls rendered at the top of the dropdown (e.g. mobile chrome). */
  menuChrome?: ReactNode;
};

const CUSTOM_FIELDS: { key: keyof CustomThemeColors; label: string }[] = [
  { key: "bg", label: "Background" },
  { key: "bgElevated", label: "Panels" },
  { key: "bgHover", label: "Hover" },
  { key: "border", label: "Border" },
  { key: "text", label: "Text" },
  { key: "textMuted", label: "Muted text" },
  { key: "accent", label: "Accent" },
];

export default function AppMenu({
  onSync,
  onChooseSource,
  onAddArtist,
  showAddArtist,
  onAddPlaylist,
  showAddPlaylist,
  showEditPlaylist,
  editPlaylistActive,
  onEditPlaylistToggle,
  showDeletePlaylist,
  onDeletePlaylist,
  showReimportCsv,
  onReimportCsv,
  isAdmin = false,
  userId,
  onSwitchProfile,
  onEditProfile,
  onRefreshMetadata,
  onFetchLyrics,
  onSetLyrics,
  onFetchVideos,
  onSetVideo,
  onWriteFileTags,
  onRefreshTracklist,
  menuVariant = "artist",
  editDataLabel,
  editDataFlat = false,
  refreshLocalFlat: _refreshLocalFlat = false,
  onAddToUniverse,
  addToUniverseLabel = "Add to Universe",
  onRescanLibrary,
  onRefreshLineup,
  onRefreshPhotos,
  onRefreshLinks,
  onEditAbout,
  onAddMember,
  onAddLink,
  onAddSimilar,
  addSimilarLabel = "Add similar artist",
  onRefreshRelatedSimilar,
  onRefreshRelatedParticipations,
  refreshIncludeBio = false,
  onRefreshIncludeBioChange,
  refreshIncludeLabel = "Include bio",
  adaptiveThemeActive,
  artistThemeActive = false,
  menuChrome,
}: Props) {
  void _refreshLocalFlat;
  const showAdaptiveTheme =
    adaptiveThemeActive ?? artistThemeActive;
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [artistDataOpen, setArtistDataOpen] = useState(false);
  const [editDataOpen, setEditDataOpen] = useState(false);
  const [trackDataOpen, setTrackDataOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [mediaSwitchOpen, setMediaSwitchOpen] = useState(false);
  const mediaSwitch = useMediaSwitch();
  const showSwitchMedia = Boolean(mediaSwitch?.showSwitchMedia);
  const [customOpen, setCustomOpen] = useState(false);
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => getMenuActiveTheme(userId));
  const [custom, setCustom] = useState<CustomThemeColors>(() => getCustomColors(userId));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustom(getCustomColors(userId));
    setActiveTheme(getMenuActiveTheme(userId));
  }, [userId]);

  useEffect(() => {
    const sync = () => setActiveTheme(getMenuActiveTheme(userId));
    window.addEventListener("theme-changed", sync);
    window.addEventListener("artist-theme-updated", sync);
    window.addEventListener("playback-cover-applied", sync);
    return () => {
      window.removeEventListener("theme-changed", sync);
      window.removeEventListener("artist-theme-updated", sync);
      window.removeEventListener("playback-cover-applied", sync);
    };
  }, [userId]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSettingsOpen(false);
        setArtistDataOpen(false);
        setEditDataOpen(false);
        setTrackDataOpen(false);
        setThemeOpen(false);
        setMediaSwitchOpen(false);
        setCustomOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function pickTheme(id: ThemeId) {
    pinArtistPageTheme(id);
    if (isPlaybackSessionActive() && isPlaybackPlaying()) {
      if (notifyUserThemePickDuringPlayback(id, userId)) {
        setActiveTheme(id);
        if (id === "custom") setCustomOpen(true);
        return;
      }
    }
    if (isPlaybackSessionActive() && !isPlaybackPlaying()) {
      notifyUserThemePickWhilePaused(id, userId);
    }
    if (id === "custom") {
      setCustomOpen(true);
      applyTheme("custom", userId);
      setActiveTheme("custom");
      return;
    }
    if (id === "artist") {
      setCustomOpen(false);
      // Persist Adaptive so a refresh keeps the choice (not Custom/Dark).
      persistThemeChoice("artist", userId);
      applySavedArtistTheme(userId);
      document.documentElement.setAttribute("data-theme", "artist");
      setActiveTheme("artist");
      window.dispatchEvent(new CustomEvent("theme-changed"));
      return;
    }
    setCustomOpen(false);
    applyTheme(id, userId);
    setActiveTheme(id);
  }

  function updateCustom(key: keyof CustomThemeColors, value: string) {
    const next = { ...custom, [key]: value };
    setCustom(next);
    saveCustomColors(next, userId);
    if (isPlaybackSessionActive() && isPlaybackPlaying()) {
      notifyUserThemePickDuringPlayback("custom", userId);
      setActiveTheme("custom");
      return;
    }
    applyTheme("custom", userId);
    setActiveTheme("custom");
  }

  function toggleTrackData() {
    setTrackDataOpen((o) => {
      const next = !o;
      if (next) {
        setArtistDataOpen(false);
        setEditDataOpen(false);
        setThemeOpen(false);
        setSettingsOpen(false);
      }
      return next;
    });
  }

  function toggleArtistData() {
    setArtistDataOpen((o) => {
      const next = !o;
      if (next) {
        setEditDataOpen(false);
        setTrackDataOpen(false);
        setThemeOpen(false);
        setSettingsOpen(false);
      }
      return next;
    });
  }

  function toggleEditData() {
    setEditDataOpen((o) => {
      const next = !o;
      if (next) {
        setArtistDataOpen(false);
        setTrackDataOpen(false);
        setThemeOpen(false);
        setSettingsOpen(false);
      }
      return next;
    });
  }

  function toggleTheme() {
    setThemeOpen((o) => {
      const next = !o;
      if (next) {
        setArtistDataOpen(false);
        setEditDataOpen(false);
        setSettingsOpen(false);
      }
      return next;
    });
  }

  function toggleSettings() {
    setSettingsOpen((o) => {
      const next = !o;
      if (next) {
        setArtistDataOpen(false);
        setEditDataOpen(false);
        setThemeOpen(false);
      }
      return next;
    });
  }

  const showTrackDataMenu =
    menuVariant === "release" &&
    (onRefreshTracklist ||
      (isAdmin &&
        (onFetchLyrics ||
          onSetLyrics ||
          onFetchVideos ||
          onSetVideo ||
          onWriteFileTags)));

  const showRefreshData =
    menuVariant !== "media-item" &&
    ((!editDataFlat && onEditAbout) ||
      (menuVariant === "release" && !editDataFlat && onAddMember) ||
      onRefreshMetadata ||
      onRescanLibrary ||
      onRefreshLineup ||
      onRefreshPhotos ||
      onRefreshLinks ||
      onRefreshRelatedSimilar ||
      onRefreshRelatedParticipations ||
      onRefreshIncludeBioChange ||
      (editDataFlat && onEditAbout));

  const showEditDataGroup =
    editDataFlat &&
    isAdmin &&
    (onAddToUniverse || onEditAbout || onAddMember || onAddLink || onAddSimilar);

  const refreshMenuLabel = editDataFlat
    ? "Refresh data"
    : menuVariant === "release"
      ? editDataLabel || "Edit Release"
      : "Refresh data";
  const RefreshMenuIcon =
    editDataFlat || menuVariant !== "release" ? IconMetadata : IconEditRelease;
  const aboutLabel = menuVariant === "release" ? "About" : "Edit about";
  const AboutIcon = menuVariant === "release" ? IconAbout : IconEditProfile;
  const updateLeafLabel = editDataLabel || "Update series";

  const refreshDataBlock =
    isAdmin && showRefreshData ? (
      <>
        <button
          type="button"
          className="menu-item-with-sub"
          onClick={toggleArtistData}
        >
          <RefreshMenuIcon className="menu-item-icon" />
          {refreshMenuLabel}
          <span className="menu-chevron">
            {artistDataOpen ? "▴" : "▾"}
          </span>
        </button>
        {artistDataOpen && (
          <div className="app-menu-submenu">
            {onEditAbout && !editDataFlat && (
              <button
                type="button"
                onClick={() => {
                  onEditAbout();
                  setOpen(false);
                }}
              >
                <AboutIcon className="menu-item-icon" />
                {aboutLabel}
              </button>
            )}
            {menuVariant === "release" &&
              isAdmin &&
              onAddMember &&
              !editDataFlat && (
                <button
                  type="button"
                  onClick={() => {
                    onAddMember();
                    setOpen(false);
                  }}
                >
                  <IconLineup className="menu-item-icon" />
                  Staff
                </button>
              )}
            {onRefreshMetadata && (
              <button
                type="button"
                onClick={() => {
                  onRefreshMetadata();
                  setOpen(false);
                }}
              >
                <IconDownload className="menu-item-icon" />
                Metadata
              </button>
            )}
            {onRefreshIncludeBioChange && (
              <label className="app-menu-checkbox app-menu-checkbox--sub">
                <input
                  type="checkbox"
                  checked={refreshIncludeBio}
                  onChange={(e) =>
                    onRefreshIncludeBioChange(e.target.checked)
                  }
                />
                {refreshIncludeLabel}
              </label>
            )}
            {onRescanLibrary && (
              <button
                type="button"
                onClick={() => {
                  onRescanLibrary();
                  setOpen(false);
                }}
              >
                <IconFolder className="menu-item-icon" />
                Local files
              </button>
            )}
            {onRefreshLineup && (
              <button
                type="button"
                onClick={() => {
                  onRefreshLineup();
                  setOpen(false);
                }}
              >
                <IconLineup className="menu-item-icon" />
                Lineup
              </button>
            )}
            {onRefreshPhotos && (
              <button
                type="button"
                onClick={() => {
                  onRefreshPhotos();
                  setOpen(false);
                }}
              >
                <IconCamera className="menu-item-icon" />
                Photos
              </button>
            )}
            {onRefreshLinks && (
              <button
                type="button"
                onClick={() => {
                  onRefreshLinks();
                  setOpen(false);
                }}
              >
                <IconLinks className="menu-item-icon" />
                Links
              </button>
            )}
            {onRefreshRelatedSimilar && (
              <button
                type="button"
                onClick={() => {
                  onRefreshRelatedSimilar();
                  setOpen(false);
                }}
              >
                <IconCards className="menu-item-icon" />
                Similar
              </button>
            )}
            {onRefreshRelatedParticipations && (
              <button
                type="button"
                onClick={() => {
                  onRefreshRelatedParticipations();
                  setOpen(false);
                }}
              >
                <IconLineup className="menu-item-icon" />
                Participations
              </button>
            )}
          </div>
        )}
      </>
    ) : null;

  const editDataBlock = showEditDataGroup ? (
    <>
      <button
        type="button"
        className="menu-item-with-sub"
        onClick={toggleEditData}
      >
        <IconEditRelease className="menu-item-icon" />
        Edit data
        <span className="menu-chevron">{editDataOpen ? "▴" : "▾"}</span>
      </button>
      {editDataOpen && (
        <div className="app-menu-submenu">
          {onAddToUniverse && (
            <button
              type="button"
              onClick={() => {
                onAddToUniverse();
                setOpen(false);
              }}
            >
              <IconUniverse className="menu-item-icon" />
              {addToUniverseLabel}
            </button>
          )}
          {onEditAbout && (
            <button
              type="button"
              onClick={() => {
                onEditAbout();
                setOpen(false);
              }}
            >
              <IconEditProfile className="menu-item-icon" />
              {updateLeafLabel}
            </button>
          )}
          {onAddMember && (
            <button
              type="button"
              onClick={() => {
                onAddMember();
                setOpen(false);
              }}
            >
              <IconAddArtist className="menu-item-icon" />
              Update cast
            </button>
          )}
          {onAddLink && (
            <button
              type="button"
              onClick={() => {
                onAddLink();
                setOpen(false);
              }}
            >
              <IconLinks className="menu-item-icon" />
              Add link
            </button>
          )}
          {onAddSimilar && (
            <button
              type="button"
              onClick={() => {
                onAddSimilar();
                setOpen(false);
              }}
            >
              <IconAddArtist className="menu-item-icon" />
              {addSimilarLabel}
            </button>
          )}
        </div>
      )}
    </>
  ) : null;

  return (
    <div className="app-menu" ref={ref}>
      <button
        type="button"
        className="app-menu-trigger"
        aria-label="Menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span />
        <span />
        <span />
      </button>
      {open && (
        <div className="app-menu-dropdown">
          {editDataFlat ? (
            <>
              {refreshDataBlock}
              {editDataBlock}
            </>
          ) : null}
          {menuChrome ? (
            <div
              className="app-menu-chrome"
              onClick={() => setOpen(false)}
            >
              {menuChrome}
            </div>
          ) : null}
          {!editDataFlat && isAdmin && onAddMember && menuVariant !== "release" && (
            <button
              type="button"
              onClick={() => {
                onAddMember();
                setOpen(false);
              }}
            >
              <IconAddArtist className="menu-item-icon" />
              Edit cast
            </button>
          )}
          {!editDataFlat && isAdmin && onAddLink && (
            <button
              type="button"
              onClick={() => {
                onAddLink();
                setOpen(false);
              }}
            >
              <IconLinks className="menu-item-icon" />
              Add link
            </button>
          )}
          {!editDataFlat && isAdmin && onAddSimilar && (
            <button
              type="button"
              onClick={() => {
                onAddSimilar();
                setOpen(false);
              }}
            >
              <IconAddArtist className="menu-item-icon" />
              {addSimilarLabel}
            </button>
          )}
          {menuVariant === "media-item" && onRefreshTracklist && (
            <button
              type="button"
              onClick={() => {
                onRefreshTracklist();
                setOpen(false);
              }}
            >
              <IconSync className="menu-item-icon" />
              Refresh list
            </button>
          )}
          {menuVariant === "media-item" && isAdmin && onEditAbout && (
            <button
              type="button"
              onClick={() => {
                onEditAbout();
                setOpen(false);
              }}
            >
              <IconEditRelease className="menu-item-icon" />
              {editDataLabel || "Edit Release"}
            </button>
          )}
          {showTrackDataMenu && (
            <>
              <button
                type="button"
                className="menu-item-with-sub"
                onClick={toggleTrackData}
              >
                <IconTrackData className="menu-item-icon" />
                Track data
                <span className="menu-chevron">{trackDataOpen ? "▴" : "▾"}</span>
              </button>
              {trackDataOpen && (
                <div className="app-menu-submenu">
                  {onFetchLyrics && (
                    <button
                      type="button"
                      onClick={() => {
                        onFetchLyrics();
                        setOpen(false);
                      }}
                    >
                      <IconLyrics className="menu-item-icon" />
                      Fetch lyrics
                    </button>
                  )}
                  {onSetLyrics && (
                    <button
                      type="button"
                      onClick={() => {
                        onSetLyrics();
                        setOpen(false);
                      }}
                    >
                      <IconLyrics className="menu-item-icon" />
                      Set lyrics
                    </button>
                  )}
                  {onFetchVideos && (
                    <button
                      type="button"
                      onClick={() => {
                        onFetchVideos();
                        setOpen(false);
                      }}
                    >
                      <IconVideo className="menu-item-icon" />
                      Fetch videos
                    </button>
                  )}
                  {onSetVideo && (
                    <button
                      type="button"
                      onClick={() => {
                        onSetVideo();
                        setOpen(false);
                      }}
                    >
                      <IconVideo className="menu-item-icon" />
                      Set videos
                    </button>
                  )}
                  {onRefreshTracklist && (
                    <button
                      type="button"
                      onClick={() => {
                        onRefreshTracklist();
                        setOpen(false);
                      }}
                    >
                      <IconSync className="menu-item-icon" />
                      Refresh tracklist
                    </button>
                  )}
                  {onWriteFileTags && (
                    <button
                      type="button"
                      onClick={() => {
                        onWriteFileTags();
                        setOpen(false);
                      }}
                    >
                      <IconFileTags className="menu-item-icon" />
                      Write file tags
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {menuVariant === "artist" && isAdmin && onFetchLyrics && (
            <button
              type="button"
              onClick={() => {
                onFetchLyrics();
                setOpen(false);
              }}
            >
              <IconLyrics className="menu-item-icon" />
              Fetch lyrics
            </button>
          )}
          {!editDataFlat ? refreshDataBlock : null}
          {isAdmin && showAddArtist && onAddArtist && (
            <button
              type="button"
              onClick={() => {
                onAddArtist();
                setOpen(false);
              }}
            >
              <IconAddArtist className="menu-item-icon" />
              Add artist
            </button>
          )}
          {showAddPlaylist && onAddPlaylist && (
            <button
              type="button"
              onClick={() => {
                onAddPlaylist();
                setOpen(false);
              }}
            >
              <IconPlus className="menu-item-icon" />
              Add playlist
            </button>
          )}
          {showEditPlaylist && onEditPlaylistToggle && (
            <button
              type="button"
              className={editPlaylistActive ? "active" : ""}
              onClick={() => {
                onEditPlaylistToggle();
              }}
            >
              {editPlaylistActive ? (
                <IconCheck className="menu-item-icon" />
              ) : (
                <IconSquare className="menu-item-icon" />
              )}
              <span>Edit playlist</span>
            </button>
          )}
          {showReimportCsv && onReimportCsv && (
            <button
              type="button"
              onClick={() => {
                onReimportCsv();
                setOpen(false);
              }}
            >
              <IconSync className="menu-item-icon" />
              <span>Refresh Playlist</span>
            </button>
          )}
          {showDeletePlaylist && onDeletePlaylist && (
            <button
              type="button"
              onClick={() => {
                onDeletePlaylist();
                setOpen(false);
              }}
            >
              <IconTrash className="menu-item-icon" />
              <span>Delete playlist</span>
            </button>
          )}
          <button
            type="button"
            className="menu-item-with-sub"
            onClick={toggleTheme}
          >
            <IconTheme className="menu-item-icon" />
            Theme
            <span className="menu-chevron">{themeOpen ? "▴" : "▾"}</span>
          </button>
          {themeOpen && (
            <div className="app-menu-submenu">
              {THEMES.filter((t) => t.id !== "custom").map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={activeTheme === t.id ? "active" : ""}
                  onClick={() => pickTheme(t.id)}
                >
                  {activeTheme === t.id && <IconCheck className="menu-item-icon" />}
                  <span className={activeTheme === t.id ? "" : "menu-submenu-pad"}>
                    {t.label}
                  </span>
                </button>
              ))}
              {showAdaptiveTheme && (
                <button
                  type="button"
                  className={activeTheme === "artist" ? "active" : ""}
                  onClick={() => pickTheme("artist")}
                >
                  {activeTheme === "artist" && (
                    <IconCheck className="menu-item-icon" />
                  )}
                  <span
                    className={activeTheme === "artist" ? "" : "menu-submenu-pad"}
                  >
                    Adaptive
                  </span>
                </button>
              )}
              {THEMES.filter((t) => t.id === "custom").map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={activeTheme === t.id ? "active" : ""}
                  onClick={() => pickTheme(t.id)}
                >
                  {activeTheme === t.id && <IconCheck className="menu-item-icon" />}
                  <span className={activeTheme === t.id ? "" : "menu-submenu-pad"}>
                    {t.label}
                  </span>
                </button>
              ))}
              {customOpen && (
                <div className="custom-theme-panel">
                  {CUSTOM_FIELDS.map((f) => (
                    <label key={f.key} className="custom-theme-row">
                      <span>{f.label}</span>
                      <input
                        type="color"
                        value={custom[f.key]}
                        onChange={(e) => updateCustom(f.key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {isAdmin && (
            <>
              <button
                type="button"
                className="menu-item-with-sub"
                onClick={toggleSettings}
              >
                <IconSettings className="menu-item-icon" />
                Setup
                <span className="menu-chevron">{settingsOpen ? "▴" : "▾"}</span>
              </button>
              {settingsOpen && (
                <div className="app-menu-submenu">
                  {onChooseSource && (
                    <button
                      type="button"
                      onClick={() => {
                        onChooseSource();
                        setOpen(false);
                      }}
                    >
                      <IconFolder className="menu-item-icon" />
                      Choose source
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onSync();
                      setOpen(false);
                    }}
                  >
                    <IconSync className="menu-item-icon" />
                    Sync folders
                  </button>
                </div>
              )}
            </>
          )}
          {onEditProfile && (
            <button
              type="button"
              onClick={() => {
                onEditProfile();
                setOpen(false);
              }}
            >
              <IconEditProfile className="menu-item-icon" />
              Edit profile
            </button>
          )}
          {showSwitchMedia && mediaSwitch ? (
            <>
              <button
                type="button"
                className="menu-item-with-sub"
                onClick={() => {
                  setMediaSwitchOpen((o) => {
                    const next = !o;
                    if (next) {
                      setSettingsOpen(false);
                      setArtistDataOpen(false);
                      setEditDataOpen(false);
                      setTrackDataOpen(false);
                      setThemeOpen(false);
                      setCustomOpen(false);
                    }
                    return next;
                  });
                }}
              >
                <IconCards className="menu-item-icon" />
                Switch media
                <span className="menu-chevron">
                  {mediaSwitchOpen ? "▴" : "▾"}
                </span>
              </button>
              {mediaSwitchOpen && (
                <div className="app-menu-submenu">
                  {MEDIA_SWITCH_OPTIONS.map(({ kind, label, Icon }) => (
                    <button
                      key={kind}
                      type="button"
                      className={
                        mediaSwitch.currentKind === kind ? "active" : undefined
                      }
                      onClick={() => {
                        mediaSwitch.selectMedia(kind);
                        setOpen(false);
                        setMediaSwitchOpen(false);
                      }}
                    >
                      <Icon className="menu-item-icon" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : null}
          {onSwitchProfile && (
            <button
              type="button"
              className="menu-item-switch-profile"
              onClick={() => {
                onSwitchProfile();
                setOpen(false);
              }}
            >
              <IconSwitchProfile className="menu-item-icon" />
              Switch profile
            </button>
          )}
        </div>
      )}
    </div>
  );
}
