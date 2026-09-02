type Props = {
  officialOnly: boolean;
  onChange: (officialOnly: boolean) => void;
  /** Accessible name for the tablist. */
  label?: string;
};

/** Official / Unofficial subbar (matches artist audio Live albums pattern). */
export default function OfficialUnofficialBar({
  officialOnly,
  onChange,
  label = "Edition",
}: Props) {
  return (
    <nav
      className="artist-page__subtabs artist-audio__official-bar"
      role="tablist"
      aria-label={label}
    >
      <button
        type="button"
        className={officialOnly ? "active" : ""}
        onClick={() => onChange(true)}
      >
        <span>OFFICIAL</span>
      </button>
      <button
        type="button"
        className={!officialOnly ? "active" : ""}
        onClick={() => onChange(false)}
      >
        <span>UNOFFICIAL</span>
      </button>
    </nav>
  );
}
