/** Shared catalog backdrop URLs — same rules as Music catalog filters. */
import type { SeriesFilterMode, SeriesFilterOptions } from "./types";

export function catalogBackgroundIso(
  filterMode: SeriesFilterMode | string,
  countryId: number | "",
  filterOptions: SeriesFilterOptions | null
): string | null {
  if (filterMode !== "country" || countryId === "") return null;
  const c = filterOptions?.country_groups
    .flatMap((gr) => gr.items)
    .find((x) => x.id === countryId);
  return (c?.iso ?? "").toLowerCase() || null;
}

export function catalogBackgroundUrl(
  filterMode: SeriesFilterMode | string,
  opts: {
    continentId: number | "";
    subgenreId: number | "";
    startDecade: number | "";
    endDecade: number | "";
    filterOptions: SeriesFilterOptions | null;
  }
): string | null {
  const {
    continentId,
    subgenreId,
    startDecade,
    endDecade,
    filterOptions,
  } = opts;
  if (filterMode === "continent" && continentId !== "") {
    const c = filterOptions?.continents.find((x) => x.id === continentId);
    const slug = (c?.name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return slug ? `/api/assets/continent-${slug}` : null;
  }
  if (filterMode === "genre" && subgenreId !== "") {
    const item = filterOptions?.subgenre_groups
      .flatMap((gr) => gr.items)
      .find((x) => x.id === subgenreId);
    const parent = filterOptions?.subgenre_groups.find((gr) =>
      gr.items.some((x) => x.id === subgenreId)
    )?.genre;
    const slug = (parent ?? item?.name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return slug ? `/api/assets/genre-${slug}` : null;
  }
  if (filterMode === "start" && startDecade !== "") {
    return `/api/assets/decade-${startDecade}s`;
  }
  if (filterMode === "end" && endDecade !== "") {
    return `/api/assets/decade-${endDecade}s`;
  }
  return null;
}
