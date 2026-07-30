import MyStackIcon from "./MyStackIcon";

type Props = {
  label?: string;
  error?: string | null;
  onBack?: () => void;
  backLabel?: string;
  className?: string;
};

/** Full-pane branded loading / error state used across catalog pages. */
export default function PlaylistBoot({
  label = "Loading…",
  error = null,
  onBack,
  backLabel = "← Back",
  className = "",
}: Props) {
  if (error) {
    return (
      <div
        className={`playlist-boot playlist-boot--error ${className}`.trim()}
        role="alert"
      >
        <MyStackIcon className="playlist-boot__icon" size={52} />
        <p className="playlist-boot__label playlist-boot__label--error">{error}</p>
        {onBack ? (
          <button type="button" className="btn" onClick={onBack}>
            {backLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`playlist-boot ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <MyStackIcon className="playlist-boot__icon" size={52} />
      <p className="playlist-boot__label">{label}</p>
    </div>
  );
}
