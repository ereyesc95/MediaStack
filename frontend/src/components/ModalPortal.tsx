import { createPortal } from "react-dom";
import { useRef, type ReactNode } from "react";

type Props = {
  onClose: () => void;
  children: ReactNode;
  layer?: 1 | 2;
};

/** Close on mouseup only when the gesture both started and ended on the backdrop. */
export default function ModalPortal({
  onClose,
  children,
  layer = 1,
}: Props) {
  const className =
    layer === 2
      ? "modal-backdrop modal-backdrop--stacked"
      : "modal-backdrop";
  const pressedOnBackdrop = useRef(false);
  return createPortal(
    <div
      className={className}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (pressedOnBackdrop.current && e.target === e.currentTarget) {
          onClose();
        }
        pressedOnBackdrop.current = false;
      }}
    >
      {children}
    </div>,
    document.body
  );
}
