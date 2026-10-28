import { useEffect, useState } from "react";
import {
  fetchFranchiseOccupancy,
  type FranchiseOccupancy,
} from "./api";

const DEBOUNCE_MS = 300;

export function occupancyModuleLabels(
  occupancy: FranchiseOccupancy
): string[] {
  if (occupancy.module_labels?.length === occupancy.modules.length) {
    return occupancy.module_labels;
  }
  return occupancy.modules.map(
    (m) => m.charAt(0).toUpperCase() + m.slice(1)
  );
}

/** Debounced exact-name occupancy lookup for add-franchise / add-artist notices. */
export function useFranchiseOccupancy(name: string): {
  occupancy: FranchiseOccupancy | null;
} {
  const [occupancy, setOccupancy] = useState<FranchiseOccupancy | null>(null);
  const trimmed = name.trim();

  useEffect(() => {
    if (!trimmed) {
      setOccupancy(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchFranchiseOccupancy(trimmed)
        .then((data) => {
          if (!cancelled) setOccupancy(data.modules?.length ? data : null);
        })
        .catch(() => {
          if (!cancelled) setOccupancy(null);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  return { occupancy };
}
