import { useMemo, useState } from "react";

type Props = {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  onCommit?: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export default function PublisherSuggestInput({
  label,
  value,
  options,
  onChange,
  onCommit,
  disabled,
  placeholder = "Publisher",
}: Props) {
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    const unused = options.filter(Boolean);
    if (!q) return unused.slice(0, 12);
    return unused
      .filter((o) => o.toLowerCase().includes(q) && o.toLowerCase() !== q)
      .slice(0, 12);
  }, [options, value]);

  function pick(name: string) {
    onChange(name);
    onCommit?.(name);
    setOpen(false);
  }

  return (
    <label className="genre-tags-input publisher-suggest">
      {label}
      <div className="genre-tags-input__box publisher-suggest__box">
        <input
          type="text"
          className="genre-tags-input__field"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false);
              onCommit?.(value);
            }, 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "Enter" && suggestions.length === 1) {
              e.preventDefault();
              pick(suggestions[0]);
            }
          }}
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="genre-tags-input__suggest" role="listbox">
          {suggestions.map((name) => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(name)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
