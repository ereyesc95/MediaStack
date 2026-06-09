import MediaStackIcon from "./MediaStackIcon";

type Props = {
  stackName?: string;
};

/** Decorative hub header branding — not interactive. */
export default function HubBrand({ stackName = "MediaStack" }: Props) {
  return (
    <div className="hub-brand" aria-hidden>
      <MediaStackIcon className="hub-brand__icon" size={16} />
      <span className="hub-brand__label">{stackName}</span>
    </div>
  );
}
