import type { CardOrientation } from "../types";

type Props = {
  orientation?: CardOrientation;
  count?: number;
  className?: string;
};

/** Soft tile grid used while related / browse cards are fetching. */
export default function ArtistCardSkeletonGrid({
  orientation = "portrait",
  count = 8,
  className = "",
}: Props) {
  const orient = orientation === "list" ? "portrait" : orientation;
  return (
    <div
      className={`artist-grid artist-grid--${orient} artist-related__grid artist-card-skeleton-grid${
        className ? ` ${className}` : ""
      }`}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`artist-card artist-card--${orient} artist-card--skeleton`}
        />
      ))}
    </div>
  );
}
