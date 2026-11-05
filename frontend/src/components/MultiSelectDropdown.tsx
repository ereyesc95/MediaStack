import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import type { DropdownOption } from "./SearchableDropdown";

type Props = {
  options: DropdownOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  visibleRows?: number;
  /** Render list in a fixed portal so modal overflow doesn't clip it. */
  portal?: boolean;
};

export default function MultiSelectDropdown({
  options,
  values,
  onChange,
  placeholder = "Select…",
  visibleRows = 7,
  portal = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedLabels = useMemo(() => {
    const map = new Map(options.map((o) => [o.value, o.label]));
    return values.map((v) => map.get(v) ?? v).filter(Boolean);
  }, [options, values]);

  useEffect(() => {
    function close(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", close, true);
    return () => document.removeEventListener("mousedown", close, true);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const groups = useMemo(() => {
    const map = new Map<string, DropdownOption[]>();
    for (const o of filtered) {
      const g = o.group || "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    const entries = [...map.entries()];
    entries.sort((a, b) => {
      if (a[0] === "Common") return -1;
      if (b[0] === "Common") return 1;
      return a[0].localeCompare(b[0]);
    });
    return entries;
  }, [filtered]);

  const hasGroups = groups.some(([g]) => g);

  useLayoutEffect(() => {
    if (!open || !portal || !ref.current) return;
    const update = () => {
      const rect = ref.current!.getBoundingClientRect();
      const rowH = 2.15 * 16;
      const listH = Math.min(
        rowH * visibleRows,
        Math.max(120, window.innerHeight * 0.32)
      );
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUp = spaceBelow < listH && spaceAbove > spaceBelow;
      const maxH = Math.min(
        listH,
        Math.max(100, openUp ? spaceAbove : spaceBelow)
      );
      setPortalStyle({
        position: "fixed",
        left: rect.left,
        width: Math.max(rect.width, 180),
        zIndex: 600,
        maxHeight: maxH,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, portal, visibleRows, filtered.length, query]);

  function toggle(opt: DropdownOption) {
    if (values.includes(opt.value)) {
      onChange(values.filter((v) => v !== opt.value));
    } else {
      onChange([...values, opt.value]);
    }
  }

  const listStyle: CSSProperties = {
    ["--dropdown-visible-rows" as string]: String(visibleRows),
    ...(portal ? portalStyle : {}),
  };

  const listEl = open ? (
    <ul
      ref={listRef}
      className={`search-dropdown-list${
        portal ? " search-dropdown-list--portal" : ""
      }`}
      role="listbox"
      style={listStyle}
    >
      {filtered.length === 0 && (
        <li className="search-dropdown-empty">No matches</li>
      )}
      {hasGroups
        ? groups.map(([group, items]) => (
            <li key={group || "_"} className="search-dropdown-group-wrap">
              {group && (
                <span className="search-dropdown-group">{group}</span>
              )}
              <ul>
                {items.map((o) => {
                  const picked = values.includes(o.value);
                  return (
                    <li key={o.value}>
                      <button
                        type="button"
                        className={picked ? "is-selected" : ""}
                        onClick={() => toggle(o)}
                      >
                        <span className="search-dropdown-check">
                          {picked ? "✓" : ""}
                        </span>
                        {o.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))
        : filtered.map((o) => {
            const picked = values.includes(o.value);
            return (
              <li key={o.value}>
                <button
                  type="button"
                  className={picked ? "is-selected" : ""}
                  onClick={() => toggle(o)}
                >
                  <span className="search-dropdown-check">
                    {picked ? "✓" : ""}
                  </span>
                  {o.label}
                </button>
              </li>
            );
          })}
    </ul>
  ) : null;

  return (
    <div className="search-dropdown search-dropdown--multi" ref={ref}>
      <input
        type="text"
        className="search-dropdown-input"
        placeholder={
          selectedLabels.length ? selectedLabels.join(", ") : placeholder
        }
        value={open ? query : ""}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {portal && listEl
        ? createPortal(listEl, document.body)
        : listEl}
    </div>
  );
}
