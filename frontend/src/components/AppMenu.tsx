import { useEffect, useRef, useState } from "react";
import { applySavedArtistTheme } from "../mediaTheme";
import {
  THEMES,
  applyTheme,
  getCustomColors,
  hasArtistTheme,
  readDomTheme,
  saveCustomColors,
  type CustomThemeColors,
  type ThemeId,
} from "../themes";
import {
  IconAddArtist,
  IconCheck,
  IconEditProfile,
  IconFolder,
  IconImport,
  IconSettings,
  IconSwitchProfile,
  IconSync,
  IconTheme,
} from "./MenuIcons";

type Props = {
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onAddArtist?: () => void;
  showAddArtist?: boolean;
  isAdmin?: boolean;
  userId?: number;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onRefreshMetadata?: () => void;
  onRescanLibrary?: () => void;
  refreshIncludeBio?: boolean;
  onRefreshIncludeBioChange?: (v: boolean) => void;
  artistThemeActive?: boolean;
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
  onImport,
  onSync,
  onChooseSource,
  onAddArtist,
  showAddArtist,
  isAdmin = false,
  userId,
  onSwitchProfile,
  onEditProfile,
  onRefreshMetadata,
  onRescanLibrary,
  refreshIncludeBio = false,
  onRefreshIncludeBioChange,
  artistThemeActive = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [artistDataOpen, setArtistDataOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => readDomTheme());
  const [custom, setCustom] = useState<CustomThemeColors>(() => getCustomColors(userId));
  const showArtistThemeOption =
    artistThemeActive && hasArtistTheme(userId);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustom(getCustomColors(userId));
    setActiveTheme(readDomTheme());
  }, [userId]);

  useEffect(() => {
    const sync = () => setActiveTheme(readDomTheme());
    window.addEventListener("theme-changed", sync);
    window.addEventListener("artist-theme-updated", sync);
    return () => {
      window.removeEventListener("theme-changed", sync);
      window.removeEventListener("artist-theme-updated", sync);
    };
  }, [userId]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSettingsOpen(false);
        setArtistDataOpen(false);
        setThemeOpen(false);
        setCustomOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function pickTheme(id: ThemeId) {
    if (id === "custom") {
      setCustomOpen(true);
      applyTheme("custom", userId);
      setActiveTheme("custom");
      return;
    }
    if (id === "artist") {
      setCustomOpen(false);
      applySavedArtistTheme(userId);
      setActiveTheme("artist");
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
    applyTheme("custom", userId);
    setActiveTheme("custom");
  }

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
          {isAdmin && (onRefreshMetadata || onRescanLibrary) && (
            <>
              <button
                type="button"
                className="menu-item-with-sub"
                onClick={() => setArtistDataOpen((o) => !o)}
              >
                <IconSync className="menu-item-icon" />
                Artist Data
                <span className="menu-chevron">
                  {artistDataOpen ? "▴" : "▾"}
                </span>
              </button>
              {artistDataOpen && (
                <div className="app-menu-submenu">
                  {onRefreshMetadata && (
                    <button
                      type="button"
                      onClick={() => {
                        onRefreshMetadata();
                        setOpen(false);
                      }}
                    >
                      <IconSync className="menu-item-icon" />
                      Refresh metadata
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
                      Include bio
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
                      Rescan library
                    </button>
                  )}
                </div>
              )}
            </>
          )}
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
          <button
            type="button"
            className="menu-item-with-sub"
            onClick={() => setThemeOpen((o) => !o)}
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
              {showArtistThemeOption && (
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
                    Artist theme
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
                onClick={() => setSettingsOpen((o) => !o)}
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
                      onImport();
                      setOpen(false);
                    }}
                  >
                    <IconImport className="menu-item-icon" />
                    Import SQL
                  </button>
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
          {!isAdmin && onEditProfile && (
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
