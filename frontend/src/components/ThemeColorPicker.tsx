import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Props = {
  value: string;
  label: string;
  onChange: (hex: string) => void;
  /** Extra class on the swatch button (e.g. profile-edit custom “+”). */
  swatchClassName?: string;
  /** Optional content inside the swatch (e.g. “+”); color fill still applied. */
  swatchContent?: ReactNode;
  disabled?: boolean;
};

type Hsv = { h: number; s: number; v: number };
type PopPos = { top: number; left: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function parseHex(hex: string): Hsv {
  const rgb = hexToRgb(hex) ?? { r: 10, g: 12, b: 16 };
  return rgbToHsv(rgb.r, rgb.g, rgb.b);
}

function hsvToHex(hsv: Hsv): string {
  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
  return rgbToHex(r, g, b);
}

function hueCss(h: number): string {
  const { r, g, b } = hsvToRgb(h, 1, 1);
  return rgbToHex(r, g, b);
}

function positionPop(swatch: HTMLElement): PopPos {
  const rect = swatch.getBoundingClientRect();
  const popW = 200;
  const popH = 236;
  const pad = 8;
  let left = rect.right - popW;
  let top = rect.bottom + 8;
  if (left < pad) left = pad;
  if (left + popW > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - pad - popW);
  }
  if (top + popH > window.innerHeight - pad) {
    top = Math.max(pad, rect.top - popH - 8);
  }
  return { top, left };
}

export default function ThemeColorPicker({
  value,
  label,
  onChange,
  swatchClassName = "",
  swatchContent,
  disabled = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const hsvRef = useRef<Hsv>(parseHex(value));
  const onChangeRef = useRef(onChange);
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => parseHex(value));
  const [hexDraft, setHexDraft] = useState(value.toUpperCase());
  const [popPos, setPopPos] = useState<PopPos | null>(null);
  const dragRef = useRef<"sv" | "hue" | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    hsvRef.current = hsv;
  }, [hsv]);

  useEffect(() => {
    if (open) return;
    const next = parseHex(value);
    hsvRef.current = next;
    setHsv(next);
    setHexDraft(value.toUpperCase());
  }, [value, open]);

  useLayoutEffect(() => {
    if (!open) {
      setPopPos(null);
      return;
    }
    const swatch = swatchRef.current;
    if (!swatch) return;
    setPopPos(positionPop(swatch));
    function place() {
      const el = swatchRef.current;
      if (!el) return;
      setPopPos(positionPop(el));
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: PointerEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
      // Capture-phase stop so a modal backdrop behind the pop doesn't
      // also treat this dismiss click as "close the whole dialog".
      e.stopPropagation();
    }
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [open]);

  function commit(next: Hsv) {
    hsvRef.current = next;
    setHsv(next);
    const hex = hsvToHex(next);
    setHexDraft(hex.toUpperCase());
    onChangeRef.current(hex);
  }

  function readSv(clientX: number, clientY: number) {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = clamp((clientX - rect.left) / rect.width, 0, 1);
    const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
    commit({ ...hsvRef.current, s, v });
  }

  function readHue(clientX: number) {
    const el = hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const h = clamp(((clientX - rect.left) / rect.width) * 360, 0, 359.999);
    commit({ ...hsvRef.current, h });
  }

  useEffect(() => {
    if (!open) return;
    function onMove(e: PointerEvent) {
      if (dragRef.current === "sv") readSv(e.clientX, e.clientY);
      if (dragRef.current === "hue") readHue(e.clientX);
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [open]);

  function onSvDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = "sv";
    readSv(e.clientX, e.clientY);
  }

  function onHueDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = "hue";
    readHue(e.clientX);
  }

  function onHexBlur() {
    const parsed = hexToRgb(hexDraft);
    if (!parsed) {
      setHexDraft(hsvToHex(hsvRef.current).toUpperCase());
      return;
    }
    commit(rgbToHsv(parsed.r, parsed.g, parsed.b));
  }

  function onHexKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
  }

  const current = hsvToHex(hsv);

  const pop =
    open && popPos
      ? createPortal(
          <div
            ref={popRef}
            className="theme-color-picker__pop"
            role="dialog"
            aria-label={`${label} color`}
            style={{ top: popPos.top, left: popPos.left }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={svRef}
              className="theme-color-picker__sv"
              style={{ backgroundColor: hueCss(hsv.h) }}
              onPointerDown={onSvDown}
            >
              <span
                className="theme-color-picker__sv-thumb"
                style={{
                  left: `${hsv.s * 100}%`,
                  top: `${(1 - hsv.v) * 100}%`,
                  background: current,
                }}
              />
            </div>
            <div
              ref={hueRef}
              className="theme-color-picker__hue"
              onPointerDown={onHueDown}
            >
              <span
                className="theme-color-picker__hue-thumb"
                style={{ left: `${(hsv.h / 360) * 100}%` }}
              />
            </div>
            <div className="theme-color-picker__meta">
              <span
                className="theme-color-picker__preview"
                style={{ background: current }}
                aria-hidden
              />
              <input
                className="theme-color-picker__hex"
                value={hexDraft}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(e) => setHexDraft(e.target.value)}
                onBlur={onHexBlur}
                onKeyDown={onHexKey}
                aria-label={`${label} hex`}
              />
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="theme-color-picker" ref={rootRef}>
      <button
        ref={swatchRef}
        type="button"
        className={`theme-color-picker__swatch ${swatchClassName}`.trim()}
        style={swatchContent ? undefined : { background: current }}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          setOpen((o) => !o);
        }}
      >
        {swatchContent}
      </button>
      {pop}
    </div>
  );
}
