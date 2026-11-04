import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type RequestClose = (after?: () => void) => void;

const ModalCloseContext = createContext<RequestClose | null>(null);

/** Prefer portal-managed close so exit animation can run. */
export function useModalClose(fallback?: () => void): RequestClose {
  const fromPortal = useContext(ModalCloseContext);
  return useCallback(
    (after?: () => void) => {
      if (fromPortal) {
        fromPortal(after);
        return;
      }
      after?.();
      fallback?.();
    },
    [fromPortal, fallback]
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type Props = {
  onClose: () => void;
  children: ReactNode;
  layer?: 1 | 2;
};

/**
 * Close on mouseup only when the gesture both started and ended on the backdrop.
 * Enter/exit animations are applied here so all portal modals share the same motion.
 */
export default function ModalPortal({
  onClose,
  children,
  layer = 1,
}: Props) {
  const [phase, setPhase] = useState<"enter" | "open" | "exit">("enter");
  const pressedOnBackdrop = useRef(false);
  const closingRef = useRef(false);
  const afterCloseRef = useRef<(() => void) | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const finishClose = useCallback(() => {
    const after = afterCloseRef.current;
    afterCloseRef.current = null;
    onClose();
    after?.();
  }, [onClose]);

  const requestClose = useCallback<RequestClose>(
    (after?: () => void) => {
      if (closingRef.current) return;
      afterCloseRef.current = after ?? null;
      if (prefersReducedMotion()) {
        closingRef.current = true;
        finishClose();
        return;
      }
      closingRef.current = true;
      setPhase("exit");
    },
    [finishClose]
  );

  useEffect(() => {
    if (prefersReducedMotion()) {
      setPhase("open");
      return;
    }
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setPhase("open"));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, []);

  useEffect(() => {
    if (phase !== "exit") return;
    const el = backdropRef.current;
    if (!el) {
      finishClose();
      return;
    }
    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      finishClose();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el) return;
      if (e.propertyName !== "opacity") return;
      complete();
    };
    el.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(complete, 300);
    return () => {
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [phase, finishClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        layer === 1 &&
        document.querySelector(".modal-backdrop--stacked")
      ) {
        return;
      }
      e.stopPropagation();
      requestClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [requestClose, layer]);

  // Route × clicks through exit animation instead of immediate parent onClose.
  useEffect(() => {
    const root = backdropRef.current;
    if (!root) return;
    const onClickCapture = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest(".modal-close-x, .music-wrapped__close");
      if (!btn || !(btn instanceof HTMLElement)) return;
      if (
        btn.hasAttribute("disabled") ||
        btn.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      requestClose();
    };
    root.addEventListener("click", onClickCapture, true);
    return () => root.removeEventListener("click", onClickCapture, true);
  }, [requestClose]);

  const className = [
    "modal-backdrop",
    "modal-backdrop--motion",
    layer === 2 ? "modal-backdrop--stacked" : "",
    phase === "open" ? "is-visible" : "",
    phase === "exit" ? "is-leaving" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      ref={backdropRef}
      className={className}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (pressedOnBackdrop.current && e.target === e.currentTarget) {
          requestClose();
        }
        pressedOnBackdrop.current = false;
      }}
    >
      <ModalCloseContext.Provider value={requestClose}>
        {children}
      </ModalCloseContext.Provider>
    </div>,
    document.body
  );
}
