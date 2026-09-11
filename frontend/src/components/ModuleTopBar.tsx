import { useEffect, useRef, useState } from "react";
import { mediaTypeIcon, toStackName } from "../mediaStack";
import { useMenuPresence } from "../useMenuPresence";

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
};

type Props = {
  media: MediaOption;
  mediaOptions: MediaOption[];
  onSelectMedia: (opt: MediaOption) => void;
  tabs: Tab[];
  menu: React.ReactNode;
};

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

      <nav className="module-top-bar__tabs" aria-label="Module sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.active ? "active" : ""}
            onClick={t.onClick}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="module-top-bar__menu">{menu}</div>
    </header>
  );
}
