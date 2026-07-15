type Props = {
  desc: boolean;
  className?: string;
};

export default function SortChevron({ desc, className = "" }: Props) {
  return (
    <svg
      className={`sort-chevron${className ? ` ${className}` : ""}`}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      {desc ? (
        <path
          d="M3 6 L8 11 L13 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M3 10 L8 5 L13 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
