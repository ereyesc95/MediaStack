import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type Props = {
  short: string;
  full?: string;
  className?: string;
  /** Optional rich content (e.g. muted title suffix). Falls back to plain text. */
  children?: ReactNode;
  /**
   * Prefer wrapping up to this many lines before billboard-scrolling.
   * 1 = classic single-line horizontal scroll (default).
   * 2–3 = try clamp 2, then 3, then vertical scroll within the clamp height.
   */
  maxLines?: 1 | 2 | 3;
};

export default function BillboardText({
  short,
  full,
  className = "",
  children,
  maxLines = 1,
}: Props) {
  const complete = (full || short || "").trim();
  const clipRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrolls, setScrolls] = useState(false);
  const [scrollAxis, setScrollAxis] = useState<"x" | "y">("y");
  const [scrollEnd, setScrollEnd] = useState("0px");
  const [scrollDuration, setScrollDuration] = useState("6s");
  const multiline = maxLines > 1;

  useLayoutEffect(() => {
    const clip = clipRef.current;
    const text = textRef.current;
    if (!clip || !text) return;

    const applyWrapStyles = () => {
      text.style.display = "block";
      text.style.webkitLineClamp = "unset";
      text.style.webkitBoxOrient = "unset";
      text.style.whiteSpace = "normal";
      text.style.overflowWrap = "normal";
      text.style.wordBreak = "normal";
      text.style.width = `${clip.clientWidth}px`;
      text.style.boxSizing = "border-box";
      text.style.transform = "";
    };

    const longestWordWidth = () => {
      const font = getComputedStyle(text).font;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return 0;
      ctx.font = font;
      let max = 0;
      for (const word of complete.split(/\s+/)) {
        const trimmed = word.trim();
        if (!trimmed) continue;
        max = Math.max(max, ctx.measureText(trimmed).width);
      }
      return max;
    };

    const measure = () => {
      if (!multiline) {
        text.style.whiteSpace = "nowrap";
        text.style.overflowWrap = "normal";
        text.style.wordBreak = "normal";
        text.style.width = "";
        text.style.boxSizing = "";
        text.style.transform = "";
        void text.offsetHeight;
        const overflow = Math.max(0, text.scrollWidth - clip.clientWidth);
        const needsScroll = overflow > 1;
        setScrollAxis("x");
        setScrolls(needsScroll);
        setScrollEnd(needsScroll ? `-${overflow}px` : "0px");
        setScrollDuration(`${Math.max(4, overflow / 32)}s`);
        return;
      }

      applyWrapStyles();
      void text.offsetHeight;

      const overflowY = Math.max(0, text.scrollHeight - clip.clientHeight);
      if (overflowY > 1) {
        text.style.width = "";
        text.style.boxSizing = "";
        setScrollAxis("y");
        setScrolls(true);
        setScrollEnd(`-${overflowY}px`);
        setScrollDuration(`${Math.max(4, overflowY / 18)}s`);
        return;
      }

      const overflowX = Math.max(
        0,
        text.scrollWidth - clip.clientWidth,
        longestWordWidth() - clip.clientWidth,
      );
      text.style.width = "";
      text.style.boxSizing = "";

      if (overflowX > 1) {
        setScrollAxis("x");
        setScrolls(true);
        setScrollEnd(`-${overflowX}px`);
        setScrollDuration(`${Math.max(4, overflowX / 32)}s`);
        return;
      }

      setScrolls(false);
      setScrollEnd("0px");
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(clip);
    return () => observer.disconnect();
  }, [complete, children, multiline, maxLines]);

  const scrollStyle = (
    multiline
      ? scrolls
        ? ({
            "--scroll-end": scrollEnd,
            "--scroll-duration": scrollDuration,
            whiteSpace: "normal",
            overflowWrap: "normal",
            wordBreak: "normal",
          } as CSSProperties)
        : ({
            whiteSpace: "normal",
            overflowWrap: "normal",
            wordBreak: "normal",
          } as CSSProperties)
      : scrolls
        ? ({
            "--scroll-end": scrollEnd,
            "--scroll-duration": scrollDuration,
          } as CSSProperties)
        : undefined
  );

  const vScroll = scrolls && multiline && scrollAxis === "y";
  const hScroll = scrolls && (!multiline || scrollAxis === "x");

  return (
    <span
      className={`billboard-text ${className}${
        hScroll ? " billboard-text--scroll" : ""
      }${multiline ? " billboard-text--multiline" : ""}${
        vScroll ? " billboard-text--vscroll" : ""
      }`}
      title={scrolls ? undefined : complete}
      style={
        multiline
          ? ({
              "--billboard-lines": String(Math.min(maxLines, 3)),
            } as CSSProperties)
          : undefined
      }
    >
      <span className="billboard-text-clip" ref={clipRef}>
        <span
          className="billboard-text-inner"
          ref={textRef}
          style={scrollStyle}
        >
          {children ?? complete}
        </span>
      </span>
    </span>
  );
}
