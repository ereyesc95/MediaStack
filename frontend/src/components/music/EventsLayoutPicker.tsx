import type { ReactElement } from "react";
import type { EventsCardLayout } from "../../types";
import { useTopBarHoverPicker } from "../../useTopBarHoverPicker";
import {
  IconCardBanner,
  IconCardCover,
  IconCardIcons,
  IconCardLandscape,
  IconCardPortrait,
  IconList,
} from "../MenuIcons";

const OPTIONS: {
  id: EventsCardLayout;
  label: string;
  Icon: (props: { className?: string }) => ReactElement;
}[] = [
  { id: "portrait", label: "Portrait", Icon: IconCardPortrait },
  { id: "landscape", label: "Landscape", Icon: IconCardLandscape },
  { id: "banner", label: "Banner", Icon: IconCardBanner },
  { id: "cover", label: "Cover", Icon: IconCardCover },
  { id: "logos", label: "Logos", Icon: IconCardIcons },
  { id: "list", label: "List", Icon: IconList },
];

type Props = {
  value: EventsCardLayout;
  onChange: (next: EventsCardLayout) => void;
  className?: string;
};

/** Icon-only hover picker — same chrome as catalog CardOrientationPicker. */
export default function EventsLayoutPicker({
  value,
  onChange,
  className = "",
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
  const current = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0];
  const CurrentIcon = current.Icon;

  return (
    <div
      ref={rootRef}
      className={`card-orientation-picker events-layout-picker${
        open ? " is-open" : ""
      } ${className}`.trim()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        className="card-orientation-toggle"
        aria-label={`Cards: ${current.label}. Choose layout.`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`View: ${current.label}`}
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
            {OPTIONS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={value === id}
                className={value === id ? "active" : ""}
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
