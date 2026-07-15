import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type Props = {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  multiple?: boolean;
  inline?: boolean;
  labelRight?: boolean;
  hideLabel?: boolean;
};

export default function FilterCombobox({
  label,
  options,
  value,
  onChange,
  placeholder = "All",
  multiple = true,
  inline = false,
  labelRight = false,
  hideLabel = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const updatePanelPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPanelStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 6000,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (
        wrapRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const display =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? value[0]
        : `${value.length} selected`;

  const toggle = (option: string) => {
    if (!multiple) {
      onChange(value.includes(option) ? [] : [option]);
      setOpen(false);
      return;
    }
    onChange(
      value.includes(option) ? value.filter((v) => v !== option) : [...value, option]
    );
  };

  const panel = open ? (
    <div
      ref={panelRef}
      className="filter-combobox__panel filter-combobox__panel--portal"
      style={panelStyle}
    >
      <input
        type="search"
        className="filter-combobox__search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${label.toLowerCase()}…`}
        autoComplete="off"
      />
      <ul className="filter-combobox__list ms-scrollbar">
        {filtered.length === 0 ? (
          <li className="filter-combobox__empty muted">No matches</li>
        ) : (
          filtered.map((option) => (
            <li key={option}>
              <button
                type="button"
                className={`filter-combobox__option${value.includes(option) ? " selected" : ""}`}
                onClick={() => toggle(option)}
              >
                {multiple && (
                  <span className="filter-combobox__check" aria-hidden>
                    {value.includes(option) ? "✓" : ""}
                  </span>
                )}
                {option}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  ) : null;

  return (
    <div
      className={`filter-combobox${inline ? " filter-combobox--inline" : ""}${
        labelRight ? " filter-combobox--label-right" : ""
      }`}
      ref={wrapRef}
    >
      {!labelRight && !hideLabel && <span className="filter-combobox__label">{label}</span>}
      <button
        ref={triggerRef}
        type="button"
        className={`filter-combobox__trigger${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={hideLabel ? label : undefined}
      >
        <span className="filter-combobox__value">{display}</span>
        <span className="filter-combobox__chev" aria-hidden>
          ▾
        </span>
      </button>
      {labelRight && !hideLabel && <span className="filter-combobox__label">{label}</span>}
      {panel && createPortal(panel, document.body)}
    </div>
  );
}
