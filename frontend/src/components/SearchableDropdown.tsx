import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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
  /** Rich label for the closed/selected field (plain `label` is still used for search). */
  renderSelectedLabel?: (option: DropdownOption) => ReactNode;
  /** Rich label for each option in the dropdown list. */
  renderOptionLabel?: (option: DropdownOption) => ReactNode;
  /**
   * Render the open list in a portal with fixed positioning so it isn't
   * clipped by scrollable modal panels.
   */
  portal?: boolean;
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
  renderSelectedLabel,
  renderOptionLabel,
  portal = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [asyncOptions, setAsyncOptions] = useState<DropdownOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedLabel, setPickedLabel] = useState("");
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected =
    options.find((o) => o.value === value) ??
    asyncOptions.find((o) => o.value === value);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!value) setPickedLabel("");
    else if (selected?.label) setPickedLabel(selected.label);
  }, [value, selected?.label]);

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

  useLayoutEffect(() => {
    if (!open || !portal || !ref.current) return;
    const update = () => {
      const rect = ref.current!.getBoundingClientRect();
      const rowH = 2.15 * 16;
      const listH = Math.min(
        rowH * visibleRows,
        Math.max(160, window.innerHeight * 0.45)
      );
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUp = spaceBelow < listH && spaceAbove > spaceBelow;
      const maxH = Math.min(listH, openUp ? spaceAbove : spaceBelow);
      setPortalStyle({
        position: "fixed",
        left: rect.left,
        width: Math.max(rect.width, 200),
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

  function pick(opt: DropdownOption) {
    setPickedLabel(opt.label);
    onChange(opt.value);
    setQuery("");
    setOpen(false);
  }

  const listStyle: CSSProperties = {
    ["--dropdown-visible-rows" as string]: String(visibleRows),
    ...(portal ? portalStyle : {}),
  };

  const showHint =
    query.trim().length < minQueryLength && (onSearch || minQueryLength > 0);

  function renderListLabel(option: DropdownOption) {
    return renderOptionLabel ? renderOptionLabel(option) : option.label;
  }

  const showSelectedDisplay = !open && !!selected && !!renderSelectedLabel;

  const listEl = open ? (
    <ul
      ref={listRef}
      className={`search-dropdown-list${
        portal ? " search-dropdown-list--portal" : ""
      }`}
      role="listbox"
      style={listStyle}
    >
      {showHint && (
        <li className="search-dropdown-empty">
          Type {minQueryLength}+ characters to search
        </li>
      )}
      {searching && <li className="search-dropdown-empty">Searching…</li>}
      {!showHint && !searching && filtered.length === 0 && (
        <li className="search-dropdown-empty">No matches</li>
      )}
      {!showHint &&
        !searching &&
        hasGroups &&
        groups.map(([group, items]) => (
          <li key={group || "_"} className="search-dropdown-group-wrap">
            {group && <span className="search-dropdown-group">{group}</span>}
            <ul>
              {items.map((o) => (
                <li key={o.value}>
                  <button type="button" onClick={() => pick(o)}>
                    {o.iso && (
                      <span className={`fi fi-${o.iso} search-dropdown-flag`} />
                    )}
                    {renderListLabel(o)}
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
              {renderListLabel(o)}
            </button>
          </li>
        ))}
    </ul>
  ) : null;

  return (
    <div className="search-dropdown" ref={ref}>
      {showSelectedDisplay ? (
        <button
          type="button"
          className="search-dropdown-input search-dropdown-selected"
          onClick={() => setOpen(true)}
        >
          {selected.iso && (
            <span
              className={`fi fi-${selected.iso} search-dropdown-flag`}
              aria-hidden
            />
          )}
          <span className="search-dropdown-selected-text">
            {renderSelectedLabel!(selected)}
          </span>
        </button>
      ) : (
        <input
          ref={inputRef}
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
      )}
      {portal && listEl
        ? createPortal(listEl, document.body)
        : listEl}
    </div>
  );
}
