import type { ReactElement } from "react";
import { useTopBarHoverPicker } from "../useTopBarHoverPicker";
import { IconCardBanner, IconCardCover, IconList } from "./MenuIcons";

export type CollectionLayout = "list" | "cover" | "banner";

const OPTIONS: {
  id: CollectionLayout;
  label: string;
  Icon: (props: { className?: string }) => ReactElement;
}[] = [
  { id: "list", label: "List", Icon: IconList },
  { id: "cover", label: "Cover", Icon: IconCardCover },
  { id: "banner", label: "Banner", Icon: IconCardBanner },
];

type Props = {
  value: CollectionLayout;
  onChange: (next: CollectionLayout) => void;
  className?: string;
};

export default function CollectionLayoutPicker({
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
      className={`card-orientation-picker collection-layout-picker${
        open ? " is-open" : ""
      } ${className}`.trim()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        className={`card-orientation-toggle catalog-display-toggle--borderless`}
        aria-label={`Collection: ${current.label}. Choose layout.`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`View: ${current.label}`}
        onClick={onToggleClick}
      >
        <CurrentIcon className="catalog-display-toggle__icon" />
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
