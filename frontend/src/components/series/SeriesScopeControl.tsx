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
import { usePhoneLayout } from "../../usePhoneLayout";
import { IconSeriesScope } from "../MenuIcons";

export type SeriesScopeOption = {
  id: string;
  title: string;
};

type Props = {
  options: SeriesScopeOption[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  /** bar = label + text trigger; icon = icon-only (top bar) */
  variant?: "bar" | "icon";
  className?: string;
  icon?: ReactNode;
};

const HOVER_CLOSE_MS = 280;

export default function SeriesScopeControl({
  options,
  value,
  onChange,
  label = "Series",
  variant = "bar",
  className = "",
  icon,
}: Props) {
  const isPhone = usePhoneLayout();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const selected = options.find((o) => o.id === value) || options[0];
  const display = selected?.title || "All";
  const iconOnly = variant === "icon";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.title.toLowerCase().includes(q));
  }, [options, query]);

  const clearCloseTimer = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    if (isPhone) return;
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  };

  const openNow = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const updatePanelPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const maxW = Math.min(22 * 16, vw - 16);
    const right = Math.max(8, vw - rect.right);
    setPanelStyle({
      position: "fixed",
      top: rect.bottom + 4,
      right,
      left: "auto",
      width: "max-content",
      maxWidth: maxW,
      zIndex: 6000,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, isPhone, iconOnly]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (
        wrapRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => () => clearCloseTimer(), []);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          className="series-scope-control__panel series-scope-control__panel--fit"
          style={panelStyle}
          role="listbox"
          aria-label={`${label} options`}
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
        >
          {options.length > 6 ? (
            <input
              className="series-scope-control__search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              autoFocus={!isPhone}
            />
          ) : null}
          <ul className="series-scope-control__list ms-scrollbar">
            {filtered.length === 0 ? (
              <li className="series-scope-control__empty muted">No matches</li>
            ) : (
              filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.id === value}
                    className={`series-scope-control__option${
                      o.id === value ? " is-selected" : ""
                    }`}
                    onClick={() => pick(o.id)}
                  >
                    <span className="series-scope-control__option-label">
                      {o.title}
                    </span>
                    {o.id === value ? (
                      <span className="series-scope-control__check" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>,
        document.body
      )
    : null;

  return (
    <div
      ref={wrapRef}
      className={`series-scope-control series-scope-control--${variant}${
        className ? ` ${className}` : ""
      }`}
      onMouseEnter={!isPhone ? openNow : undefined}
      onMouseLeave={!isPhone ? scheduleClose : undefined}
    >
      {!iconOnly ? (
        <span className="series-scope-control__label">{label}</span>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        className={`series-scope-control__trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={iconOnly ? `${label}: ${display}` : undefined}
        title={iconOnly ? `${label}: ${display}` : undefined}
        onClick={() => (open ? setOpen(false) : openNow())}
      >
        {iconOnly ? (
          icon ?? <IconSeriesScope className="series-scope-control__icon" />
        ) : (
          <>
            <span className="series-scope-control__value" title={display}>
              {display}
            </span>
            <span className="series-scope-control__chev" aria-hidden>
              ▾
            </span>
          </>
        )}
      </button>
      {panel}
    </div>
  );
}
