import { useEffect, useRef, useState } from "react";
import {
  THEMES,
  applyTheme,
  getCustomColors,
  getStoredTheme,
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
}: Props) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => getStoredTheme(userId));
  const [custom, setCustom] = useState<CustomThemeColors>(() => getCustomColors(userId));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTheme(getStoredTheme(userId));
    setCustom(getCustomColors(userId));
  }, [userId]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSettingsOpen(false);
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
      setTheme("custom");
      applyTheme("custom", userId);
      return;
    }
    setCustomOpen(false);
    applyTheme(id, userId);
    setTheme(id);
  }

  function updateCustom(key: keyof CustomThemeColors, value: string) {
    const next = { ...custom, [key]: value };
    setCustom(next);
    saveCustomColors(next, userId);
    applyTheme("custom", userId);
    setTheme("custom");
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
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={theme === t.id ? "active" : ""}
                  onClick={() => pickTheme(t.id)}
                >
                  {theme === t.id && <IconCheck className="menu-item-icon" />}
                  <span className={theme === t.id ? "" : "menu-submenu-pad"}>
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
