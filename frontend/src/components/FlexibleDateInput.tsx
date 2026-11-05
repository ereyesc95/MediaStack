import { useEffect, useState } from "react";
import {
  formatFlexibleDateInput,
  parseFlexibleDate,
} from "../formatDate";

type Props = {
  value: string;
  onChange: (stored: string) => void;
  placeholder?: string;
  className?: string;
  /** Shown in title / aria; defaults to flexible formats hint. */
  title?: string;
  disabled?: boolean;
  id?: string;
};

const HINT = "MM/DD/YYYY, MM/YYYY, or YYYY";

/**
 * Text date field that accepts partial dates and stores
 * YYYY | YYYY-MM | YYYY-MM-DD.
 */
export default function FlexibleDateInput({
  value,
  onChange,
  placeholder = "MM/DD/YYYY",
  className = "",
  title = HINT,
  disabled,
  id,
}: Props) {
  const [text, setText] = useState(() => formatFlexibleDateInput(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(formatFlexibleDateInput(value));
    setInvalid(false);
  }, [value]);

  function commit(raw: string) {
    const parsed = parseFlexibleDate(raw);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(formatFlexibleDateInput(parsed));
    if (parsed !== value) onChange(parsed);
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      className={`${className}${invalid ? " is-invalid" : ""}`.trim()}
      value={text}
      placeholder={placeholder}
      title={title}
      aria-invalid={invalid || undefined}
      aria-label={title}
      onChange={(e) => {
        setText(e.target.value);
        if (invalid) setInvalid(false);
      }}
      onBlur={() => commit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(text);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}
