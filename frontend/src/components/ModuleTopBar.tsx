import { useEffect, useRef, useState, type ReactNode } from "react";
import { mediaTypeIcon, toStackName } from "../mediaStack";
import { useMenuPresence } from "../useMenuPresence";
import {
  isMobilePortraitLayout,
  useDeviceLayout,
} from "../usePhoneLayout";
import {
  IconCamera,
  IconCollection,
  IconMediaBooks,
  IconMediaGames,
  IconMediaMovies,
  IconMediaSeries,
  IconStar,
  IconTabArtists,
  IconTabCatalog,
  IconTabEvents,
  IconTabHome,
  IconTabPlaylists,
} from "./MenuIcons";

export type MediaOption = {
  id: number;
  label: string;
  kind: string;
};

type Tab = {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
};

type Props = {
  media: MediaOption;
  mediaOptions: MediaOption[];
  onSelectMedia: (opt: MediaOption) => void;
  tabs: Tab[];
  menu: React.ReactNode;
};

function defaultTabIcon(id: string, label: string, mediaKind?: string): ReactNode {
  const key = id.toLowerCase();
  const text = label.toLowerCase();
  const kind = (mediaKind ?? "").toLowerCase();
  if (key === "home" || text === "home") return <IconTabHome />;
  if (key === "gallery" || text === "gallery") return <IconCamera />;
  if (key === "exclusive" || text === "exclusive") return <IconStar />;
  if (key === "artists" || text === "artists") return <IconTabArtists />;
  if (key === "collection" || text === "collection") return <IconCollection />;
  if (key === "events" || text === "events") return <IconTabEvents />;
  if (key === "playlists" || text === "playlists") return <IconTabPlaylists />;
  /* Catalog tabs use the module name as label (SERIES / MOVIES / …). */
  if (
    key === "catalog" ||
    text === "catalog" ||
    text === "series" ||
    text === "movies" ||
    text === "books" ||
    text === "games"
  ) {
    if (text === "series" || kind === "series") return <IconMediaSeries />;
    if (text === "movies" || kind === "movies") return <IconMediaMovies />;
    if (text === "books" || kind === "books") return <IconMediaBooks />;
    if (text === "games" || kind === "games") return <IconMediaGames />;
    return <IconTabCatalog />;
  }
  return <IconTabCatalog />;
}

export default function ModuleTopBar({
  media,
  mediaOptions,
  onSelectMedia,
  tabs,
  menu,
}: Props) {
  const [mediaOpen, setMediaOpen] = useState(false);
  const { present: menuPresent, visible: menuVisible } =
    useMenuPresence(mediaOpen);
  const mediaRef = useRef<HTMLDivElement>(null);
  const deviceLayout = useDeviceLayout();
  const iconTabs = isMobilePortraitLayout(deviceLayout);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (mediaRef.current && !mediaRef.current.contains(e.target as Node)) {
        setMediaOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    document.title = toStackName(media.label);
  }, [media.label]);

  const stackTitle = toStackName(media.label);

  return (
    <header className="module-top-bar">
      <div className="module-top-bar__media" ref={mediaRef}>
        <button
          type="button"
          className="module-top-bar__media-btn"
          onClick={() => setMediaOpen((o) => !o)}
          aria-expanded={mediaOpen}
          aria-label={stackTitle}
        >
          <span className="module-top-bar__media-icon" aria-hidden>
            {mediaTypeIcon(media.kind)}
          </span>
          <span className="module-top-bar__media-label">{stackTitle}</span>
          <span className="module-top-bar__chevron" aria-hidden>
            ▾
          </span>
        </button>
        {menuPresent ? (
          <ul
            className={`module-top-bar__media-menu ms-menu-pop${
              menuVisible ? " is-open" : ""
            }`}
            aria-hidden={!menuVisible}
            inert={menuVisible ? undefined : true}
          >
            {mediaOptions.map((opt) => (
              <li key={opt.kind}>
                <button
                  type="button"
                  className={opt.kind === media.kind ? "active" : ""}
                  onClick={() => {
                    onSelectMedia(opt);
                    setMediaOpen(false);
                  }}
                >
                  <span className="module-top-bar__media-icon" aria-hidden>
                    {mediaTypeIcon(opt.kind)}
                  </span>
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <nav
        className={`module-top-bar__tabs${
          iconTabs ? " module-top-bar__tabs--icons" : ""
        }`}
        aria-label="Module sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.active ? "active" : ""}
            onClick={t.onClick}
            aria-label={t.label}
            title={t.label}
          >
            {iconTabs ? (
              <span className="module-top-bar__tab-icon" aria-hidden>
                {t.icon ?? defaultTabIcon(t.id, t.label, media.kind)}
              </span>
            ) : (
              t.label
            )}
          </button>
        ))}
      </nav>

      <div className="module-top-bar__menu">{menu}</div>
    </header>
  );
}
