import { useMemo, useState, type KeyboardEvent } from "react";

type Props = {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

function titleCaseWord(word: string): string {
  if (!word) return word;
  return word[0].toUpperCase() + word.slice(1);
}

export default function GenreTagsInput({
  label,
  options,
  value,
  onChange,
  disabled,
}: Props) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  const catalog = useMemo(() => {
    const map = new Map<string, string>();
    for (const name of options) {
      map.set(name.toLowerCase(), name);
    }
    return map;
  }, [options]);

  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) {
      return options.filter(
        (o) => !value.some((v) => v.toLowerCase() === o.toLowerCase())
      );
    }
    return options.filter(
      (o) =>
        o.toLowerCase().includes(q) &&
        !value.some((v) => v.toLowerCase() === o.toLowerCase())
    );
  }, [draft, options, value]);

  function commitToken(raw: string) {
    const typed = raw.trim();
    if (!typed) return false;
    const canon = catalog.get(typed.toLowerCase());
    if (!canon) return false;
    if (value.some((v) => v.toLowerCase() === canon.toLowerCase())) {
      setDraft("");
      return true;
    }
    onChange([...value, canon]);
    setDraft("");
    return true;
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === ";" || e.key === "Enter") {
      e.preventDefault();
      if (!commitToken(draft)) {
        // Keep draft so the user can pick a suggestion
        setOpen(true);
      }
      return;
    }
    if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <label className="genre-tags-input">
      {label}
      <div className="genre-tags-input__box">
        {value.map((tag) => (
          <button
            key={tag}
            type="button"
            className="genre-tags-input__chip"
            disabled={disabled}
            onClick={() => onChange(value.filter((v) => v !== tag))}
            title="Remove"
          >
            {tag} ×
          </button>
        ))}
        <input
          type="text"
          className="genre-tags-input__field"
          value={draft}
          disabled={disabled}
          placeholder={value.length ? "" : "Type a genre, then ;"}
          onChange={(e) => {
            setDraft(e.target.value.replace(/;/g, ""));
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="genre-tags-input__suggest" role="listbox">
          {suggestions.slice(0, 12).map((name) => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  commitToken(name);
                  setOpen(false);
                }}
              >
                {titleCaseWord(name)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {draft.trim() &&
        !catalog.has(draft.trim().toLowerCase()) &&
        suggestions.length === 0 && (
          <p className="genre-tags-input__hint muted">
            Genre must match an existing database entry.
          </p>
        )}
    </label>
  );
}
