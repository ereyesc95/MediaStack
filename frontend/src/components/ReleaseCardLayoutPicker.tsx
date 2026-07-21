import type { ReleaseCardLayout } from "../types";
import { IconCardBanner, IconCardCover } from "./MenuIcons";

type Props = {
  value: ReleaseCardLayout;
  onChange: (next: ReleaseCardLayout) => void;
  className?: string;
};

export default function ReleaseCardLayoutPicker({
  value,
  onChange,
  className = "",
}: Props) {
  const next = value === "cover" ? "banner" : "cover";
  const label = value === "cover" ? "Cover" : "Banner";

  return (
    <div
      className={`release-card-layout-picker ${className}`.trim()}
    >
      <button
        type="button"
        className="card-orientation-toggle release-card-layout-picker__trigger"
        aria-label={`Release cards: ${label}. Tap to switch to ${next}.`}
        title={`Cards: ${label} (tap for ${next})`}
        onClick={() => onChange(next)}
      >
        {value === "cover" ? <IconCardCover /> : <IconCardBanner />}
      </button>
    </div>
  );
}
