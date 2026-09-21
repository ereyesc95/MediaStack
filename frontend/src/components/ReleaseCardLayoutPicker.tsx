import { useEffect, useRef, useState, type ReactElement } from "react";
import type { ReleaseCardLayout } from "../types";
import { useMenuPresence } from "../useMenuPresence";
import { usePhoneLayout } from "../usePhoneLayout";
import { IconCardBanner, IconCardCover, IconList } from "./MenuIcons";

const OPTIONS: {
  id: ReleaseCardLayout;
  label: string;
  Icon: (props: { className?: string }) => ReactElement;
}[] = [
  { id: "cover", label: "Cover", Icon: IconCardCover },
  { id: "banner", label: "Banner", Icon: IconCardBanner },
  { id: "list", label: "List", Icon: IconList },
];

type Props = {
  value: ReleaseCardLayout;
  onChange: (next: ReleaseCardLayout) => void;
  className?: string;
  /** Catalog albums/singles: include text List layout. Artist pages stay Cover/Banner. */
  includeList?: boolean;
};

const CLOSE_DELAY_MS = 280;

export default function ReleaseCardLayoutPicker({
  value,
  onChange,
  className = "",
  includeList = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const { present: menuPresent, visible: menuVisible } = useMenuPresence(open);
  const rootRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<number | null>(null);
  const isPhone = usePhoneLayout();
  const options = includeList
    ? OPTIONS
    : OPTIONS.filter((o) => o.id !== "list");
  const safeValue = !includeList && value === "list" ? "cover" : value;
  const current = options.find((o) => o.id === safeValue) ?? options[0];
  const CurrentIcon = current.Icon;

  const clearLeaveTimer = () => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  useEffect(() => () => clearLeaveTimer(), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`card-orientation-picker release-card-layout-picker${
        open ? " is-open" : ""
      } ${className}`.trim()}
      onMouseEnter={() => {
        if (isPhone) return;
        clearLeaveTimer();
        setOpen(true);
      }}
      onMouseLeave={() => {
        if (isPhone) return;
        clearLeaveTimer();
        leaveTimer.current = window.setTimeout(() => {
          setOpen(false);
          leaveTimer.current = null;
        }, CLOSE_DELAY_MS);
      }}
    >
      <button
        type="button"
        className="card-orientation-toggle"
        aria-label={`Release cards: ${current.label}. Choose layout.`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Cards: ${current.label}`}
        onClick={() => {
          clearLeaveTimer();
          setOpen((v) => !v);
        }}
      >
        <CurrentIcon />
      </button>
      {menuPresent ? (
        <div
          className={`card-orientation-picker__menu ms-menu-pop${
            menuVisible ? " is-open" : ""
          }`}
          role="menu"
          aria-hidden={!menuVisible}
          inert={menuVisible ? undefined : true}
        >
          <div className="card-orientation-picker__menu-panel">
            {OPTIONS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={safeValue === id}
                className={safeValue === id ? "active" : ""}
                onClick={() => {
                  onChange(id);
                  setOpen(false);
                }}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
