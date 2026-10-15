import { useEffect, useRef, useState } from "react";
import type { SeriesFranchiseCard } from "../../types";

type Props = {
  platforms: SeriesFranchiseCard[];
  value: string | null;
  onChange: (platformName: string | null) => void;
};

export default function GamesPlatformFilter({
  platforms,
  value,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [open]);

  const selected = value
    ? platforms.find(
        (p) => (p.name || "").toLowerCase() === value.toLowerCase()
      ) || null
    : null;
  const selectedIcon =
    selected?.icon_url || selected?.logo_url || null;

  return (
    <div className="games-platform-filter" ref={rootRef}>
      <button
        type="button"
        className="games-platform-filter__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected?.name || "All platforms"}
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? (
          selectedIcon ? (
            <img
              src={selectedIcon}
              alt=""
              className="games-platform-filter__icon"
            />
          ) : (
            <span>{selected.name}</span>
          )
        ) : (
          <span>ALL</span>
        )}
      </button>
      {open ? (
        <div className="games-platform-filter__menu" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={
              !value
                ? "games-platform-filter__option is-active"
                : "games-platform-filter__option"
            }
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            ALL
          </button>
          {platforms.map((p) => {
            const name = p.name || p.id;
            const icon = p.icon_url || p.logo_url || null;
            const active =
              Boolean(value) &&
              name.toLowerCase() === (value || "").toLowerCase();
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={active}
                className={
                  active
                    ? "games-platform-filter__option is-active"
                    : "games-platform-filter__option"
                }
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
              >
                {icon ? (
                  <img
                    src={icon}
                    alt=""
                    className="games-platform-filter__option-icon"
                  />
                ) : null}
                <span>{name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
