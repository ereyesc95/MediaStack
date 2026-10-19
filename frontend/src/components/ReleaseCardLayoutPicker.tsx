import type { ReactElement } from "react";
import type { ReleaseCardLayout } from "../types";
import { useTopBarHoverPicker } from "../useTopBarHoverPicker";
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

export default function ReleaseCardLayoutPicker({
  value,
  onChange,
  className = "",
  includeList = false,
}: Props) {
  const {
    open,
    setOpen,
    menuPresent,
    menuVisible,
    rootRef,
    onMouseEnter,
    onMouseLeave,
    onToggleClick,
  } = useTopBarHoverPicker();
  const options = includeList
    ? OPTIONS
    : OPTIONS.filter((o) => o.id !== "list");
  const safeValue = !includeList && value === "list" ? "cover" : value;
  const current = options.find((o) => o.id === safeValue) ?? options[0];
  const CurrentIcon = current.Icon;

  return (
    <div
      ref={rootRef}
      className={`card-orientation-picker release-card-layout-picker${
        open ? " is-open" : ""
      } ${className}`.trim()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        className="card-orientation-toggle"
        aria-label={`Release cards: ${current.label}. Choose layout.`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Cards: ${current.label}`}
        onClick={onToggleClick}
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
            {options.map(({ id, label, Icon }) => (
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
