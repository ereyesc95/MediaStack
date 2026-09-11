import type { ReactNode } from "react";

type Props = {
  open: boolean;
  children: ReactNode;
  className?: string;
};

/** Height slide for accordion panels (tracklists, seasons, editions). */
export default function MsDisclosure({ open, children, className = "" }: Props) {
  return (
    <div
      className={`ms-disclosure${open ? " is-open" : ""}${
        className ? ` ${className}` : ""
      }`}
      aria-hidden={!open}
    >
      <div className="ms-disclosure__inner">{children}</div>
    </div>
  );
}
