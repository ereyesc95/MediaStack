import { useEffect, useRef, useState, type ReactElement } from "react";
import type { CardOrientation } from "../types";
import { usePhoneLayout } from "../usePhoneLayout";
import {
  IconCardBanner,
  IconCardIcons,
  IconCardLandscape,
  IconCardPortrait,
} from "./MenuIcons";

const OPTIONS: {
  id: CardOrientation;
  label: string;
  Icon: (props: { className?: string }) => ReactElement;
}[] = [
  { id: "landscape", label: "Landscape", Icon: IconCardLandscape },
  { id: "portrait", label: "Portrait", Icon: IconCardPortrait },
  { id: "banner", label: "Banner", Icon: IconCardBanner },
  { id: "icons", label: "Icons", Icon: IconCardIcons },
];

type Props = {
  value: CardOrientation;
  onChange: (next: CardOrientation) => void;
  className?: string;
};

export default function CardOrientationPicker({
  value,
  onChange,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isPhone = usePhoneLayout();
  const current = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0];
  const CurrentIcon = current.Icon;

  useEffect(() => {
    if (!open || !isPhone) return;
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
  }, [open, isPhone]);

  return (
    <div
      ref={rootRef}
      className={`card-orientation-picker ${className}`.trim()}
      onMouseEnter={() => {
        if (!isPhone) setOpen(true);
      }}
      onMouseLeave={() => {
        if (!isPhone) setOpen(false);
      }}
    >
      <button
        type="button"
        className="card-orientation-toggle"
        aria-label={`Cards: ${current.label}. Choose layout.`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (isPhone) setOpen((v) => !v);
        }}
      >
        <CurrentIcon />
      </button>
      {open && (
        <div className="card-orientation-picker__menu" role="menu">
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
      )}
    </div>
  );
}
