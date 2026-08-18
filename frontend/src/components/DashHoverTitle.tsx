import {
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import BillboardText from "./BillboardText";

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}

export function useDashCardReveal() {
  const coarse = useCoarsePointer();
  const [revealedId, setRevealedId] = useState<string | null>(null);

  useEffect(() => {
    if (!coarse || revealedId == null) return;
    function dismiss(e: PointerEvent) {
      const target = e.target as Element | null;
      if (!target?.closest("[data-dash-card]")) {
        setRevealedId(null);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [coarse, revealedId]);

  function onCardActivate(id: string, action: () => void) {
    return (e: MouseEvent<HTMLElement>) => {
      if (coarse && revealedId !== id) {
        e.preventDefault();
        e.stopPropagation();
        setRevealedId(id);
        return;
      }
      action();
    };
  }

  return { coarse, revealedId, onCardActivate };
}

export function DashHoverTitle({
  title,
  subtitle,
  revealed = false,
}: {
  title: string;
  subtitle?: string;
  revealed?: boolean;
}) {
  if (!title && !subtitle) return null;
  return (
    <span className={`dash-hover-title${revealed ? " is-revealed" : ""}`}>
      {title ? (
        <BillboardText
          className="dash-hover-title__main"
          short={title}
          full={title}
        />
      ) : null}
      {subtitle ? (
        <BillboardText
          className="dash-hover-title__sub"
          short={subtitle}
          full={subtitle}
        />
      ) : null}
    </span>
  );
}

export function dashCardProps(id: string, revealed: boolean): {
  "data-dash-card": string;
  className: string;
} {
  return {
    "data-dash-card": id,
    className: revealed ? " is-revealed" : "",
  };
}

export function DashCardButton({
  id,
  revealed,
  className,
  onActivate,
  children,
}: {
  id: string;
  revealed: boolean;
  className: string;
  onActivate: (e: MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-dash-card={id}
      className={`${className}${revealed ? " is-revealed" : ""}`}
      onClick={onActivate}
    >
      {children}
    </button>
  );
}
