import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

export type DropdownOption = {
  value: string;
  label: string;
  iso?: string;
  group?: string;
};

type Props = {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Max visible rows in the list (scrollable). */
  visibleRows?: number;
  /** Do not list options until the user types at least this many characters. */
  minQueryLength?: number;
  /** Load options asynchronously as the user types (e.g. members roster). */
  onSearch?: (query: string) => Promise<DropdownOption[]>;
  searchDebounceMs?: number;
};

export default function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder = "Search…",
  visibleRows = 7,
  minQueryLength = 0,
  onSearch,
  searchDebounceMs = 280,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [asyncOptions, setAsyncOptions] = useState<DropdownOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedLabel, setPickedLabel] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected =
    options.find((o) => o.value === value) ??
    asyncOptions.find((o) => o.value === value);

  useEffect(() => {
    if (!value) setPickedLabel("");
    else if (selected?.label) setPickedLabel(selected.label);
  }, [value, selected?.label]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close, true);
    return () => document.removeEventListener("mousedown", close, true);
  }, []);

  useEffect(() => {
    if (!onSearch) return;
    const q = query.trim();
    if (q.length < minQueryLength) {
      setAsyncOptions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(() => {
      onSearch(q)
        .then(setAsyncOptions)
        .catch(() => setAsyncOptions([]))
        .finally(() => setSearching(false));
    }, searchDebounceMs);
    return () => window.clearTimeout(t);
  }, [query, onSearch, minQueryLength, searchDebounceMs]);

  const sourceOptions = onSearch ? asyncOptions : options;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (onSearch) {
      return q.length >= minQueryLength ? sourceOptions : [];
    }
    if (q.length < minQueryLength) return [];
    if (!q) return sourceOptions;
    return sourceOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, sourceOptions, query, minQueryLength, onSearch]);

  const groups = useMemo(() => {
    const map = new Map<string, DropdownOption[]>();
    for (const o of filtered) {
      const g = o.group || "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const hasGroups = groups.some(([g]) => g);

  function pick(opt: DropdownOption) {
    setPickedLabel(opt.label);
    onChange(opt.value);
    setQuery("");
    setOpen(false);
  }

  const listStyle: CSSProperties = {
    ["--dropdown-visible-rows" as string]: String(visibleRows),
  };

  const showHint =
    query.trim().length < minQueryLength && (onSearch || minQueryLength > 0);

  return (
    <div className="search-dropdown" ref={ref}>
      <input
        type="text"
        className="search-dropdown-input"
        placeholder={selected?.label ?? pickedLabel ?? placeholder}
        value={open ? query : selected?.label ?? pickedLabel ?? ""}
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
          {showHint && (
            <li className="search-dropdown-empty">
              Type {minQueryLength}+ characters to search
            </li>
          )}
          {searching && (
            <li className="search-dropdown-empty">Searching…</li>
          )}
          {!showHint && !searching && filtered.length === 0 && (
            <li className="search-dropdown-empty">No matches</li>
          )}
          {!showHint &&
            !searching &&
            hasGroups &&
            groups.map(([group, items]) => (
              <li key={group || "_"} className="search-dropdown-group-wrap">
                {group && (
                  <span className="search-dropdown-group">{group}</span>
                )}
                <ul>
                  {items.map((o) => (
                    <li key={o.value}>
                      <button type="button" onClick={() => pick(o)}>
                        {o.iso && (
                          <span
                            className={`fi fi-${o.iso} search-dropdown-flag`}
                          />
                        )}
                        {o.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          {!showHint &&
            !searching &&
            !hasGroups &&
            filtered.map((o) => (
              <li key={o.value}>
                <button type="button" onClick={() => pick(o)}>
                  {o.iso && (
                    <span className={`fi fi-${o.iso} search-dropdown-flag`} />
                  )}
                  {o.label}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
