import MyStackIcon from "./MyStackIcon";
import MyStackWordmark from "./MyStackWordmark";

/** Decorative hub header branding — not interactive. */
export default function HubBrand() {
  return (
    <div className="hub-brand" aria-hidden>
      <MyStackIcon className="hub-brand__icon" size={16} />
      <MyStackWordmark className="hub-brand__wordmark" height={18} />
    </div>
  );
}
