import {
  WORDMARK_MY_PATHS,
  WORDMARK_STACK_PATHS,
  WORDMARK_VIEW_BOX,
} from "../mystackWordmark";

type Props = {
  className?: string;
  /** Rendered height in CSS pixels; width follows viewBox aspect. */
  height?: number;
  title?: string;
};

/** Dual-fill wordmark: My uses accent, Stack uses currentColor. */
export default function MyStackWordmark({
  className = "",
  height = 28,
  title = "MyStack",
}: Props) {
  return (
    <svg
      className={`mystack-wordmark ${className}`.trim()}
      viewBox={WORDMARK_VIEW_BOX}
      height={height}
      width={height * (1209 / 318)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <g className="mystack-wordmark__stack" fill="currentColor" fillRule="evenodd">
        {WORDMARK_STACK_PATHS.map((d, i) => (
          <path key={`s${i}`} d={d} />
        ))}
      </g>
      <g className="mystack-wordmark__my" fill="var(--accent)" fillRule="evenodd">
        {WORDMARK_MY_PATHS.map((d, i) => (
          <path key={`m${i}`} d={d} />
        ))}
      </g>
    </svg>
  );
}
