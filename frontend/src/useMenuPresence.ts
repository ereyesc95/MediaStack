import { useEffect, useState } from "react";

/** Keep a menu mounted briefly after close so exit transitions can play. */
export function useMenuPresence(open: boolean, durationMs = 180) {
  const [present, setPresent] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      // Mount first in the closed visual state; a later effect opens it.
      setPresent(true);
      setVisible(false);
      return;
    }
    setVisible(false);
    const t = window.setTimeout(() => setPresent(false), durationMs);
    return () => window.clearTimeout(t);
  }, [open, durationMs]);

  useEffect(() => {
    if (!present || !open) return;
    // Double rAF so the closed styles paint before adding `.is-open`.
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [present, open]);

  return { present, visible };
}
