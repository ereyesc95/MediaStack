import { useEffect, useState } from "react";
import {
  formatFlexibleDateInput,
  maskFlexibleDateInput,
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

const HINT = "YYYY/MM/DD, YYYY/MM, or YYYY";

/**
 * Date field: digits + auto `/` only. Accepts YYYY / YYYY/MM / YYYY/MM/DD.
 * Stores YYYY | YYYY-MM | YYYY-MM-DD.
 */
export default function FlexibleDateInput({
  value,
  onChange,
  placeholder = "YYYY/MM/DD",
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
    const masked = maskFlexibleDateInput(raw);
    // Allow empty or complete segments only.
    if (!masked) {
      setInvalid(false);
      setText("");
      if (value) onChange("");
      return;
    }
    const parsed = parseFlexibleDate(masked);
    if (parsed === null) {
      setInvalid(true);
      setText(masked);
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
      maxLength={10}
      onChange={(e) => {
        const next = maskFlexibleDateInput(e.target.value);
        setText(next);
        if (invalid) setInvalid(false);
      }}
      onBlur={() => commit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(text);
          (e.currentTarget as HTMLInputElement).blur();
          return;
        }
        // Block letters and other symbols; allow control/nav keys.
        if (
          e.key.length === 1 &&
          !/[0-9/]/.test(e.key) &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey
        ) {
          e.preventDefault();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text");
        const next = maskFlexibleDateInput(pasted);
        setText(next);
        if (invalid) setInvalid(false);
      }}
    />
  );
}
