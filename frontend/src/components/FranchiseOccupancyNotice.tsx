import type { FranchiseOccupancy } from "../api";
import { occupancyModuleLabels } from "../franchiseOccupancy";

type Props = {
  occupancy: FranchiseOccupancy | null | undefined;
  className?: string;
  as?: "p" | "span";
};

/** Muted “To be part of {Name} (Music · …)” with a bold franchise name. */
export default function FranchiseOccupancyNotice({
  occupancy,
  className = "",
  as: Tag = "p",
}: Props) {
  if (!occupancy?.modules?.length || !occupancy.display_name) return null;
  const labels = occupancyModuleLabels(occupancy);
  return (
    <Tag
      className={`muted franchise-occupancy-notice${className ? ` ${className}` : ""}`}
    >
      To be part of{" "}
      <strong className="franchise-occupancy-notice__name">
        {occupancy.display_name}
      </strong>{" "}
      ({labels.join(" · ")})
    </Tag>
  );
}
