import {
  MYSTACK_BOTTOM_PATH,
  MYSTACK_MIDDLE_PATH,
  MYSTACK_TOP_PATH,
  MYSTACK_TRANSFORM,
  MYSTACK_VIEW_BOX,
} from "../mystackMark";

type Props = {
  className?: string;
  size?: number;
};

/**
 * MyStack mark from assets/icons/MyStack.svg.
 * Top diamond + bottom line use theme accent; middle band uses currentColor.
 */
export default function MyStackIcon({ className, size = 16 }: Props) {
  return (
    <svg
      className={className}
      viewBox={MYSTACK_VIEW_BOX}
      width={size}
      height={size}
      aria-hidden
      fill="none"
    >
      <g transform={MYSTACK_TRANSFORM}>
        <path
          className="mystack-icon__accent"
          fill="var(--accent)"
          d={MYSTACK_TOP_PATH}
        />
        <path
          className="mystack-icon__body"
          fill="currentColor"
          d={MYSTACK_MIDDLE_PATH}
        />
        <path
          className="mystack-icon__accent"
          fill="var(--accent)"
          d={MYSTACK_BOTTOM_PATH}
        />
      </g>
    </svg>
  );
}
