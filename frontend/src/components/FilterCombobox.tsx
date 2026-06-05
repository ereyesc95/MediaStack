import { useMemo, useState } from "react";

export type ComboOption = { value: string; label: string };

type Props = {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
};

export default function FilterCombobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchable = false,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="filter-combo">
      {searchable && (
        <input
          className="filter-combo-search"
          type="text"
          placeholder={selected?.label ?? placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <select
        className="filter-combo-select"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery("");
        }}
      >
        <option value="">{placeholder}</option>
        {filtered.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
