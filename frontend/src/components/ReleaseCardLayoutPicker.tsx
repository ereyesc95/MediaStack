import { useEffect, useRef, useState } from "react";
import type { ReleaseCardLayout } from "../types";

const OPTIONS: { id: ReleaseCardLayout; label: string }[] = [
  { id: "cover", label: "Cover" },
  { id: "banner", label: "Banner" },
];

type Props = {
  value: ReleaseCardLayout;
  onChange: (next: ReleaseCardLayout) => void;
  className?: string;
};

export default function ReleaseCardLayoutPicker({
  value,
  onChange,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0];

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
      className={`release-card-layout-picker ${className}`.trim()}
    >
      <button
        type="button"
        className="card-orientation-toggle release-card-layout-picker__trigger"
        aria-label={`Release cards: ${current.label}. Choose layout.`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="release-card-layout-picker__label">{current.label}</span>
      </button>
      {open && (
        <div className="card-orientation-picker__menu" role="menu">
          {OPTIONS.map(({ id, label }) => (
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
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
