import type { ListeningWrapped } from "./types";

const store = new Map<number, ListeningWrapped>();

export function getCachedListeningWrapped(
  year: number
): ListeningWrapped | null {
  return store.get(year) ?? null;
}

export function setCachedListeningWrapped(
  year: number,
  data: ListeningWrapped
): void {
  store.set(year, data);
}

/** Nov–Dec → that year; January → previous year; otherwise null (off-season). */
export function wrappedSeasonYear(now = new Date()): number | null {
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();
  if (month === 10 || month === 11) return year;
  if (month === 0) return year - 1;
  return null;
}
