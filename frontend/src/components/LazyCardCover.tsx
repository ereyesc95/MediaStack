import { useEffect, useRef, useState } from "react";

/** Defer CSS backgroundImage until the card nears the viewport. */
export default function LazyCardCover({
  url,
  className = "artist-card-bg card-bg-layer",
}: {
  url: string | null | undefined;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!url || active) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [url, active]);

  return (
    <span
      ref={ref}
      className={className}
      style={
        active && url ? { backgroundImage: `url("${url}")` } : undefined
      }
    />
  );
}
