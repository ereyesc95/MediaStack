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
  const [scrollEnd, setScrollEnd] = useState("0px");
  const [scrollDuration, setScrollDuration] = useState("6s");
  const [lineClamp, setLineClamp] = useState(maxLines > 1 ? 2 : 1);
  const multiline = maxLines > 1;

  useLayoutEffect(() => {
    const clip = clipRef.current;
    const text = textRef.current;
    if (!clip || !text) return;

    const measure = () => {
      if (!multiline) {
        const overflow = Math.max(0, text.scrollWidth - clip.clientWidth);
        const needsScroll = overflow > 1;
        setScrolls(needsScroll);
        setScrollEnd(needsScroll ? `-${overflow}px` : "0px");
        setScrollDuration(`${Math.max(4, overflow / 32)}s`);
        return;
      }

      // Progressive wrap: try 2 lines, then 3, then vertical billboard scroll.
      text.style.webkitLineClamp = "2";
      text.style.display = "-webkit-box";
      text.style.webkitBoxOrient = "vertical";
      text.style.whiteSpace = "normal";
      text.style.transform = "";
      void text.offsetHeight;
      let clamp = 2;
      if (text.scrollHeight > clip.clientHeight + 1 && maxLines >= 3) {
        clamp = 3;
        text.style.webkitLineClamp = "3";
        void text.offsetHeight;
      }
      setLineClamp(clamp);

      const overflowY = Math.max(0, text.scrollHeight - clip.clientHeight);
      if (overflowY > 1) {
        // Still too tall at max clamp — unlock clamp and scroll vertically.
        text.style.webkitLineClamp = "unset";
        text.style.display = "block";
        void text.offsetHeight;
        const fullOverflow = Math.max(0, text.scrollHeight - clip.clientHeight);
        setScrolls(fullOverflow > 1);
        setScrollEnd(fullOverflow > 1 ? `-${fullOverflow}px` : "0px");
        setScrollDuration(`${Math.max(4, fullOverflow / 18)}s`);
      } else {
        setScrolls(false);
        setScrollEnd("0px");
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(clip);
    return () => observer.disconnect();
  }, [complete, children, multiline, maxLines]);

  const scrollStyle = (
    multiline
      ? ({
          "--scroll-end": scrollEnd,
          "--scroll-duration": scrollDuration,
          ...(scrolls
            ? {}
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: String(lineClamp),
                whiteSpace: "normal",
                overflow: "hidden",
              }),
        } as CSSProperties)
      : scrolls
        ? ({
            "--scroll-end": scrollEnd,
            "--scroll-duration": scrollDuration,
          } as CSSProperties)
        : undefined
  );

  return (
    <span
      className={`billboard-text ${className}${
        scrolls ? " billboard-text--scroll" : ""
      }${multiline ? " billboard-text--multiline" : ""}${
        scrolls && multiline ? " billboard-text--vscroll" : ""
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
