import { useEffect, useState } from "react";

type Props = {
  frontUrl: string | null;
  backUrl: string | null;
  variant: "portrait" | "landscape";
  className?: string;
  coverOnly?: boolean;
};

export type ReleasePhotocardSet = {
  portrait_front: string | null;
  portrait_back: string | null;
  landscape_front: string | null;
  landscape_back: string | null;
  cover_only?: boolean;
};

export function ReleasePhotocardGroup({
  cards,
  className = "",
}: {
  cards: ReleasePhotocardSet;
  className?: string;
}) {
  const coverOnly = Boolean(cards.cover_only);

  if (coverOnly) {
    const front = cards.portrait_front ?? cards.landscape_front;
    if (!front) return null;
    const back =
      cards.portrait_back ?? cards.landscape_back ?? front;
    return (
      <ReleasePhotocard
        variant="portrait"
        frontUrl={front}
        backUrl={back}
        coverOnly
        className={className}
      />
    );
  }

  return (
    <>
      {cards.portrait_front && (
        <ReleasePhotocard
          variant="portrait"
          frontUrl={cards.portrait_front}
          backUrl={cards.portrait_back ?? cards.portrait_front}
          className={className}
        />
      )}
      {cards.landscape_front && (
        <ReleasePhotocard
          variant="landscape"
          frontUrl={cards.landscape_front}
          backUrl={cards.landscape_back ?? cards.landscape_front}
          className={className}
        />
      )}
    </>
  );
}

export default function ReleasePhotocard({
  frontUrl,
  backUrl,
  variant,
  className = "",
  coverOnly = false,
}: Props) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setFlipped(false);
  }, [frontUrl]);

  if (!frontUrl) return null;

  const canFlip = Boolean(backUrl);
  const backPhotocard = Boolean(
    backUrl && /photocard/i.test(decodeURIComponent(backUrl))
  );
  const backCover = Boolean(canFlip && backUrl && (!backPhotocard || coverOnly));

  return (
    <button
      type="button"
      className={`release-photocard release-photocard--${variant}${
        flipped ? " release-photocard--flipped" : ""
      }${coverOnly ? " release-photocard--cover-only" : ""}${
        className ? ` ${className}` : ""
      }`}
      onClick={() => canFlip && setFlipped((f) => !f)}
      aria-label={canFlip ? "Flip photocard" : undefined}
      disabled={!canFlip}
    >
      <span className="release-photocard__scene">
        <span className="release-photocard__face release-photocard__face--front">
          <span className="release-photocard__clip">
            <img src={frontUrl} alt="" draggable={false} />
          </span>
        </span>
        {canFlip && (
          <span
            className={`release-photocard__face release-photocard__face--back${
              backCover ? " release-photocard__face--cover" : ""
            }`}
          >
            <span className="release-photocard__clip">
              <img src={backUrl!} alt="" draggable={false} />
            </span>
          </span>
        )}
      </span>
    </button>
  );
}
