import type { ElementType, ReactNode } from "react";

type Variant = "logo" | "photo" | "cover" | "card" | "disc" | "round";

type Props = {
  children: ReactNode;
  variant?: Variant;
  block?: boolean;
  className?: string;
  as?: ElementType;
};

/** Accent-themed beat halo around logos, photos, and cover art. */
export default function MediaBeatFrame({
  children,
  variant = "cover",
  block = false,
  className,
  as: Tag = "span",
}: Props) {
  return (
    <Tag
      className={[
        "media-beat-frame",
        `media-beat-frame--${variant}`,
        block ? "media-beat-frame--block" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}
