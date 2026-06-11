import { createPortal } from "react-dom";
import type { ReactNode } from "react";

type Props = {
  onClose: () => void;
  children: ReactNode;
  layer?: 1 | 2;
};

export default function ModalPortal({
  onClose,
  children,
  layer = 1,
}: Props) {
  const className =
    layer === 2
      ? "modal-backdrop modal-backdrop--stacked"
      : "modal-backdrop";
  return createPortal(
    <div className={className} onMouseDown={onClose}>
      {children}
    </div>,
    document.body
  );
}
