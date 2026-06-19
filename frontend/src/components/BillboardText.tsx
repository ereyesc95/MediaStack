import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

type Props = {
  short: string;
  full?: string;
  className?: string;
};

export default function BillboardText({ short, full, className = "" }: Props) {
  const complete = (full || short || "").trim();
  const clipRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrolls, setScrolls] = useState(false);
  const [scrollEnd, setScrollEnd] = useState("0px");
  const [scrollDuration, setScrollDuration] = useState("6s");

  useLayoutEffect(() => {
    const clip = clipRef.current;
    const text = textRef.current;
    if (!clip || !text) return;

    const measure = () => {
      const overflow = Math.max(0, text.scrollWidth - clip.clientWidth);
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

  const scrollStyle = scrolls
    ? ({
        "--scroll-end": scrollEnd,
        "--scroll-duration": scrollDuration,
      } as CSSProperties)
    : undefined;

  return (
    <span
      className={`billboard-text ${className}${scrolls ? " billboard-text--scroll" : ""}`}
      title={scrolls ? undefined : complete}
    >
      <span className="billboard-text-clip" ref={clipRef}>
        <span
          className="billboard-text-inner"
          ref={textRef}
          style={scrollStyle}
        >
          {complete}
        </span>
      </span>
    </span>
  );
}
