import { LyricsNotSyncedIcon, LyricsSyncedIcon } from "./releaseTrackActionIcons";

type Props = {
  synced: boolean;
  iconOnly?: boolean;
  actionable?: boolean;
  onClick?: () => void;
  title: string;
};

export default function LyricsStatusBadge({
  synced,
  iconOnly = false,
  actionable = false,
  onClick,
  title,
}: Props) {
  const className = [
    "lyrics-status-badge",
    synced ? "lyrics-status-badge--synced" : "lyrics-status-badge--plain",
    actionable ? "lyrics-status-badge--action" : "",
    iconOnly ? "lyrics-status-badge--icon-only" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = synced ? "Synced" : "Not synced";

  const content = (
    <>
      <span className="lyrics-status-badge__label">{label}</span>
      <span className="lyrics-status-badge__icon" aria-hidden="true">
        {synced ? (
          <LyricsSyncedIcon className="lyrics-status-badge__icon-svg" />
        ) : (
          <LyricsNotSyncedIcon className="lyrics-status-badge__icon-svg" />
        )}
      </span>
    </>
  );

  if (actionable && onClick) {
    return (
      <button
        type="button"
        className={className}
        title={title}
        aria-label={title}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={className} title={title}>
      {content}
    </span>
  );
}
