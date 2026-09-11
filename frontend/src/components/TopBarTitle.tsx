import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

type Props = {
  text: string;
  className?: string;
};

/** Single-line top-bar title: shrink a bit to fit, then billboard-scroll. */
export default function TopBarTitle({ text, className = "" }: Props) {
  const complete = (text || "").trim();
  const clipRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontPx, setFontPx] = useState<number | null>(null);
  const [scrolls, setScrolls] = useState(false);
  const [scrollEnd, setScrollEnd] = useState("0px");
  const [scrollDuration, setScrollDuration] = useState("6s");

  useLayoutEffect(() => {
    const clip = clipRef.current;
    const el = textRef.current;
    if (!clip || !el) return;

    const SHRINK_STEPS = [1, 0.9, 0.8, 0.72];

    const measure = () => {
      const available = clip.clientWidth;
      if (available <= 0) return;

      el.style.fontSize = "";
      el.style.width = "";
      el.style.maxWidth = "";
      el.style.transform = "";
      el.style.whiteSpace = "nowrap";
      void el.offsetWidth;

      const basePx = parseFloat(getComputedStyle(el).fontSize) || 16;
      let chosenPx = basePx;
      let overflow = 0;

      for (const step of SHRINK_STEPS) {
        const px = basePx * step;
        el.style.fontSize = `${px}px`;
        void el.offsetWidth;
        overflow = Math.max(0, el.scrollWidth - available);
        chosenPx = px;
        if (overflow <= 1) {
          overflow = 0;
          break;
        }
      }

      setFontPx(chosenPx === basePx ? null : chosenPx);
      const needsScroll = overflow > 1;
      setScrolls(needsScroll);
      setScrollEnd(needsScroll ? `-${overflow}px` : "0px");
      setScrollDuration(`${Math.max(4, overflow / 32)}s`);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(clip);
    return () => observer.disconnect();
  }, [complete]);

  const innerStyle = (
    {
      ...(fontPx != null ? { fontSize: `${fontPx}px` } : null),
      ...(scrolls
        ? {
            "--scroll-end": scrollEnd,
            "--scroll-duration": scrollDuration,
          }
        : null),
    } as CSSProperties
  );

  return (
    <span
      className={`billboard-text top-bar-title${
        scrolls ? " billboard-text--scroll top-bar-title--scroll" : ""
      }${className ? ` ${className}` : ""}`}
      title={scrolls ? undefined : complete}
    >
      <span className="billboard-text-clip" ref={clipRef}>
        <span className="billboard-text-inner" ref={textRef} style={innerStyle}>
          {complete}
        </span>
      </span>
    </span>
  );
}
