import { useEffect, useRef, useState } from "react";
import { IconSearch } from "./MenuIcons";
import { usePhoneLayout } from "../usePhoneLayout";

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** Shown only when the field is expanded. Defaults to "Search". */
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** Force always-expanded (desktop-style) even on phone. */
  alwaysExpanded?: boolean;
};

/**
 * Phone: collapsed = search icon only; tap expands a typed field.
 * Desktop / alwaysExpanded: always shows the field.
 */
export default function ExpandableFilterSearch({
  value,
  onChange,
  placeholder = "Search",
  ariaLabel = "Search",
  className = "",
  alwaysExpanded = false,
}: Props) {
  const isPhone = usePhoneLayout();
  const [open, setOpen] = useState(() => Boolean(value.trim()));
  const inputRef = useRef<HTMLInputElement>(null);
  const expand = alwaysExpanded || !isPhone || open || Boolean(value.trim());

  useEffect(() => {
    if (value.trim()) setOpen(true);
  }, [value]);

  useEffect(() => {
    if (expand && isPhone && !alwaysExpanded) {
      inputRef.current?.focus();
    }
  }, [expand, isPhone, alwaysExpanded]);

  if (!expand) {
    return (
      <button
        type="button"
        className={`filter-subbar-search-toggle${className ? ` ${className}` : ""}`}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => setOpen(true)}
      >
        <IconSearch className="filter-subbar-search-icon filter-subbar-search-icon--btn" />
      </button>
    );
  }

  return (
    <div
      className={`filter-subbar-search-wrap filter-subbar-search-wrap--expanded${
        className ? ` ${className}` : ""
      }`}
    >
      <IconSearch className="filter-subbar-search-icon" aria-hidden />
      <input
        ref={inputRef}
        className="filter-subbar-search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      {isPhone && !alwaysExpanded ? (
        <button
          type="button"
          className="filter-subbar-search-close"
          aria-label="Close search"
          onClick={() => {
            setOpen(false);
            onChange("");
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
