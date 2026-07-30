import {
  MYSTACK_PATHS,
  MYSTACK_TRANSFORM,
  MYSTACK_VIEW_BOX,
} from "../mystackMark";

type Props = {
  className?: string;
  size?: number;
};

/** MyStack mark from assets/icons/MyStack.svg — uses currentColor. */
export default function MyStackIcon({ className, size = 16 }: Props) {
  return (
    <svg
      className={className}
      viewBox={MYSTACK_VIEW_BOX}
      width={size}
      height={size}
      aria-hidden
      fill="currentColor"
    >
      <g transform={MYSTACK_TRANSFORM}>
        {MYSTACK_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
