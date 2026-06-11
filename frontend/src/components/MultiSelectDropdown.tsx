import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { DropdownOption } from "./SearchableDropdown";

type Props = {
  options: DropdownOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  visibleRows?: number;
};

export default function MultiSelectDropdown({
  options,
  values,
  onChange,
  placeholder = "Select…",
  visibleRows = 7,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selectedLabels = useMemo(() => {
    const map = new Map(options.map((o) => [o.value, o.label]));
    return values.map((v) => map.get(v) ?? v).filter(Boolean);
  }, [options, values]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  function toggle(opt: DropdownOption) {
    if (values.includes(opt.value)) {
      onChange(values.filter((v) => v !== opt.value));
    } else {
      onChange([...values, opt.value]);
    }
  }

  const listStyle: CSSProperties = {
    ["--dropdown-visible-rows" as string]: String(visibleRows),
  };

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
      {open && (
        <ul
          className="search-dropdown-list"
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
      )}
    </div>
  );
}
