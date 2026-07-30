import MyStackIcon from "./MyStackIcon";

type Props = {
  stackName?: string;
};

/** Decorative hub header branding — not interactive. */
export default function HubBrand({ stackName = "MyStack" }: Props) {
  return (
    <div className="hub-brand" aria-hidden>
      <MyStackIcon className="hub-brand__icon" size={16} />
      <span className="hub-brand__label">{stackName}</span>
    </div>
  );
}
