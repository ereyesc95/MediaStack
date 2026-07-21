import {
  MEDIASTACK_PATHS,
  MEDIASTACK_TRANSFORM,
  MEDIASTACK_VIEW_BOX,
} from "../mediastackMark";

type Props = {
  className?: string;
  size?: number;
};

/** MediaStack mark from assets/icons/MediaStack.svg — uses currentColor. */
export default function MediaStackIcon({ className, size = 16 }: Props) {
  return (
    <svg
      className={className}
      viewBox={MEDIASTACK_VIEW_BOX}
      width={size}
      height={size}
      aria-hidden
      fill="currentColor"
    >
      <g transform={MEDIASTACK_TRANSFORM}>
        {MEDIASTACK_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
