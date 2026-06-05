import MediaStackIcon from "./MediaStackIcon";

/** Decorative hub header branding — not interactive. */
export default function HubBrand() {
  return (
    <div className="hub-brand" aria-hidden>
      <MediaStackIcon className="hub-brand__icon" size={16} />
      <span className="hub-brand__label">MediaStack</span>
    </div>
  );
}
