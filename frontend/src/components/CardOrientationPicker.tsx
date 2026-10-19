import type { ReactElement } from "react";
import type { CardOrientation } from "../types";
import { useTopBarHoverPicker } from "../useTopBarHoverPicker";
import {
  IconCardBadge,
  IconCardBanner,
  IconCardIcons,
  IconCardLandscape,
  IconCardPortrait,
  IconCardRound,
  IconList,
} from "./MenuIcons";

const OPTIONS: {
  id: CardOrientation;
  label: string;
  Icon: (props: { className?: string }) => ReactElement;
}[] = [
  { id: "banner", label: "Banner", Icon: IconCardBanner },
  { id: "landscape", label: "Landscape", Icon: IconCardLandscape },
  { id: "portrait", label: "Portrait", Icon: IconCardPortrait },
  { id: "round", label: "Round", Icon: IconCardRound },
  { id: "icons", label: "Logos", Icon: IconCardIcons },
  { id: "badge", label: "Badge", Icon: IconCardBadge },
  { id: "list", label: "List", Icon: IconList },
];

type Props = {
  value: CardOrientation;
  onChange: (next: CardOrientation) => void;
  className?: string;
  /** When false (default), Badge is hidden — Music catalog only supports landscape|portrait|banner|icons. */
  includeBadge?: boolean;
};

export default function CardOrientationPicker({
  value,
  onChange,
  className = "",
  includeBadge = false,
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
  const options = includeBadge
    ? OPTIONS
    : OPTIONS.filter((o) => o.id !== "badge");
  const safeValue =
    !includeBadge && value === "badge" ? "icons" : value;
  const current = options.find((o) => o.id === safeValue) ?? options[0];
  const CurrentIcon = current.Icon;

  return (
    <div
      ref={rootRef}
      className={`card-orientation-picker${open ? " is-open" : ""} ${className}`.trim()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        className="card-orientation-toggle"
        aria-label={`Cards: ${current.label}. Choose layout.`}
        aria-haspopup="menu"
        aria-expanded={open}
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
