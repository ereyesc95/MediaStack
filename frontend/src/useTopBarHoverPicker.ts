import { useEffect, useRef, useState } from "react";
import {
  getAppMenuOpen,
  requestCloseAppMenu,
  subscribeAppMenuOpen,
} from "./appMenuChrome";
import { useMenuPresence } from "./useMenuPresence";
import { usePhoneLayout } from "./usePhoneLayout";

const CLOSE_DELAY_MS = 280;

/**
 * Hover-to-open picker next to the hamburger. While AppMenu is open, hover is
 * disabled — open only on click (and that click also closes the hamburger).
 */
export function useTopBarHoverPicker() {
  const [open, setOpen] = useState(false);
  const { present: menuPresent, visible: menuVisible } = useMenuPresence(open);
  const rootRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<number | null>(null);
  const isPhone = usePhoneLayout();
  const [appMenuOpen, setAppMenuOpenState] = useState(getAppMenuOpen);

  const clearLeaveTimer = () => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  useEffect(() => subscribeAppMenuOpen(setAppMenuOpenState), []);
  useEffect(() => () => clearLeaveTimer(), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMouseEnter = () => {
    if (isPhone || appMenuOpen) return;
    clearLeaveTimer();
    setOpen(true);
  };

  const onMouseLeave = () => {
    if (isPhone || appMenuOpen) return;
    clearLeaveTimer();
    leaveTimer.current = window.setTimeout(() => {
      setOpen(false);
      leaveTimer.current = null;
    }, CLOSE_DELAY_MS);
  };

  const onToggleClick = () => {
    clearLeaveTimer();
    if (appMenuOpen) {
      requestCloseAppMenu();
      setOpen(true);
      return;
    }
    setOpen((v) => !v);
  };

  return {
    open,
    setOpen,
    menuPresent,
    menuVisible,
    rootRef,
    onMouseEnter,
    onMouseLeave,
    onToggleClick,
  };
}
