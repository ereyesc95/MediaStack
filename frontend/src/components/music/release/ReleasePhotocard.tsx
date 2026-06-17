import { useState } from "react";

type Props = {
  frontUrl: string | null;
  backUrl: string | null;
  variant: "portrait" | "landscape";
  className?: string;
};

export default function ReleasePhotocard({
  frontUrl,
  backUrl,
  variant,
  className = "",
}: Props) {
  const [flipped, setFlipped] = useState(false);
  if (!frontUrl) return null;

  const canFlip = Boolean(backUrl && backUrl !== frontUrl);

  return (
    <button
      type="button"
      className={`release-photocard release-photocard--${variant}${
        flipped ? " release-photocard--flipped" : ""
      }${className ? ` ${className}` : ""}`}
      onClick={() => canFlip && setFlipped((f) => !f)}
      aria-label={canFlip ? "Flip photocard" : undefined}
      disabled={!canFlip}
    >
      <span className="release-photocard__scene">
        <span className="release-photocard__face release-photocard__face--front">
          <img src={frontUrl} alt="" draggable={false} />
        </span>
        {canFlip && (
          <span className="release-photocard__face release-photocard__face--back">
            <img src={backUrl!} alt="" draggable={false} />
          </span>
        )}
      </span>
    </button>
  );
}
